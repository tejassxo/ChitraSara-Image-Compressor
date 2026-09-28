import { FormatProbe } from '../../core/engine/FormatProbe';
import { appStore } from '../../state/store';
import type { CompressionMode, CompressionOptions, SupportedMimeType } from '../../types';

export class ControlsPanel {
  private element: HTMLElement;
  private onTrigger: () => void;

  constructor(onTrigger: () => void) {
    this.onTrigger = onTrigger;
    this.element = document.createElement('div');
    this.element.className = 'controls-card';
    this.render();
    this.bindEvents();
    this.probeFormats();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public render(): void {
    const state = appStore.getState();
    const mode = state.options.mode || 'quality';
    const qualityVal = Math.round((state.options.quality || 0.75) * 100);

    this.element.innerHTML = `
      <div class="controls-toolbar">
        <!-- Mode Switcher: Quality vs Target Size -->
        <div class="segmented-control mode-selector" role="radiogroup" aria-label="Optimization Mode">
          <button type="button" class="segmented-btn ${mode === 'quality' ? 'active' : ''}" data-mode="quality">
            Quality Mode
          </button>
          <button type="button" class="segmented-btn ${mode === 'targetSize' ? 'active' : ''}" data-mode="targetSize">
            Target Size Mode
          </button>
        </div>

        <!-- Format Selector -->
        <div class="control-subgroup format-subgroup">
          <span class="control-label">Format</span>
          <div class="segmented-control format-selector" id="format-selector" role="radiogroup">
            <button type="button" class="segmented-btn active" data-format="original">Original</button>
            <button type="button" class="segmented-btn" data-format="image/webp">WebP</button>
            <button type="button" class="segmented-btn" data-format="image/jpeg">JPEG</button>
            <button type="button" class="segmented-btn" data-format="image/png">PNG</button>
            <button type="button" class="segmented-btn" data-format="image/avif" id="btn-avif">AVIF</button>
          </div>
        </div>

        <!-- Max Dimension Selector -->
        <div class="control-subgroup dim-subgroup">
          <label for="dimension-select" class="control-label">Max Dimension</label>
          <select id="dimension-select" class="pro-select">
            <option value="original" selected>Original Dimensions</option>
            <option value="2560">2560px (2K QHD)</option>
            <option value="1920">1920px (Full HD)</option>
            <option value="1280">1280px (Standard Web)</option>
            <option value="800">800px (Mobile)</option>
          </select>
        </div>
      </div>

      <!-- Mode-Specific Input Area -->
      <div class="mode-parameters-row">
        <!-- Quality Slider Container -->
        <div class="parameter-box quality-box ${mode === 'quality' ? '' : 'hidden'}" id="quality-box">
          <div class="parameter-header">
            <label for="quality-slider" class="control-label">Compression Factor</label>
            <span class="parameter-value" id="quality-val">${qualityVal}%</span>
          </div>
          <div class="slider-track-wrap">
            <input type="range" id="quality-slider" min="5" max="100" value="${qualityVal}" step="1" class="pro-range" />
            <div class="slider-ticks">
              <span>Max Compression</span>
              <span>Balanced</span>
              <span>High Fidelity</span>
            </div>
          </div>
        </div>

        <!-- Target Size Input Container -->
        <div class="parameter-box target-size-box ${mode === 'targetSize' ? '' : 'hidden'}" id="target-size-box">
          <div class="parameter-header">
            <label for="target-size-input" class="control-label">Target File Size Limit</label>
            <span class="parameter-hint">Binary Search + Progressive Downscale</span>
          </div>
          <div class="target-size-inputs">
            <div class="quick-size-pills" id="quick-size-pills">
              <button type="button" class="pill-preset" data-bytes="51200">50 KB</button>
              <button type="button" class="pill-preset active" data-bytes="102400">100 KB</button>
              <button type="button" class="pill-preset" data-bytes="204800">200 KB</button>
              <button type="button" class="pill-preset" data-bytes="512000">500 KB</button>
              <button type="button" class="pill-preset" data-bytes="1048576">1 MB</button>
            </div>
            <div class="custom-size-field">
              <input type="number" id="custom-size-input" min="5" max="20000" placeholder="Custom" class="pro-number-input" />
              <select id="custom-size-unit" class="pro-select unit-select">
                <option value="KB" selected>KB</option>
                <option value="MB">MB</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="controls-footer">
        <label class="toggle-checkbox" for="auto-process-toggle">
          <input type="checkbox" id="auto-process-toggle" checked />
          <span class="toggle-text">Auto-process on parameter change</span>
        </label>
        <button type="button" class="pro-btn pro-btn-primary" id="manual-compress-btn" style="display: none;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>Run Compression</span>
        </button>
      </div>
    `;
  }

  private async probeFormats(): Promise<void> {
    const info = await FormatProbe.probeCapabilities();
    const avifBtn = this.element.querySelector<HTMLButtonElement>('#btn-avif');
    if (avifBtn && !info.avif) {
      avifBtn.disabled = true;
      avifBtn.classList.add('disabled');
      avifBtn.title = 'AVIF encoding not supported natively in this browser';
    }
  }

  private bindEvents(): void {
    // 1. Mode Switcher
    const modeBtns = this.element.querySelectorAll<HTMLButtonElement>('.mode-selector .segmented-btn');
    modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode') as CompressionMode;
        modeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const qualityBox = this.element.querySelector<HTMLElement>('#quality-box');
        const targetSizeBox = this.element.querySelector<HTMLElement>('#target-size-box');

        if (mode === 'quality') {
          qualityBox?.classList.remove('hidden');
          targetSizeBox?.classList.add('hidden');
          appStore.updateOptions({ mode: 'quality', targetBytes: undefined });
        } else {
          qualityBox?.classList.add('hidden');
          targetSizeBox?.classList.remove('hidden');
          const activePreset = this.element.querySelector<HTMLButtonElement>('.quick-size-pills .pill-preset.active');
          const bytes = activePreset ? parseInt(activePreset.getAttribute('data-bytes') || '102400', 10) : 102400;
          appStore.updateOptions({ mode: 'targetSize', targetBytes: bytes });
        }

        if (appStore.getState().autoProcess) {
          this.onTrigger();
        }
      });
    });

    // 2. Format Buttons
    const formatBtns = this.element.querySelectorAll<HTMLButtonElement>('#format-selector .segmented-btn');
    formatBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const format = btn.getAttribute('data-format') as SupportedMimeType | 'original';
        formatBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        // Disable quality slider for PNG
        const qualitySlider = this.element.querySelector<HTMLInputElement>('#quality-slider');
        const qualityVal = this.element.querySelector<HTMLElement>('#quality-val');
        if (format === 'image/png') {
          if (qualitySlider) qualitySlider.disabled = true;
          if (qualityVal) qualityVal.textContent = 'Lossless';
        } else {
          if (qualitySlider) qualitySlider.disabled = false;
          if (qualityVal && qualitySlider) qualityVal.textContent = `${qualitySlider.value}%`;
        }

        appStore.updateOptions({ format });
        if (appStore.getState().autoProcess) {
          this.onTrigger();
        }
      });
    });

    // 3. Quality Slider
    const qualitySlider = this.element.querySelector<HTMLInputElement>('#quality-slider');
    const qualityVal = this.element.querySelector<HTMLElement>('#quality-val');
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    qualitySlider?.addEventListener('input', () => {
      const val = parseInt(qualitySlider.value, 10);
      if (qualityVal) qualityVal.textContent = `${val}%`;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        appStore.updateOptions({ quality: val / 100 });
        if (appStore.getState().autoProcess) {
          this.onTrigger();
        }
      }, 100);
    });

    // 4. Target Size Quick Presets
    const presets = this.element.querySelectorAll<HTMLButtonElement>('.quick-size-pills .pill-preset');
    presets.forEach((preset) => {
      preset.addEventListener('click', () => {
        presets.forEach((p) => p.classList.remove('active'));
        preset.classList.add('active');
        const bytes = parseInt(preset.getAttribute('data-bytes') || '102400', 10);
        appStore.updateOptions({ targetBytes: bytes });
        if (appStore.getState().autoProcess) {
          this.onTrigger();
        }
      });
    });

    // 5. Custom Target Size Input
    const customInput = this.element.querySelector<HTMLInputElement>('#custom-size-input');
    const customUnit = this.element.querySelector<HTMLSelectElement>('#custom-size-unit');

    const updateCustomSize = () => {
      const num = parseFloat(customInput?.value || '0');
      if (num > 0) {
        presets.forEach((p) => p.classList.remove('active'));
        const multiplier = customUnit?.value === 'MB' ? 1024 * 1024 : 1024;
        const bytes = Math.round(num * multiplier);
        appStore.updateOptions({ targetBytes: bytes });
        if (appStore.getState().autoProcess) {
          this.onTrigger();
        }
      }
    };

    customInput?.addEventListener('change', updateCustomSize);
    customUnit?.addEventListener('change', updateCustomSize);

    // 6. Max Dimension Selector
    const dimSelect = this.element.querySelector<HTMLSelectElement>('#dimension-select');
    dimSelect?.addEventListener('change', () => {
      const val = dimSelect.value;
      if (val === 'original') {
        appStore.updateOptions({
          resize: { mode: 'original', maintainAspectRatio: true },
        });
      } else {
        const dim = parseInt(val, 10);
        appStore.updateOptions({
          resize: {
            mode: 'constraint',
            maxWidth: dim,
            maxHeight: dim,
            maintainAspectRatio: true,
          },
        });
      }

      if (appStore.getState().autoProcess) {
        this.onTrigger();
      }
    });

    // 7. Auto Process Toggle & Manual Button
    const autoToggle = this.element.querySelector<HTMLInputElement>('#auto-process-toggle');
    const manualBtn = this.element.querySelector<HTMLButtonElement>('#manual-compress-btn');

    autoToggle?.addEventListener('change', () => {
      const checked = autoToggle.checked;
      appStore.setState({ autoProcess: checked });
      if (manualBtn) {
        manualBtn.style.display = checked ? 'none' : 'inline-flex';
      }
    });

    manualBtn?.addEventListener('click', () => {
      this.onTrigger();
    });
  }

  public syncFromState(_options: CompressionOptions, autoProcess: boolean): void {
    const autoToggle = this.element.querySelector<HTMLInputElement>('#auto-process-toggle');
    const manualBtn = this.element.querySelector<HTMLButtonElement>('#manual-compress-btn');
    if (autoToggle) autoToggle.checked = autoProcess;
    if (manualBtn) manualBtn.style.display = autoProcess ? 'none' : 'inline-flex';
  }
}
