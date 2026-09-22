import { ENGINE_DEFAULTS } from '../config/constants';
import type { CompressionOptions, CompressionResult, SourceImage } from '../types';

export interface AppState {
  sourceImage: SourceImage | null;
  compressionResult: CompressionResult | null;
  isProcessing: boolean;
  error: string | null;
  options: CompressionOptions;
  autoProcess: boolean;
  activePreviewTab: 'compressed' | 'original';
}

export type StateListener = (state: AppState, prevState: AppState) => void;

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
        resize: {
          mode: 'original',
          maintainAspectRatio: true,
        },
      },
      autoProcess: ENGINE_DEFAULTS.AUTO_PROCESS_DEFAULT,
      activePreviewTab: 'compressed',
      ...initialState,
    };
  }

  public getState(): Readonly<AppState> {
    return this.state;
  }

  public setState(partial: Partial<AppState>): void {
    const prevState = this.state;
    this.state = { ...prevState, ...partial };
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

  public reset(): void {
    if (this.state.sourceImage?.originalUrl) {
      URL.revokeObjectURL(this.state.sourceImage.originalUrl);
    }
    if (this.state.compressionResult?.objectUrl) {
      URL.revokeObjectURL(this.state.compressionResult.objectUrl);
    }

    this.setState({
      sourceImage: null,
      compressionResult: null,
      isProcessing: false,
      error: null,
      activePreviewTab: 'compressed',
    });
  }
}

export const appStore = new Store();
