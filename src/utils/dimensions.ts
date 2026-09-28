import type { ImageDimensions } from '../types';

export interface ContainDimensionOptions {
  allowUpscale?: boolean;
  maxCanvasDim?: number;
}

export interface ContainDimensionResult {
  width: number;
  height: number;
  scale: number;
  isUpscaled: boolean;
  aspectRatio: number;
}

/**
 * Calculates target dimensions preserving aspect ratio with sub-pixel safe rounding,
 * default anti-upscaling protection, and hardware canvas limits.
 *
 * Guaranteed Invariants:
 * - Aspect ratio preserved within sub-pixel rounding tolerance.
 * - scale > 1 is prevented unless options.allowUpscale is true.
 * - Dimensions are clamped to at least 1x1.
 * - Fits strictly within target bounds (contain logic, never crop/cover).
 */
export function calculateContainDimensions(
  original: ImageDimensions,
  target: { width?: number; height?: number },
  options: ContainDimensionOptions = {}
): ContainDimensionResult {
  const { allowUpscale = false, maxCanvasDim = 16384 } = options;

  const origW = Math.max(1, Math.round(original.width));
  const origH = Math.max(1, Math.round(original.height));
  const aspectRatio = origW / origH;

  const scaleX = target.width !== undefined && target.width > 0 ? target.width / origW : Infinity;
  const scaleY = target.height !== undefined && target.height > 0 ? target.height / origH : Infinity;
  let scale = Math.min(scaleX, scaleY);

  if (!isFinite(scale)) {
    scale = 1.0;
  }

  let isUpscaled = false;
  if (scale > 1) {
    if (!allowUpscale) {
      scale = 1;
    } else {
      isUpscaled = true;
    }
  }

  let newWidth = Math.round(origW * scale);
  let newHeight = Math.round(origH * scale);

  // Hardware boundary clamping
  if (newWidth > maxCanvasDim || newHeight > maxCanvasDim) {
    const overflowFactor = Math.min(maxCanvasDim / newWidth, maxCanvasDim / newHeight);
    newWidth = Math.round(newWidth * overflowFactor);
    newHeight = Math.round(newHeight * overflowFactor);
  }

  // Guarantee minimum 1x1
  newWidth = Math.max(1, newWidth);
  newHeight = Math.max(1, newHeight);

  return {
    width: newWidth,
    height: newHeight,
    scale,
    isUpscaled,
    aspectRatio,
  };
}

/**
 * Verifies that the aspect ratio of target matches original within a relative tolerance (default 1.0%).
 * Pixel rounding causes slight deviations on small or odd dimensions (e.g. 1920x1080 -> 1280x720 is exact 1.7778,
 * but 51x33 -> 25x16 has ~2% rounding difference).
 */
export function isAspectRatioPreserved(
  original: ImageDimensions,
  target: ImageDimensions,
  tolerancePercent = 1.5
): boolean {
  if (original.width <= 0 || original.height <= 0 || target.width <= 0 || target.height <= 0) {
    return false;
  }
  const origRatio = original.width / original.height;
  const targetRatio = target.width / target.height;
  const relativeDiff = Math.abs(origRatio - targetRatio) / origRatio;
  return relativeDiff * 100 <= tolerancePercent;
}

/**
 * Formats width and height into standard ratio notation (e.g. "16:9", "4:3", "1:1", "21:9")
 */
export function formatAspectRatio(width: number, height: number): string {
  if (width <= 0 || height <= 0) return '1:1';

  // Common standard ratios with small epsilon tolerance
  const ratio = width / height;
  const commonRatios: [number, string][] = [
    [1, '1:1'],
    [16 / 9, '16:9'],
    [9 / 16, '9:16'],
    [4 / 3, '4:3'],
    [3 / 4, '3:4'],
    [3 / 2, '3:2'],
    [2 / 3, '2:3'],
    [21 / 9, '21:9'],
    [5 / 4, '5:4'],
  ];

  for (const [val, label] of commonRatios) {
    if (Math.abs(ratio - val) < 0.02) {
      return label;
    }
  }

  // Greatest common divisor reduction
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const div = gcd(Math.round(width), Math.round(height));
  const rw = Math.round(width / div);
  const rh = Math.round(height / div);

  if (rw > 50 || rh > 50) {
    return `${ratio.toFixed(2)}:1`;
  }
  return `${rw}:${rh}`;
}
