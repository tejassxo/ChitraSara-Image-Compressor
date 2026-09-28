/**
 * MIME type definitions, mappings, and magic headers
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

export const MIME_MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header
};

export function isSupportedMimeType(type: string): type is SupportedMimeType {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(type);
}
