import { describe, expect, it } from 'vitest';
import {
  calculateContainDimensions,
  formatAspectRatio,
  isAspectRatioPreserved,
} from '../src/utils/dimensions';

describe('calculateContainDimensions', () => {
  it('correctly resizes landscape image (1920x1080 -> 1280 width constraint)', () => {
    const res = calculateContainDimensions({ width: 1920, height: 1080 }, { width: 1280 });
    expect(res.width).toBe(1280);
    expect(res.height).toBe(720);
    expect(res.isUpscaled).toBe(false);
    expect(isAspectRatioPreserved({ width: 1920, height: 1080 }, res)).toBe(true);
  });

  it('correctly resizes portrait image (1080x1920 -> 720 width constraint)', () => {
    const res = calculateContainDimensions({ width: 1080, height: 1920 }, { width: 720 });
    expect(res.width).toBe(720);
    expect(res.height).toBe(1280);
    expect(res.isUpscaled).toBe(false);
    expect(isAspectRatioPreserved({ width: 1080, height: 1920 }, res)).toBe(true);
  });

  it('correctly resizes square image (1000x1000 -> 500)', () => {
    const res = calculateContainDimensions({ width: 1000, height: 1000 }, { width: 500, height: 500 });
    expect(res.width).toBe(500);
    expect(res.height).toBe(500);
    expect(res.isUpscaled).toBe(false);
    expect(res.aspectRatio).toBeCloseTo(1.0);
  });

  it('correctly handles ultra-wide image (3840x1080 -> width 1920)', () => {
    const res = calculateContainDimensions({ width: 3840, height: 1080 }, { width: 1920, height: 1080 });
    expect(res.width).toBe(1920);
    expect(res.height).toBe(540);
    expect(isAspectRatioPreserved({ width: 3840, height: 1080 }, res)).toBe(true);
  });

  it('correctly handles very tall image (1000x6000 -> height 2000)', () => {
    const res = calculateContainDimensions({ width: 1000, height: 6000 }, { width: 1000, height: 2000 });
    expect(res.width).toBe(333);
    expect(res.height).toBe(2000);
    expect(isAspectRatioPreserved({ width: 1000, height: 6000 }, res)).toBe(true);
  });

  it('correctly handles odd dimensions (1337x923 -> width 650)', () => {
    const res = calculateContainDimensions({ width: 1337, height: 923 }, { width: 650 });
    expect(res.width).toBe(650);
    expect(res.height).toBe(Math.round(923 * (650 / 1337)));
    expect(isAspectRatioPreserved({ width: 1337, height: 923 }, res)).toBe(true);
  });

  it('handles 1-pixel edge cases safely', () => {
    const res1x1 = calculateContainDimensions({ width: 1, height: 1 }, { width: 500 });
    expect(res1x1.width).toBe(1);
    expect(res1x1.height).toBe(1);

    const resTall1 = calculateContainDimensions({ width: 1, height: 1000 }, { height: 100 });
    expect(resTall1.height).toBe(100);
    expect(resTall1.width).toBe(1); // Clamped to min 1

    const resWide1 = calculateContainDimensions({ width: 1000, height: 1 }, { width: 100 });
    expect(resWide1.width).toBe(100);
    expect(resWide1.height).toBe(1); // Clamped to min 1
  });

  it('prevents upscaling by default when requested dimensions exceed original', () => {
    const original = { width: 1920, height: 1080 };
    const res = calculateContainDimensions(original, { width: 2560, height: 1440 });
    expect(res.width).toBe(1920);
    expect(res.height).toBe(1080);
    expect(res.scale).toBe(1.0);
    expect(res.isUpscaled).toBe(false);
  });

  it('allows upscaling only when allowUpscale is explicitly true', () => {
    const original = { width: 1920, height: 1080 };
    const res = calculateContainDimensions(original, { width: 3840, height: 2160 }, { allowUpscale: true });
    expect(res.width).toBe(3840);
    expect(res.height).toBe(2160);
    expect(res.scale).toBe(2.0);
    expect(res.isUpscaled).toBe(true);
  });

  it('enforces hardware canvas ceiling (maxCanvasDim)', () => {
    const original = { width: 12000, height: 8000 };
    const res = calculateContainDimensions(original, {}, { maxCanvasDim: 4096 });
    expect(res.width).toBeLessThanOrEqual(4096);
    expect(res.height).toBeLessThanOrEqual(4096);
    expect(isAspectRatioPreserved(original, res)).toBe(true);
  });

  it('preserves dimensions when target is empty or unconstrained', () => {
    const original = { width: 800, height: 600 };
    const res = calculateContainDimensions(original, {});
    expect(res.width).toBe(800);
    expect(res.height).toBe(600);
  });
});

describe('isAspectRatioPreserved', () => {
  it('returns true for exact ratio matches', () => {
    expect(isAspectRatioPreserved({ width: 1920, height: 1080 }, { width: 1280, height: 720 })).toBe(true);
    expect(isAspectRatioPreserved({ width: 1000, height: 1000 }, { width: 500, height: 500 })).toBe(true);
  });

  it('returns true within small pixel rounding tolerance', () => {
    // 51x33 has ratio 1.5454. 25x16 has ratio 1.5625. Difference ~1.1%
    expect(isAspectRatioPreserved({ width: 51, height: 33 }, { width: 25, height: 16 }, 1.5)).toBe(true);
  });

  it('returns false for distorted ratios', () => {
    expect(isAspectRatioPreserved({ width: 1920, height: 1080 }, { width: 1080, height: 1920 })).toBe(false);
    expect(isAspectRatioPreserved({ width: 1000, height: 1000 }, { width: 1000, height: 500 })).toBe(false);
  });
});

describe('formatAspectRatio', () => {
  it('formats standard ratios', () => {
    expect(formatAspectRatio(1920, 1080)).toBe('16:9');
    expect(formatAspectRatio(1080, 1920)).toBe('9:16');
    expect(formatAspectRatio(800, 600)).toBe('4:3');
    expect(formatAspectRatio(600, 800)).toBe('3:4');
    expect(formatAspectRatio(1000, 1000)).toBe('1:1');
    expect(formatAspectRatio(300, 200)).toBe('3:2');
  });

  it('formats non-standard ratios using simplified numbers or float ratio', () => {
    const formatted = formatAspectRatio(1500, 500);
    expect(formatted).toBe('3:1');
  });
});
