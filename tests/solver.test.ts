import { describe, expect, it } from 'vitest';
import { TargetSizeSolver } from '../src/core/solver/TargetSizeSolver';
import type { ImageDimensions, SupportedMimeType } from '../src/types';

describe('TargetSizeSolver - Binary Search & Progressive Downscaler', () => {
  it('converges quickly (<= 5 iterations) for reachable target sizes', async () => {
    let iterations = 0;
    // Mock encoder: size directly proportional to quality: size = 200KB * quality
    const mockEncode = async (
      _source: CanvasImageSource,
      _dims: ImageDimensions,
      _format: SupportedMimeType,
      quality: number
    ): Promise<Blob> => {
      iterations++;
      const sizeBytes = Math.round(200 * 1024 * quality); // 200KB at q=1.0, 100KB at q=0.5
      return new Blob([new Uint8Array(sizeBytes)], { type: 'image/jpeg' });
    };

    const targetBytes = 100 * 1024; // 100 KB target (+/- 5% tolerance = 95KB - 105KB)
    const result = await TargetSizeSolver.solve({
      sourceImage: {} as CanvasImageSource,
      targetBytes,
      format: 'image/jpeg',
      maxDimensions: { width: 1920, height: 1080 },
      toleranceRatio: 0.05,
      maxIterations: 7,
      encodeOverride: mockEncode,
    });

    expect(result.targetAchieved).toBe(true);
    expect(result.achievedBytes).toBeLessThanOrEqual(targetBytes * 1.05);
    expect(result.achievedBytes).toBeGreaterThanOrEqual(targetBytes * 0.95);
    expect(result.iterationsCount).toBeLessThanOrEqual(5);
    expect(result.downscaled).toBe(false);
  });

  it('gracefully downscales dimensions to minDimensions for impossible target sizes', async () => {
    // Mock encoder: even at minQuality (0.15), size is 50 KB. Target is 5 KB (impossible without downscaling)
    const minDims: ImageDimensions = { width: 320, height: 320 };
    const mockEncode = async (
      _source: CanvasImageSource,
      dims: ImageDimensions,
      _format: SupportedMimeType,
      _quality: number
    ): Promise<Blob> => {
      // Area-based size: at 4K (3840x2160) = 500KB; at 320x320 = 10KB
      const area = dims.width * dims.height;
      const sizeBytes = Math.max(8 * 1024, Math.round(area * 0.06));
      return new Blob([new Uint8Array(sizeBytes)], { type: 'image/jpeg' });
    };

    const impossibleTarget = 5 * 1024; // 5 KB target for 4K frame
    const result = await TargetSizeSolver.solve({
      sourceImage: {} as CanvasImageSource,
      targetBytes: impossibleTarget,
      format: 'image/jpeg',
      maxDimensions: { width: 3840, height: 2160 },
      minDimensions: minDims,
      encodeOverride: mockEncode,
    });

    expect(result.downscaled).toBe(true);
    // Should stop gracefully at or near minDimensions without infinite loop
    expect(result.finalDimensions.width).toBeLessThanOrEqual(3840 * 0.8);
    expect(result.finalDimensions.width).toBeGreaterThanOrEqual(minDims.width);
    expect(result.finalDimensions.height).toBeGreaterThanOrEqual(minDims.height);
    expect(result.iterationsCount).toBeLessThan(15);
  });

  it('aborts cleanly when signal is canceled with zero hanging promises', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      TargetSizeSolver.solve({
        sourceImage: {} as CanvasImageSource,
        targetBytes: 50 * 1024,
        format: 'image/jpeg',
        maxDimensions: { width: 800, height: 600 },
        signal: controller.signal,
      })
    ).rejects.toThrow('Solver aborted by user');
  });

  it('throws an error for invalid non-positive target bytes', async () => {
    await expect(
      TargetSizeSolver.solve({
        sourceImage: {} as CanvasImageSource,
        targetBytes: 0,
        format: 'image/jpeg',
        maxDimensions: { width: 800, height: 600 },
      })
    ).rejects.toThrow(/Invalid target bytes/);
  });
});
