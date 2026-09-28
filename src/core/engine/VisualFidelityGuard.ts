import type { FidelityMetrics, FidelityProfile, ImageDimensions } from '../../types';

export interface FidelityThresholds {
  minSsim: number;
  minPsnr: number;
  maxMeanDelta: number;
  maxDelta: number;
}

export const FIDELITY_THRESHOLDS: Record<FidelityProfile, FidelityThresholds> = {
  maxFidelity: {
    minSsim: 0.95,
    minPsnr: 36.0,
    maxMeanDelta: 5.0,
    maxDelta: 35,
  },
  balanced: {
    minSsim: 0.88,
    minPsnr: 30.0,
    maxMeanDelta: 12.0,
    maxDelta: 60,
  },
  maxCompression: {
    minSsim: 0.80,
    minPsnr: 26.0,
    maxMeanDelta: 22.0,
    maxDelta: 90,
  },
  targetSize: {
    minSsim: 0.75, // Quality protection floor to prevent destroyed output
    minPsnr: 24.0,
    maxMeanDelta: 28.0,
    maxDelta: 120,
  },
  lossless: {
    minSsim: 0.9999,
    minPsnr: 80.0,
    maxMeanDelta: 0.01,
    maxDelta: 0,
  },
};

export class VisualFidelityGuard {
  /**
   * Computes comprehensive visual fidelity metrics between two aligned pixel buffers.
   * Both buffers MUST have identical dimensions.
   */
  public static computeMetrics(
    origPixels: Uint8ClampedArray,
    compPixels: Uint8ClampedArray,
    width: number,
    height: number,
    profile: FidelityProfile = 'balanced'
  ): FidelityMetrics {
    if (origPixels.length !== compPixels.length || origPixels.length < width * height * 4) {
      throw new Error(
        `Mismatched buffer sizes for fidelity evaluation: original=${origPixels.length}, compressed=${compPixels.length}, expected=${width * height * 4}`
      );
    }

    const totalPixels = width * height;
    if (totalPixels === 0) {
      return {
        ssim: 1,
        psnr: 100,
        meanDelta: 0,
        maxDelta: 0,
        isAcceptable: true,
      };
    }

    let sumSquaredError = 0;
    let sumAbsDiff = 0;
    let maxDelta = 0;

    // Luminance buffers for SSIM (Y = 0.299R + 0.587G + 0.114B)
    const lumOrig = new Float32Array(totalPixels);
    const lumComp = new Float32Array(totalPixels);

    let lumOrigSum = 0;
    let lumCompSum = 0;

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      const r1 = origPixels[idx];
      const g1 = origPixels[idx + 1];
      const b1 = origPixels[idx + 2];

      const r2 = compPixels[idx];
      const g2 = compPixels[idx + 1];
      const b2 = compPixels[idx + 2];

      const dr = Math.abs(r1 - r2);
      const dg = Math.abs(g1 - g2);
      const db = Math.abs(b1 - b2);

      sumSquaredError += (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
      sumAbsDiff += dr + dg + db;

      const pMax = Math.max(dr, dg, db);
      if (pMax > maxDelta) maxDelta = pMax;

      const y1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
      const y2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;

      lumOrig[i] = y1;
      lumComp[i] = y2;
      lumOrigSum += y1;
      lumCompSum += y2;
    }

    // 1. MSE and PSNR Calculation
    const mse = sumSquaredError / (totalPixels * 3);
    let psnr = 100;
    if (mse > 0.00001) {
      psnr = 10 * Math.log10((255 * 255) / mse);
    }

    // 2. Mean Delta
    const meanDelta = sumAbsDiff / (totalPixels * 3);

    // 3. Fast Windowed Block SSIM (8x8 blocks)
    const ssim = this.calculateBlockSsim(lumOrig, lumComp, width, height);

    // 4. Acceptability evaluation against profile thresholds
    const thresholds = FIDELITY_THRESHOLDS[profile] || FIDELITY_THRESHOLDS.balanced;
    const isAcceptable =
      ssim >= thresholds.minSsim &&
      psnr >= thresholds.minPsnr &&
      meanDelta <= thresholds.maxMeanDelta &&
      maxDelta <= thresholds.maxDelta;

    return {
      ssim: Math.round(ssim * 10000) / 10000,
      psnr: Math.round(psnr * 100) / 100,
      meanDelta: Math.round(meanDelta * 100) / 100,
      maxDelta,
      isAcceptable,
    };
  }

