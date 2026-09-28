import { MIME_TO_EXTENSION, SUPPORTED_MIME_TYPES, type SupportedMimeType } from '../../config/constants';
import type { CompressionOptions, CompressionResult, ImageDimensions } from '../../types';
import { calculateTargetDimensions, clamp } from '../../utils/math';
import { HardwareGovernor } from '../governor/HardwareGovernor';
import { CanvasRasterizer } from './CanvasRasterizer';
import { TargetSizeSolver } from '../solver/TargetSizeSolver';
import { MemoryLifecycle } from '../../services/lifecycle';

export class CompressionEngine {
  /**
   * Compresses a source File or Blob according to provided options.
   * Guarantees deterministic memory cleanup, zero leaks, and abort support.
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

    // Quality factor: PNG is lossless (browser ignores quality), lossy formats use 0.05 - 1.0
    const quality = clamp(options.quality, 0.05, 1.0);

    // 2. Decode Input into ImageBitmap (or fallback to HTMLImageElement)
    let bitmap: ImageBitmap | null = null;
    let fallbackImg: HTMLImageElement | null = null;
    let tempObjectUrl: string | null = null;
    let sourceWidth = 0;
    let sourceHeight = 0;

    try {
      if (typeof createImageBitmap === 'function') {
        bitmap = await createImageBitmap(source);
        sourceWidth = bitmap.width;
        sourceHeight = bitmap.height;
      } else {
        // Fallback for environments lacking createImageBitmap
        tempObjectUrl = URL.createObjectURL(source);
        fallbackImg = await this.loadImageElement(tempObjectUrl, signal);
        sourceWidth = fallbackImg.naturalWidth;
        sourceHeight = fallbackImg.naturalHeight;
      }

      if (signal?.aborted) {
        throw new DOMException('Compression aborted by user', 'AbortError');
      }

      // 3. Compute Target Dimensions
      const caps = HardwareGovernor.getCapabilities();
      const targetDims: ImageDimensions = calculateTargetDimensions(
        { width: sourceWidth, height: sourceHeight },
        options.resize,
        caps.maxCanvasDimension
      );

      const drawable: CanvasImageSource = bitmap || fallbackImg!;
      let blob: Blob;
      let finalDims: ImageDimensions = targetDims;
      let iterationsCount = 1;
      let downscaled = false;

      // 4. Check if Target Size Solver is requested
      if (options.mode === 'targetSize' && options.targetBytes && options.targetBytes > 0) {
        const solverResult = await TargetSizeSolver.solve({
          sourceImage: drawable,
          targetBytes: options.targetBytes,
          format: targetFormat,
          maxDimensions: targetDims,
          signal,
        });
        blob = solverResult.finalBlob;
        finalDims = solverResult.finalDimensions;
        iterationsCount = solverResult.iterationsCount;
        downscaled = solverResult.downscaled;
      } else {
        // Rasterize onto Canvas (OffscreenCanvas with DOM Canvas fallback)
        blob = await CanvasRasterizer.renderAndEncode(drawable, {
          dimensions: targetDims,
          format: targetFormat,
          quality,
          useOffscreen: caps.hasOffscreenCanvas && caps.hasConvertToBlob,
          signal,
        });
      }

      if (signal?.aborted) {
        throw new DOMException('Compression aborted by user', 'AbortError');
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
      };
    } finally {
      // Deterministic cleanup invariant: close bitmap & revoke temporary URLs
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
