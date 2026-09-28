import { describe, expect, it } from 'vitest';
import { QualityPreservationEngine } from '../src/core/engine/QualityPreservationEngine';

describe('QualityPreservationEngine', () => {
  it('creates safe preservation plan preserving landscape aspect ratio', () => {
    const plan = QualityPreservationEngine.createPreservationPlan({
      originalDimensions: { width: 1920, height: 1080 },
      sourceMime: 'image/jpeg',
      targetFormat: 'image/webp',
      resize: {
        mode: 'constraint',
        maxWidth: 1280,
        maxHeight: 1280,
        maintainAspectRatio: true,
      },
    });

    expect(plan.safeDimensions.width).toBe(1280);
    expect(plan.safeDimensions.height).toBe(720);
    expect(plan.isUpscaled).toBe(false);
    expect(plan.isResizingNecessary).toBe(true);
    expect(plan.targetFormat).toBe('image/webp');
  });

  it('prevents accidental upscaling by default', () => {
    const plan = QualityPreservationEngine.createPreservationPlan({
      originalDimensions: { width: 800, height: 600 },
      sourceMime: 'image/png',
      targetFormat: 'original',
      resize: {
        mode: 'constraint',
        maxWidth: 1600,
        maxHeight: 1200,
        maintainAspectRatio: true,
      },
    });

    expect(plan.safeDimensions.width).toBe(800);
    expect(plan.safeDimensions.height).toBe(600);
    expect(plan.isUpscaled).toBe(false);
    expect(plan.isResizingNecessary).toBe(false);
    expect(plan.resizingStrategy).toBe('none');
  });

  it('selects stepped downscaling strategy for large reductions (>2x)', () => {
    const plan = QualityPreservationEngine.createPreservationPlan({
      originalDimensions: { width: 6000, height: 4000 },
      sourceMime: 'image/jpeg',
      targetFormat: 'image/jpeg',
      resize: {
        mode: 'constraint',
        maxWidth: 1200,
        maintainAspectRatio: true,
      },
    });

    expect(plan.safeDimensions.width).toBe(1200);
    expect(plan.safeDimensions.height).toBe(800);
    expect(plan.resizingStrategy).toBe('stepped');
  });

  it('protects transparency and warns when converting transparent image to JPEG', () => {
    const plan = QualityPreservationEngine.createPreservationPlan({
      originalDimensions: { width: 500, height: 500 },
      sourceMime: 'image/png',
      targetFormat: 'image/jpeg',
      hasAlpha: true,
    });

    expect(plan.transparencyPreserved).toBe(false);
    expect(plan.transparencyWarning).toBeDefined();
    expect(plan.transparencyWarning).toContain('does not support alpha');
  });
});
