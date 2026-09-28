import { MIME_TO_EXTENSION, SUPPORTED_MIME_TYPES, type SupportedMimeType } from '../../config/constants';
import type { CompressionOptions, CompressionResult, FidelityMetrics, ImageDimensions } from '../../types';
import { clamp } from '../../utils/math';
import { CanvasRasterizer } from './CanvasRasterizer';
import { TargetSizeSolver } from '../solver/TargetSizeSolver';
import { MemoryLifecycle } from '../../services/lifecycle';
import { QualityPreservationEngine } from './QualityPreservationEngine';
import { OutputValidator } from './OutputValidator';
import { VisualFidelityGuard } from './VisualFidelityGuard';
import { getExifOrientation } from '../../utils/exif';

export class CompressionEngine {
  /**
   * Compresses a source File or Blob according to provided options.
   *
   * Core Guarantees:
   * 1. 100% Client-side execution with zero external requests.
   * 2. Reduces bytes, not visual identity: aspect ratio and orientation preserved.
   * 3. Immutable source reference: candidates are generated from original decoded source (no generational degradation).
   * 4. Pre-download output validation: corrupted or invalid blobs are never returned.
   * 5. Deterministic memory lifecycle: all ImageBitmaps closed and temporary object URLs revoked.
   */
  public static async compress(
    source: File | Blob,
    options: CompressionOptions,
    originalFilename = 'image'
  ): Promise<CompressionResult> {
    const startTime = performance.now();
    const signal = options.signal;

    if (signal?.aborted) {
      throw new DOMException('Compression aborted by user', 'AbortError');
    }

    // 1. Resolve Output Format
    const sourceMime = (source.type as SupportedMimeType) || 'image/jpeg';
    let targetFormat: SupportedMimeType;

    if (options.format === 'original') {
      targetFormat = (SUPPORTED_MIME_TYPES as readonly string[]).includes(sourceMime)
        ? sourceMime
        : 'image/jpeg';
    } else {
      targetFormat = options.format;
    }

    // Lossless mode override: quality 1.0, PNG or WebP
    const isLosslessMode = options.mode === 'lossless';
    const quality = isLosslessMode ? 1.0 : clamp(options.quality, 0.05, 1.0);

    // 2. Orientation & Visual Inspection
    let orientation = 1;
    try {
      orientation = await getExifOrientation(source);
    } catch {
      orientation = 1;
    }

    // 3. Decode Input into ImageBitmap with orientation normalization
    let bitmap: ImageBitmap | null = null;
    let fallbackImg: HTMLImageElement | null = null;
    let tempObjectUrl: string | null = null;
    let sourceWidth = 0;
    let sourceHeight = 0;

    try {
      if (typeof createImageBitmap === 'function') {
        // Modern browsers: 'from-image' automatically applies EXIF orientation
        try {
          bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
        } catch {
          bitmap = await createImageBitmap(source);
        }
        sourceWidth = bitmap.width;
        sourceHeight = bitmap.height;
      } else {
        tempObjectUrl = URL.createObjectURL(source);
        fallbackImg = await this.loadImageElement(tempObjectUrl, signal);
        sourceWidth = fallbackImg.naturalWidth;
        sourceHeight = fallbackImg.naturalHeight;
      }

      if (signal?.aborted) {
        throw new DOMException('Compression aborted by user', 'AbortError');
      }

      // 4. Quality Preservation Plan
      const origDims: ImageDimensions = { width: sourceWidth, height: sourceHeight };
      const preservationPlan = QualityPreservationEngine.createPreservationPlan({
        originalDimensions: origDims,
        sourceMime,
        targetFormat,
        hasAlpha: options.preserveAlpha,
        orientation: orientation as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
        resize: isLosslessMode ? { mode: 'original', maintainAspectRatio: true } : options.resize,
        allowUpscale: options.resize?.allowUpscale,
      });

      const targetDims = preservationPlan.safeDimensions;
      targetFormat = preservationPlan.targetFormat;

      const drawable: CanvasImageSource = bitmap || fallbackImg!;
      let blob: Blob;
      let finalDims: ImageDimensions = targetDims;
      let iterationsCount = 1;
      let downscaled = false;
      let impossibleTarget = false;
      let targetAchieved = true;
      let targetMessage: string | undefined;

      // 5. Target Size Solver 2.0 or Direct Rasterization
      if (options.mode === 'targetSize' && options.targetBytes && options.targetBytes > 0) {
        const solverResult = await TargetSizeSolver.solve({
          sourceImage: drawable,
          targetBytes: options.targetBytes,
          format: targetFormat,
          maxDimensions: targetDims,
          originalDimensions: origDims,
          signal,
        });

        blob = solverResult.finalBlob;
        finalDims = solverResult.finalDimensions;
        iterationsCount = solverResult.iterationsCount;
        downscaled = solverResult.downscaled;
        impossibleTarget = solverResult.impossibleTarget;
        targetAchieved = solverResult.targetAchieved;
        targetMessage = solverResult.targetMessage;
      } else {
        // Direct Encoding with progressive stepped downscaling
        blob = await CanvasRasterizer.renderAndEncode(drawable, {
          dimensions: targetDims,
          format: targetFormat,
          quality,
          enableSteppedDownscaling: preservationPlan.resizingStrategy === 'stepped',
          signal,
        });
      }

      if (signal?.aborted) {
        throw new DOMException('Compression aborted by user', 'AbortError');
      }

      // 6. Pre-Download Output Validation
      const validationReport = await OutputValidator.validateCandidate(blob, {
        expectedFormat: targetFormat,
        maxDimensions: finalDims,
        originalDimensions: origDims,
        allowUpscale: preservationPlan.isUpscaled,
        targetBytes: options.targetBytes,
      });

      if (!validationReport.isValid && validationReport.errors.length > 0) {
        throw new Error(
          `Generated image failed output validation: ${validationReport.errors.join('; ')}`
        );
      }

      // 7. Measure Visual Fidelity (SSIM & PSNR)
      let fidelityMetrics: FidelityMetrics | undefined;
      try {
        fidelityMetrics = await this.measureFidelity(drawable, blob, finalDims);
      } catch {
        // Non-fatal if metric probe fails
      }

      const latencyMs = performance.now() - startTime;
      const sourceSize = source.size;
      const outputSize = blob.size;
      const bytesSaved = Math.max(0, sourceSize - outputSize);
      const savingsPercent = sourceSize > 0 ? ((sourceSize - outputSize) / sourceSize) * 100 : 0;
      const compressionRatio = outputSize > 0 ? sourceSize / outputSize : 1;

      // Construct standard minified filename: [name].min.[ext]
      const cleanBaseName = originalFilename.replace(/\.[^/.]+$/, '');
      const ext = MIME_TO_EXTENSION[targetFormat] || 'jpg';
      const outputFilename = `${cleanBaseName}.min.${ext}`;

      const rawObjectUrl = URL.createObjectURL(blob);
      const objectUrl = MemoryLifecycle.trackUrl(rawObjectUrl);

      // Verify lossless condition
      const isLossless =
        isLosslessMode &&
        (targetFormat === 'image/png' || targetFormat === 'image/webp') &&
        !downscaled;

      return {
        blob,
        objectUrl,
        format: targetFormat,
        dimensions: finalDims,
        sourceSize,
        outputSize,
        bytesSaved,
        savingsPercent,
        compressionRatio,
        latencyMs,
        filename: outputFilename,
        iterationsCount,
        downscaled,
        impossibleTarget,
        targetAchieved,
        targetMessage,
        fidelityMetrics,
        validationResult: {
          isValid: validationReport.isValid,
          errors: validationReport.errors,
          warnings: validationReport.warnings,
        },
        isLossless,
      };
    } finally {
      // Deterministic cleanup: close bitmap & revoke temporary URLs
      if (bitmap) {
        try {
          bitmap.close();
        } catch {
          // ignore closed bitmap error
        }
      }
      if (tempObjectUrl) {
        URL.revokeObjectURL(tempObjectUrl);
      }
      if (fallbackImg) {
        fallbackImg.src = '';
      }
    }
  }

