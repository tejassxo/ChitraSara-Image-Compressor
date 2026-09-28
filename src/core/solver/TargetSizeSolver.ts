import { SOLVER_DEFAULTS } from '../../config/constants';
import type { ImageDimensions, SupportedMimeType } from '../../types';
import { CanvasRasterizer } from '../engine/CanvasRasterizer';

export interface SolverParams {
  sourceImage: CanvasImageSource;
  targetBytes: number;
  format: SupportedMimeType;
  maxDimensions: ImageDimensions;
  toleranceRatio?: number;
  maxIterations?: number;
  minDimensions?: ImageDimensions;
  minQuality?: number;
  signal?: AbortSignal;
  encodeOverride?: (
    source: CanvasImageSource,
    dims: ImageDimensions,
    format: SupportedMimeType,
    quality: number
  ) => Promise<Blob>;
}

export interface SolverResult {
  finalBlob: Blob;
  finalQuality: number;
  finalDimensions: ImageDimensions;
  achievedBytes: number;
  targetBytes: number;
  iterationsCount: number;
  durationMs: number;
  targetAchieved: boolean;
  downscaled: boolean;
}

export class TargetSizeSolver {
  /**
   * Iterative binary search auto-tuner on quality with rapid progressive dimension downscaling
   */
  public static async solve(params: SolverParams): Promise<SolverResult> {
    const startTime = performance.now();
    const {
      sourceImage,
      targetBytes,
      format,
      maxDimensions,
      toleranceRatio = SOLVER_DEFAULTS.DEFAULT_TOLERANCE_RATIO,
      maxIterations = SOLVER_DEFAULTS.DEFAULT_MAX_ITERATIONS,
      minDimensions = {
        width: SOLVER_DEFAULTS.MIN_DIMENSION_WIDTH,
        height: SOLVER_DEFAULTS.MIN_DIMENSION_HEIGHT,
      },
      minQuality = SOLVER_DEFAULTS.MIN_QUALITY,
      signal,
      encodeOverride,
    } = params;

    if (signal?.aborted) {
      throw new DOMException('Solver aborted by user', 'AbortError');
    }

    if (targetBytes <= 0) {
      throw new Error(`Invalid target bytes: ${targetBytes}. Target size must be positive.`);
    }

    let currentDimensions: ImageDimensions = { ...maxDimensions };
    let currentScale = 1.0;
    let totalIterations = 0;
    let downscaled = false;
    let totalAttempts = 0;

    const lowerTargetBound = targetBytes * (1 - toleranceRatio);
    const upperTargetBound = targetBytes * (1 + toleranceRatio);

    let bestBlob: Blob | null = null;
    let bestQuality = minQuality;
    let bestDimensions: ImageDimensions = { ...currentDimensions };

    const encode = async (dims: ImageDimensions, q: number): Promise<Blob> => {
      totalIterations++;
      if (encodeOverride) {
        return encodeOverride(sourceImage, dims, format, q);
      }
      return CanvasRasterizer.renderAndEncode(sourceImage, {
        dimensions: dims,
        format,
        quality: q,
        signal,
      });
    };

    while (totalAttempts < SOLVER_DEFAULTS.MAX_TOTAL_ATTEMPTS) {
      totalAttempts++;

      if (signal?.aborted) {
        throw new DOMException('Solver aborted by user', 'AbortError');
      }

      const canDownscale =
        currentDimensions.width > minDimensions.width ||
        currentDimensions.height > minDimensions.height;

      // 1. First probe at minQuality
      // If even minQuality exceeds targetBytes, higher qualities will also exceed it!
      const minQBlob = await encode(currentDimensions, minQuality);
      const minQSize = minQBlob.size;

      // Track closest candidate
      if (!bestBlob || (bestBlob.size > targetBytes && minQSize < bestBlob.size)) {
        bestBlob = minQBlob;
        bestQuality = minQuality;
        bestDimensions = { ...currentDimensions };
      } else if (minQSize <= targetBytes && (!bestBlob || bestBlob.size > targetBytes || minQSize > bestBlob.size)) {
        bestBlob = minQBlob;
        bestQuality = minQuality;
        bestDimensions = { ...currentDimensions };
      }

      // Check if minQuality is already within tolerance
      if (minQSize >= lowerTargetBound && minQSize <= upperTargetBound) {
        return {
          finalBlob: minQBlob,
          finalQuality: minQuality,
          finalDimensions: currentDimensions,
          achievedBytes: minQSize,
          targetBytes,
          iterationsCount: totalIterations,
          durationMs: performance.now() - startTime,
          targetAchieved: true,
          downscaled,
        };
      }

      // If even minQuality exceeds targetBytes:
      if (minQSize > targetBytes) {
        if (canDownscale) {
          currentScale *= SOLVER_DEFAULTS.DOWNSCALE_STEP_FACTOR;
          downscaled = true;
          const nextWidth = Math.max(minDimensions.width, Math.round(maxDimensions.width * currentScale));
          const nextHeight = Math.max(minDimensions.height, Math.round(maxDimensions.height * currentScale));

          if (nextWidth === currentDimensions.width && nextHeight === currentDimensions.height) {
            break;
          }

          currentDimensions = {
            width: nextWidth,
            height: nextHeight,
          };
          continue;
        } else {
          // Already at minDimensions and minQuality; cannot reduce size any further
          break;
        }
      }

      // 2. Binary Search over Quality [minQuality, 1.0] since minQSize <= targetBytes
      let qLow = minQuality;
      let qHigh = 1.0;
      let stepIterations = 0;

      while (stepIterations < maxIterations && qHigh - qLow > 0.02) {
        if (signal?.aborted) {
          throw new DOMException('Solver aborted by user', 'AbortError');
        }

        stepIterations++;
        const qMid = (qLow + qHigh) / 2;
        const testBlob = await encode(currentDimensions, qMid);
        const testSize = testBlob.size;

        if (testSize <= targetBytes) {
          if (!bestBlob || bestBlob.size > targetBytes || testSize > bestBlob.size) {
            bestBlob = testBlob;
            bestQuality = qMid;
            bestDimensions = { ...currentDimensions };
          }
        } else {
          if (!bestBlob || (bestBlob.size > targetBytes && testSize < bestBlob.size)) {
            bestBlob = testBlob;
            bestQuality = qMid;
            bestDimensions = { ...currentDimensions };
          }
        }

        // Check if within tolerance
        if (testSize >= lowerTargetBound && testSize <= upperTargetBound) {
          return {
            finalBlob: testBlob,
            finalQuality: Math.round(qMid * 100) / 100,
            finalDimensions: currentDimensions,
            achievedBytes: testSize,
            targetBytes,
            iterationsCount: totalIterations,
            durationMs: performance.now() - startTime,
            targetAchieved: true,
            downscaled,
          };
        }

        if (testSize > targetBytes) {
          qHigh = qMid;
        } else {
          qLow = qMid;
        }
      }

      // If we found a candidate under targetBytes during this step, we can stop
      if (bestBlob && bestBlob.size <= targetBytes) {
        return {
          finalBlob: bestBlob,
          finalQuality: Math.round(bestQuality * 100) / 100,
          finalDimensions: bestDimensions,
          achievedBytes: bestBlob.size,
          targetBytes,
          iterationsCount: totalIterations,
          durationMs: performance.now() - startTime,
          targetAchieved: true,
          downscaled,
        };
      }

      if (!canDownscale) {
        break;
      }
    }

    // Return the closest achieved result
    const finalBlob = bestBlob || (await encode(currentDimensions, minQuality));

    return {
      finalBlob,
      finalQuality: Math.round(bestQuality * 100) / 100,
      finalDimensions: bestDimensions,
      achievedBytes: finalBlob.size,
      targetBytes,
      iterationsCount: totalIterations,
      durationMs: performance.now() - startTime,
      targetAchieved: finalBlob.size <= upperTargetBound,
      downscaled,
    };
  }
}
