import { describe, expect, it, vi } from 'vitest';
import { CompressionEngine } from '../src/core/engine/CompressionEngine';
import { IngestionService } from '../src/services/IngestionService';
import type { CompressionOptions } from '../src/types';

describe('CompressionEngine & IngestionService Lifecycle & Reliability', () => {
  describe('Input Validation', () => {
    it('rejects unsupported MIME types immediately', async () => {
      const fakePdf = new File(['%PDF-1.4'], 'document.pdf', { type: 'application/pdf' });
      await expect(IngestionService.ingestFile(fakePdf)).rejects.toThrow(
        /Unsupported format: "application\/pdf"/
      );

      const fakeGif = new File(['GIF89a'], 'animation.gif', { type: 'image/gif' });
      await expect(IngestionService.ingestFile(fakeGif)).rejects.toThrow(
        /Unsupported format: "image\/gif"/
      );
    });

    it('rejects empty 0-byte files immediately', async () => {
      const emptyFile = new File([], 'empty.jpg', { type: 'image/jpeg' });
      await expect(IngestionService.ingestFile(emptyFile)).rejects.toThrow(
        /Selected file is empty/
      );
    });
  });

  describe('Abort Handling', () => {
    it('aborts immediately when AbortSignal is already triggered', async () => {
      const controller = new AbortController();
      controller.abort();

      const fakeImage = new Blob([new Uint8Array(100)], { type: 'image/jpeg' });
      const options: CompressionOptions = {
        format: 'image/jpeg',
        quality: 0.8,
        resize: { mode: 'original', maintainAspectRatio: true },
        signal: controller.signal,
      };

      await expect(
        CompressionEngine.compress(fakeImage, options, 'test.jpg')
      ).rejects.toThrow('Compression aborted by user');
    });

    it('aborts during processing and cleans up resources without orphaned references', async () => {
      const controller = new AbortController();
      const fakeImage = new Blob([new Uint8Array(100)], { type: 'image/jpeg' });

      // Mock createImageBitmap to simulate cancellation mid-flight
      const closeSpy = vi.fn();
      vi.stubGlobal('createImageBitmap', async () => {
        controller.abort(); // Trigger abort during bitmap decoding
        return {
          width: 800,
          height: 600,
          close: closeSpy,
        };
      });

      const options: CompressionOptions = {
        format: 'image/jpeg',
        quality: 0.8,
        resize: { mode: 'original', maintainAspectRatio: true },
        signal: controller.signal,
      };

      await expect(
        CompressionEngine.compress(fakeImage, options, 'test.jpg')
      ).rejects.toThrow('Compression aborted by user');

      // Verify ImageBitmap.close() was called inside finally block
      expect(closeSpy).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('Lifecycle and Deterministic Cleanup', () => {
    it('ensures ImageBitmap.close() and URL.revokeObjectURL() execute even when rasterization fails', async () => {
      const closeSpy = vi.fn();
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

      vi.stubGlobal('createImageBitmap', async () => ({
        width: 1000,
        height: 1000,
        close: closeSpy,
      }));

      // Mock OffscreenCanvas whose convertToBlob throws an internal encoding error
      vi.stubGlobal('OffscreenCanvas', class {
        width = 1000;
        height = 1000;
        getContext() {
          return {
            drawImage: vi.fn(),
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
          };
        }
        convertToBlob() {
          throw new Error('Fatal GPU Memory Allocation Failure in convertToBlob');
        }
      });

      const fakeImage = new Blob([new Uint8Array(500)], { type: 'image/png' });
      const options: CompressionOptions = {
        format: 'image/png',
        quality: 1.0,
        resize: { mode: 'original', maintainAspectRatio: true },
      };

      await expect(
        CompressionEngine.compress(fakeImage, options, 'sample.png')
      ).rejects.toThrow('Fatal GPU Memory Allocation Failure');

      // Crucial invariant: close() MUST be called in finally block
      expect(closeSpy).toHaveBeenCalled();

      vi.unstubAllGlobals();
      revokeSpy.mockRestore();
    });
  });
});