  /**
   * Block-based Structural Similarity Index (SSIM) using standard 8x8 windows.
   */
  private static calculateBlockSsim(
    img1: Float32Array,
    img2: Float32Array,
    width: number,
    height: number
  ): number {
    const C1 = 6.5025; // (0.01 * 255)^2
    const C2 = 58.5225; // (0.03 * 255)^2

    const blockSize = 8;
    const blocksX = Math.floor(width / blockSize);
    const blocksY = Math.floor(height / blockSize);

    if (blocksX === 0 || blocksY === 0) {
      // Image too small for 8x8 blocks: compute global SSIM
      return this.calculateGlobalSsim(img1, img2, C1, C2);
    }

    let totalSsim = 0;
    let blockCount = 0;

    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        let sum1 = 0;
        let sum2 = 0;
        let sumSq1 = 0;
        let sumSq2 = 0;
        let sum12 = 0;

        const startX = bx * blockSize;
        const startY = by * blockSize;

        for (let y = 0; y < blockSize; y++) {
          const rowOffset = (startY + y) * width;
          for (let x = 0; x < blockSize; x++) {
            const idx = rowOffset + (startX + x);
            const v1 = img1[idx];
            const v2 = img2[idx];

            sum1 += v1;
            sum2 += v2;
            sumSq1 += v1 * v1;
            sumSq2 += v2 * v2;
            sum12 += v1 * v2;
          }
        }

        const n = blockSize * blockSize;
        const mean1 = sum1 / n;
        const mean2 = sum2 / n;

        const var1 = Math.max(0, sumSq1 / n - mean1 * mean1);
        const var2 = Math.max(0, sumSq2 / n - mean2 * mean2);
        const covar = sum12 / n - mean1 * mean2;

        const numerator = (2 * mean1 * mean2 + C1) * (2 * covar + C2);
        const denominator = (mean1 * mean1 + mean2 * mean2 + C1) * (var1 + var2 + C2);

        const blockSsim = denominator > 0 ? numerator / denominator : 1;
        totalSsim += blockSsim;
        blockCount++;
      }
    }

    return blockCount > 0 ? totalSsim / blockCount : 1;
  }

  /**
   * Fallback for tiny dimensions (< 8px)
   */
  private static calculateGlobalSsim(
    img1: Float32Array,
    img2: Float32Array,
    C1: number,
    C2: number
  ): number {
    const n = img1.length;
    if (n === 0) return 1;

    let sum1 = 0;
    let sum2 = 0;
    let sumSq1 = 0;
    let sumSq2 = 0;
    let sum12 = 0;

    for (let i = 0; i < n; i++) {
      const v1 = img1[i];
      const v2 = img2[i];
      sum1 += v1;
      sum2 += v2;
      sumSq1 += v1 * v1;
      sumSq2 += v2 * v2;
      sum12 += v1 * v2;
    }

    const mean1 = sum1 / n;
    const mean2 = sum2 / n;
    const var1 = Math.max(0, sumSq1 / n - mean1 * mean1);
    const var2 = Math.max(0, sumSq2 / n - mean2 * mean2);
    const covar = sum12 / n - mean1 * mean2;

    const numerator = (2 * mean1 * mean2 + C1) * (2 * covar + C2);
    const denominator = (mean1 * mean1 + mean2 * mean2 + C1) * (var1 + var2 + C2);

    return denominator > 0 ? numerator / denominator : 1;
  }

  /**
   * Evaluates if a set of fidelity metrics is eligible for output selection
   */
  public static isCandidateEligible(
    metrics: FidelityMetrics,
    profile: FidelityProfile = 'balanced'
  ): boolean {
    const thresholds = FIDELITY_THRESHOLDS[profile] || FIDELITY_THRESHOLDS.balanced;
    return metrics.ssim >= thresholds.minSsim && metrics.psnr >= thresholds.minPsnr;
  }
}
