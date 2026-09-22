import type { SupportedMimeType } from '../config/constants';
import { FormatProber } from '../core/engine/FormatProber';
import { appStore } from '../state/Store';
import type { CompressionOptions, FormatSupportInfo } from '../types';
import { $, $$ } from '../utils/dom';

export class ControlPanel {
  private formatBtns: HTMLButtonElement[] = [];
  private qualitySlider: HTMLInputElement;
  private qualityVal: HTMLElement;
  private dimensionSelect: HTMLSelectElement;
  private autoProcessToggle: HTMLInputElement;
  private compressBtn: HTMLButtonElement;
  private onTriggerCompression: () => void;

  constructor(onTriggerCompression: () => void) {
    this.onTriggerCompression = onTriggerCompression;
    this.qualitySlider = $<HTMLInputElement>('#quality-slider');
    this.qualityVal = $<HTMLElement>('#quality-val');
    this.dimensionSelect = $<HTMLSelectElement>('#max-dimension-select');
    this.autoProcessToggle = $<HTMLInputElement>('#auto-process-toggle');
    this.compressBtn = $<HTMLButtonElement>('#manual-compress-btn');
    this.formatBtns = $$<HTMLButtonElement>('#format-selector .pill-btn');

    this.bindEvents();
    this.initFormatCapabilities();
  }

  private async initFormatCapabilities(): Promise<void> {
    const supportInfo: FormatSupportInfo = await FormatProber.probeCapabilities();
    const avifBtn = $<HTMLButtonElement>('#btn-avif');
    if (!supportInfo.avif) {
      avifBtn.disabled = true;
      avifBtn.classList.add('disabled');
      avifBtn.title = 'AVIF encoding not supported natively in this browser';
    }
  }

  private bindEvents(): void {
    // 1. Format Selection
    this.formatBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const format = btn.getAttribute('data-format') as SupportedMimeType | 'original';
        this.formatBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        // Dynamically disable quality slider for lossless PNG
        this.updateQualitySliderAvailability(format);

        appStore.updateOptions({ format });
        if (appStore.getState().autoProcess) {
          this.onTriggerCompression();
        }
      });
    });

    // 2. Quality Slider with Debounce
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    this.qualitySlider.addEventListener('input', () => {
      const qualityInt = parseInt(this.qualitySlider.value, 10);
      this.qualityVal.textContent = `${qualityInt}%`;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        appStore.updateOptions({ quality: qualityInt / 100 });
        if (appStore.getState().autoProcess) {
          this.onTriggerCompression();
        }
      }, 80);
    });

    // 3. Dimension Select
    this.dimensionSelect.addEventListener('change', () => {
      const val = this.dimensionSelect.value;
      if (val === 'original') {
        appStore.updateOptions({
          resize: { mode: 'original', maintainAspectRatio: true },
        });
      } else {
        const maxDim = parseInt(val, 10);
        appStore.updateOptions({
          resize: {
            mode: 'constraint',
            maxWidth: maxDim,
            maxHeight: maxDim,
            maintainAspectRatio: true,
          },
        });
      }

      if (appStore.getState().autoProcess) {
        this.onTriggerCompression();
      }
    });

    // 4. Auto Process Toggle
    this.autoProcessToggle.addEventListener('change', () => {
      const autoProcess = this.autoProcessToggle.checked;
      appStore.setState({ autoProcess });
      this.compressBtn.style.display = autoProcess ? 'none' : 'inline-flex';
    });

    // 5. Manual Compress Button
    this.compressBtn.addEventListener('click', () => {
      this.onTriggerCompression();
    });
  }

  private updateQualitySliderAvailability(format: SupportedMimeType | 'original'): void {
    const isPng = format === 'image/png';
    this.qualitySlider.disabled = isPng;
    if (isPng) {
      this.qualitySlider.title = 'PNG uses lossless compression (quality slider is disabled)';
      this.qualityVal.textContent = 'Lossless';
    } else {
      this.qualitySlider.title = '';
      this.qualityVal.textContent = `${this.qualitySlider.value}%`;
    }
  }

  public syncFromState(options: CompressionOptions, autoProcess: boolean): void {
    // Sync format buttons
    this.formatBtns.forEach((btn) => {
      const btnFormat = btn.getAttribute('data-format');
      btn.classList.toggle('active', btnFormat === options.format);
    });

    this.updateQualitySliderAvailability(options.format);
    this.autoProcessToggle.checked = autoProcess;
    this.compressBtn.style.display = autoProcess ? 'none' : 'inline-flex';
  }
}
