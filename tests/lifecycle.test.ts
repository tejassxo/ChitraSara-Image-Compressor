import { describe, expect, it, vi } from 'vitest';
import { MemoryLifecycle } from '../src/services/lifecycle';
import { CompressionEngine } from '../src/core/engine/CompressionEngine';
import { HardwareGovernor } from '../src/core/governor/HardwareGovernor';
import type { CompressionOptions } from '../src/types';

describe('Memory Lifecycle & Zero-Leak Invariants', () => {
  it('tracks and revokes object URLs deterministically', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    const url1 = MemoryLifecycle.trackUrl('blob:http://localhost/1234');
    MemoryLifecycle.trackUrl('blob:http://localhost/5678');

    expect(MemoryLifecycle.getActiveUrlCount()).toBe(2);

    MemoryLifecycle.revokeUrl(url1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/1234');
    expect(MemoryLifecycle.getActiveUrlCount()).toBe(1);

    MemoryLifecycle.revokeAll();
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/5678');
    expect(MemoryLifecycle.getActiveUrlCount()).toBe(0);

    revokeSpy.mockRestore();
  });

  it('tracks and closes ImageBitmaps deterministically', () => {
    const closeSpy1 = vi.fn();
    const closeSpy2 = vi.fn();

    const mockBitmap1 = { width: 100, height: 100, close: closeSpy1 } as unknown as ImageBitmap;
    const mockBitmap2 = { width: 200, height: 200, close: closeSpy2 } as unknown as ImageBitmap;

    MemoryLifecycle.trackBitmap(mockBitmap1);
    MemoryLifecycle.trackBitmap(mockBitmap2);

    expect(MemoryLifecycle.getActiveBitmapCount()).toBe(2);

    MemoryLifecycle.disposeBitmap(mockBitmap1);
    expect(closeSpy1).toHaveBeenCalled();
    expect(MemoryLifecycle.getActiveBitmapCount()).toBe(1);

    MemoryLifecycle.revokeAll();
    expect(closeSpy2).toHaveBeenCalled();
    expect(MemoryLifecycle.getActiveBitmapCount()).toBe(0);
  });

  it('ensures ImageBitmap.close() fires across success, error, and canceled states in CompressionEngine', async () => {
    const closeSpy = vi.fn();

    vi.stubGlobal('createImageBitmap', async () => ({
      width: 100,
      height: 100,
      close: closeSpy,
    }));

    class MockOffscreenCanvas {
      width = 100;
      height = 100;
      getContext() {
        return {
          drawImage: vi.fn(),
          imageSmoothingEnabled: true,
          imageSmoothingQuality: 'high',
        };
      }
      async convertToBlob(): Promise<Blob> {
        return new Blob(['output'], { type: 'image/jpeg' });
      }
    }

    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
    HardwareGovernor.resetCache();

    const fakeImage = new Blob([new Uint8Array(100)], { type: 'image/jpeg' });
    const options: CompressionOptions = {
      format: 'image/jpeg',
      quality: 0.8,
      resize: { mode: 'original', maintainAspectRatio: true },
    };

    // 1. Success state
    const result = await CompressionEngine.compress(fakeImage, options, 'test.jpg');
    expect(closeSpy).toHaveBeenCalledTimes(1);

    // 2. Abort / Canceled state
    closeSpy.mockClear();
    const controller = new AbortController();
    const abortedOptions = { ...options, signal: controller.signal };
    controller.abort();

    await expect(CompressionEngine.compress(fakeImage, abortedOptions, 'test.jpg')).rejects.toThrow();

    // 3. Error state during encoding
    closeSpy.mockClear();
    vi.stubGlobal('OffscreenCanvas', class {
      width = 100;
      height = 100;
      getContext() {
        return { drawImage: vi.fn() };
      }
      async convertToBlob() {
        throw new Error('Fatal GPU OOM');
      }
    });
    HardwareGovernor.resetCache();

    await expect(CompressionEngine.compress(fakeImage, options, 'test.jpg')).rejects.toThrow('Fatal GPU OOM');
    expect(closeSpy).toHaveBeenCalledTimes(1);

    // Cleanup result URL
    MemoryLifecycle.revokeUrl(result.objectUrl);
    vi.unstubAllGlobals();
    HardwareGovernor.resetCache();
  });
});
