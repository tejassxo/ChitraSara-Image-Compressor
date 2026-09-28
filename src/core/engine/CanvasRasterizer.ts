import type { ImageDimensions, SupportedMimeType } from '../../types';

export interface RasterizeOptions {
  dimensions: ImageDimensions;
  format: SupportedMimeType;
  quality: number;
  useOffscreen?: boolean;
  signal?: AbortSignal;
}

export class CanvasRasterizer {
  /**
   * Renders a drawable source onto an OffscreenCanvas or DOM Canvas fallback,
   * encodes to Blob, and immediately zeroes canvas dimensions to free GPU memory.
   */
  public static async renderAndEncode(
    source: CanvasImageSource,
    options: RasterizeOptions
  ): Promise<Blob> {
    const { dimensions, format, quality, useOffscreen = true, signal } = options;

    if (signal?.aborted) {
      throw new DOMException('Rasterization aborted by user', 'AbortError');
    }

    const hasOffscreen = useOffscreen && typeof OffscreenCanvas !== 'undefined';

    if (hasOffscreen) {
      const offscreen = new OffscreenCanvas(dimensions.width, dimensions.height);
      const ctx = offscreen.getContext('2d', { alpha: format !== 'image/jpeg' }) as OffscreenCanvasRenderingContext2D | null;

      if (!ctx) {
        throw new Error('Failed to create 2D rendering context on OffscreenCanvas');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, dimensions.width, dimensions.height);

      if (signal?.aborted) {
        offscreen.width = 0;
        offscreen.height = 0;
        throw new DOMException('Rasterization aborted by user', 'AbortError');
      }

      try {
        const blob = await offscreen.convertToBlob({
          type: format,
          quality: format === 'image/png' ? undefined : quality,
        });
        return blob;
      } finally {
        // Zero dimensions to assist GPU GC immediately
        offscreen.width = 0;
        offscreen.height = 0;
      }
    } else {
      // Detached DOM Canvas Fallback
      if (typeof document === 'undefined') {
        throw new Error('DOM document not available for canvas fallback');
      }

      const canvas = document.createElement('canvas');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const ctx = canvas.getContext('2d', { alpha: format !== 'image/jpeg' });

      if (!ctx) {
        throw new Error('Failed to create 2D rendering context on HTMLCanvasElement');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, dimensions.width, dimensions.height);

      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          if (signal?.aborted) {
            reject(new DOMException('Rasterization aborted by user', 'AbortError'));
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
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  }
}
