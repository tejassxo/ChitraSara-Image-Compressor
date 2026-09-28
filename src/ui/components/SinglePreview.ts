import type { CompressionResult, SourceImage } from '../../types';
import { formatBytes, formatDimensions } from '../../utils/formatters';

export class SinglePreview {
  private element: HTMLElement;
  private originalImg: HTMLImageElement | null = null;
  private compressedImg: HTMLImageElement | null = null;
  private splitHairline: HTMLElement | null = null;
  private isDragging = false;
  private loaderEl: HTMLElement | null = null;
  private currentZoom = 1;
  private viewMode: 'split' | 'toggle' = 'split';
  private showingOriginalInToggle = false;

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
          <span class="preview-split-hint" id="preview-mode-hint">Drag hairline divider to inspect pixels</span>
        </div>

        <div class="preview-toolbar-actions">
          <!-- View Mode (Split vs Flip) -->
          <div class="mini-segmented" id="preview-mode-toggle">
            <button type="button" class="mini-seg-btn active" data-view="split" title="Split Screen Slider">Split</button>
            <button type="button" class="mini-seg-btn" data-view="toggle" title="Click or Spacebar to Toggle A/B">A/B Flip</button>
          </div>

          <!-- Zoom Controls -->
          <div class="mini-segmented" id="preview-zoom-group">
            <button type="button" class="mini-seg-btn active" data-zoom="fit">Fit</button>
            <button type="button" class="mini-seg-btn" data-zoom="1">100%</button>
            <button type="button" class="mini-seg-btn" data-zoom="2">200%</button>
          </div>
        </div>
      </div>

      <div class="preview-meta-bar" id="preview-meta-bar">
        <div class="meta-chips-row">
          <span class="meta-chip meta-chip-orig" id="preview-meta-orig">Original: 0 B</span>
          <span class="meta-arrow">➔</span>
          <span class="meta-chip meta-chip-comp" id="preview-meta-comp">Compressed: 0 B</span>
          <span class="meta-chip meta-chip-res" id="preview-meta-res">-- × --</span>
        </div>
      </div>

      <div class="preview-stage" id="preview-stage" tabindex="0" title="Click stage to interact">
        <div class="stage-zoom-container" id="stage-zoom-container">
          <!-- Original Layer -->
          <div class="preview-layer preview-layer-original" id="layer-original">
            <img id="img-original" alt="Original Image" draggable="false" />
            <span class="layer-badge layer-badge-left" id="badge-orig">Original</span>
          </div>

          <!-- Compressed Layer -->
          <div class="preview-layer preview-layer-compressed" id="layer-compressed">
            <img id="img-compressed" alt="Compressed Image" draggable="false" />
            <span class="layer-badge layer-badge-right" id="badge-comp">Compressed</span>
          </div>
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
          <span class="loader-text">Encoding image pixels...</span>
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

    // 1. Pointer Drag on Hairline
    const onPointerDown = (e: PointerEvent) => {
      if (this.viewMode === 'toggle') {
        this.toggleAB();
        return;
      }
      this.isDragging = true;
      this.splitHairline?.setPointerCapture(e.pointerId);
      this.handleDrag(e, stage);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.isDragging || this.viewMode === 'toggle') return;
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

