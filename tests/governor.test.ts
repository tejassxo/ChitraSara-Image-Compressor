import { describe, expect, it } from 'vitest';
import { evaluateHardwareProfile } from '../src/core/governor/HardwareGovernor';

describe('HardwareGovernor - Capability & Profile Detection', () => {
  it('should assign LOW profile when deviceMemory <= 2 GB', () => {
    const caps = evaluateHardwareProfile(
      { deviceMemory: 2, hardwareConcurrency: 8 },
      { OffscreenCanvas: class {} }
    );
    expect(caps.profile).toBe('LOW');
    expect(caps.maxCanvasDimension).toBe(2048);
  });

  it('should assign LOW profile when hardwareConcurrency <= 2 cores', () => {
    const caps = evaluateHardwareProfile(
      { deviceMemory: 8, hardwareConcurrency: 2 },
      { OffscreenCanvas: class {} }
    );
    expect(caps.profile).toBe('LOW');
    expect(caps.maxCanvasDimension).toBe(2048);
  });

  it('should assign LOW profile when Save-Data mode is active', () => {
    const caps = evaluateHardwareProfile(
      { deviceMemory: 16, hardwareConcurrency: 16, connection: { saveData: true } },
      { OffscreenCanvas: class {} }
    );
    expect(caps.profile).toBe('LOW');
    expect(caps.hasSaveData).toBe(true);
    expect(caps.maxCanvasDimension).toBe(2048);
  });

  it('should assign BALANCED profile when RAM <= 4 GB or cores <= 4', () => {
    const caps = evaluateHardwareProfile(
      { deviceMemory: 4, hardwareConcurrency: 4 },
      { OffscreenCanvas: class {} }
    );
    expect(caps.profile).toBe('BALANCED');
    expect(caps.maxCanvasDimension).toBe(4096);
  });

  it('should assign HIGH profile when RAM > 4 GB and cores > 4', () => {
    const caps = evaluateHardwareProfile(
      { deviceMemory: 8, hardwareConcurrency: 8 },
      { OffscreenCanvas: class {} }
    );
    expect(caps.profile).toBe('HIGH');
    expect(caps.maxCanvasDimension).toBe(8192);
  });

  it('should gracefully handle undefined deviceMemory on non-Chromium browsers (Firefox/Safari)', () => {
    const caps = evaluateHardwareProfile(
      { deviceMemory: undefined, hardwareConcurrency: 6 },
      { OffscreenCanvas: class {} }
    );
    expect(caps.deviceMemoryGB).toBeUndefined();
    expect(caps.profile).toBe('BALANCED');
    expect(caps.maxCanvasDimension).toBe(4096);
  });

  it('should fallback to 2 cores when hardwareConcurrency is undefined or 0', () => {
    const caps = evaluateHardwareProfile(
      { hardwareConcurrency: undefined },
      {}
    );
    expect(caps.hardwareConcurrency).toBe(2);
    expect(caps.profile).toBe('LOW');
  });

  it('should accurately detect OffscreenCanvas and convertToBlob presence', () => {
    class MockOffscreenCanvas {
      convertToBlob() {}
    }
    const caps = evaluateHardwareProfile({}, { OffscreenCanvas: MockOffscreenCanvas });
    expect(caps.hasOffscreenCanvas).toBe(true);
    expect(caps.hasConvertToBlob).toBe(true);

    const capsNoOffscreen = evaluateHardwareProfile({}, {});
    expect(capsNoOffscreen.hasOffscreenCanvas).toBe(false);
    expect(capsNoOffscreen.hasConvertToBlob).toBe(false);
  });
});
