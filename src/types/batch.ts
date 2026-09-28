import type { CompressionResult, ImageDimensions } from './engine';
import type { SolverOptions } from './worker';

export type BatchStatus =
  | 'PENDING'
  | 'EXTRACTING_META'
  | 'QUEUED'
  | 'PROCESSING'
  | 'SOLVING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export interface BatchItem {
  id: string;
  file: File;
  name: string;
  originalSize: number;
  originalDimensions: ImageDimensions | null;
  thumbnailUrl: string | null;
  status: BatchStatus;
  progress: number;
  result: CompressionResult | null;
  error: string | null;
  durationMs: number;
  retryCount: number;
}

export interface QueueMetrics {
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  totalOriginalBytes: number;
  totalCompressedBytes: number;
  totalSavedBytes: number;
  averageRatio: number;
  isPaused: boolean;
  activeWorkers: number;
}

export type { SolverOptions };
