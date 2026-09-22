import { appStore } from '../../state/Store';
import type { CompressionResult, SourceImage } from '../../types';
import { $, $$ } from '../../utils/dom';
import { formatDimensions } from '../../utils/formatters';

export class PreviewViewport {
  private previewImg: HTMLImageElement;
  private previewLoader: HTMLElement;
  private previewDimensions: HTMLElement;
  private tabCompressed: HTMLButtonElement;
  private tabOriginal: HTMLButtonElement;

  constructor() {
    this.previewImg = $<HTMLImageElement>('#preview-img');
    this.previewLoader = $<HTMLElement>('#preview-loader');
    this.previewDimensions = $<HTMLElement>('#preview-dimensions');
    this.tabCompressed = $<HTMLButtonElement>('#tab-compressed');
    this.tabOriginal = $<HTMLButtonElement>('#tab-original');

    this.bindEvents();
  }

  private bindEvents(): void {
    const tabs = $$<HTMLButtonElement>('.preview-tabs .preview-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const view = tab.getAttribute('data-view') as 'compressed' | 'original';
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        appStore.setState({ activePreviewTab: view });
        this.renderCurrentView();
      });
    });
  }

  public setProcessing(isProcessing: boolean): void {
    this.previewLoader.classList.toggle('hidden', !isProcessing);
  }

  public render(
    source: SourceImage | null,
    result: CompressionResult | null,
    activeTab: 'compressed' | 'original'
  ): void {
    this.tabCompressed.classList.toggle('active', activeTab === 'compressed');
    this.tabOriginal.classList.toggle('active', activeTab === 'original');

    if (!source) {
      this.previewImg.src = '';
      this.previewDimensions.textContent = '0 × 0 px';
      return;
    }

    if (activeTab === 'original') {
      this.previewImg.src = source.originalUrl;
      this.previewDimensions.textContent = `Original: ${formatDimensions(
        source.dimensions.width,
        source.dimensions.height
      )}`;
    } else if (result) {
      this.previewImg.src = result.objectUrl;
      this.previewDimensions.textContent = `Compressed: ${formatDimensions(
        result.dimensions.width,
        result.dimensions.height
      )}`;
    } else {
      // Still compressing or no result yet, show original as placeholder
      this.previewImg.src = source.originalUrl;
      this.previewDimensions.textContent = `Processing: ${formatDimensions(
        source.dimensions.width,
        source.dimensions.height
      )}`;
    }
  }

  private renderCurrentView(): void {
    const { sourceImage, compressionResult, activePreviewTab } = appStore.getState();
    this.render(sourceImage, compressionResult, activePreviewTab);
  }
}
