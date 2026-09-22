import type { FormatSupportInfo, SupportedMimeType } from '../../types';

export class FormatProber {
  private static cachedSupport: FormatSupportInfo | null = null;

  public static async probeCapabilities(): Promise<FormatSupportInfo> {
    if (this.cachedSupport) {
      return this.cachedSupport;
    }

    const testCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!testCanvas) {
      return { jpeg: true, png: true, webp: true, avif: false };
    }

    testCanvas.width = 1;
    testCanvas.height = 1;

    // Fast synchronous dataURL check for baseline formats
    const webpSupported = testCanvas.toDataURL('image/webp').startsWith('data:image/webp');

    // Dynamic runtime probe for AVIF via 1x1 canvas blob export
    let avifSupported = false;
    try {
      const avifDataUrl = testCanvas.toDataURL('image/avif');
      if (avifDataUrl.startsWith('data:image/avif')) {
        avifSupported = true;
      }
    } catch {
      avifSupported = false;
    }

    // Zero out probe canvas immediately to assist GC
    testCanvas.width = 0;
    testCanvas.height = 0;

    this.cachedSupport = {
      jpeg: true,
      png: true,
      webp: webpSupported,
      avif: avifSupported,
    };

    return this.cachedSupport;
  }

  public static isFormatSupported(mime: SupportedMimeType, info: FormatSupportInfo): boolean {
    switch (mime) {
      case 'image/jpeg': return info.jpeg;
      case 'image/png': return info.png;
      case 'image/webp': return info.webp;
      case 'image/avif': return info.avif;
      default: return false;
    }
  }

  public static resetCache(): void {
    this.cachedSupport = null;
  }
}
