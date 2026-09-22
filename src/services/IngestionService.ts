import { SUPPORTED_MIME_TYPES, type SupportedMimeType } from '../config/constants';
import { appStore } from '../state/Store';
import type { ImageDimensions, SourceImage } from '../types';

export class IngestionService {
  private static activeObjectUrls: Set<string> = new Set();

  /**
   * Validates and loads a raw File into a SourceImage instance
   */
  public static async ingestFile(file: File): Promise<SourceImage> {
    if (!file) {
      throw new Error('No file provided for ingestion');
    }

    if (file.size === 0) {
      throw new Error('Selected file is empty (0 bytes)');
    }

    const mime = file.type as SupportedMimeType;
    if (!SUPPORTED_MIME_TYPES.includes(mime)) {
      throw new Error(
        `Unsupported format: "${file.type || 'unknown'}". Supported formats: JPG, PNG, WebP, AVIF.`
      );
    }

    // Inspect natural image dimensions
    let dimensions: ImageDimensions;
    const tempUrl = URL.createObjectURL(file);
    this.activeObjectUrls.add(tempUrl);

    try {
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        dimensions = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
      } else {
        dimensions = await this.readDimensionsViaImage(tempUrl);
      }
    } catch {
      URL.revokeObjectURL(tempUrl);
      this.activeObjectUrls.delete(tempUrl);
      throw new Error('Failed to decode image data. The file may be corrupt or invalid.');
    }

    const sourceImage: SourceImage = {
      file,
      originalUrl: tempUrl,
      dimensions,
      size: file.size,
      type: mime,
    };

    appStore.setState({
      sourceImage,
      error: null,
      compressionResult: null,
    });

    return sourceImage;
  }

  /**
   * Mounts drag-and-drop, file-picker, and paste listeners across the window & elements
   */
  public static setupIngestionListeners(
    dropzoneEl: HTMLElement,
    fileInputEl: HTMLInputElement
  ): () => void {
    // 1. File Input Picker Handler
    const handleFileInput = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        this.ingestFile(file).catch((err) => {
          appStore.setState({ error: err.message || 'File ingestion failed' });
        });
      }
      target.value = '';
    };

    fileInputEl.addEventListener('change', handleFileInput);

    // 2. Dropzone Click Trigger
    const handleDropzoneClick = () => {
      fileInputEl.click();
    };
    dropzoneEl.addEventListener('click', handleDropzoneClick);

    // Dropzone Keyboard Trigger (Enter or Space)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInputEl.click();
      }
    };
    dropzoneEl.addEventListener('keydown', handleKeyDown);

    // 3. Drag and Drop Handlers
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneEl.classList.add('drag-over');
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneEl.classList.remove('drag-over');
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneEl.classList.remove('drag-over');

      const file = e.dataTransfer?.files?.[0];
      if (file) {
        this.ingestFile(file).catch((err) => {
          appStore.setState({ error: err.message || 'File ingestion failed' });
        });
      }
    };

    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    dropzoneEl.addEventListener('dragover', handleDragOver);
    dropzoneEl.addEventListener('dragleave', handleDragLeave);
    dropzoneEl.addEventListener('drop', handleDrop);

    // 4. Global Clipboard Paste Listener
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            this.ingestFile(file).catch((err) => {
              appStore.setState({ error: err.message || 'Clipboard ingestion failed' });
            });
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);

    // Return cleanup callback
    return () => {
      fileInputEl.removeEventListener('change', handleFileInput);
      dropzoneEl.removeEventListener('click', handleDropzoneClick);
      dropzoneEl.removeEventListener('keydown', handleKeyDown);
      dropzoneEl.removeEventListener('dragover', handleDragOver);
      dropzoneEl.removeEventListener('dragleave', handleDragLeave);
      dropzoneEl.removeEventListener('drop', handleDrop);
      window.removeEventListener('paste', handlePaste);
    };
  }

  private static readDimensionsViaImage(url: string): Promise<ImageDimensions> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        reject(new Error('Failed to load image element'));
      };
      img.src = url;
    });
  }

  public static revokeAllUrls(): void {
    for (const url of this.activeObjectUrls) {
      URL.revokeObjectURL(url);
    }
    this.activeObjectUrls.clear();
  }
}
