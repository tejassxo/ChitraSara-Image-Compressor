import { FormatProbe } from '../../core/engine/FormatProbe';
import { appStore } from '../../state/store';
import type { CompressionMode, SupportedMimeType } from '../../types';
import { calculateTargetDimensions } from '../../utils/math';
import { formatAspectRatio } from '../../utils/dimensions';

export class ControlsPanel {
  private element: HTMLElement;
  private onTrigger: () => void;
  private aspectLocked = true;

  constructor(onTrigger: () => void) {
    this.onTrigger = onTrigger;
    this.element = document.createElement('div');
    this.element.className = 'controls-card';
    this.render();
    this.bindEvents();
    this.probeFormats();
    this.subscribeToStore();
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
        <!-- 1. Optimization Mode Switcher -->
        <div class="control-section">
          <label class="control-section-label">Engine Mode</label>
          <div class="segmented-control mode-selector" role="radiogroup" aria-label="Optimization Mode">
            <button type="button" class="segmented-btn ${mode === 'quality' ? 'active' : ''}" data-mode="quality">
              Quality Mode
            </button>
            <button type="button" class="segmented-btn ${mode === 'targetSize' ? 'active' : ''}" data-mode="targetSize">
              Target Size
            </button>
            <button type="button" class="segmented-btn ${mode === 'lossless' ? 'active' : ''}" data-mode="lossless">
              Lossless
            </button>
          </div>
        </div>

        <!-- 2. Target Format Selector -->
        <div class="control-section">
          <div class="control-label-row">
            <label class="control-section-label">Output Format</label>
            <span class="control-label-hint">Lossy / Lossless</span>
          </div>
          <div class="segmented-control format-selector" id="format-selector" role="radiogroup">
            <button type="button" class="segmented-btn active" data-format="original">Original</button>
            <button type="button" class="segmented-btn" data-format="image/webp">WebP</button>
            <button type="button" class="segmented-btn" data-format="image/jpeg">JPEG</button>
            <button type="button" class="segmented-btn" data-format="image/png">PNG</button>
            <button type="button" class="segmented-btn" data-format="image/avif" id="btn-avif">AVIF</button>
          </div>
        </div>

        <!-- 3. Resolution & Scaling Studio -->
        <div class="control-section resolution-section">
          <div class="control-label-row">
            <label class="control-section-label">Resolution &amp; Framing</label>
            <span class="control-label-hint" id="res-mode-hint">Original 100%</span>
          </div>

          <!-- Scale Mode Sub-Tabs -->
          <div class="mini-tab-group" id="scale-mode-selector">
            <button type="button" class="mini-tab-btn active" data-scale-mode="original">Original</button>
            <button type="button" class="mini-tab-btn" data-scale-mode="scale">Scale %</button>
            <button type="button" class="mini-tab-btn" data-scale-mode="custom">Custom W×H</button>
            <button type="button" class="mini-tab-btn" data-scale-mode="preset">Presets</button>
          </div>

          <!-- Scale % Controls -->
          <div class="scale-mode-panel hidden" id="panel-scale">
            <div class="scale-quick-pills">
              <button type="button" class="scale-pill" data-scale="100">100%</button>
              <button type="button" class="scale-pill active" data-scale="75">75%</button>
              <button type="button" class="scale-pill" data-scale="50">50%</button>
              <button type="button" class="scale-pill" data-scale="25">25%</button>
            </div>
            <div class="scale-slider-row">
              <input type="range" id="scale-slider" min="10" max="100" value="75" step="5" class="pro-range" />
              <span class="scale-val-badge" id="scale-val-badge">75%</span>
            </div>
          </div>

          <!-- Custom Dimensions (W x H) -->
          <div class="scale-mode-panel hidden" id="panel-custom">
            <div class="custom-dims-row">
              <div class="dim-input-col">
                <span class="input-sub">Width (px)</span>
                <input type="number" id="dim-custom-w" min="32" max="16384" placeholder="Width" class="pro-number-input" />
              </div>
              <button type="button" class="aspect-lock-btn active" id="btn-aspect-lock" title="Lock Aspect Ratio">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </button>
              <div class="dim-input-col">
                <span class="input-sub">Height (px)</span>
                <input type="number" id="dim-custom-h" min="32" max="16384" placeholder="Height" class="pro-number-input" />
              </div>
            </div>
            <div class="custom-dims-subrow" style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 12px; color: var(--text-secondary);">
              <span class="aspect-ratio-indicator" id="aspect-ratio-indicator">Aspect Ratio: --</span>
              <label class="toggle-checkbox" for="allow-upscale-toggle" title="Allow scaling beyond natural dimensions (synthesizes new pixels)">
                <input type="checkbox" id="allow-upscale-toggle" />
                <span class="toggle-text">Allow upscaling</span>
              </label>
            </div>
          </div>

          <!-- Categorized Presets -->
          <div class="scale-mode-panel hidden" id="panel-preset">
            <select id="preset-select" class="pro-select">
              <option value="" disabled selected>Choose Display or Social Preset...</option>
              <optgroup label="Display Standards">
                <option value="3840x2160">4K UHD (3840 × 2160)</option>
                <option value="2560x1440">2K QHD (2560 × 1440)</option>
                <option value="1920x1080">Full HD 1080p (1920 × 1080)</option>
                <option value="1280x720">HD 720p (1280 × 720)</option>
                <option value="800x600">SVGA (800 × 600)</option>
              </optgroup>
              <optgroup label="Social Platforms">
                <option value="1080x1080">Instagram Square (1080 × 1080)</option>
                <option value="1080x1350">Instagram Portrait (1080 × 1350)</option>
                <option value="1080x1920">Instagram Story / Reels (1080 × 1920)</option>
                <option value="1200x675">Twitter / X Post (1200 × 675)</option>
                <option value="1500x500">Twitter / X Header (1500 × 500)</option>
                <option value="1280x720">YouTube Thumbnail (1280 × 720)</option>
                <option value="1200x627">LinkedIn Feed (1200 × 627)</option>
                <option value="1584x396">LinkedIn Banner (1584 × 396)</option>
              </optgroup>
              <optgroup label="E-Commerce &amp; Web">
                <option value="2048x2048">Shopify / Amazon Square (2048 × 2048)</option>
                <option value="1200x1200">Catalog Standard (1200 × 1200)</option>
                <option value="512x512">Avatar / App Icon (512 × 512)</option>
              </optgroup>
            </select>
          </div>

          <!-- Dynamic Resolution Delta Badge -->
          <div class="resolution-delta-pill hidden" id="resolution-delta-pill"></div>
        </div>

        <!-- 4. Mode-Specific Input Area -->
        <div class="control-section mode-parameters-section">
          <!-- Quality Slider Container -->
          <div class="parameter-box quality-box ${mode === 'quality' ? '' : 'hidden'}" id="quality-box">
            <div class="control-label-row">
              <label for="quality-slider" class="control-section-label">Compression Factor</label>
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
            <div class="control-label-row">
              <label for="target-size-input" class="control-section-label">Target File Size</label>
              <span class="parameter-hint">Progressive Solver</span>
            </div>
            <div class="target-size-inputs">
              <div class="quick-size-pills" id="quick-size-pills">
                <button type="button" class="pill-preset" data-bytes="51200">50 KB</button>
                <button type="button" class="pill-preset active" data-bytes="102400">100 KB</button>
                <button type="button" class="pill-preset" data-bytes="204800">200 KB</button>
                <button type="button" class="pill-preset" data-bytes="512000">500 KB</button>
                <button type="button" class="pill-preset" data-bytes="1048576">1 MB</button>
                <button type="button" class="pill-preset" data-bytes="2097152">2 MB</button>
              </div>
              <div class="custom-size-field">
                <input type="number" id="custom-size-input" min="5" max="50000" placeholder="Custom size" class="pro-number-input" />
                <select id="custom-size-unit" class="pro-select unit-select">
                  <option value="KB" selected>KB</option>
                  <option value="MB">MB</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Advanced Compression Options -->
        <div class="control-section advanced-section">
          <div class="advanced-header">
            <span class="control-section-label">Advanced Optimization</span>
          </div>
          <div class="advanced-options-grid">
            <label class="toggle-checkbox" for="strip-metadata-toggle" title="Removes EXIF location, camera data, and color profiles to reduce file size">
              <input type="checkbox" id="strip-metadata-toggle" checked />
              <span class="toggle-text">Strip EXIF / Privacy Metadata</span>
            </label>
            <label class="toggle-checkbox" for="high-quality-smoothing-toggle" title="Applies high-order bicubic filtering during downscale operations">
              <input type="checkbox" id="high-quality-smoothing-toggle" checked />
              <span class="toggle-text">Bicubic Resampling Interpolation</span>
            </label>
          </div>
        </div>
        <!-- 6. Safety Trade-off Alert Banner -->
        <div class="safety-tradeoff-alert hidden" id="safety-tradeoff-alert" style="margin-top: 12px; padding: 12px 14px; border-radius: 8px; font-size: 13px; line-height: 1.4;"></div>
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

  private subscribeToStore(): void {
    appStore.subscribe((state, prevState) => {
      if (state.sourceImage !== prevState.sourceImage || state.options.resize !== prevState.options.resize) {
        this.updateResolutionDelta();
        if (state.sourceImage && !prevState.sourceImage) {
          const wInput = this.element.querySelector<HTMLInputElement>('#dim-custom-w');
          const hInput = this.element.querySelector<HTMLInputElement>('#dim-custom-h');
          if (wInput && hInput) {
            wInput.value = String(state.sourceImage.dimensions.width);
            hInput.value = String(state.sourceImage.dimensions.height);
          }
        }
      }

      // Update safety trade-off alert banner
      const alertEl = this.element.querySelector<HTMLElement>('#safety-tradeoff-alert');
      if (alertEl) {
        const res = state.compressionResult;
        if (res && res.impossibleTarget && res.targetMessage) {
          alertEl.classList.remove('hidden');
          alertEl.style.display = 'block';
          alertEl.style.background = 'rgba(239, 68, 68, 0.15)';
          alertEl.style.border = '1px solid rgba(239, 68, 68, 0.35)';
          alertEl.style.color = '#fca5a5';
          alertEl.innerHTML = `<strong>⚠️ Quality Protection:</strong> ${res.targetMessage}`;
        } else if (res && res.downscaled && state.options.mode === 'targetSize') {
          alertEl.classList.remove('hidden');
          alertEl.style.display = 'block';
          alertEl.style.background = 'rgba(245, 158, 11, 0.12)';
          alertEl.style.border = '1px solid rgba(245, 158, 11, 0.3)';
          alertEl.style.color = '#fde68a';
          alertEl.innerHTML = `<strong>ℹ️ Dimension Trade-off:</strong> Target achieved by containing dimensions to ${res.dimensions.width}×${res.dimensions.height} px to protect visual identity.`;
        } else {
          alertEl.classList.add('hidden');
          alertEl.style.display = 'none';
          alertEl.textContent = '';
        }
      }
    });
  }

  private updateResolutionDelta(): void {
    const state = appStore.getState();
    const source = state.sourceImage;
    const deltaPill = this.element.querySelector<HTMLElement>('#resolution-delta-pill');
    if (!deltaPill) return;

    if (!source) {
      deltaPill.classList.add('hidden');
      return;
    }

    deltaPill.classList.remove('hidden');
    const targetDims = calculateTargetDimensions(
      source.dimensions,
      state.options.resize,
      8192
    );

    const origMp = ((source.dimensions.width * source.dimensions.height) / 1e6).toFixed(1);
    const targetMp = ((targetDims.width * targetDims.height) / 1e6).toFixed(1);
    const origPixels = source.dimensions.width * source.dimensions.height;
    const targetPixels = targetDims.width * targetDims.height;
    const pxReduction = Math.round(((origPixels - targetPixels) / origPixels) * 100);

    deltaPill.innerHTML = `
      <div class="res-delta-row">
        <span class="res-chip">${source.dimensions.width}×${source.dimensions.height} (${origMp}MP)</span>
        <span class="res-arrow">➔</span>
        <span class="res-chip res-chip-target">${targetDims.width}×${targetDims.height} (${targetMp}MP)</span>
        <span class="res-badge ${pxReduction > 0 ? 'badge-reduced' : ''}">
          ${pxReduction > 0 ? `-${pxReduction}% px` : '100%'}
        </span>
      </div>
    `;
  }

  private bindEvents(): void {
    // 1. Engine Mode Switcher
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
        } else if (mode === 'targetSize') {
          qualityBox?.classList.add('hidden');
          targetSizeBox?.classList.remove('hidden');
          const activePreset = this.element.querySelector<HTMLButtonElement>('.quick-size-pills .pill-preset.active');
          const bytes = activePreset ? parseInt(activePreset.getAttribute('data-bytes') || '102400', 10) : 102400;
          appStore.updateOptions({ mode: 'targetSize', targetBytes: bytes });
        } else if (mode === 'lossless') {
          qualityBox?.classList.add('hidden');
          targetSizeBox?.classList.add('hidden');
          appStore.updateOptions({ mode: 'lossless', targetBytes: undefined });
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

    // 3. Resolution & Scaling Mode Tabs
    const scaleTabs = this.element.querySelectorAll<HTMLButtonElement>('#scale-mode-selector .mini-tab-btn');
    const panelScale = this.element.querySelector<HTMLElement>('#panel-scale');
    const panelCustom = this.element.querySelector<HTMLElement>('#panel-custom');
    const panelPreset = this.element.querySelector<HTMLElement>('#panel-preset');
    const resHint = this.element.querySelector<HTMLElement>('#res-mode-hint');

    scaleTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        scaleTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const sm = tab.getAttribute('data-scale-mode') as 'original' | 'scale' | 'custom' | 'preset';

        panelScale?.classList.add('hidden');
        panelCustom?.classList.add('hidden');
        panelPreset?.classList.add('hidden');

        if (sm === 'original') {
          if (resHint) resHint.textContent = 'Original 100%';
          appStore.updateOptions({ resize: { mode: 'original', maintainAspectRatio: true } });
        } else if (sm === 'scale') {
          panelScale?.classList.remove('hidden');
          const slider = this.element.querySelector<HTMLInputElement>('#scale-slider');
          const scale = slider ? parseInt(slider.value, 10) : 75;
          if (resHint) resHint.textContent = `Scale ${scale}%`;
          appStore.updateOptions({
            resize: { mode: 'scale', scalePercent: scale, maintainAspectRatio: true },
          });
        } else if (sm === 'custom') {
          panelCustom?.classList.remove('hidden');
          if (resHint) resHint.textContent = 'Custom Bounds';
          this.applyCustomDims();
        } else if (sm === 'preset') {
          panelPreset?.classList.remove('hidden');
          const presetSelect = this.element.querySelector<HTMLSelectElement>('#preset-select');
          if (resHint && presetSelect && presetSelect.value) {
            resHint.textContent = presetSelect.value;
          } else if (resHint) {
            resHint.textContent = 'Preset Bounds';
          }
          this.applyPresetDims();
        }

        this.updateResolutionDelta();
        if (appStore.getState().autoProcess) {
          this.onTrigger();
        }
      });
    });

    // Scale % Slider and Pills
    const scaleSlider = this.element.querySelector<HTMLInputElement>('#scale-slider');
    const scaleBadge = this.element.querySelector<HTMLElement>('#scale-val-badge');
    const scalePills = this.element.querySelectorAll<HTMLButtonElement>('.scale-quick-pills .scale-pill');

    scaleSlider?.addEventListener('input', () => {
      const val = parseInt(scaleSlider.value, 10);
      if (scaleBadge) scaleBadge.textContent = `${val}%`;
      scalePills.forEach((p) => {
        p.classList.toggle('active', parseInt(p.getAttribute('data-scale') || '0', 10) === val);
      });
      if (resHint) resHint.textContent = `Scale ${val}%`;
      appStore.updateOptions({
        resize: { mode: 'scale', scalePercent: val, maintainAspectRatio: true },
      });
      this.updateResolutionDelta();
      if (appStore.getState().autoProcess) {
        this.onTrigger();
      }
    });

    scalePills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const val = parseInt(pill.getAttribute('data-scale') || '75', 10);
        scalePills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        if (scaleSlider) scaleSlider.value = String(val);
        if (scaleBadge) scaleBadge.textContent = `${val}%`;
        if (resHint) resHint.textContent = `Scale ${val}%`;
        appStore.updateOptions({
          resize: { mode: 'scale', scalePercent: val, maintainAspectRatio: true },
        });
        this.updateResolutionDelta();
        if (appStore.getState().autoProcess) {
          this.onTrigger();
        }
      });
    });

    // Aspect Ratio Lock Toggle
    const aspectBtn = this.element.querySelector<HTMLButtonElement>('#btn-aspect-lock');
    aspectBtn?.addEventListener('click', () => {
      this.aspectLocked = !this.aspectLocked;
      aspectBtn.classList.toggle('active', this.aspectLocked);
      aspectBtn.title = this.aspectLocked ? 'Aspect Ratio Locked' : 'Aspect Ratio Unlocked';
      this.applyCustomDims();
    });

    // Custom Width & Height Inputs
    const customW = this.element.querySelector<HTMLInputElement>('#dim-custom-w');
    const customH = this.element.querySelector<HTMLInputElement>('#dim-custom-h');

    customW?.addEventListener('input', () => {
      if (this.aspectLocked) {
        const source = appStore.getState().sourceImage;
        const w = parseInt(customW.value, 10);
        if (source && w > 0 && customH) {
          const ratio = source.dimensions.width / source.dimensions.height;
          customH.value = String(Math.round(w / ratio));
        }
      }
      this.applyCustomDims();
    });

    customH?.addEventListener('input', () => {
      if (this.aspectLocked) {
        const source = appStore.getState().sourceImage;
        const h = parseInt(customH.value, 10);
        if (source && h > 0 && customW) {
          const ratio = source.dimensions.width / source.dimensions.height;
          customW.value = String(Math.round(h * ratio));
        }
      }
      this.applyCustomDims();
    });

    // Preset Select Dropdown
    const presetSelect = this.element.querySelector<HTMLSelectElement>('#preset-select');
    presetSelect?.addEventListener('change', () => {
      if (resHint && presetSelect.value) {
        resHint.textContent = presetSelect.value;
      }
      this.applyPresetDims();
    });

    // 4. Quality Slider
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

    // 5. Target Size Quick Presets
    const presets = this.element.querySelectorAll<HTMLButtonElement>('.quick-size-pills .pill-preset');
    const customInput = this.element.querySelector<HTMLInputElement>('#custom-size-input');
    const customUnit = this.element.querySelector<HTMLSelectElement>('#custom-size-unit');

    presets.forEach((preset) => {
      preset.addEventListener('click', () => {
        presets.forEach((p) => p.classList.remove('active'));
        preset.classList.add('active');
        
        if (customInput) customInput.value = ''; // Clear custom input

        const bytes = parseInt(preset.getAttribute('data-bytes') || '102400', 10);
        appStore.updateOptions({ targetBytes: bytes });
        if (appStore.getState().autoProcess) {
          this.onTrigger();
        }
      });
    });

    // Custom Target Size Input
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

    customInput?.addEventListener('input', updateCustomSize);
    customUnit?.addEventListener('change', updateCustomSize);

    // 6. Auto Process Toggle & Manual Button
    const autoToggle = this.element.querySelector<HTMLInputElement>('#auto-process-toggle');
    const manualBtn = this.element.querySelector<HTMLButtonElement>('#manual-compress-btn');

    autoToggle?.addEventListener('change', () => {
      const checked = autoToggle.checked;
      appStore.setState({ autoProcess: checked });
      if (manualBtn) {
        manualBtn.style.display = checked ? 'none' : 'inline-flex';
      }
    });

    // Allow Upscale Toggle
    const allowUpscaleToggle = this.element.querySelector<HTMLInputElement>('#allow-upscale-toggle');
    allowUpscaleToggle?.addEventListener('change', () => {
      this.applyCustomDims();
    });
  }

  private applyCustomDims(): void {
    const customW = this.element.querySelector<HTMLInputElement>('#dim-custom-w');
    const customH = this.element.querySelector<HTMLInputElement>('#dim-custom-h');
    const allowUpscaleToggle = this.element.querySelector<HTMLInputElement>('#allow-upscale-toggle');
    const aspectIndicator = this.element.querySelector<HTMLElement>('#aspect-ratio-indicator');
    const w = parseInt(customW?.value || '0', 10);
    const h = parseInt(customH?.value || '0', 10);

    if (aspectIndicator && w > 0 && h > 0) {
      aspectIndicator.textContent = `Aspect Ratio: ${formatAspectRatio(w, h)}`;
    }

    if (w > 0 || h > 0) {
      appStore.updateOptions({
        resize: {
          mode: 'constraint',
          maxWidth: w > 0 ? w : undefined,
          maxHeight: h > 0 ? h : undefined,
          maintainAspectRatio: this.aspectLocked,
          allowUpscale: allowUpscaleToggle?.checked || false,
          preventUpscale: !allowUpscaleToggle?.checked,
        },
      });
      this.updateResolutionDelta();
      if (appStore.getState().autoProcess) {
        this.onTrigger();
      }
    }
  }

  private applyPresetDims(): void {
    const presetSelect = this.element.querySelector<HTMLSelectElement>('#preset-select');
    if (!presetSelect || !presetSelect.value) return;

    const [wStr, hStr] = presetSelect.value.split('x');
    const w = parseInt(wStr, 10);
    const h = parseInt(hStr, 10);

    if (w > 0 && h > 0) {
      appStore.updateOptions({
        resize: {
          mode: 'constraint',
          maxWidth: w,
          maxHeight: h,
          maintainAspectRatio: true,
        },
      });
      this.updateResolutionDelta();
      if (appStore.getState().autoProcess) {
        this.onTrigger();
      }
    }
  }
}
