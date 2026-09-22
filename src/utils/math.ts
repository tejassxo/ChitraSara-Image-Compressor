import type { ImageDimensions, ResizeOptions } from '../types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculates target dimensions preserving aspect ratio with sub-pixel safe rounding
 * and hardware canvas ceiling enforcement.
 */
export function calculateTargetDimensions(
  source: ImageDimensions,
  options: ResizeOptions,
  maxCanvasDim = 4096
): ImageDimensions {
  if (source.width <= 0 || source.height <= 0) {
    return { width: 1, height: 1 };
  }

  let targetWidth = source.width;
  let targetHeight = source.height;

  if (options.mode === 'scale' && options.scalePercent !== undefined) {
    const factor = clamp(options.scalePercent, 1, 500) / 100;
    targetWidth = Math.round(source.width * factor);
    targetHeight = Math.round(source.height * factor);
  } else if (options.mode === 'constraint') {
    const maxW = options.maxWidth && options.maxWidth > 0 ? options.maxWidth : source.width;
    const maxH = options.maxHeight && options.maxHeight > 0 ? options.maxHeight : source.height;

    if (options.maintainAspectRatio) {
      const widthRatio = maxW / source.width;
      const heightRatio = maxH / source.height;
      const bestRatio = Math.min(widthRatio, heightRatio);

      targetWidth = Math.round(source.width * bestRatio);
      targetHeight = Math.round(source.height * bestRatio);
    } else {
      targetWidth = Math.round(maxW);
      targetHeight = Math.round(maxH);
    }
  }

  // Enforce hardware canvas boundary
  if (targetWidth > maxCanvasDim || targetHeight > maxCanvasDim) {
    const overflowFactor = Math.min(maxCanvasDim / targetWidth, maxCanvasDim / targetHeight);
    targetWidth = Math.round(targetWidth * overflowFactor);
    targetHeight = Math.round(targetHeight * overflowFactor);
  }

  // Ensure dimensions never drop below 1px
  return {
    width: Math.max(1, targetWidth),
    height: Math.max(1, targetHeight),
  };
}
