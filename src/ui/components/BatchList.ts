import type { BatchItem } from '../../types';
import { appStore } from '../../state/store';
import { BatchActions } from '../../state/actions';
import { BatchItemRow } from './BatchItemRow';

export class BatchList {
  private element: HTMLElement;
  private rowsMap: Map<string, BatchItemRow> = new Map();
  private onSelectItem?: (item: BatchItem) => void;

  constructor(onSelectItem?: (item: BatchItem) => void) {
    this.onSelectItem = onSelectItem;
    this.element = document.createElement('div');
    this.element.className = 'batch-list-card';
    this.render();
    this.bindEvents();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public render(): void {
    const state = appStore.getState();
    const metrics = state.queueMetrics;
    const isPaused = metrics.isPaused;

    this.element.innerHTML = `
      <div class="batch-header">
        <div class="batch-title-group">
          <span class="batch-title">Batch Queue</span>
          <span class="batch-count-badge" id="batch-count">${state.batchItems.length} files</span>
        </div>

        <div class="batch-controls-group">
          <button type="button" class="pro-btn pro-btn-sm" id="btn-pause-resume" title="${isPaused ? 'Resume processing' : 'Pause queue'}">
            ${isPaused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" class="pro-btn pro-btn-sm" id="btn-retry-failed" title="Retry all failed tasks">
            Retry Failed
          </button>
          <button type="button" class="pro-btn pro-btn-sm" id="btn-cancel-all" title="Cancel all pending/processing">
            Cancel All
          </button>
          <button type="button" class="pro-btn pro-btn-sm pro-btn-primary" id="btn-download-all" title="Download all compressed images sequentially">
            Download All
          </button>
        </div>
      </div>

      <div class="batch-table-container">
        <div class="batch-table-header">
          <div class="batch-cell thumb-cell">Thumb</div>
          <div class="batch-cell info-cell">Filename &amp; Sizes</div>
          <div class="batch-cell status-cell">Status</div>
          <div class="batch-cell actions-cell">Actions</div>
        </div>
        <div class="batch-rows-container" id="batch-rows"></div>
      </div>
    `;

    this.renderRows(state.batchItems);
  }

  private renderRows(items: BatchItem[]): void {
    const container = this.element.querySelector<HTMLElement>('#batch-rows');
    if (!container) return;

    // Check if items changed
    const currentIds = new Set(items.map((i) => i.id));

    // Remove rows that are no longer in items
    for (const [id, row] of this.rowsMap.entries()) {
      if (!currentIds.has(id)) {
        row.getElement().remove();
        this.rowsMap.delete(id);
      }
    }

    // Add or update rows
    for (const item of items) {
      if (this.rowsMap.has(item.id)) {
        this.rowsMap.get(item.id)!.update(item);
      } else {
        const row = new BatchItemRow(item, this.onSelectItem);
        this.rowsMap.set(item.id, row);
        container.appendChild(row.getElement());
      }
    }
  }

  public update(items: BatchItem[]): void {
    const countBadge = this.element.querySelector<HTMLElement>('#batch-count');
    if (countBadge) {
      countBadge.textContent = `${items.length} ${items.length === 1 ? 'file' : 'files'}`;
    }

    const isPaused = appStore.getState().queueMetrics.isPaused;
    const pauseBtn = this.element.querySelector<HTMLButtonElement>('#btn-pause-resume');
    if (pauseBtn) {
      pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    }

    this.renderRows(items);
  }

  private bindEvents(): void {
    const pauseBtn = this.element.querySelector<HTMLButtonElement>('#btn-pause-resume');
    pauseBtn?.addEventListener('click', () => {
      const isPaused = appStore.getState().queueMetrics.isPaused;
      if (isPaused) {
        BatchActions.resumeQueue();
      } else {
        BatchActions.pauseQueue();
      }
    });

    const retryBtn = this.element.querySelector<HTMLButtonElement>('#btn-retry-failed');
    retryBtn?.addEventListener('click', () => {
      BatchActions.retryFailed();
    });

    const cancelBtn = this.element.querySelector<HTMLButtonElement>('#btn-cancel-all');
    cancelBtn?.addEventListener('click', () => {
      BatchActions.cancelAll();
    });

    const dlAllBtn = this.element.querySelector<HTMLButtonElement>('#btn-download-all');
    dlAllBtn?.addEventListener('click', () => {
      BatchActions.downloadAllSequenced();
    });
  }

  public setVisible(visible: boolean): void {
    this.element.style.display = visible ? 'flex' : 'none';
  }
}
