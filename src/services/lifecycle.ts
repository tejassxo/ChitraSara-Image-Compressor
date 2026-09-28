/**
 * Central deterministic memory and resource lifecycle manager.
 * Tracks and revokes Object URLs, Blobs, and ImageBitmaps across execution paths.
 */

export class MemoryLifecycle {
  private static activeUrls: Set<string> = new Set();
  private static activeBitmaps: Set<ImageBitmap> = new Set();

  public static trackUrl(url: string): string {
    if (url && url.startsWith('blob:')) {
      this.activeUrls.add(url);
    }
    return url;
  }

  public static revokeUrl(url: string | null | undefined): void {
    if (url && this.activeUrls.has(url)) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore revocation errors
      }
      this.activeUrls.delete(url);
    } else if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore
      }
    }
  }

  public static trackBitmap(bitmap: ImageBitmap): ImageBitmap {
    if (bitmap) {
      this.activeBitmaps.add(bitmap);
    }
    return bitmap;
  }

  public static disposeBitmap(bitmap: ImageBitmap | null | undefined): void {
    if (bitmap) {
      try {
        bitmap.close();
      } catch {
        // Ignore already closed error
      }
      this.activeBitmaps.delete(bitmap);
    }
  }

  public static revokeAll(): void {
    for (const url of this.activeUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore
      }
    }
    this.activeUrls.clear();

    for (const bitmap of this.activeBitmaps) {
      try {
        bitmap.close();
      } catch {
        // Ignore
      }
    }
    this.activeBitmaps.clear();
  }

  public static getActiveUrlCount(): number {
    return this.activeUrls.size;
  }

  public static getActiveBitmapCount(): number {
    return this.activeBitmaps.size;
  }
}
