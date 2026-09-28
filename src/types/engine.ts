import type { SupportedMimeType } from '../config/mime';

export type { SupportedMimeType };

export interface ImageDimensions {
  width: number;
  height: number;
}

export type ResizeMode = 'original' | 'scale' | 'constraint';

export interface ResizeOptions {
  mode: ResizeMode;
  scalePercent?: number;       // e.g. 80 for 80%
  maxWidth?: number;           // e.g. 1920
  maxHeight?: number;          // e.g. 1080
  maintainAspectRatio: boolean;
  preventUpscale?: boolean;    // Default: true (never upscale unless explicitly requested)
  allowUpscale?: boolean;
}

export type CompressionMode = 'quality' | 'targetSize' | 'lossless';

export type FidelityProfile = 'maxFidelity' | 'balanced' | 'maxCompression' | 'targetSize' | 'lossless';

export interface FidelityMetrics {
  ssim: number;
  psnr: number;
  meanDelta: number;
  maxDelta: number;
  isAcceptable: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CompressionOptions {
  format: SupportedMimeType | 'original';
  quality: number;             // 0.05 to 1.0
  resize: ResizeOptions;
  mode?: CompressionMode;
  targetBytes?: number;
  preventUpscale?: boolean;
  preserveAlpha?: boolean;
  stripMetadata?: boolean;
  signal?: AbortSignal;
}

export interface CompressionResult {
  blob: Blob;
  objectUrl: string;
  format: SupportedMimeType;
  dimensions: ImageDimensions;
  sourceSize: number;
  outputSize: number;
  bytesSaved: number;
  savingsPercent: number;
  compressionRatio: number;
  latencyMs: number;
  filename: string;
  iterationsCount?: number;
  downscaled?: boolean;
  fidelityMetrics?: FidelityMetrics;
  validationResult?: ValidationResult;
  targetAchieved?: boolean;
  impossibleTarget?: boolean;
  targetMessage?: string;
  isLossless?: boolean;
}

export interface SourceImage {
  file: File;
  originalUrl: string;
  dimensions: ImageDimensions;
  size: number;
  type: SupportedMimeType;
  hasAlpha?: boolean;
  orientation?: number;
  aspectRatio?: number;
}

export interface FormatSupportInfo {
  jpeg: boolean;
  png: boolean;
  webp: boolean;
  avif: boolean;
}

