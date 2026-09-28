import { HardwareGovernor } from '../core/governor/HardwareGovernor';

export interface DeltaHeatmapOptions {
  gain?: number; // Amplification factor: 1x, 2x, 5x, 10x (default: 3x)
  maxAnalysisDimension?: number;
}

export interface DeltaHeatmapResult {
  heatmapDataUrl: string;
  width: number;
  height: number;
  maxDifference: number;
  averageDifference: number;
  gainUsed: number;
  disclaimer: string;
}

export class DeltaHeatmapService {
  /**
   * Generates a Chroma Delta Heatmap visualizing numerical pixel differences.
   *
   * Invariants:
   * - Aligns original and compressed sources onto matching comparison coordinates.
   * - Never modifies or mutates source images.
   * - Uses downscaled analysis resolution to prevent memory exhaustion on low-end devices.
   * - Strictly zeroes and reclaims all intermediate canvases.
   */
  public static async generateHeatmap(
    originalSource: CanvasImageSource,
    compressedSource: CanvasImageSource,
    options: DeltaHeatmapOptions = {}
  ): Promise<DeltaHeatmapResult> {
    const caps = HardwareGovernor.getCapabilities();
    const gain = Math.max(1, Math.min(20, options.gain ?? 3));

    // Limit resolution to protect memory on low-end hardware
    const maxDimLimit = caps.profile === 'LOW' ? 512 : 1024;
    const maxDim = options.maxAnalysisDimension
      ? Math.min(options.maxAnalysisDimension, maxDimLimit)
      : maxDimLimit;

    // Determine reference dimensions from original source
    let origW = 800;
    let origH = 600;
    if ('naturalWidth' in originalSource && typeof (originalSource as HTMLImageElement).naturalWidth === 'number') {
      origW = (originalSource as HTMLImageElement).naturalWidth;
      origH = (originalSource as HTMLImageElement).naturalHeight;
    } else if ('width' in originalSource && typeof (originalSource as { width: number }).width === 'number') {
      origW = (originalSource as { width: number }).width;
      origH = (originalSource as { height: number }).height;
    }

    const scale = Math.min(1, maxDim / Math.max(origW, origH));
    const analysisW = Math.max(16, Math.round(origW * scale));
    const analysisH = Math.max(16, Math.round(origH * scale));

    const intermediateCanvases: (HTMLCanvasElement | OffscreenCanvas)[] = [];

    try {
      // 1. Render both to aligned canvases
      const origCanvas = this.createCanvas(analysisW, analysisH);
      const compCanvas = this.createCanvas(analysisW, analysisH);
      intermediateCanvases.push(origCanvas, compCanvas);

      const ctxOrig = this.getContext(origCanvas);
      const ctxComp = this.getContext(compCanvas);

      if (!ctxOrig || !ctxComp) {
        throw new Error('Failed to acquire canvas contexts for delta analysis');
      }

      ctxOrig.imageSmoothingEnabled = true;
      ctxOrig.imageSmoothingQuality = 'high';
      ctxOrig.drawImage(originalSource, 0, 0, analysisW, analysisH);

      ctxComp.imageSmoothingEnabled = true;
      ctxComp.imageSmoothingQuality = 'high';
      ctxComp.drawImage(compressedSource, 0, 0, analysisW, analysisH);

      const origImageData = ctxOrig.getImageData(0, 0, analysisW, analysisH);
      const compImageData = ctxComp.getImageData(0, 0, analysisW, analysisH);

      const p1 = origImageData.data;
      const p2 = compImageData.data;

      // 2. Compute Heatmap Pixels
      const heatmapCanvas = document.createElement('canvas');
      heatmapCanvas.width = analysisW;
      heatmapCanvas.height = analysisH;
      const ctxHeat = heatmapCanvas.getContext('2d');
      intermediateCanvases.push(heatmapCanvas);

      if (!ctxHeat) {
        throw new Error('Failed to create heatmap destination context');
      }

      const heatImageData = ctxHeat.createImageData(analysisW, analysisH);
      const hp = heatImageData.data;

      let sumDiff = 0;
      let maxDiff = 0;
      const totalPixels = analysisW * analysisH;

      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const dr = Math.abs(p1[idx] - p2[idx]);
        const dg = Math.abs(p1[idx + 1] - p2[idx + 1]);
        const db = Math.abs(p1[idx + 2] - p2[idx + 2]);

        const avgPixelDiff = (dr + dg + db) / 3;
        sumDiff += avgPixelDiff;
        if (avgPixelDiff > maxDiff) maxDiff = avgPixelDiff;

        // Apply gain amplification
        const val = Math.min(255, Math.round(avgPixelDiff * gain));

        // Heat colormap (Dark Navy -> Cyan -> Green -> Yellow -> Red)
        const [r, g, b] = this.colormap(val);
        hp[idx] = r;
        hp[idx + 1] = g;
        hp[idx + 2] = b;
        hp[idx + 3] = 255;
      }

      ctxHeat.putImageData(heatImageData, 0, 0);
      const heatmapDataUrl = heatmapCanvas.toDataURL('image/png');

      const averageDifference = Math.round((sumDiff / totalPixels) * 100) / 100;

      return {
        heatmapDataUrl,
        width: analysisW,
        height: analysisH,
        maxDifference: Math.round(maxDiff * 100) / 100,
        averageDifference,
        gainUsed: gain,
        disclaimer: `Numerical pixel delta (amplified by ${gain}×). Visualizes mathematical variance, not necessarily humanly noticeable defects.`,
      };
    } finally {
      // Deterministically zero all canvas dimensions
      for (const c of intermediateCanvases) {
        c.width = 0;
        c.height = 0;
      }
    }
  }

  private static createCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(w, h);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }

  private static getContext(
    canvas: HTMLCanvasElement | OffscreenCanvas
  ): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
    return canvas.getContext('2d', { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
  }

  /**
   * Perceptually smooth heatmap colormap (Navy -> Cyan -> Yellow -> Red)
   */
  private static colormap(value: number): [number, number, number] {
    if (value === 0) return [10, 15, 30]; // Dark blue background for identical pixels

    const t = value / 255;
    if (t < 0.25) {
      // Dark blue to Cyan
      const factor = t / 0.25;
      return [10, Math.round(15 + factor * 185), Math.round(30 + factor * 225)];
    } else if (t < 0.5) {
      // Cyan to Green
      const factor = (t - 0.25) / 0.25;
      return [0, 200, Math.round(255 - factor * 255)];
    } else if (t < 0.75) {
      // Green to Yellow
      const factor = (t - 0.5) / 0.25;
      return [Math.round(factor * 255), 230, 0];
    } else {
      // Yellow to Vivid Red
      const factor = (t - 0.75) / 0.25;
      return [255, Math.round(230 * (1 - factor)), 0];
    }
  }
}
