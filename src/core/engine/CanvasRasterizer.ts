import type { ImageDimensions, SupportedMimeType } from '../../types';

export interface RasterizeOptions {
  dimensions: ImageDimensions;
  format: SupportedMimeType;
  quality: number;
  useOffscreen?: boolean;
  signal?: AbortSignal;
  enableSteppedDownscaling?: boolean;
  colorPolicy?: 'preserve' | 'normalize' | 'strip';
}

export class CanvasRasterizer {
  /**
   * Renders a drawable source onto an OffscreenCanvas or DOM Canvas fallback,
   * encodes to Blob, and immediately zeroes canvas dimensions to free GPU memory.
   *
   * Features:
   * - Adaptive progressive stepped downscaling for large dimension reductions (>2x)
   * - High-order bicubic imageSmoothingQuality = 'high'
   * - Explicit alpha channel policy (disabled for JPEG to avoid black fringe)
   * - Strict deterministic memory cleanup (canvas width/height = 0)
   */
  public static async renderAndEncode(
    source: CanvasImageSource,
    options: RasterizeOptions
  ): Promise<Blob> {
    const {
      dimensions,
      format,
      quality,
      useOffscreen = true,
      signal,
      enableSteppedDownscaling = true,
    } = options;

    if (signal?.aborted) {
      throw new DOMException('Rasterization aborted by user', 'AbortError');
    }

    const hasOffscreen = useOffscreen && typeof OffscreenCanvas !== 'undefined';
    const isJpeg = format === 'image/jpeg';

    // Extract source dimensions to determine if stepped downscaling is needed
    let srcW = dimensions.width;
    let srcH = dimensions.height;
    if ('naturalWidth' in source && typeof source.naturalWidth === 'number' && source.naturalWidth > 0) {
      srcW = source.naturalWidth;
      srcH = source.naturalHeight;
    } else if ('width' in source && typeof source.width === 'number' && source.width > 0) {
      srcW = source.width;
      srcH = source.height;
    }

    const downscaleFactor = Math.max(srcW / dimensions.width, srcH / dimensions.height);
    const useStepped = enableSteppedDownscaling && downscaleFactor > 2.0;

    if (hasOffscreen) {
      return this.renderOffscreen(source, dimensions, format, quality, isJpeg, useStepped, srcW, srcH, signal);
    } else {
      return this.renderDomCanvas(source, dimensions, format, quality, isJpeg, useStepped, srcW, srcH, signal);
    }
  }

  private static async renderOffscreen(
    source: CanvasImageSource,
    targetDims: ImageDimensions,
    format: SupportedMimeType,
    quality: number,
    isJpeg: boolean,
    useStepped: boolean,
    srcW: number,
    srcH: number,
    signal?: AbortSignal
  ): Promise<Blob> {
    const offscreen = new OffscreenCanvas(targetDims.width, targetDims.height);
    const ctx = offscreen.getContext('2d', {
      alpha: !isJpeg,
      colorSpace: 'srgb',
    }) as OffscreenCanvasRenderingContext2D | null;

    if (!ctx) {
      throw new Error('Failed to create 2D rendering context on OffscreenCanvas');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (useStepped) {
      this.drawStepped(ctx, source, srcW, srcH, targetDims.width, targetDims.height, !isJpeg);
    } else {
      ctx.drawImage(source, 0, 0, targetDims.width, targetDims.height);
    }

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
      offscreen.width = 0;
      offscreen.height = 0;
    }
  }

  private static async renderDomCanvas(
    source: CanvasImageSource,
    targetDims: ImageDimensions,
    format: SupportedMimeType,
    quality: number,
    isJpeg: boolean,
    useStepped: boolean,
    srcW: number,
    srcH: number,
    signal?: AbortSignal
  ): Promise<Blob> {
    if (typeof document === 'undefined') {
      throw new Error('DOM document not available for canvas fallback');
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetDims.width;
    canvas.height = targetDims.height;
    const ctx = canvas.getContext('2d', {
      alpha: !isJpeg,
      colorSpace: 'srgb',
    });

    if (!ctx) {
      throw new Error('Failed to create 2D rendering context on HTMLCanvasElement');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (useStepped) {
      this.drawStepped(ctx, source, srcW, srcH, targetDims.width, targetDims.height, !isJpeg);
    } else {
      ctx.drawImage(source, 0, 0, targetDims.width, targetDims.height);
    }

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

  /**
   * Performs high-quality stepped downscaling (half-stepping) to eliminate moiré and aliasing.
   */
  private static drawStepped(
    targetCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    dstW: number,
    dstH: number,
    alpha: boolean
  ): void {
    let curW = srcW;
    let curH = srcH;
    let curSource: CanvasImageSource = source;
    const intermediateCanvases: (HTMLCanvasElement | OffscreenCanvas)[] = [];

    try {
      while (curW / 2 > dstW && curH / 2 > dstH) {
        const nextW = Math.max(dstW, Math.round(curW / 2));
        const nextH = Math.max(dstH, Math.round(curH / 2));

        let stepCanvas: HTMLCanvasElement | OffscreenCanvas;
        let stepCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

        if (typeof OffscreenCanvas !== 'undefined') {
          stepCanvas = new OffscreenCanvas(nextW, nextH);
          stepCtx = stepCanvas.getContext('2d', { alpha }) as OffscreenCanvasRenderingContext2D | null;
        } else if (typeof document !== 'undefined') {
          stepCanvas = document.createElement('canvas');
          stepCanvas.width = nextW;
          stepCanvas.height = nextH;
          stepCtx = stepCanvas.getContext('2d', { alpha });
        } else {
          break;
        }

        if (stepCtx) {
          stepCtx.imageSmoothingEnabled = true;
          stepCtx.imageSmoothingQuality = 'high';
          stepCtx.drawImage(curSource, 0, 0, nextW, nextH);
          curSource = stepCanvas;
          curW = nextW;
          curH = nextH;
          intermediateCanvases.push(stepCanvas);
        } else {
          break;
        }
      }

      targetCtx.drawImage(curSource, 0, 0, dstW, dstH);
    } finally {
      // Deterministically zero all intermediate canvases immediately
      for (const canvas of intermediateCanvases) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  }
}
