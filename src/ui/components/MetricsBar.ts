import { appStore } from '../../state/store';
import type { CompressionResult, SourceImage } from '../../types';
import { formatBytes, formatLatency, formatPercent } from '../../utils/formatters';

export class MetricsBar {
  private element: HTMLElement;
  private onReset: () => void;
  private onDownload: () => void;

  constructor(onReset: () => void, onDownload: () => void) {
    this.onReset = onReset;
    this.onDownload = onDownload;
    this.element = document.createElement('div');
    this.element.className = 'metrics-bar-card';
    this.render();
    this.bindEvents();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public render(): void {
    this.element.innerHTML = `
      <div class="metrics-grid">
        <div class="metric-block">
          <span class="metric-sub">Total Source</span>
          <span class="metric-val" id="metric-source-size">0 B</span>
        </div>

        <div class="metric-block">
          <span class="metric-sub">Compressed</span>
          <span class="metric-val" id="metric-output-size">0 B</span>
        </div>

        <div class="metric-block">
          <span class="metric-sub">Space Saved</span>
          <span class="metric-val text-success" id="metric-saved-size">-0%</span>
        </div>

        <div class="metric-block">
          <span class="metric-sub">Ratio</span>
          <span class="metric-val" id="metric-ratio">1.0:1</span>
        </div>

        <div class="metric-block">
          <span class="metric-sub">Latency</span>
          <span class="metric-val" id="metric-latency">0ms</span>
        </div>

        <div class="metric-block metric-block-solver hidden" id="metric-solver-block">
          <span class="metric-sub">Solver Iters</span>
          <span class="metric-val" id="metric-solver-iters">1</span>
        </div>
      </div>

      <div class="metrics-actions">
        <button type="button" class="pro-btn pro-btn-primary" id="btn-metric-download" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span id="btn-dl-text">Download Output</span>
        </button>

        <button type="button" class="pro-btn pro-btn-secondary" id="btn-metric-copy" disabled title="Copy compressed image to clipboard">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span id="btn-copy-text">Copy Image</span>
        </button>

        <button type="button" class="pro-btn pro-btn-secondary" id="btn-metric-reset" title="Reset all and clear queue">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
          <span>Clear</span>
        </button>
      </div>
    `;
  }

  private bindEvents(): void {
    const resetBtn = this.element.querySelector<HTMLButtonElement>('#btn-metric-reset');
    resetBtn?.addEventListener('click', () => {
      this.onReset();
    });

    const dlBtn = this.element.querySelector<HTMLButtonElement>('#btn-metric-download');
    dlBtn?.addEventListener('click', () => {
      this.onDownload();
    });

    const copyBtn = this.element.querySelector<HTMLButtonElement>('#btn-metric-copy');
    copyBtn?.addEventListener('click', async () => {
      const state = appStore.getState();
      const result = state.compressionResult;
      if (!result) return;

      const copySpan = this.element.querySelector<HTMLElement>('#btn-copy-text');
      try {
        if (navigator.clipboard && 'write' in navigator.clipboard) {
          let blobToCopy = result.blob;
          // Clipboard Item standard requires image/png in many browsers
          if (result.format !== 'image/png') {
            const img = new Image();
            img.src = result.objectUrl;
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error('Image decode failed'));
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0);
            const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
            if (pngBlob) blobToCopy = pngBlob;
          }

          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blobToCopy })
          ]);

