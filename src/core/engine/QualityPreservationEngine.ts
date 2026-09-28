import { HardwareGovernor } from '../governor/HardwareGovernor';
import { calculateContainDimensions, type ContainDimensionResult } from '../../utils/dimensions';
import { resolveSafeFormatForAlpha } from '../../utils/alpha';
import type { ExifOrientation } from '../../utils/exif';
import { OutputValidator, type CandidateValidationReport } from './OutputValidator';
import { VisualFidelityGuard } from './VisualFidelityGuard';
import type {
  FidelityMetrics,
  FidelityProfile,
  ImageDimensions,
  ResizeOptions,
  SupportedMimeType,
} from '../../types';

export type ResizingStrategy = 'none' | 'direct' | 'stepped';

export type ColorManagementPolicy = 'preserve' | 'normalize' | 'strip';

export interface QualityPreservationPlan {
  safeDimensions: ImageDimensions;
  resizingStrategy: ResizingStrategy;
  isResizingNecessary: boolean;
  aspectRatio: number;
  scale: number;
  isUpscaled: boolean;
  orientation: ExifOrientation;
  targetFormat: SupportedMimeType;
  transparencyPreserved: boolean;
  transparencyWarning?: string;
  maxCanvasDimension: number;
  colorPolicy: ColorManagementPolicy;
  containResult: ContainDimensionResult;
}

export interface QualityPreservationOptions {
  originalDimensions: ImageDimensions;
  sourceMime: SupportedMimeType;
  targetFormat: SupportedMimeType | 'original';
  hasAlpha?: boolean;
  orientation?: ExifOrientation;
  resize?: ResizeOptions;
  allowUpscale?: boolean;
  colorPolicy?: ColorManagementPolicy;
}

export class QualityPreservationEngine {
  /**
   * Constructs an immutable, safety-hardened preservation plan prior to compression.
   * Enforces:
   * - Aspect ratio containment
   * - Anti-upscale protection by default
   * - Progressive stepped downscale strategy selection for large reduction factors
   * - Transparency requirement resolution
   * - Hardware canvas boundary clamping
   */
  public static createPreservationPlan(
    options: QualityPreservationOptions
  ): QualityPreservationPlan {
    const caps = HardwareGovernor.getCapabilities();
    const origDims = options.originalDimensions;
    const orientation = options.orientation || 1;
    const allowUpscale = options.allowUpscale ?? (options.resize?.allowUpscale || false);
    const colorPolicy = options.colorPolicy || 'normalize';

    // 1. Resolve Target Request Bounds
    const resizeOpts = options.resize;
    let reqWidth: number | undefined;
    let reqHeight: number | undefined;

    if (resizeOpts) {
      if (resizeOpts.mode === 'scale' && resizeOpts.scalePercent !== undefined) {
        const factor = resizeOpts.scalePercent / 100;
        reqWidth = Math.round(origDims.width * factor);
        reqHeight = Math.round(origDims.height * factor);
      } else if (resizeOpts.mode === 'constraint') {
        reqWidth = resizeOpts.maxWidth;
        reqHeight = resizeOpts.maxHeight;
      }
    }

    // 2. Compute Contain Dimensions
    const containResult = calculateContainDimensions(
      origDims,
      { width: reqWidth, height: reqHeight },
      {
        allowUpscale,
        maxCanvasDim: caps.maxCanvasDimension,
      }
    );

    const safeDimensions: ImageDimensions = {
      width: containResult.width,
      height: containResult.height,
    };

    const isResizingNecessary =
      safeDimensions.width !== origDims.width || safeDimensions.height !== origDims.height;

    // 3. Resizing Strategy Selection
    // If downscaling by factor > 2.0 on either axis, select progressive stepped downscaling
    // to eliminate aliasing and jagged edges.
    let resizingStrategy: ResizingStrategy = 'none';
    if (isResizingNecessary) {
      const downscaleFactor = origDims.width / safeDimensions.width;
      if (downscaleFactor > 2.0 && !caps.isLowEndDevice) {
        resizingStrategy = 'stepped';
      } else {
        resizingStrategy = 'direct';
      }
    }

    // 4. Alpha & Transparency Protection
    const alphaSafety = resolveSafeFormatForAlpha(
      !!options.hasAlpha,
      options.targetFormat,
      options.sourceMime
    );

    return {
      safeDimensions,
      resizingStrategy,
      isResizingNecessary,
      aspectRatio: containResult.aspectRatio,
      scale: containResult.scale,
      isUpscaled: containResult.isUpscaled,
      orientation,
      targetFormat: alphaSafety.format,
      transparencyPreserved: !alphaSafety.transparencyFlattened,
      transparencyWarning: alphaSafety.warningMessage,
      maxCanvasDimension: caps.maxCanvasDimension,
      colorPolicy,
      containResult,
    };
  }

  /**
   * Coordinates validation of candidate output against the preservation plan
   */
  public static async validateCandidate(
    blob: Blob | null,
    plan: QualityPreservationPlan,
    targetBytes?: number
  ): Promise<CandidateValidationReport> {
    return OutputValidator.validateCandidate(blob, {
      expectedFormat: plan.targetFormat,
      maxDimensions: plan.safeDimensions,
      originalDimensions: {
        width: Math.round(plan.safeDimensions.width / plan.scale),
        height: Math.round(plan.safeDimensions.height / plan.scale),
      },
      targetBytes,
      allowUpscale: plan.isUpscaled,
      sourceHadAlpha: !plan.transparencyPreserved,
    });
  }

  /**
   * Evaluates visual fidelity metrics using VisualFidelityGuard
   */
  public static evaluateFidelity(
    origPixels: Uint8ClampedArray,
    compPixels: Uint8ClampedArray,
    width: number,
    height: number,
    profile: FidelityProfile = 'balanced'
  ): FidelityMetrics {
    return VisualFidelityGuard.computeMetrics(origPixels, compPixels, width, height, profile);
  }
}
