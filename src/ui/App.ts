import { Header } from './components/Header';
import { Dropzone } from './components/Dropzone';
import { SinglePreview } from './components/SinglePreview';
import { ControlsPanel } from './components/ControlsPanel';
import { BatchList } from './components/BatchList';
import { MetricsBar } from './components/MetricsBar';
import { ChitraSaraFooter } from './components/ChitraSaraFooter';
import { appStore, type AppState } from '../state/store';
import { BatchActions } from '../state/actions';
import { CompressionEngine } from '../core/engine/CompressionEngine';
import { IngestionService } from '../services/ingestion';
import { announceA11y } from '../utils/a11y';

export class App {
  private container: HTMLElement;
  private header: Header;
  private dropzone: Dropzone;
  private singlePreview: SinglePreview;
  private controlsPanel: ControlsPanel;
  private batchList: BatchList;
  private metricsBar: MetricsBar;
  private footer: ChitraSaraFooter;
  private activeAbortController: AbortController | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.innerHTML = '';

    // Initialize Components
    this.header = new Header();
    this.dropzone = new Dropzone((files) => this.handleFiles(files));
    this.singlePreview = new SinglePreview();
    this.controlsPanel = new ControlsPanel(() => this.triggerSingleCompression());
    this.batchList = new BatchList((item) => this.handleSelectItem(item));
    this.metricsBar = new MetricsBar(
      () => this.handleReset(),
      () => this.handleDownload()
    );
    this.footer = new ChitraSaraFooter();

    this.mount();
    this.subscribeToStore();
    this.setupGlobalPaste();
    this.runEntranceAnimations();
  }

  private mount(): void {
    const errorBanner = document.createElement('div');
    errorBanner.id = 'error-banner';
    errorBanner.className = 'error-banner hidden';

    const main = document.createElement('main');
    main.className = 'app-main-layout';

    // Top Section: Ingestion Dropzone
    main.appendChild(this.dropzone.getElement());

    // Middle Section: Studio Area
    const studioSection = document.createElement('section');
    studioSection.id = 'studio-section';
    studioSection.className = 'studio-layout hidden';

    // Left Column: Controls Studio Palette
    const sideCol = document.createElement('div');
    sideCol.className = 'studio-side-col';
    sideCol.appendChild(this.controlsPanel.getElement());

    // Right Column: Inspection Stage, Metrics & Batch Queue
    const centerCol = document.createElement('div');
    centerCol.className = 'studio-center-col';
    centerCol.appendChild(this.singlePreview.getElement());
    centerCol.appendChild(this.metricsBar.getElement());
    centerCol.appendChild(this.batchList.getElement());

    studioSection.appendChild(sideCol);
    studioSection.appendChild(centerCol);
    main.appendChild(studioSection);

    this.container.appendChild(this.header.getElement());
    this.container.appendChild(errorBanner);
    this.container.appendChild(main);
    this.container.appendChild(this.footer.getElement());
  }

  private runEntranceAnimations(): void {
    try {
      this.header.getElement().animate(
        [
          { opacity: '0', transform: 'translateY(-10px)' },
          { opacity: '1', transform: 'translateY(0)' },
        ],
        { duration: 400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
      );

      this.dropzone.getElement().animate(
        [
          { opacity: '0', transform: 'translateY(12px)' },
          { opacity: '1', transform: 'translateY(0)' },
        ],
        { duration: 450, delay: 80, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
      );
    } catch {
      // Graceful fallback if motion cannot run
    }
  }

  private setupGlobalPaste(): void {
    window.addEventListener('paste', (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        this.handleFiles(files);
      }
    });
  }

  private handleFiles(files: File[]): void {
    if (files.length === 0) return;
    announceA11y(`Ingesting ${files.length} image file${files.length > 1 ? 's' : ''}`);
    BatchActions.enqueueFiles(files);
  }

  private handleSelectItem(item: import('../types').BatchItem): void {
    appStore.setState({ activeBatchItemId: item.id });
    IngestionService.ingestFile(item.file)
      .then((src) => {
        appStore.setState({
          sourceImage: src,
          compressionResult: item.result,
        });
        this.singlePreview.update(src, item.result);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        appStore.setState({ error: msg });
        announceA11y(`Error loading file: ${msg}`);
      });
  }

  private handleReset(): void {
    appStore.reset();
  }

  private handleDownload(): void {
    const state = appStore.getState();
    if (state.batchItems.length > 1) {
      BatchActions.downloadAllSequenced();
    } else if (state.compressionResult) {
      const a = document.createElement('a');
      a.href = state.compressionResult.objectUrl;
      a.download = state.compressionResult.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  private subscribeToStore(): void {
    const studioSection = this.container.querySelector<HTMLElement>('#studio-section')!;
    const errorBanner = this.container.querySelector<HTMLElement>('#error-banner')!;

    appStore.subscribe((state: AppState, prevState: AppState) => {
      const hasContent = state.sourceImage !== null || state.batchItems.length > 0;
      const prevHasContent = prevState.sourceImage !== null || prevState.batchItems.length > 0;

      if (hasContent !== prevHasContent) {
        if (hasContent) {
          studioSection.classList.remove('hidden');
          studioSection.animate(
            [
              { opacity: '0', transform: 'translateY(12px)' },
              { opacity: '1', transform: 'translateY(0)' },
            ],
            { duration: 350, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
          );
        } else {
          studioSection.classList.add('hidden');
        }
      }

      // Manage single vs batch view visibility
      if (state.batchItems.length > 1) {
        this.batchList.setVisible(true);
      } else {
        this.batchList.setVisible(false);
      }

      // Update Single Preview
      this.singlePreview.update(state.sourceImage, state.compressionResult);
      this.singlePreview.setProcessing(state.isProcessing);

      // Update Batch List
      this.batchList.update(state.batchItems);

      // Update Metrics
      this.metricsBar.update(state.sourceImage, state.compressionResult);

      // Error handling
      if (state.error !== prevState.error) {
        if (state.error) {
          errorBanner.textContent = state.error;
          errorBanner.classList.remove('hidden');
          announceA11y(`Alert: ${state.error}`);
        } else {
          errorBanner.classList.add('hidden');
        }
      }

      // Success announcement
      if (state.compressionResult && state.compressionResult !== prevState.compressionResult) {
        announceA11y(
          `Compression complete: ${state.compressionResult.filename}. Output size: ${Math.round(state.compressionResult.outputSize / 1024)} KB.`
        );
      }
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const eb = this.container.querySelector<HTMLElement>('#error-banner');
        if (eb && !eb.classList.contains('hidden')) {
          eb.classList.add('hidden');
          appStore.setState({ error: null });
        }
      }
    });
  }

  public async triggerSingleCompression(): Promise<void> {
    const state = appStore.getState();

    // If batch mode, pump queue with updated options
    if (state.batchItems.length > 1) {
      BatchActions.retryFailed();
      return;
    }

    if (!state.sourceImage) return;

    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    this.activeAbortController = new AbortController();
    const signal = this.activeAbortController.signal;

    appStore.setState({ isProcessing: true, error: null });

    try {
      const optionsWithSignal = {
        ...state.options,
        signal,
      };

      const result = await CompressionEngine.compress(
        state.sourceImage.file,
        optionsWithSignal,
        state.sourceImage.file.name
      );

      appStore.setState({
        compressionResult: result,
        isProcessing: false,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      appStore.setState({
        isProcessing: false,
        error: msg,
      });
    } finally {
      if (this.activeAbortController?.signal === signal) {
        this.activeAbortController = null;
      }
    }
  }
}
