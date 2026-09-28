import type { BatchItem } from '../../types';
import { formatBytes, formatPercent } from '../../utils/formatters';
import { BatchActions } from '../../state/actions';
import { escapeHtml } from '../../utils/dom';

export class BatchItemRow {
  private element: HTMLElement;
  private item: BatchItem;
  private onSelect?: (item: BatchItem) => void;

  constructor(item: BatchItem, onSelect?: (item: BatchItem) => void) {
    this.item = item;
    this.onSelect = onSelect;
    this.element = document.createElement('div');
    this.element.className = 'batch-row';
    this.element.setAttribute('data-id', item.id);
    this.render();
    this.bindEvents();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public update(item: BatchItem): void {
    this.item = item;
    this.render();
    this.bindEvents();
  }

  public render(): void {
    const { item } = this;
    const isCompleted = item.status === 'COMPLETED' && item.result;
    const isFailed = item.status === 'FAILED';
    const isProcessing = item.status === 'PROCESSING' || item.status === 'SOLVING';

    const origSize = formatBytes(item.originalSize);
    const compSize = isCompleted ? formatBytes(item.result!.outputSize) : '—';
    const savings = isCompleted ? formatPercent(item.result!.savingsPercent) : '';

    const thumbSrc = item.thumbnailUrl || '';

    const safeName = escapeHtml(item.name);
    this.element.innerHTML = `
      <div class="batch-cell thumb-cell">
        <div class="row-thumbnail">
          ${
            thumbSrc
              ? `<img src="${thumbSrc}" alt="${safeName}" />`
              : `<div class="thumb-placeholder">IMG</div>`
          }
        </div>
      </div>

      <div class="batch-cell info-cell">
        <div class="row-name" title="${safeName}">${safeName}</div>
        <div class="row-sizes">
          <span>${origSize}</span>
          ${isCompleted ? `<span class="size-arrow">→</span><span class="comp-size">${compSize}</span>` : ''}
          ${isCompleted && savings ? `<span class="badge badge-savings">${savings}</span>` : ''}
          ${item.durationMs > 0 ? `<span class="row-duration">${Math.round(item.durationMs)}ms</span>` : ''}
        </div>
        ${
          isProcessing
            ? `<div class="row-progress-bar"><div class="progress-fill" style="width: ${item.progress}%;"></div></div>`
            : ''
        }
      </div>

      <div class="batch-cell status-cell">
        <span class="status-pill status-${item.status.toLowerCase()}">${item.status}</span>
      </div>

      <div class="batch-cell actions-cell">
        ${
          isCompleted
            ? `
          <button type="button" class="icon-btn btn-download" title="Download minified image">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        `
            : ''
        }
        ${
          isFailed
            ? `
          <button type="button" class="icon-btn btn-retry" title="Retry task">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        `
            : ''
        }
        ${
          isProcessing || item.status === 'QUEUED' || item.status === 'PENDING'
            ? `
          <button type="button" class="icon-btn btn-cancel" title="Cancel item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        `
            : ''
        }
      </div>
    `;
  }

  private bindEvents(): void {
    this.element.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.actions-cell')) return;
      this.onSelect?.(this.item);
    });

    const dlBtn = this.element.querySelector<HTMLButtonElement>('.btn-download');
    dlBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      BatchActions.downloadItem(this.item.id);
    });

    const retryBtn = this.element.querySelector<HTMLButtonElement>('.btn-retry');
    retryBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      BatchActions.pumpQueue();
    });

    const cancelBtn = this.element.querySelector<HTMLButtonElement>('.btn-cancel');
    cancelBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      BatchActions.cancelItem(this.item.id);
    });
  }
}
