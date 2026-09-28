import type { SupportedMimeType } from '../types';

export interface AlphaAnalysisResult {
  hasAlpha: boolean;
  isSemiTransparent: boolean;
  transparentPixelCount: number;
  totalPixels: number;
}

/**
 * Formats that inherently support alpha / transparency channels.
 */
export const ALPHA_SUPPORTING_FORMATS: ReadonlySet<SupportedMimeType> = new Set([
  'image/png',
  'image/webp',
  'image/avif',
]);

/**
 * Checks whether a given MIME type supports an alpha channel.
 */
export function isFormatAlphaCompatible(format: string): boolean {
  return ALPHA_SUPPORTING_FORMATS.has(format as SupportedMimeType);
}

/**
 * Scans an ImageData buffer to detect transparent or semi-transparent pixels.
 * Uses high-performance strided scanning for large buffers to prevent UI lockup.
 */
export function analyzeAlphaChannel(
  data: Uint8ClampedArray | ImageData,
  step = 1
): AlphaAnalysisResult {
  const pixels =
    typeof ImageData !== 'undefined' && data instanceof ImageData
      ? data.data
      : 'data' in data && (data as ImageData).data instanceof Uint8ClampedArray
      ? (data as ImageData).data
      : (data as Uint8ClampedArray);
  const totalPixels = Math.floor(pixels.length / 4);

  let transparentPixelCount = 0;
  let isSemiTransparent = false;
  let hasAlpha = false;

  // Stride step to optimize large buffers
  const stride = Math.max(1, step) * 4;

  for (let i = 3; i < pixels.length; i += stride) {
    const a = pixels[i];
    if (a < 255) {
      hasAlpha = true;
      transparentPixelCount++;
      if (a > 0) {
        isSemiTransparent = true;
      }
    }
  }

  return {
    hasAlpha,
    isSemiTransparent,
    transparentPixelCount,
    totalPixels,
  };
}

/**
 * Resolves safe format policy when transparency is detected.
 * Guarantees that transparent images are never silently flattened without notification.
 */
export function resolveSafeFormatForAlpha(
  hasAlpha: boolean,
  requestedFormat: SupportedMimeType | 'original',
  sourceMime: SupportedMimeType
): {
  format: SupportedMimeType;
  hasWarning: boolean;
  warningMessage?: string;
  transparencyFlattened: boolean;
} {
  let targetMime: SupportedMimeType;

  if (requestedFormat === 'original') {
    targetMime = sourceMime;
  } else {
    targetMime = requestedFormat;
  }

  if (hasAlpha && !isFormatAlphaCompatible(targetMime)) {
    return {
      format: targetMime,
      hasWarning: true,
      warningMessage: `Image contains transparency, but ${targetMime.split('/')[1].toUpperCase()} does not support alpha. Transparent areas will be flattened with a solid background.`,
      transparencyFlattened: true,
    };
  }

  return {
    format: targetMime,
    hasWarning: false,
    transparencyFlattened: false,
  };
}
