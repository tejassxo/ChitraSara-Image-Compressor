import { describe, expect, it } from 'vitest';
import {
  analyzeAlphaChannel,
  isFormatAlphaCompatible,
  resolveSafeFormatForAlpha,
} from '../src/utils/alpha';

describe('analyzeAlphaChannel', () => {
  it('detects fully opaque images', () => {
    // 4 pixels, RGBA = 255, 255, 255, 255
    const data = new Uint8ClampedArray([
      255, 255, 255, 255,
      128, 128, 128, 255,
      0, 0, 0, 255,
      200, 100, 50, 255,
    ]);
    const res = analyzeAlphaChannel(data);
    expect(res.hasAlpha).toBe(false);
    expect(res.isSemiTransparent).toBe(false);
    expect(res.transparentPixelCount).toBe(0);
    expect(res.totalPixels).toBe(4);
  });

  it('detects fully transparent pixels', () => {
    const data = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 0, // Fully transparent
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]);
    const res = analyzeAlphaChannel(data);
    expect(res.hasAlpha).toBe(true);
    expect(res.isSemiTransparent).toBe(false);
    expect(res.transparentPixelCount).toBe(1);
  });

  it('detects semi-transparent pixels', () => {
    const data = new Uint8ClampedArray([
      255, 255, 255, 255,
      255, 0, 0, 128, // Semi-transparent
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]);
    const res = analyzeAlphaChannel(data);
    expect(res.hasAlpha).toBe(true);
    expect(res.isSemiTransparent).toBe(true);
    expect(res.transparentPixelCount).toBe(1);
  });
});

describe('isFormatAlphaCompatible', () => {
  it('correctly identifies alpha-supporting formats', () => {
    expect(isFormatAlphaCompatible('image/png')).toBe(true);
    expect(isFormatAlphaCompatible('image/webp')).toBe(true);
    expect(isFormatAlphaCompatible('image/avif')).toBe(true);
    expect(isFormatAlphaCompatible('image/jpeg')).toBe(false);
  });
});

describe('resolveSafeFormatForAlpha', () => {
  it('warns when converting transparent image to JPEG', () => {
    const res = resolveSafeFormatForAlpha(true, 'image/jpeg', 'image/png');
    expect(res.hasWarning).toBe(true);
    expect(res.transparencyFlattened).toBe(true);
    expect(res.warningMessage).toContain('does not support alpha');
  });

  it('does not warn when converting transparent image to WebP or PNG', () => {
    const resWebp = resolveSafeFormatForAlpha(true, 'image/webp', 'image/png');
    expect(resWebp.hasWarning).toBe(false);
    expect(resWebp.transparencyFlattened).toBe(false);

    const resPng = resolveSafeFormatForAlpha(true, 'image/png', 'image/png');
    expect(resPng.hasWarning).toBe(false);
  });

  it('does not warn for opaque image converted to JPEG', () => {
    const res = resolveSafeFormatForAlpha(false, 'image/jpeg', 'image/png');
    expect(res.hasWarning).toBe(false);
    expect(res.transparencyFlattened).toBe(false);
  });
});
