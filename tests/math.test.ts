import { describe, expect, it } from 'vitest';
import { calculateTargetDimensions, clamp } from '../src/utils/math';

describe('Math Utilities - Dimension Calculations', () => {
  it('clamp should restrict values within bounds', () => {
    expect(clamp(50, 0, 100)).toBe(50);
    expect(clamp(-10, 0, 100)).toBe(0);
    expect(clamp(150, 0, 100)).toBe(100);
  });

  describe('Aspect Ratio and Scale Algorithms', () => {
    it('preserves exact dimensions in original mode when within canvas limits', () => {
      const source = { width: 1920, height: 1080 };
      const dims = calculateTargetDimensions(source, { mode: 'original', maintainAspectRatio: true }, 4096);
      expect(dims).toEqual({ width: 1920, height: 1080 });
    });

    it('scales dimensions proportionally in scale mode with sub-pixel safe rounding', () => {
      const source = { width: 1921, height: 1081 };
      const dims = calculateTargetDimensions(
        source,
        { mode: 'scale', scalePercent: 50, maintainAspectRatio: true },
        4096
      );
      expect(dims.width).toBe(961); // Math.round(1921 * 0.5) = 961
      expect(dims.height).toBe(541); // Math.round(1081 * 0.5) = 541
    });

    it('correctly fits extreme landscape aspect ratios (e.g. 10:1 banner)', () => {
      const landscapeSource = { width: 5000, height: 500 }; // 10:1 ratio
      const dims = calculateTargetDimensions(
        landscapeSource,
        { mode: 'constraint', maxWidth: 1000, maxHeight: 1000, maintainAspectRatio: true },
        4096
      );
      expect(dims.width).toBe(1000);
      expect(dims.height).toBe(100); // 10:1 ratio preserved
    });

    it('correctly fits extreme portrait aspect ratios (e.g. 1:10 skyscraper)', () => {
      const portraitSource = { width: 400, height: 4000 }; // 1:10 ratio
      const dims = calculateTargetDimensions(
        portraitSource,
        { mode: 'constraint', maxWidth: 1000, maxHeight: 1000, maintainAspectRatio: true },
        4096
      );
      expect(dims.height).toBe(1000);
      expect(dims.width).toBe(100); // 1:10 ratio preserved
    });

    it('correctly fits ultra-wide panoramic aspect ratios (e.g. 32:9)', () => {
      const panoramic = { width: 5120, height: 1440 }; // 32:9 ratio
      const dims = calculateTargetDimensions(
        panoramic,
        { mode: 'constraint', maxWidth: 2560, maxHeight: 1440, maintainAspectRatio: true },
        4096
      );
      expect(dims.width).toBe(2560);
      expect(dims.height).toBe(720);
    });

    it('enforces hardware maxCanvasDim constraint and downscales proportionally', () => {
      const massiveSource = { width: 12000, height: 6000 };
      const dims = calculateTargetDimensions(
        massiveSource,
        { mode: 'original', maintainAspectRatio: true },
        2048 // Low-power canvas limit
      );
      expect(dims.width).toBe(2048);
      expect(dims.height).toBe(1024);
    });

    it('safely handles zero or negative dimensions by returning minimum 1x1', () => {
      expect(calculateTargetDimensions({ width: 0, height: 0 }, { mode: 'original', maintainAspectRatio: true })).toEqual({
        width: 1,
        height: 1,
      });
      expect(calculateTargetDimensions({ width: -100, height: 50 }, { mode: 'original', maintainAspectRatio: true })).toEqual({
        width: 1,
        height: 1,
      });
    });
  });
});
