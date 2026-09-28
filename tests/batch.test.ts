import { describe, expect, it } from 'vitest';
import { appStore } from '../src/state/store';
import { BatchActions } from '../src/state/actions';
import type { BatchItem } from '../src/types';

describe('Batch Processing System & Queue Lifecycle', () => {
  it('manages batch item state transitions and aggregates queue metrics accurately', () => {
    appStore.reset();

    const file1 = new File(['1234567890'], 'image1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['12345678901234567890'], 'image2.png', { type: 'image/png' });

    const item1: BatchItem = {
      id: 'item-1',
      file: file1,
      name: file1.name,
      originalSize: 1000,
      originalDimensions: { width: 800, height: 600 },
      thumbnailUrl: null,
      status: 'PENDING',
      progress: 0,
      result: null,
      error: null,
      durationMs: 0,
      retryCount: 0,
    };

    const item2: BatchItem = {
      id: 'item-2',
      file: file2,
      name: file2.name,
      originalSize: 2000,
      originalDimensions: { width: 1200, height: 800 },
      thumbnailUrl: null,
      status: 'PENDING',
      progress: 0,
      result: null,
      error: null,
      durationMs: 0,
      retryCount: 0,
    };

    appStore.addBatchItem(item1);
    appStore.addBatchItem(item2);

    expect(appStore.getState().batchItems.length).toBe(2);
    expect(appStore.getState().isBatchMode).toBe(true);
    expect(appStore.getState().queueMetrics.totalOriginalBytes).toBe(3000);
    expect(appStore.getState().queueMetrics.processedFiles).toBe(0);

    // Transition item1 to PROCESSING -> COMPLETED
    appStore.updateBatchItem('item-1', {
      status: 'COMPLETED',
      result: {
        blob: new Blob(['comp']),
        objectUrl: 'blob:comp-1',
        format: 'image/jpeg',
        dimensions: { width: 800, height: 600 },
        sourceSize: 1000,
        outputSize: 400,
        bytesSaved: 600,
        savingsPercent: 60,
        compressionRatio: 2.5,
        latencyMs: 15,
        filename: 'image1.min.jpg',
      },
    });

    const metricsAfter1 = appStore.getState().queueMetrics;
    expect(metricsAfter1.processedFiles).toBe(1);
    expect(metricsAfter1.totalCompressedBytes).toBe(400);
    expect(metricsAfter1.totalSavedBytes).toBe(2600); // 3000 - 400

    // Transition item2 to FAILED
    appStore.updateBatchItem('item-2', {
      status: 'FAILED',
      error: 'Corrupt header',
    });

    const metricsAfter2 = appStore.getState().queueMetrics;
    expect(metricsAfter2.failedFiles).toBe(1);

    // Pause and Resume queue controls
    BatchActions.pauseQueue();
    expect(appStore.getState().queueMetrics.isPaused).toBe(true);

    BatchActions.resumeQueue();
    expect(appStore.getState().queueMetrics.isPaused).toBe(false);

    // Clear batch
    appStore.clearBatch();
    expect(appStore.getState().batchItems.length).toBe(0);
    expect(appStore.getState().isBatchMode).toBe(false);
  });
});
