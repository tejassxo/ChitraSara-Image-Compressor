import { MIME_TO_EXTENSION, SUPPORTED_MIME_TYPES, type SupportedMimeType } from '../../config/constants';
import type { CompressionOptions, CompressionResult, ImageDimensions } from '../../types';
import { calculateTargetDimensions, clamp } from '../../utils/math';
import { HardwareGovernor } from '../governor/HardwareGovernor';

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

      // 4. Rasterize onto Canvas (OffscreenCanvas with DOM Canvas fallback)
      const blob = await this.renderAndEncode(
        bitmap || fallbackImg!,
        targetDims,
        targetFormat,
        quality,
        caps.hasOffscreenCanvas && caps.hasConvertToBlob,
        signal
      );

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

      const objectUrl = URL.createObjectURL(blob);

      return {
        blob,
        objectUrl,
        format: targetFormat,
        dimensions: targetDims,
        sourceSize,
        outputSize,
        bytesSaved,
        savingsPercent,
        compressionRatio,
        latencyMs,
        filename: outputFilename,
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
   * Renders the frame onto canvas and encodes to Blob with canvas zeroing
   */
  private static async renderAndEncode(
    sourceDrawable: ImageBitmap | HTMLImageElement,
    dimensions: ImageDimensions,
    format: SupportedMimeType,
    quality: number,
    useOffscreen: boolean,
    signal?: AbortSignal
  ): Promise<Blob> {
    if (signal?.aborted) {
      throw new DOMException('Compression aborted by user', 'AbortError');
    }

    if (useOffscreen && typeof OffscreenCanvas !== 'undefined') {
      const offscreen = new OffscreenCanvas(dimensions.width, dimensions.height);
      const ctx = offscreen.getContext('2d', { alpha: format !== 'image/jpeg' });
      if (!ctx) {
        throw new Error('Failed to create 2D rendering context on OffscreenCanvas');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sourceDrawable, 0, 0, dimensions.width, dimensions.height);

      try {
        const blob = await offscreen.convertToBlob({
          type: format,
          quality: format === 'image/png' ? undefined : quality,
        });
        return blob;
      } finally {
        // Zero out dimensions to release GPU canvas buffer memory immediately
        offscreen.width = 0;
        offscreen.height = 0;
      }
    } else {
      // Detached DOM Canvas Fallback
      const canvas = document.createElement('canvas');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const ctx = canvas.getContext('2d', { alpha: format !== 'image/jpeg' });
      if (!ctx) {
        throw new Error('Failed to create 2D rendering context on HTMLCanvasElement');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sourceDrawable, 0, 0, dimensions.width, dimensions.height);

      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          if (signal?.aborted) {
            reject(new DOMException('Compression aborted by user', 'AbortError'));
            return;
          }
          canvas.toBlob(
            (b) => {
              if (b) resolve(b);
              else reject(new Error(`Failed to encode image to ${format}`));
            },
            format,
            format === 'image/png' ? undefined : quality
          );
        });
        return blob;
      } finally {
        // Zero out dimensions to release GPU canvas buffer memory immediately
        canvas.width = 0;
        canvas.height = 0;
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
