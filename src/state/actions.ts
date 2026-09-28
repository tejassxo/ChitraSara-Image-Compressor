import { appStore } from './store';
import { WorkerPool } from '../core/workers/WorkerPool';
import { IngestionService } from '../services/ingestion';
import { MemoryLifecycle } from '../services/lifecycle';
import { HardwareGovernor } from '../core/governor/HardwareGovernor';
import { QualityPreservationEngine } from '../core/engine/QualityPreservationEngine';
import type { BatchItem, SupportedMimeType, TaskEnvelope } from '../types';

let activeWorkerDispatches = 0;

export class BatchActions {
  /**
   * Adds newly selected or dropped files into the batch queue as raw, inert File handles
   */
  public static async enqueueFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;

    // Single file ingestion also updates sourceImage for instant preview
    if (files.length === 1 && appStore.getState().batchItems.length === 0) {
      try {
        const sourceImage = await IngestionService.ingestFile(files[0]);
        appStore.setState({ sourceImage, error: null });
      } catch (err: unknown) {
        appStore.setState({ error: err instanceof Error ? err.message : String(err) });
      }
    }

    const caps = HardwareGovernor.getCapabilities();

    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // Generate micro-thumbnail asynchronously without holding heavy bitmap
      let thumbUrl = '';
      try {
        thumbUrl = await IngestionService.generateMicroThumbnail(file, caps.maxThumbnailDimension);
      } catch {
        thumbUrl = '';
      }

      const item: BatchItem = {
        id,
        file,
        name: file.name,
        originalSize: file.size,
        originalDimensions: null,
        thumbnailUrl: thumbUrl,
        status: 'PENDING',
        progress: 0,
        result: null,
        error: null,
        durationMs: 0,
        retryCount: 0,
      };

