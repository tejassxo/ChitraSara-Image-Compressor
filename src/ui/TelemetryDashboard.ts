import { appStore } from '../../state/Store';
import type { CompressionResult, SourceImage } from '../../types';
import { $ } from '../../utils/dom';
import { formatBytes, formatDimensions, formatLatency, formatPercent } from '../../utils/formatters';

export class TelemetryDashboard {
  private originalSizeEl: HTMLElement;
  private compressedSizeEl: HTMLElement;
  private savingsBadgeEl: HTMLElement;
  private latencyEl: HTMLElement;
  private downloadBtn: HTMLButtonElement;
  private resetBtn: HTMLButtonElement;

  constructor() {
    this.originalSizeEl = $<HTMLElement>('#stat-original-size');
    this.compressedSizeEl = $<HTMLElement>('#stat-compressed-size');
    this.savingsBadgeEl = $<HTMLElement>('#stat-savings-badge');
    this.latencyEl = $<HTMLElement>('#stat-latency');
    this.downloadBtn = $<HTMLButtonElement>('#download-btn');
    this.resetBtn = $<HTMLButtonElement>('#reset-btn');

    this.bindEvents();
  }

  private bindEvents(): void {
    // 1. Download Action
    this.downloadBtn.addEventListener('click', () => {
      const { compressionResult } = appStore.getState();
      if (!compressionResult) return;

      const a = document.createElement('a');
      a.href = compressionResult.objectUrl;
      a.download = compressionResult.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    // 2. Reset Action
    this.resetBtn.addEventListener('click', () => {
      appStore.reset();
    });
  }

  public update(source: SourceImage | null, result: CompressionResult | null): void {
    if (!source) {
      this.originalSizeEl.textContent = '0 B';
      this.compressedSizeEl.textContent = '0 B';
      this.savingsBadgeEl.textContent = '-0%';
      this.latencyEl.textContent = '0ms';
      this.downloadBtn.disabled = true;
      return;
    }

    // Source stats
    const sourceFormattedSize = formatBytes(source.size);
    const sourceFormattedDims = formatDimensions(source.dimensions.width, source.dimensions.height);
    this.originalSizeEl.innerHTML = `${sourceFormattedSize} <span class="stat-dims">(${sourceFormattedDims})</span>`;

    if (result) {
      const compFormattedSize = formatBytes(result.outputSize);
      const compFormattedDims = formatDimensions(result.dimensions.width, result.dimensions.height);
      this.compressedSizeEl.innerHTML = `${compFormattedSize} <span class="stat-dims">(${compFormattedDims})</span>`;

      this.savingsBadgeEl.textContent = formatPercent(result.savingsPercent);
      this.savingsBadgeEl.classList.toggle('badge-negative', result.savingsPercent < 0);

      this.latencyEl.textContent = formatLatency(result.latencyMs);
      this.downloadBtn.disabled = false;
      this.downloadBtn.title = `Download ${result.filename} (${formatBytes(result.outputSize)})`;
    } else {
      this.compressedSizeEl.textContent = 'Compressing...';
      this.savingsBadgeEl.textContent = '...';
      this.latencyEl.textContent = '...';
      this.downloadBtn.disabled = true;
    }
  }
}
