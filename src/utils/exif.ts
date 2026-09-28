/**
 * EXIF Orientation Parser & Visual Normalization Utilities
 * Zero-dependency, safe client-side binary parser for TIFF/JPEG headers.
 */

export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface OrientationInfo {
  orientation: ExifOrientation;
  isTransposed: boolean; // Width & height swapped (orientations 5, 6, 7, 8)
  rotationDegrees: number; // 0, 90, 180, 270
  flipHorizontal: boolean;
  description: string;
}

const ORIENTATION_DESCRIPTIONS: Record<ExifOrientation, string> = {
  1: 'Normal (0°)',
  2: 'Mirrored Horizontal',
  3: 'Rotated 180°',
  4: 'Mirrored Vertical',
  5: 'Mirrored Horizontal & Rotated 270° CW (Transpose)',
  6: 'Rotated 90° CW',
  7: 'Mirrored Horizontal & Rotated 90° CW (Transverse)',
  8: 'Rotated 270° CW',
};

/**
 * Parses EXIF orientation tag (0x0112) from ArrayBuffer / Blob.
 * Supports JPEG APP1 marker with TIFF header (little-endian & big-endian).
 * Returns 1 (normal) if not present, unparseable, or non-JPEG.
 */
export async function getExifOrientation(source: Blob | ArrayBuffer): Promise<ExifOrientation> {
  try {
    let buffer: ArrayBuffer;
    if (source instanceof Blob) {
      // Read first 64KB - EXIF header is always within first few KB of JPEG
      const slice = source.slice(0, 65536);
      buffer = await slice.arrayBuffer();
    } else {
      buffer = source;
    }

    return parseExifOrientationFromBuffer(buffer);
  } catch {
    return 1;
  }
}

/**
 * Synchronous parser for ArrayBuffer
 */
export function parseExifOrientationFromBuffer(buffer: ArrayBuffer): ExifOrientation {
  const view = new DataView(buffer);

  // Check for JPEG SOI marker (0xFFD8)
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
    return 1;
  }

  let offset = 2;
  const length = view.byteLength;

  while (offset + 4 <= length) {
    const marker = view.getUint16(offset, false);
    offset += 2;

    // Check for SOS (Start of Scan) - image data starts here, no EXIF after
    if (marker === 0xffda || marker === 0xffd9) {
      break;
    }

    const markerLength = view.getUint16(offset, false);
    offset += 2;

    if (markerLength < 2) {
      break;
    }

    // APP1 marker (0xFFE1) contains EXIF
    if (marker === 0xffe1) {
      // Verify "Exif\0\0" header (0x45786966 0x0000)
      if (offset + 6 <= length) {
        const exifHeader = view.getUint32(offset, false);
        const zeroCheck = view.getUint16(offset + 4, false);

        if (exifHeader === 0x45786966 && zeroCheck === 0x0000) {
          const tiffStart = offset + 6;
          return parseTiffOrientation(view, tiffStart);
        }
      }
    }

    offset += markerLength - 2;
  }

  return 1;
}

function parseTiffOrientation(view: DataView, tiffStart: number): ExifOrientation {
  if (tiffStart + 8 > view.byteLength) return 1;

  // TIFF Byte Order: "II" (0x4949) = Little Endian, "MM" (0x4D4D) = Big Endian
  const byteOrderMarker = view.getUint16(tiffStart, false);
  let littleEndian = false;

  if (byteOrderMarker === 0x4949) {
    littleEndian = true;
  } else if (byteOrderMarker === 0x4d4d) {
    littleEndian = false;
  } else {
    return 1;
  }

  // 42 test
  if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002a) {
    return 1;
  }

  // Offset to first IFD (IFD0)
  const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
  if (firstIfdOffset < 8) return 1;

  let ifdOffset = tiffStart + firstIfdOffset;
  if (ifdOffset + 2 > view.byteLength) return 1;

  const entriesCount = view.getUint16(ifdOffset, littleEndian);
  ifdOffset += 2;

  // Search through IFD entries (12 bytes per entry)
  for (let i = 0; i < entriesCount; i++) {
    if (ifdOffset + 12 > view.byteLength) break;

    const tag = view.getUint16(ifdOffset, littleEndian);
    if (tag === 0x0112) {
      // Orientation tag found!
      const val = view.getUint16(ifdOffset + 8, littleEndian);
      if (val >= 1 && val <= 8) {
        return val as ExifOrientation;
      }
      return 1;
    }

    ifdOffset += 12;
  }

  return 1;
}

/**
 * Returns structural information for a given EXIF orientation
 */
export function getOrientationInfo(orientation: ExifOrientation): OrientationInfo {
  const isTransposed = orientation >= 5 && orientation <= 8;

  let rotationDegrees = 0;
  let flipHorizontal = false;

  switch (orientation) {
    case 1:
      rotationDegrees = 0;
      break;
    case 2:
      flipHorizontal = true;
      break;
    case 3:
      rotationDegrees = 180;
      break;
    case 4:
      rotationDegrees = 180;
      flipHorizontal = true;
      break;
    case 5:
      rotationDegrees = 270;
      flipHorizontal = true;
      break;
    case 6:
      rotationDegrees = 90;
      break;
    case 7:
      rotationDegrees = 90;
      flipHorizontal = true;
      break;
    case 8:
      rotationDegrees = 270;
      break;
  }

  return {
    orientation,
    isTransposed,
    rotationDegrees,
    flipHorizontal,
    description: ORIENTATION_DESCRIPTIONS[orientation],
  };
}

/**
 * Applies 2D canvas transform to normalize an image orientation onto a canvas.
 * Useful when drawing an orientation-tagged source where automatic browser decoding was not applied.
 */
export function applyOrientationTransform(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  orientation: ExifOrientation,
  width: number,
  height: number
): void {
  switch (orientation) {
    case 2:
      // Horizontal flip
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      break;
    case 3:
      // 180° rotate
      ctx.translate(width, height);
      ctx.rotate(Math.PI);
      break;
    case 4:
      // Vertical flip
      ctx.translate(0, height);
      ctx.scale(1, -1);
      break;
    case 5:
      // Transpose
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6:
      // 90° CW rotate
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -height);
      break;
    case 7:
      // Transverse
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(width, -height);
      ctx.scale(-1, 1);
      break;
    case 8:
      // 270° CW rotate (90° CCW)
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-width, 0);
      break;
    case 1:
    default:
      // Normal, no-op
      break;
  }
}
