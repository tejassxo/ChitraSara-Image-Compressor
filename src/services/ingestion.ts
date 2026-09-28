import { SUPPORTED_MIME_TYPES, type SupportedMimeType } from '../config/constants';
import { MemoryLifecycle } from './lifecycle';
import type { ImageDimensions, SourceImage } from '../types';

export class IngestionService {
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

    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB limit
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum safety limit of 100 MB.`);
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
    MemoryLifecycle.trackUrl(tempUrl);

    try {
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        dimensions = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
      } else {
        dimensions = await this.readDimensionsViaImage(tempUrl);
      }
    } catch {
      MemoryLifecycle.revokeUrl(tempUrl);
      throw new Error('Failed to decode image data. The file may be corrupt or invalid.');
    }

    const MAX_DIM = 16384;
    const MAX_PIXELS = 64 * 1024 * 1024; // 64 MP
    if (dimensions.width > MAX_DIM || dimensions.height > MAX_DIM || dimensions.width * dimensions.height > MAX_PIXELS) {
      MemoryLifecycle.revokeUrl(tempUrl);
      throw new Error(
        `Image resolution (${dimensions.width}×${dimensions.height}) exceeds safety limit of 64 Megapixels or 16,384px per side.`
      );
    }

    const sourceImage: SourceImage = {
      file,
      originalUrl: tempUrl,
      dimensions,
      size: file.size,
      type: mime,
    };

    return sourceImage;
  }

  /**
   * Quick metadata extractor for batch items that doesn't hold memory
   */
  public static async extractDimensions(file: File): Promise<ImageDimensions> {
    const tempUrl = URL.createObjectURL(file);
    try {
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        const dims = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return dims;
      } else {
        return await this.readDimensionsViaImage(tempUrl);
      }
    } finally {
      URL.revokeObjectURL(tempUrl);
    }
  }

  /**
   * Generates a lightweight micro-thumbnail (max 80x80 or 160x160) for batch preview
   */
  public static async generateMicroThumbnail(
    file: File,
    maxDim: number = 80
  ): Promise<string> {
    let bitmap: ImageBitmap | null = null;
    let tempUrl: string | null = null;
    try {
      if (typeof createImageBitmap === 'function') {
        bitmap = await createImageBitmap(file);
        const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          canvas.width = 0;
          canvas.height = 0;
          return dataUrl;
        }
      }

      tempUrl = URL.createObjectURL(file);
      return tempUrl;
    } catch {
      return '';
    } finally {
      if (bitmap) {
        try {
          bitmap.close();
        } catch {
          // Ignore
        }
      }
    }
  }

  /**
   * Mounts drag-and-drop, file-picker, and paste listeners across window & elements
   */
  public static setupIngestionListeners(
    dropzoneEl: HTMLElement,
    fileInputEl: HTMLInputElement,
    onFilesIngested: (files: File[]) => void
  ): () => void {
    // 1. File Input Picker Handler
    const handleFileInput = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const fileList = target.files;
      if (fileList && fileList.length > 0) {
        onFilesIngested(Array.from(fileList));
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

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        onFilesIngested(Array.from(files));
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

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        onFilesIngested(pastedFiles);
      }
    };

    window.addEventListener('paste', handlePaste);

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
    MemoryLifecycle.revokeAll();
  }
}