          if (copySpan) copySpan.textContent = 'Copied to Clipboard!';
          copyBtn.classList.add('btn-copied');
          setTimeout(() => {
            if (copySpan) copySpan.textContent = 'Copy Image';
            copyBtn.classList.remove('btn-copied');
          }, 2000);
        }
      } catch (err) {
        console.warn('Clipboard write fallback triggered:', err);
        if (copySpan) copySpan.textContent = 'Copy Failed';
        setTimeout(() => {
          if (copySpan) copySpan.textContent = 'Copy Image';
        }, 2000);
      }
    });
  }

  public update(source: SourceImage | null, result: CompressionResult | null): void {
    const srcEl = this.element.querySelector<HTMLElement>('#metric-source-size');
    const outEl = this.element.querySelector<HTMLElement>('#metric-output-size');
    const savedEl = this.element.querySelector<HTMLElement>('#metric-saved-size');
    const ratioEl = this.element.querySelector<HTMLElement>('#metric-ratio');
    const latencyEl = this.element.querySelector<HTMLElement>('#metric-latency');
    const solverBlock = this.element.querySelector<HTMLElement>('#metric-solver-block');
    const solverIters = this.element.querySelector<HTMLElement>('#metric-solver-iters');
    const dlBtn = this.element.querySelector<HTMLButtonElement>('#btn-metric-download');
    const copyBtn = this.element.querySelector<HTMLButtonElement>('#btn-metric-copy');
    const dlText = this.element.querySelector<HTMLElement>('#btn-dl-text');

    const state = appStore.getState();
    const isBatch = state.batchItems.length > 1;

    if (isBatch) {
      const q = state.queueMetrics;
      if (srcEl) srcEl.textContent = formatBytes(q.totalOriginalBytes);
      if (outEl) outEl.textContent = formatBytes(q.totalCompressedBytes);
      const savedPct =
        q.totalOriginalBytes > 0
          ? ((q.totalOriginalBytes - q.totalCompressedBytes) / q.totalOriginalBytes) * 100
          : 0;
      if (savedEl) savedEl.textContent = formatPercent(savedPct);
      if (ratioEl) ratioEl.textContent = `${q.averageRatio.toFixed(1)}:1`;
      if (latencyEl) latencyEl.textContent = `${q.processedFiles} / ${q.totalFiles}`;
      if (solverBlock) solverBlock.classList.add('hidden');
      if (dlBtn) dlBtn.disabled = q.processedFiles === 0;
      if (copyBtn) copyBtn.disabled = true;
      if (dlText) dlText.textContent = `Download Batch (${q.processedFiles})`;
      return;
    }

    if (!source) {
      if (srcEl) srcEl.textContent = '0 B';
      if (outEl) outEl.textContent = '0 B';
      if (savedEl) savedEl.textContent = '-0%';
      if (ratioEl) ratioEl.textContent = '1.0:1';
      if (latencyEl) latencyEl.textContent = '0ms';
      if (solverBlock) solverBlock.classList.add('hidden');
      if (dlBtn) dlBtn.disabled = true;
      if (copyBtn) copyBtn.disabled = true;
      if (dlText) dlText.textContent = 'Download Output';
      return;
    }

    if (srcEl) srcEl.textContent = formatBytes(source.size);

    if (result) {
      if (outEl) outEl.textContent = formatBytes(result.outputSize);
      if (savedEl) savedEl.textContent = formatPercent(result.savingsPercent);
      if (ratioEl) ratioEl.textContent = `${result.compressionRatio.toFixed(1)}:1`;
      if (latencyEl) latencyEl.textContent = formatLatency(result.latencyMs);

      if (result.iterationsCount && result.iterationsCount > 1) {
        if (solverBlock) solverBlock.classList.remove('hidden');
        if (solverIters) {
          solverIters.textContent = `${result.iterationsCount} ${result.downscaled ? '(Scaled)' : ''}`;
        }
      } else {
        if (solverBlock) solverBlock.classList.add('hidden');
      }

      if (dlBtn) {
        dlBtn.disabled = false;
        dlBtn.title = `Download ${result.filename} (${formatBytes(result.outputSize)})`;
      }
      if (copyBtn) copyBtn.disabled = false;
      if (dlText) dlText.textContent = `Download (${formatBytes(result.outputSize)})`;
    } else {
      if (outEl) outEl.textContent = 'Calculating...';
      if (savedEl) savedEl.textContent = '...';
      if (ratioEl) ratioEl.textContent = '...';
      if (latencyEl) latencyEl.textContent = '...';
      if (dlBtn) dlBtn.disabled = true;
      if (copyBtn) copyBtn.disabled = true;
      if (dlText) dlText.textContent = 'Processing...';
    }
  }
}
