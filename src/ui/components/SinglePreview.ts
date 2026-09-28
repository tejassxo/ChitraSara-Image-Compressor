import type { CompressionResult, SourceImage } from '../../types';
import { formatBytes, formatDimensions } from '../../utils/formatters';

export class SinglePreview {
  private element: HTMLElement;
  private originalImg: HTMLImageElement | null = null;
  private compressedImg: HTMLImageElement | null = null;
  private splitHairline: HTMLElement | null = null;
  private isDragging = false;
  private loaderEl: HTMLElement | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'single-preview-card';
    this.render();
    this.bindEvents();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public render(): void {
    this.element.innerHTML = `
      <div class="preview-header">
        <div class="preview-title-bar">
          <span class="preview-label">Visual Inspection</span>
          <span class="preview-split-hint">Drag hairline divider to inspect pixels</span>
        </div>
        <div class="preview-meta-bar" id="preview-meta-bar">
          <span class="meta-item meta-orig" id="preview-meta-orig">Original: 0 B</span>
          <span class="meta-separator">|</span>
          <span class="meta-item meta-comp" id="preview-meta-comp">Compressed: 0 B</span>
        </div>
      </div>

      <div class="preview-stage" id="preview-stage">
        <!-- Original Layer (Underneath or clipped) -->
        <div class="preview-layer preview-layer-original" id="layer-original">
          <img id="img-original" alt="Original Image" draggable="false" />
          <span class="layer-badge layer-badge-left">Original</span>
        </div>

        <!-- Compressed Layer (Clipped by slider ratio) -->
        <div class="preview-layer preview-layer-compressed" id="layer-compressed">
          <img id="img-compressed" alt="Compressed Image" draggable="false" />
          <span class="layer-badge layer-badge-right">Compressed</span>
        </div>

        <!-- Draggable Hairline Splitter -->
        <div class="split-divider" id="split-divider" style="left: 50%;">
          <div class="split-handle">
            <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
              <path d="M3 3L1 7L3 11M7 3L9 7L7 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>

        <!-- Processing Loader -->
        <div class="preview-loader hidden" id="preview-loader">
          <div class="loader-spinner"></div>
          <span class="loader-text">Compressing frame...</span>
        </div>
      </div>
    `;

    this.originalImg = this.element.querySelector<HTMLImageElement>('#img-original');
    this.compressedImg = this.element.querySelector<HTMLImageElement>('#img-compressed');
    this.splitHairline = this.element.querySelector<HTMLElement>('#split-divider');
    this.loaderEl = this.element.querySelector<HTMLElement>('#preview-loader');
    this.updateSplit(50);
  }

  private bindEvents(): void {
    const stage = this.element.querySelector<HTMLElement>('#preview-stage');
    if (!stage || !this.splitHairline) return;

    const onPointerDown = (e: PointerEvent) => {
      this.isDragging = true;
      this.splitHairline?.setPointerCapture(e.pointerId);
      this.handleDrag(e, stage);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.isDragging) return;
      this.handleDrag(e, stage);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (this.isDragging) {
        this.isDragging = false;
        try {
          this.splitHairline?.releasePointerCapture(e.pointerId);
        } catch {
          // Ignore
        }
      }
    };

    this.splitHairline.addEventListener('pointerdown', onPointerDown);
    this.splitHairline.addEventListener('pointermove', onPointerMove);
    this.splitHairline.addEventListener('pointerup', onPointerUp);
    this.splitHairline.addEventListener('pointercancel', onPointerUp);

    // Also support clicking directly anywhere on the stage to jump split
    stage.addEventListener('click', (e: MouseEvent) => {
      if (e.target !== this.splitHairline && !this.splitHairline?.contains(e.target as Node)) {
        this.handleDrag(e, stage);
      }
    });
  }

  private handleDrag(e: MouseEvent | PointerEvent, stage: HTMLElement): void {
    const rect = stage.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    this.updateSplit(percent);
  }

  private updateSplit(ratio: number): void {
    if (this.splitHairline) {
      this.splitHairline.style.left = `${ratio}%`;
    }
    const compressedLayer = this.element.querySelector<HTMLElement>('#layer-compressed');
    if (compressedLayer) {
      compressedLayer.style.clipPath = `inset(0 0 0 ${ratio}%)`;
    }
  }

  public update(source: SourceImage | null, result: CompressionResult | null): void {
    const metaOrig = this.element.querySelector<HTMLElement>('#preview-meta-orig');
    const metaComp = this.element.querySelector<HTMLElement>('#preview-meta-comp');

    if (!source) {
      if (this.originalImg) this.originalImg.src = '';
      if (this.compressedImg) this.compressedImg.src = '';
      if (metaOrig) metaOrig.textContent = 'Original: 0 B';
      if (metaComp) metaComp.textContent = 'Compressed: 0 B';
      return;
    }

    if (this.originalImg) {
      this.originalImg.src = source.originalUrl;
    }
    if (metaOrig) {
      metaOrig.textContent = `Original: ${formatBytes(source.size)} (${formatDimensions(source.dimensions.width, source.dimensions.height)})`;
    }

    if (result) {
      if (this.compressedImg) {
        this.compressedImg.src = result.objectUrl;
      }
      if (metaComp) {
        metaComp.textContent = `Compressed: ${formatBytes(result.outputSize)} (${formatDimensions(result.dimensions.width, result.dimensions.height)})`;
      }
    } else {
      if (this.compressedImg) {
        this.compressedImg.src = source.originalUrl; // Show original until compressed
      }
      if (metaComp) {
        metaComp.textContent = 'Compressing...';
      }
    }
  }

  public setProcessing(isProcessing: boolean): void {
    this.loaderEl?.classList.toggle('hidden', !isProcessing);
  }

  public setVisible(visible: boolean): void {
    this.element.style.display = visible ? 'flex' : 'none';
  }
}
