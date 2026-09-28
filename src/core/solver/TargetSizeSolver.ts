import { SOLVER_DEFAULTS } from '../../config/constants';
import type { FidelityMetrics, ImageDimensions, SupportedMimeType } from '../../types';
import { CanvasRasterizer } from '../engine/CanvasRasterizer';
import { OutputValidator } from '../engine/OutputValidator';
import { calculateContainDimensions } from '../../utils/dimensions';
import { formatBytes } from '../../utils/formatters';

export interface SolverParams {
  sourceImage: CanvasImageSource;
  targetBytes: number;
  format: SupportedMimeType;
  maxDimensions: ImageDimensions;
  originalDimensions?: ImageDimensions;
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
  impossibleTarget: boolean;
  targetMessage?: string;
  fidelityMetrics?: FidelityMetrics;
}

export class TargetSizeSolver {
  /**
   * Target Size Solver 2.0:
   * Constrained optimization solver that maximizes visual fidelity subject to:
   *   fileSize <= targetBytes
   *   aspectRatio preserved
   *   dimensions >= minimum
   *   output validated
   *
   * Invariants:
   * 1. Immutable reference: candidates are generated from original decoded source (zero generational loss).
   * 2. Quality-first: searches quality in safe range before touching dimensions.
   * 3. Adaptive containment downscaling: uses calculateContainDimensions for smooth stepped reductions.
   * 4. Impossible target protection: returns best safe validated candidate with clear message instead of destroying image.
   */
  public static async solve(params: SolverParams): Promise<SolverResult> {
    const startTime = performance.now();
    const {
      sourceImage,
      targetBytes,
      format,
      maxDimensions,
      originalDimensions = maxDimensions,
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
    let totalIterations = 0;
    let downscaled = false;
    let totalAttempts = 0;

    const lowerTargetBound = targetBytes * (1 - toleranceRatio);
    const upperTargetBound = targetBytes * (1 + toleranceRatio);

    // Adaptive containment step factors to avoid aggressive destructive dimension cuts
    const dimensionStepFactors = [0.92, 0.85, 0.78, 0.70, 0.60, 0.50, 0.40, 0.30];
    let stepIndex = 0;

    let bestBlob: Blob | null = null;
    let bestQuality = minQuality;
    let bestDimensions: ImageDimensions = { ...currentDimensions };
    let bestValid = false;

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

      // 1. Probe at minQuality for current dimensions
      const minQBlob = await encode(currentDimensions, minQuality);
      const minQSize = minQBlob.size;

      // Validate candidate
      const validation = await OutputValidator.validateCandidate(minQBlob, {
        expectedFormat: format,
        originalDimensions,
        maxDimensions: currentDimensions,
      });

      if (validation.isValid) {
        if (!bestBlob || (bestBlob.size > targetBytes && minQSize < bestBlob.size)) {
          bestBlob = minQBlob;
          bestQuality = minQuality;
          bestDimensions = { ...currentDimensions };
          bestValid = true;
        } else if (
          minQSize <= targetBytes &&
          (!bestBlob || bestBlob.size > targetBytes || minQSize > bestBlob.size)
        ) {
          bestBlob = minQBlob;
          bestQuality = minQuality;
          bestDimensions = { ...currentDimensions };
          bestValid = true;
        }
      }

      // Check if minQuality is already within tolerance
      if (minQSize >= lowerTargetBound && minQSize <= upperTargetBound && validation.isValid) {
        return {
          finalBlob: minQBlob,
          finalQuality: minQuality,
          finalDimensions: currentDimensions,
          achievedBytes: minQSize,
          targetBytes,
          iterationsCount: totalIterations,
          durationMs: performance.now() - startTime,
          targetAchieved: true,
          impossibleTarget: false,
          downscaled,
        };
      }

      // If even minQuality exceeds targetBytes at current dimensions:
      if (minQSize > targetBytes) {
        if (canDownscale && stepIndex < dimensionStepFactors.length) {
          const factor = dimensionStepFactors[stepIndex++];
          downscaled = true;

          const containRes = calculateContainDimensions(
            maxDimensions,
            {
              width: Math.max(minDimensions.width, Math.round(maxDimensions.width * factor)),
              height: Math.max(minDimensions.height, Math.round(maxDimensions.height * factor)),
            },
            { allowUpscale: false }
          );

          if (
            containRes.width === currentDimensions.width &&
            containRes.height === currentDimensions.height
          ) {
            break;
          }

          currentDimensions = {
            width: containRes.width,
            height: containRes.height,
          };
          continue;
        } else {
          // Reached smallest allowable dimension limit
          break;
        }
      }

      // 2. Binary search over Quality [minQuality, 1.0] since minQSize <= targetBytes
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

        const testValidation = await OutputValidator.validateCandidate(testBlob, {
          expectedFormat: format,
          originalDimensions,
          maxDimensions: currentDimensions,
        });

        if (testValidation.isValid) {
          if (testSize <= targetBytes) {
            if (!bestBlob || bestBlob.size > targetBytes || testSize > bestBlob.size) {
              bestBlob = testBlob;
              bestQuality = qMid;
              bestDimensions = { ...currentDimensions };
              bestValid = true;
            }
          } else {
            if (!bestBlob || (bestBlob.size > targetBytes && testSize < bestBlob.size)) {
              bestBlob = testBlob;
              bestQuality = qMid;
              bestDimensions = { ...currentDimensions };
              bestValid = true;
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
              impossibleTarget: false,
              downscaled,
            };
          }
        }

        if (testSize > targetBytes) {
          qHigh = qMid;
        } else {
          qLow = qMid;
        }
      }

      // If we found a valid candidate under targetBytes during this search, we can finish
      if (bestBlob && bestBlob.size <= targetBytes && bestValid) {
        return {
          finalBlob: bestBlob,
          finalQuality: Math.round(bestQuality * 100) / 100,
          finalDimensions: bestDimensions,
          achievedBytes: bestBlob.size,
          targetBytes,
          iterationsCount: totalIterations,
          durationMs: performance.now() - startTime,
          targetAchieved: true,
          impossibleTarget: false,
          downscaled,
        };
      }

      if (!canDownscale) {
        break;
      }
    }

    // Fallback: return best validated candidate
    const finalBlob = bestBlob || (await encode(currentDimensions, minQuality));
    const targetAchieved = finalBlob.size <= upperTargetBound;
    const impossibleTarget = !targetAchieved;

    let targetMessage: string | undefined;
    if (impossibleTarget) {
      targetMessage = `Target not safely achievable. Best validated result: ${formatBytes(finalBlob.size)}. Quality protection prevented further degradation.`;
    }

    return {
      finalBlob,
      finalQuality: Math.round(bestQuality * 100) / 100,
      finalDimensions: bestDimensions,
      achievedBytes: finalBlob.size,
      targetBytes,
      iterationsCount: totalIterations,
      durationMs: performance.now() - startTime,
      targetAchieved,
      impossibleTarget,
      targetMessage,
      downscaled,
    };
  }
}
