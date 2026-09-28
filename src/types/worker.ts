import type { CompressionOptions, CompressionResult, ImageDimensions, SupportedMimeType } from './engine';

export type WorkerAction = 'COMPRESS' | 'SOLVE_TARGET' | 'CANCEL';

export interface SolverOptions {
  targetBytes: number;
  toleranceRatio?: number;
  maxIterations?: number;
  minDimensions?: ImageDimensions;
  minQuality?: number;
}

export interface TaskEnvelope {
  taskId: string;
  action: WorkerAction;
  fileBlob?: Blob;
  imageBitmap?: ImageBitmap;
  options: CompressionOptions;
  format: SupportedMimeType;
  maxDimensions: ImageDimensions;
  solverOptions?: SolverOptions;
}

export interface WorkerSuccessResponse {
  taskId: string;
  success: true;
  result: CompressionResult;
}

export interface WorkerErrorResponse {
  taskId: string;
  success: false;
  error: string;
  isAborted?: boolean;
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;

export type WorkerMessage = TaskEnvelope;
