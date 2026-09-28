export type HardwareProfile = 'LOW' | 'BALANCED' | 'HIGH';

export interface HardwareCapabilities {
  deviceMemoryGB: number | undefined;
  hardwareConcurrency: number;
  hasOffscreenCanvas: boolean;
  hasConvertToBlob: boolean;
  hasCreateImageBitmap: boolean;
  hasAsyncClipboard: boolean;
  hasWebWorkers: boolean;
  hasSaveData: boolean;
  profile: HardwareProfile;
  maxCanvasDimension: number;
  workerCount: number;
  maxThumbnailDimension: number;
  platform?: string;
  memoryLabel?: string;
  gpuRenderer?: string;
}
