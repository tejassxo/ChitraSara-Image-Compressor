/**
 * Immutable Configuration Constants for OptiPulse Compression Engine
 */

export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export type SupportedMimeType = typeof SUPPORTED_MIME_TYPES[number];

export const MIME_TO_EXTENSION: Record<SupportedMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export const EXTENSION_TO_MIME: Record<string, SupportedMimeType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

export const HARDWARE_THRESHOLDS = {
  LOW_RAM_GB: 2,
  BALANCED_RAM_GB: 4,
  LOW_CORES: 2,
  BALANCED_CORES: 4,
  MAX_CANVAS_DIM_LOW: 2048,
  MAX_CANVAS_DIM_BALANCED: 4096,
  MAX_CANVAS_DIM_HIGH: 8192,
  DEFAULT_FALLBACK_CORES: 2,
} as const;

export const ENGINE_DEFAULTS = {
  DEFAULT_QUALITY: 0.75,
  MIN_QUALITY: 0.05,
  MAX_QUALITY: 1.0,
  STEP_DOWN_THRESHOLD_PIXELS: 4096 * 4096, // 16MP threshold for memory step-down
  AUTO_PROCESS_DEFAULT: true,
} as const;
