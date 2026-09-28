import type { FormatSupportInfo, SupportedMimeType } from '../../types';

export interface FormatRecommendation {
  recommendedFormat: SupportedMimeType;
  reason: string;
  isLosslessAppropriate: boolean;
  supportedAlternatives: SupportedMimeType[];
}

export class SmartFormatSelector {
  /**
   * Evaluates source characteristics and browser capabilities to recommend optimal format.
   * Never forces conversion; provides rationale while respecting user overrides.
   */
  public static recommendFormat(params: {
    sourceMime: SupportedMimeType;
    hasAlpha: boolean;
    fileSizeBytes: number;
    width: number;
    height: number;
    formatSupport: FormatSupportInfo;
  }): FormatRecommendation {
    const { sourceMime, hasAlpha, width, height, formatSupport } = params;

    const alternatives: SupportedMimeType[] = [];
    if (formatSupport.webp) alternatives.push('image/webp');
    if (formatSupport.avif) alternatives.push('image/avif');
    if (formatSupport.jpeg && !hasAlpha) alternatives.push('image/jpeg');
    if (formatSupport.png) alternatives.push('image/png');

    // 1. Transparent Image Handling
    if (hasAlpha) {
      if (formatSupport.webp) {
        return {
          recommendedFormat: 'image/webp',
          reason: 'Preserves alpha transparency with up to 60% greater compression efficiency than PNG.',
          isLosslessAppropriate: false,
          supportedAlternatives: alternatives.filter((f) => f !== 'image/jpeg'),
        };
      }
      return {
        recommendedFormat: 'image/png',
        reason: 'Standard lossless container with full 8-bit alpha channel support.',
        isLosslessAppropriate: true,
        supportedAlternatives: alternatives.filter((f) => f !== 'image/jpeg'),
      };
    }

    // 2. High-Resolution Photographic Content (>1.5 MP or source was JPEG)
    const totalPixels = width * height;
    const isPhoto = totalPixels > 1_500_000 || sourceMime === 'image/jpeg';

    if (isPhoto) {
      if (formatSupport.avif && totalPixels < 8_000_000) {
        // AVIF on modest photos
        return {
          recommendedFormat: 'image/avif',
          reason: 'Next-gen AV1 compression delivering extreme file size savings at high perceptual fidelity.',
          isLosslessAppropriate: false,
          supportedAlternatives: alternatives,
        };
      }
      if (formatSupport.webp) {
        return {
          recommendedFormat: 'image/webp',
          reason: 'Modern web standard offering superior photographic compression with broad universal support.',
          isLosslessAppropriate: false,
          supportedAlternatives: alternatives,
        };
      }
      return {
        recommendedFormat: 'image/jpeg',
        reason: 'Universal photographic compatibility across all platforms and devices.',
        isLosslessAppropriate: false,
        supportedAlternatives: alternatives,
      };
    }

    // 3. Simple Graphics, Icons, or UI Screenshots (< 1.5 MP and source was PNG)
    if (sourceMime === 'image/png') {
      if (formatSupport.webp) {
        return {
          recommendedFormat: 'image/webp',
          reason: 'Sharp rendering of high-contrast UI graphics and text with smaller footprint than PNG.',
          isLosslessAppropriate: true,
          supportedAlternatives: alternatives,
        };
      }
      return {
        recommendedFormat: 'image/png',
        reason: 'Pixel-perfect lossless fidelity for screenshots and line art.',
        isLosslessAppropriate: true,
        supportedAlternatives: alternatives,
      };
    }

    // Default recommendation: WebP if supported, otherwise original format
    return {
      recommendedFormat: formatSupport.webp ? 'image/webp' : sourceMime,
      reason: 'Balanced compression efficiency and visual clarity.',
      isLosslessAppropriate: false,
      supportedAlternatives: alternatives,
    };
  }
}
