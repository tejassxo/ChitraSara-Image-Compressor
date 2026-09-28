import { describe, expect, it } from 'vitest';
import {
  applyOrientationTransform,
  getOrientationInfo,
  parseExifOrientationFromBuffer,
  type ExifOrientation,
} from '../src/utils/exif';

/**
 * Helper to construct a synthetic JPEG buffer with APP1 EXIF orientation marker
 */
function createSyntheticExifJpeg(orientation: ExifOrientation, littleEndian = true): ArrayBuffer {
  // Approximate size ~128 bytes
  const buffer = new ArrayBuffer(128);
  const view = new DataView(buffer);

  // JPEG SOI
  view.setUint16(0, 0xffd8, false);

  // APP1 Marker
  view.setUint16(2, 0xffe1, false);

  // Length of APP1 payload (including length bytes)
  const app1Length = 2 + 6 + 8 + 2 + 12 + 4;
  view.setUint16(4, app1Length, false);

  // "Exif\0\0"
  view.setUint32(6, 0x45786966, false);
  view.setUint16(10, 0x0000, false);

  // TIFF Header at offset 12
  const tiffStart = 12;
  const byteOrder = littleEndian ? 0x4949 : 0x4d4d;
  view.setUint16(tiffStart, byteOrder, false);
  view.setUint16(tiffStart + 2, 0x002a, littleEndian); // 42 test
  view.setUint32(tiffStart + 4, 8, littleEndian); // Offset to IFD0 (8 bytes from TIFF start)

  // IFD0 at offset tiffStart + 8 (offset 20)
  const ifd0Start = tiffStart + 8;
  view.setUint16(ifd0Start, 1, littleEndian); // 1 directory entry

  // Tag 0x0112 (Orientation), Type 3 (SHORT), Count 1, Value = orientation
  const entryStart = ifd0Start + 2;
  view.setUint16(entryStart, 0x0112, littleEndian); // Tag
  view.setUint16(entryStart + 2, 3, littleEndian); // Type: SHORT
  view.setUint32(entryStart + 4, 1, littleEndian); // Count: 1
  view.setUint16(entryStart + 8, orientation, littleEndian); // Value

  return buffer;
}

describe('EXIF Orientation Parser', () => {
  it('parses all orientations 1 to 8 correctly with Little Endian byte order', () => {
    for (let o = 1; o <= 8; o++) {
      const buf = createSyntheticExifJpeg(o as ExifOrientation, true);
      const parsed = parseExifOrientationFromBuffer(buf);
      expect(parsed).toBe(o);
    }
  });

  it('parses all orientations 1 to 8 correctly with Big Endian byte order', () => {
    for (let o = 1; o <= 8; o++) {
      const buf = createSyntheticExifJpeg(o as ExifOrientation, false);
      const parsed = parseExifOrientationFromBuffer(buf);
      expect(parsed).toBe(o);
    }
  });

  it('safely defaults to orientation 1 for non-JPEG buffers', () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
    expect(parseExifOrientationFromBuffer(pngHeader)).toBe(1);
  });

  it('safely defaults to orientation 1 for empty or corrupted buffers', () => {
    expect(parseExifOrientationFromBuffer(new ArrayBuffer(0))).toBe(1);
    expect(parseExifOrientationFromBuffer(new ArrayBuffer(10))).toBe(1);
  });
});

describe('getOrientationInfo', () => {
  it('identifies transposed orientations (5, 6, 7, 8)', () => {
    expect(getOrientationInfo(1).isTransposed).toBe(false);
    expect(getOrientationInfo(2).isTransposed).toBe(false);
    expect(getOrientationInfo(3).isTransposed).toBe(false);
    expect(getOrientationInfo(4).isTransposed).toBe(false);
    expect(getOrientationInfo(5).isTransposed).toBe(true);
    expect(getOrientationInfo(6).isTransposed).toBe(true);
    expect(getOrientationInfo(7).isTransposed).toBe(true);
    expect(getOrientationInfo(8).isTransposed).toBe(true);
  });

  it('returns correct rotation degrees', () => {
    expect(getOrientationInfo(1).rotationDegrees).toBe(0);
    expect(getOrientationInfo(3).rotationDegrees).toBe(180);
    expect(getOrientationInfo(6).rotationDegrees).toBe(90);
    expect(getOrientationInfo(8).rotationDegrees).toBe(270);
  });
});

describe('applyOrientationTransform', () => {
  it('does not throw when applying transform to context mock', () => {
    const ctxMock = {
      translate: () => {},
      rotate: () => {},
      scale: () => {},
    } as unknown as CanvasRenderingContext2D;

    for (let o = 1; o <= 8; o++) {
      expect(() => applyOrientationTransform(ctxMock, o as ExifOrientation, 100, 200)).not.toThrow();
    }
  });
});