    // Click anywhere on stage to jump divider (if in split mode)
    stage.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.target === this.splitHairline || this.splitHairline?.contains(e.target as Node)) {
        return;
      }
      if (this.viewMode === 'split') {
        this.handleDrag(e, stage);
      } else {
        this.toggleAB();
      }
    });

    // Keyboard spacebar to toggle A/B
    stage.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.toggleAB();
      }
    });

    // 2. View Mode Toggle
    const modeBtns = this.element.querySelectorAll<HTMLButtonElement>('#preview-mode-toggle .mini-seg-btn');
    const hintEl = this.element.querySelector<HTMLElement>('#preview-mode-hint');

    modeBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        modeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const v = btn.getAttribute('data-view') as 'split' | 'toggle';
        this.viewMode = v;

        const compLayer = this.element.querySelector<HTMLElement>('#layer-compressed');
        const origBadge = this.element.querySelector<HTMLElement>('#badge-orig');
        const compBadge = this.element.querySelector<HTMLElement>('#badge-comp');

        if (v === 'split') {
          if (this.splitHairline) this.splitHairline.style.display = 'block';
          if (hintEl) hintEl.textContent = 'Drag hairline divider to inspect pixels';
          this.updateSplit(50);
          if (origBadge) origBadge.style.display = 'block';
          if (compBadge) compBadge.style.display = 'block';
        } else {
          if (this.splitHairline) this.splitHairline.style.display = 'none';
          if (hintEl) hintEl.textContent = 'Click stage or press Spacebar to toggle Original vs Output';
          if (compLayer) compLayer.style.clipPath = 'none';
          this.showingOriginalInToggle = false;
          this.updateToggleBadges();
        }
      });
    });

    // 3. Zoom Controls
    const zoomBtns = this.element.querySelectorAll<HTMLButtonElement>('#preview-zoom-group .mini-seg-btn');
    const zoomContainer = this.element.querySelector<HTMLElement>('#stage-zoom-container');

    zoomBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        zoomBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const z = btn.getAttribute('data-zoom');

        if (z === 'fit') {
          this.currentZoom = 1;
          if (zoomContainer) {
            zoomContainer.style.transform = 'scale(1)';
            zoomContainer.style.cursor = 'default';
          }
        } else if (z === '1') {
          this.currentZoom = 1.35;
          if (zoomContainer) {
            zoomContainer.style.transform = `scale(${this.currentZoom})`;
            zoomContainer.style.cursor = 'grab';
          }
        } else if (z === '2') {
          this.currentZoom = 2.0;
          if (zoomContainer) {
            zoomContainer.style.transform = `scale(${this.currentZoom})`;
            zoomContainer.style.cursor = 'grab';
          }
        }
      });
    });
  }

  private toggleAB(): void {
    if (this.viewMode !== 'toggle') return;
    this.showingOriginalInToggle = !this.showingOriginalInToggle;
    const compLayer = this.element.querySelector<HTMLElement>('#layer-compressed');
    if (compLayer) {
      compLayer.style.opacity = this.showingOriginalInToggle ? '0' : '1';
    }
    this.updateToggleBadges();
  }

  private updateToggleBadges(): void {
    const origBadge = this.element.querySelector<HTMLElement>('#badge-orig');
    const compBadge = this.element.querySelector<HTMLElement>('#badge-comp');
    if (this.showingOriginalInToggle) {
      if (origBadge) {
        origBadge.style.display = 'block';
        origBadge.textContent = 'Showing: ORIGINAL';
      }
      if (compBadge) compBadge.style.display = 'none';
    } else {
      if (origBadge) origBadge.style.display = 'none';
      if (compBadge) {
        compBadge.style.display = 'block';
        compBadge.textContent = 'Showing: COMPRESSED';
      }
    }
  }

  private handleDrag(e: PointerEvent, stage: HTMLElement): void {
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    this.updateSplit(pct);
  }

  public updateSplit(percent: number): void {
    if (this.splitHairline) {
      this.splitHairline.style.left = `${percent}%`;
    }
    const compLayer = this.element.querySelector<HTMLElement>('#layer-compressed');
    if (compLayer) {
      compLayer.style.clipPath = `polygon(${percent}% 0%, 100% 0%, 100% 100%, ${percent}% 100%)`;
    }
  }

  public update(source: SourceImage | null, result: CompressionResult | null): void {
    const metaOrig = this.element.querySelector<HTMLElement>('#preview-meta-orig');
    const metaComp = this.element.querySelector<HTMLElement>('#preview-meta-comp');
    const metaRes = this.element.querySelector<HTMLElement>('#preview-meta-res');

    if (!source) {
      if (this.originalImg) this.originalImg.src = '';
      if (this.compressedImg) this.compressedImg.src = '';
      if (metaOrig) metaOrig.textContent = 'Original: 0 B';
      if (metaComp) metaComp.textContent = 'Compressed: 0 B';
      if (metaRes) metaRes.textContent = '-- × --';
      return;
    }

    if (this.originalImg) {
      this.originalImg.src = source.originalUrl;
    }
    if (metaOrig) {
      metaOrig.textContent = `Original: ${formatBytes(source.size)}`;
    }

    if (metaRes) {
      const origMp = ((source.dimensions.width * source.dimensions.height) / 1e6).toFixed(1);
      metaRes.textContent = `${source.dimensions.width}×${source.dimensions.height} (${origMp} MP)`;
    }

    if (result) {
      if (this.compressedImg) {
        this.compressedImg.src = result.objectUrl;
      }
      if (metaComp) {
        metaComp.textContent = `Compressed: ${formatBytes(result.outputSize)}`;
      }
      if (metaRes) {
        const outMp = ((result.dimensions.width * result.dimensions.height) / 1e6).toFixed(1);
        metaRes.textContent = `${formatDimensions(result.dimensions.width, result.dimensions.height)} (${outMp} MP)`;
      }
    } else {
      if (this.compressedImg) {
        this.compressedImg.src = source.originalUrl;
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
