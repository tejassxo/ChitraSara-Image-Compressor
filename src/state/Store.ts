import { ENGINE_DEFAULTS } from '../config/constants';
import { MemoryLifecycle } from '../services/lifecycle';
import type {
  BatchItem,
  CompressionOptions,
  CompressionResult,
  QueueMetrics,
  SourceImage,
} from '../types';

export interface AppState {
  sourceImage: SourceImage | null;
  compressionResult: CompressionResult | null;
  isProcessing: boolean;
  error: string | null;
  options: CompressionOptions;
  autoProcess: boolean;
  activePreviewTab: 'compressed' | 'original';
  // Phase 2 Batch & Queue State
  batchItems: BatchItem[];
  activeBatchItemId: string | null;
  queueMetrics: QueueMetrics;
  isBatchMode: boolean;
}

export type StateListener = (state: AppState, prevState: AppState) => void;

const SETTINGS_KEY = 'optipulse_settings_v1';

export function loadStoredSettings(): { autoProcess?: boolean; options?: Partial<CompressionOptions> } {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          autoProcess: typeof parsed.autoProcess === 'boolean' ? parsed.autoProcess : undefined,
          options: parsed.options,
        };
      }
    }
  } catch {
    // Ignore
  }
  return {};
}

export function saveStoredSettings(state: AppState): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          autoProcess: state.autoProcess,
          options: {
            format: state.options.format,
            quality: state.options.quality,
            mode: state.options.mode,
          },
        })
      );
    }
  } catch {
    // Ignore
  }
}

export class Store {
  private state: AppState;
  private listeners: Set<StateListener> = new Set();

  constructor(initialState?: Partial<AppState>) {
    this.state = {
      sourceImage: null,
      compressionResult: null,
      isProcessing: false,
      error: null,
      options: {
        format: 'original',
        quality: ENGINE_DEFAULTS.DEFAULT_QUALITY,
        mode: 'quality',
        resize: {
          mode: 'original',
          maintainAspectRatio: true,
        },
      },
      autoProcess: ENGINE_DEFAULTS.AUTO_PROCESS_DEFAULT,
      activePreviewTab: 'compressed',
      batchItems: [],
      activeBatchItemId: null,
      queueMetrics: {
        totalFiles: 0,
        processedFiles: 0,
        failedFiles: 0,
        totalOriginalBytes: 0,
        totalCompressedBytes: 0,
        totalSavedBytes: 0,
        averageRatio: 1,
        isPaused: false,
        activeWorkers: 0,
      },
      isBatchMode: false,
      ...initialState,
    };
  }

  public getState(): Readonly<AppState> {
    return this.state;
  }

  public setState(partial: Partial<AppState>): void {
    const prevState = this.state;
    this.state = { ...prevState, ...partial };
    if (partial.options || partial.autoProcess !== undefined) {
      saveStoredSettings(this.state);
    }
    this.notify(this.state, prevState);
  }

  public updateOptions(partialOptions: Partial<CompressionOptions>): void {
    this.setState({
      options: {
        ...this.state.options,
        ...partialOptions,
        resize: {
          ...this.state.options.resize,
          ...(partialOptions.resize || {}),
        },
      },
    });
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(state: AppState, prevState: AppState): void {
    for (const listener of this.listeners) {
      try {
        listener(state, prevState);
      } catch (err) {
        console.error('State listener error:', err);
      }
    }
  }

  public addBatchItem(item: BatchItem): void {
    const updated = [...this.state.batchItems, item];
    const isBatchMode = updated.length > 1;
    this.setState({
      batchItems: updated,
      isBatchMode,
    });
    this.recalculateMetrics();
  }

  public updateBatchItem(id: string, partial: Partial<BatchItem>): void {
    const updated = this.state.batchItems.map((item) =>
      item.id === id ? { ...item, ...partial } : item
    );
    this.setState({ batchItems: updated });
    this.recalculateMetrics();
  }

  public removeBatchItem(id: string): void {
    const item = this.state.batchItems.find((i) => i.id === id);
    if (item?.thumbnailUrl && item.thumbnailUrl.startsWith('blob:')) {
      MemoryLifecycle.revokeUrl(item.thumbnailUrl);
    }
    if (item?.result?.objectUrl) {
      MemoryLifecycle.revokeUrl(item.result.objectUrl);
    }

    const updated = this.state.batchItems.filter((i) => i.id !== id);
    const isBatchMode = updated.length > 1;
    const activeBatchItemId =
      this.state.activeBatchItemId === id ? (updated[0]?.id ?? null) : this.state.activeBatchItemId;

    this.setState({
      batchItems: updated,
      isBatchMode,
      activeBatchItemId,
    });
    this.recalculateMetrics();
  }

  public clearBatch(): void {
    for (const item of this.state.batchItems) {
      if (item.thumbnailUrl && item.thumbnailUrl.startsWith('blob:')) {
        MemoryLifecycle.revokeUrl(item.thumbnailUrl);
      }
      if (item.result?.objectUrl) {
        MemoryLifecycle.revokeUrl(item.result.objectUrl);
      }
    }

    this.setState({
      batchItems: [],
      activeBatchItemId: null,
      isBatchMode: false,
    });
    this.recalculateMetrics();
  }

  public recalculateMetrics(): void {
    const items = this.state.batchItems;
    let totalOriginal = 0;
    let totalCompressed = 0;
    let processed = 0;
    let failed = 0;

    for (const item of items) {
      totalOriginal += item.originalSize;
      if (item.status === 'COMPLETED' && item.result) {
        processed++;
        totalCompressed += item.result.outputSize;
      } else if (item.status === 'FAILED') {
        failed++;
      }
    }

    const totalSaved = Math.max(0, totalOriginal - totalCompressed);
    const ratio = totalCompressed > 0 ? totalOriginal / totalCompressed : 1;

    this.setState({
      queueMetrics: {
        ...this.state.queueMetrics,
        totalFiles: items.length,
        processedFiles: processed,
        failedFiles: failed,
        totalOriginalBytes: totalOriginal,
        totalCompressedBytes: totalCompressed,
        totalSavedBytes: totalSaved,
        averageRatio: Math.round(ratio * 10) / 10,
      },
    });
  }

  public reset(): void {
    if (this.state.sourceImage?.originalUrl) {
      MemoryLifecycle.revokeUrl(this.state.sourceImage.originalUrl);
    }
    if (this.state.compressionResult?.objectUrl) {
      MemoryLifecycle.revokeUrl(this.state.compressionResult.objectUrl);
    }

    this.clearBatch();

    this.setState({
      sourceImage: null,
      compressionResult: null,
      isProcessing: false,
      error: null,
      activePreviewTab: 'compressed',
      activeBatchItemId: null,
      isBatchMode: false,
    });
  }
}

const savedSettings = loadStoredSettings();
export const appStore = new Store({
  autoProcess: savedSettings.autoProcess ?? ENGINE_DEFAULTS.AUTO_PROCESS_DEFAULT,
  options: {
    format: savedSettings.options?.format ?? 'original',
    quality: savedSettings.options?.quality ?? ENGINE_DEFAULTS.DEFAULT_QUALITY,
    mode: savedSettings.options?.mode ?? 'quality',
    resize: {
      mode: 'original',
      maintainAspectRatio: true,
    },
  },
});

