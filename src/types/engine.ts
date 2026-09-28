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
}

export type CompressionMode = 'quality' | 'targetSize';

export interface CompressionOptions {
  format: SupportedMimeType | 'original';
  quality: number;             // 0.05 to 1.0
  resize: ResizeOptions;
  mode?: CompressionMode;
  targetBytes?: number;
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
}

export interface SourceImage {
  file: File;
  originalUrl: string;
  dimensions: ImageDimensions;
  size: number;
  type: SupportedMimeType;
}

export interface FormatSupportInfo {
  jpeg: boolean;
  png: boolean;
  webp: boolean;
  avif: boolean;
}
