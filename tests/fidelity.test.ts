import { describe, expect, it } from 'vitest';
import { VisualFidelityGuard } from '../src/core/engine/VisualFidelityGuard';

describe('VisualFidelityGuard', () => {
  it('returns perfect fidelity for identical pixel buffers', () => {
    const width = 16;
    const height = 16;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 120; // R
      pixels[i + 1] = 150; // G
      pixels[i + 2] = 180; // B
      pixels[i + 3] = 255; // A
    }

    const metrics = VisualFidelityGuard.computeMetrics(pixels, pixels, width, height, 'maxFidelity');
    expect(metrics.ssim).toBe(1);
    expect(metrics.psnr).toBe(100);
    expect(metrics.meanDelta).toBe(0);
    expect(metrics.maxDelta).toBe(0);
    expect(metrics.isAcceptable).toBe(true);
  });

  it('measures small perturbations accurately with high SSIM and PSNR', () => {
    const width = 16;
    const height = 16;
    const orig = new Uint8ClampedArray(width * height * 4);
    const comp = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < orig.length; i += 4) {
      orig[i] = 128;
      orig[i + 1] = 128;
      orig[i + 2] = 128;
      orig[i + 3] = 255;

      // Add tiny perturbation of +/- 1 to 2
      comp[i] = 129;
      comp[i + 1] = 127;
      comp[i + 2] = 128;
      comp[i + 3] = 255;
    }

    const metrics = VisualFidelityGuard.computeMetrics(orig, comp, width, height, 'balanced');
    expect(metrics.ssim).toBeGreaterThan(0.98);
    expect(metrics.psnr).toBeGreaterThan(40);
    expect(metrics.meanDelta).toBeLessThan(1.5);
    expect(metrics.maxDelta).toBeLessThanOrEqual(2);
    expect(metrics.isAcceptable).toBe(true);
  });

  it('detects heavily degraded images and marks them unacceptable', () => {
    const width = 16;
    const height = 16;
    const orig = new Uint8ClampedArray(width * height * 4);
    const comp = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < orig.length; i += 4) {
      orig[i] = 250;
      orig[i + 1] = 250;
      orig[i + 2] = 250;
      orig[i + 3] = 255;

      // Severe degradation
      comp[i] = 20;
      comp[i + 1] = 20;
      comp[i + 2] = 20;
      comp[i + 3] = 255;
    }

    const metrics = VisualFidelityGuard.computeMetrics(orig, comp, width, height, 'balanced');
    expect(metrics.ssim).toBeLessThan(0.70);
    expect(metrics.psnr).toBeLessThan(20);
    expect(metrics.isAcceptable).toBe(false);
  });

  it('handles tiny dimensions (<8x8) using global SSIM fallback without error', () => {
    const width = 4;
    const height = 4;
    const orig = new Uint8ClampedArray(width * height * 4);
    const comp = new Uint8ClampedArray(width * height * 4);
    orig.fill(200);
    comp.fill(198);

    const metrics = VisualFidelityGuard.computeMetrics(orig, comp, width, height, 'balanced');
    expect(metrics.ssim).toBeGreaterThan(0.9);
    expect(metrics.psnr).toBeGreaterThan(35);
  });
});