  /**
   * Helper to compute SSIM and PSNR between original drawable and compressed blob
   */
  private static async measureFidelity(
    original: CanvasImageSource,
    compressedBlob: Blob,
    dims: ImageDimensions
  ): Promise<FidelityMetrics | undefined> {
    const probeW = Math.min(dims.width, 256);
    const probeH = Math.min(dims.height, 256);

    let compBitmap: ImageBitmap | null = null;
    let canvasOrig: HTMLCanvasElement | OffscreenCanvas | null = null;
    let canvasComp: HTMLCanvasElement | OffscreenCanvas | null = null;

    try {
      compBitmap = await createImageBitmap(compressedBlob);

      if (typeof OffscreenCanvas !== 'undefined') {
        canvasOrig = new OffscreenCanvas(probeW, probeH);
        canvasComp = new OffscreenCanvas(probeW, probeH);
      } else if (typeof document !== 'undefined') {
        canvasOrig = document.createElement('canvas');
        canvasOrig.width = probeW;
        canvasOrig.height = probeH;

        canvasComp = document.createElement('canvas');
        canvasComp.width = probeW;
        canvasComp.height = probeH;
      } else {
        return undefined;
      }

      const ctx1 = canvasOrig.getContext('2d', { willReadFrequently: true }) as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
      const ctx2 = canvasComp.getContext('2d', { willReadFrequently: true }) as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;

      if (!ctx1 || !ctx2) return undefined;

      ctx1.imageSmoothingQuality = 'high';
      ctx2.imageSmoothingQuality = 'high';

      ctx1.drawImage(original, 0, 0, probeW, probeH);
      ctx2.drawImage(compBitmap, 0, 0, probeW, probeH);

      const d1 = ctx1.getImageData(0, 0, probeW, probeH).data;
      const d2 = ctx2.getImageData(0, 0, probeW, probeH).data;

      return VisualFidelityGuard.computeMetrics(d1, d2, probeW, probeH, 'balanced');
    } finally {
      if (compBitmap) {
        try {
          compBitmap.close();
        } catch {
          // ignore
        }
      }
      if (canvasOrig) {
        canvasOrig.width = 0;
        canvasOrig.height = 0;
      }
      if (canvasComp) {
        canvasComp.width = 0;
        canvasComp.height = 0;
      }
    }
  }

  /**
   * Helper to load an HTMLImageElement with abort and load handlers
   */
  private static loadImageElement(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Compression aborted by user', 'AbortError'));
        return;
      }

      const img = new Image();
      const onAbort = () => {
        img.src = '';
        reject(new DOMException('Compression aborted by user', 'AbortError'));
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      img.onload = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve(img);
      };

      img.onerror = () => {
        signal?.removeEventListener('abort', onAbort);
        reject(new Error('Failed to load image element from source'));
      };

      img.src = url;
    });
  }
}
