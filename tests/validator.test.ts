import { describe, expect, it } from 'vitest';
import { OutputValidator } from '../src/core/engine/OutputValidator';

describe('OutputValidator', () => {
  it('rejects null or undefined blob', async () => {
    const report = await OutputValidator.validateCandidate(null);
    expect(report.isValid).toBe(false);
    expect(report.errors[0]).toContain('null or undefined');
  });

  it('rejects 0-byte empty blob', async () => {
    const emptyBlob = new Blob([], { type: 'image/jpeg' });
    const report = await OutputValidator.validateCandidate(emptyBlob);
    expect(report.isValid).toBe(false);
    expect(report.errors[0]).toContain('0 bytes');
  });

  it('rejects unsupported MIME type', async () => {
    const invalidBlob = new Blob(['sample data'], { type: 'application/pdf' });
    const report = await OutputValidator.validateCandidate(invalidBlob);
    expect(report.isValid).toBe(false);
    expect(report.errors.some((e) => e.includes('Unsupported output MIME'))).toBe(true);
  });

  it('detects aspect ratio distortion', async () => {
    // Mock decode returning distorted dimensions (e.g. 1920x1080 -> 1000x1000)
    const blob = new Blob(['dummy'], { type: 'image/jpeg' });
    const report = await OutputValidator.validateCandidate(blob, {
      originalDimensions: { width: 1920, height: 1080 },
      maxDimensions: { width: 1000, height: 1000 },
    });
    // With fallback dimensions 1000x1000 vs 1920x1080
    expect(report.errors.some((e) => e.includes('Aspect ratio violation'))).toBe(true);
  });

  it('validates a valid candidate within constraints', async () => {
    const validBlob = new Blob(['dummy-image-bytes'], { type: 'image/webp' });
    const report = await OutputValidator.validateCandidate(validBlob, {
      expectedFormat: 'image/webp',
      originalDimensions: { width: 1920, height: 1080 },
      maxDimensions: { width: 1280, height: 720 },
    });
    // In node/test environment fallback returns maxDimensions { width: 1280, height: 720 }
    // which has exact 16:9 ratio matching 1920x1080
    expect(report.isValid).toBe(true);
    expect(report.errors.length).toBe(0);
  });

  it('flags accidental upscaling when allowUpscale is false', async () => {
    const blob = new Blob(['bytes'], { type: 'image/png' });
    const report = await OutputValidator.validateCandidate(blob, {
      originalDimensions: { width: 800, height: 600 },
      maxDimensions: { width: 1600, height: 1200 },
      allowUpscale: false,
    });
    expect(report.isValid).toBe(false);
    expect(report.errors.some((e) => e.includes('Accidental upscaling detected'))).toBe(true);
  });
});
