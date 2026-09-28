import { describe, expect, it } from 'vitest';
import { SmartFormatSelector } from '../src/core/engine/SmartFormatSelector';

describe('SmartFormatSelector', () => {
  const fullSupport = { jpeg: true, png: true, webp: true, avif: true };
  const legacySupport = { jpeg: true, png: true, webp: true, avif: false };

  it('recommends WebP for images with transparency to save size while preserving alpha', () => {
    const rec = SmartFormatSelector.recommendFormat({
      sourceMime: 'image/png',
      hasAlpha: true,
      fileSizeBytes: 500 * 1024,
      width: 1200,
      height: 800,
      formatSupport: fullSupport,
    });

    expect(rec.recommendedFormat).toBe('image/webp');
    expect(rec.supportedAlternatives).not.toContain('image/jpeg');
    expect(rec.reason).toContain('alpha');
  });

  it('recommends AVIF or WebP for high-resolution photos', () => {
    const rec = SmartFormatSelector.recommendFormat({
      sourceMime: 'image/jpeg',
      hasAlpha: false,
      fileSizeBytes: 2 * 1024 * 1024,
      width: 3840,
      height: 2160,
      formatSupport: fullSupport,
    });

    expect(['image/avif', 'image/webp']).toContain(rec.recommendedFormat);
    expect(rec.reason).toBeDefined();
  });

  it('falls back to WebP for photos when AVIF is unsupported', () => {
    const rec = SmartFormatSelector.recommendFormat({
      sourceMime: 'image/jpeg',
      hasAlpha: false,
      fileSizeBytes: 2 * 1024 * 1024,
      width: 3840,
      height: 2160,
      formatSupport: legacySupport,
    });

    expect(rec.recommendedFormat).toBe('image/webp');
  });

  it('recommends PNG or WebP for UI screenshots and graphics', () => {
    const rec = SmartFormatSelector.recommendFormat({
      sourceMime: 'image/png',
      hasAlpha: false,
      fileSizeBytes: 150 * 1024,
      width: 800,
      height: 600,
      formatSupport: fullSupport,
    });

    expect(['image/webp', 'image/png']).toContain(rec.recommendedFormat);
  });
});