      appStore.addBatchItem(item);
    }

    if (appStore.getState().autoProcess && !appStore.getState().queueMetrics.isPaused) {
      this.pumpQueue();
    }
  }

  /**
   * Dispatches queued items to the WorkerPool adhering to HardwareGovernor concurrency limit
   */
  public static pumpQueue(): void {
    const state = appStore.getState();
    if (state.queueMetrics.isPaused) return;

    const pool = WorkerPool.getInstance();
    const maxConcurrency = pool.getMaxConcurrency();

    // Check how many items we can start
    const pendingItems = state.batchItems.filter((i: BatchItem) => i.status === 'PENDING' || i.status === 'QUEUED');

    while (activeWorkerDispatches < maxConcurrency && pendingItems.length > 0) {
      const item = pendingItems.shift();
      if (!item) break;

      activeWorkerDispatches++;
      appStore.updateBatchItem(item.id, { status: 'QUEUED' });

      // Run off-thread
      this.dispatchItem(item.id).finally(() => {
        activeWorkerDispatches--;
        this.pumpQueue();
      });
    }

    appStore.setState({
      queueMetrics: {
        ...appStore.getState().queueMetrics,
        activeWorkers: activeWorkerDispatches,
      },
    });
  }

  private static async dispatchItem(id: string): Promise<void> {
    const item = appStore.getState().batchItems.find((i: BatchItem) => i.id === id);
    if (!item) return;

    const startTime = performance.now();
    appStore.updateBatchItem(id, { status: 'PROCESSING', progress: 10 });

    try {
      // Extract dimensions only upon active dispatch (inert invariant)
      const dims = await IngestionService.extractDimensions(item.file);
      appStore.updateBatchItem(id, { originalDimensions: dims, progress: 30 });

      const mime = (item.file.type as SupportedMimeType) || 'image/jpeg';
      const plan = QualityPreservationEngine.createPreservationPlan({
        originalDimensions: dims,
        sourceMime: mime,
        targetFormat: state.options.format,
        resize: state.options.resize,
        allowUpscale: state.options.resize?.allowUpscale,
      });

      const targetDims = plan.safeDimensions;
      const targetFormat = plan.targetFormat;

      const isSolver = state.options.mode === 'targetSize' && !!state.options.targetBytes;
      if (isSolver) {
        appStore.updateBatchItem(id, { status: 'SOLVING', progress: 50 });
      }

      const envelope: TaskEnvelope = {
        taskId: id,
        action: isSolver ? 'SOLVE_TARGET' : 'COMPRESS',
        fileBlob: item.file,
        options: state.options,
        format: targetFormat,
        maxDimensions: targetDims,
        solverOptions: isSolver
          ? {
              targetBytes: state.options.targetBytes!,
            }
          : undefined,
      };

      const pool = WorkerPool.getInstance();
      const result = await pool.dispatch(envelope);

      // Create managed Object URL on main thread
      const rawUrl = URL.createObjectURL(result.blob);
      result.objectUrl = MemoryLifecycle.trackUrl(rawUrl);
      result.filename = `${item.name.replace(/\.[^/.]+$/, '')}.min.${result.format === 'image/jpeg' ? 'jpg' : result.format.split('/')[1]}`;

      const durationMs = performance.now() - startTime;

      appStore.updateBatchItem(id, {
        status: 'COMPLETED',
        progress: 100,
        result,
        durationMs,
      });

      // If active item or single preview, update main result
      if (state.batchItems.length === 1 || state.activeBatchItemId === id) {
        appStore.setState({
          compressionResult: result,
          isProcessing: false,
        });
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        appStore.updateBatchItem(id, { status: 'CANCELED', progress: 0 });
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        appStore.updateBatchItem(id, {
          status: 'FAILED',
          error: errorMsg,
          progress: 0,
        });
      }
    }
  }

  public static cancelItem(id: string): void {
    const pool = WorkerPool.getInstance();
    pool.cancelTask(id);
    appStore.updateBatchItem(id, { status: 'CANCELED', progress: 0 });
    this.pumpQueue();
  }

  public static cancelAll(): void {
    const pool = WorkerPool.getInstance();
    const items = appStore.getState().batchItems;
    for (const item of items) {
      if (item.status === 'PENDING' || item.status === 'QUEUED' || item.status === 'PROCESSING' || item.status === 'SOLVING') {
        pool.cancelTask(item.id);
        appStore.updateBatchItem(item.id, { status: 'CANCELED', progress: 0 });
      }
    }
    activeWorkerDispatches = 0;
    this.pumpQueue();
  }

  public static retryFailed(): void {
    const items = appStore.getState().batchItems;
    for (const item of items) {
      if (item.status === 'FAILED' || item.status === 'CANCELED') {
        appStore.updateBatchItem(item.id, { status: 'PENDING', error: null, progress: 0 });
      }
    }
    this.pumpQueue();
  }

  public static pauseQueue(): void {
    appStore.setState({
      queueMetrics: {
        ...appStore.getState().queueMetrics,
        isPaused: true,
      },
    });
  }

  public static resumeQueue(): void {
    appStore.setState({
      queueMetrics: {
        ...appStore.getState().queueMetrics,
        isPaused: false,
      },
    });
    this.pumpQueue();
  }

  public static downloadItem(id: string): void {
    const item = appStore.getState().batchItems.find((i: BatchItem) => i.id === id);
    if (!item?.result?.objectUrl) return;

    const a = document.createElement('a');
    a.href = item.result.objectUrl;
    a.download = item.result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  public static downloadAllSequenced(): void {
    const completedItems = appStore.getState().batchItems.filter(
      (i: BatchItem) => i.status === 'COMPLETED' && i.result?.objectUrl
    );

    completedItems.forEach((item: BatchItem, index: number) => {
      setTimeout(() => {
        if (item.result?.objectUrl) {
          const a = document.createElement('a');
          a.href = item.result.objectUrl;
          a.download = item.result.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      }, index * 250); // Stagger by 250ms to prevent browser pop-up block
    });
  }
}
