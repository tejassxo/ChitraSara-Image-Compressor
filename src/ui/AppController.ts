import { CompressionEngine } from '../core/engine/CompressionEngine';
import { HardwareGovernor } from '../core/governor/HardwareGovernor';
import { IngestionService } from '../services/IngestionService';
import { appStore, type AppState } from '../state/store';
import { $ } from '../utils/dom';
import { ControlPanel } from './ControlPanel';
import { PreviewViewport } from './PreviewViewport';
import { TelemetryDashboard } from './TelemetryDashboard';

export class AppController {
  public readonly controlPanel: ControlPanel;
  public readonly telemetryDashboard: TelemetryDashboard;
  public readonly previewViewport: PreviewViewport;
  private dropzoneSection: HTMLElement;
  private studioSection: HTMLElement;
  private hardwareTextEl: HTMLElement;
  private errorBannerEl: HTMLElement;
  private activeAbortController: AbortController | null = null;

  constructor() {
    this.dropzoneSection = $<HTMLElement>('#dropzone-section');
    this.studioSection = $<HTMLElement>('#studio-section');
    this.hardwareTextEl = $<HTMLElement>('#hardware-text');
    this.errorBannerEl = $<HTMLElement>('#error-banner');

    this.controlPanel = new ControlPanel(() => this.triggerCompression());
    this.telemetryDashboard = new TelemetryDashboard();
    this.previewViewport = new PreviewViewport();

    this.initHardwareTelemetry();
    this.initIngestion();
    this.subscribeToStore();
  }

  private initHardwareTelemetry(): void {
    const caps = HardwareGovernor.getCapabilities();
    HardwareGovernor.applyProfileDOMHints();

    const memStr = caps.deviceMemoryGB ? `${caps.deviceMemoryGB}GB RAM` : 'RAM Managed';
    const coreStr = `${caps.hardwareConcurrency} Cores`;
    this.hardwareTextEl.textContent = `${caps.profile} (${coreStr} • ${memStr})`;
  }

  private initIngestion(): void {
    const dropzoneEl = $<HTMLElement>('#dropzone');
    const fileInputEl = $<HTMLInputElement>('#file-input');

    IngestionService.setupIngestionListeners(dropzoneEl, fileInputEl, (files) => {
      if (files[0]) {
        IngestionService.ingestFile(files[0]).then((sourceImage) => {
          appStore.setState({ sourceImage, error: null });
        }).catch((err: unknown) => {
          appStore.setState({ error: err instanceof Error ? err.message : String(err) });
        });
      }
    });
  }

  private subscribeToStore(): void {
    appStore.subscribe((state: AppState, prevState: AppState) => {
      // 1. Source image changes
      if (state.sourceImage !== prevState.sourceImage) {
        if (state.sourceImage) {
          this.dropzoneSection.classList.add('hidden');
          this.studioSection.classList.remove('hidden');
          // Trigger initial compression on ingestion
          this.triggerCompression();
        } else {
          this.dropzoneSection.classList.remove('hidden');
          this.studioSection.classList.add('hidden');
        }
      }

      // 2. Error handling
      if (state.error !== prevState.error) {
        if (state.error) {
          this.errorBannerEl.textContent = state.error;
          this.errorBannerEl.classList.remove('hidden');
        } else {
          this.errorBannerEl.classList.add('hidden');
        }
      }

      // 3. Processing state
      if (state.isProcessing !== prevState.isProcessing) {
        this.previewViewport.setProcessing(state.isProcessing);
      }

      // 4. Update telemetry and preview views
      this.telemetryDashboard.update(state.sourceImage, state.compressionResult);
      this.previewViewport.render(state.sourceImage, state.compressionResult, state.activePreviewTab);
    });
  }

  public async triggerCompression(): Promise<void> {
    const state = appStore.getState();
    if (!state.sourceImage) return;

    // Abort any in-flight compression operation to maintain zero orphaned computations
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

      // Clean up previous result object URL if one existed
      if (state.compressionResult?.objectUrl) {
        URL.revokeObjectURL(state.compressionResult.objectUrl);
      }

      appStore.setState({
        compressionResult: result,
        isProcessing: false,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Normal cancellation path, do not display error banner
        return;
      }
      console.error('Compression failure:', err);
      const msg = err instanceof Error ? err.message : String(err);
      appStore.setState({
        isProcessing: false,
        error: msg || 'Compression failed',
      });
    } finally {
      if (this.activeAbortController?.signal === signal) {
        this.activeAbortController = null;
      }
    }
  }
}
