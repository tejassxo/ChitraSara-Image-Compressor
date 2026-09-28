export class Dropzone {
  private element: HTMLElement;
  private fileInput: HTMLInputElement;
  private onFiles: (files: File[]) => void;

  constructor(onFiles: (files: File[]) => void) {
    this.onFiles = onFiles;
    this.element = document.createElement('div');
    this.element.className = 'dropzone-wrapper';
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = true;
    this.fileInput.accept = 'image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml,.jpg,.jpeg,.png,.webp,.avif';
    this.fileInput.className = 'visually-hidden';

    this.render();
    this.bindEvents();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public render(): void {
    this.element.innerHTML = `
      <div class="dropzone-card" id="dropzone" tabindex="0" role="button" aria-label="Drop images or browse">
        <div class="dropzone-icon">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        </div>
        <div class="dropzone-content">
          <div class="dropzone-headline">
            <span class="dropzone-primary-action">Select images</span> or drag &amp; drop here
          </div>
          <div class="dropzone-meta">
            <span>Supports JPEG, PNG, WebP, AVIF</span>
            <span class="divider-dot">•</span>
            <span>Batch &amp; Multi-thread processing</span>
            <span class="divider-dot dropzone-meta-desktop">•</span>
            <span class="dropzone-meta-desktop"><kbd>Ctrl</kbd>+<kbd>V</kbd> to paste</span>
          </div>
        </div>
      </div>
    `;
    this.element.appendChild(this.fileInput);
  }

  private bindEvents(): void {
    const card = this.element.querySelector<HTMLElement>('#dropzone')!;

    card.addEventListener('click', () => {
      this.fileInput.click();
    });

    card.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.fileInput.click();
      }
    });

    this.fileInput.addEventListener('change', () => {
      if (this.fileInput.files && this.fileInput.files.length > 0) {
        this.onFiles(Array.from(this.fileInput.files));
        this.fileInput.value = '';
      }
    });

    // Drag events on the card
    card.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('drag-over');
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        this.onFiles(Array.from(e.dataTransfer.files));
      }
    });

    // Global dragover prevention
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
  }

  public setVisible(visible: boolean): void {
    this.element.style.display = visible ? 'block' : 'none';
  }
}
