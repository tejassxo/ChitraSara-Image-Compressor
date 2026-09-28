import { HARDWARE_THRESHOLDS } from '../../config/constants';
import type { HardwareCapabilities, HardwareProfile } from '../../types';

interface ExtendedNavigator {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  clipboard?: unknown;
  userAgent?: string;
  userAgentData?: {
    platform?: string;
  };
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
}

interface WindowEnvironment {
  OffscreenCanvas?: {
    prototype?: {
      convertToBlob?: unknown;
    };
  };
  createImageBitmap?: unknown;
  Worker?: unknown;
  document?: Document;
  performance?: Performance & {
    memory?: {
      jsHeapSizeLimit?: number;
    };
  };
}

function detectPlatform(nav?: ExtendedNavigator): string {
  if (nav?.userAgentData?.platform) {
    return nav.userAgentData.platform;
  }
  const ua = nav?.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (/windows|win32|win64/i.test(ua)) return 'Windows';
  if (/macintosh|mac os x/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  return 'Desktop Client';
}

function detectGpuRenderer(win?: WindowEnvironment): string {
  try {
    const doc = win?.document ?? (typeof document !== 'undefined' ? document : null);
    if (!doc) return '2D Accelerated';
    const canvas = doc.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return '2D Accelerated';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const unmasked = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      if (typeof unmasked === 'string' && unmasked.length > 0) {
        // Strip verbose wrappers e.g. "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0...)"
        const clean = unmasked
          .replace(/ANGLE \([^,]+,\s*/i, '')
          .replace(/\s*Direct3D.*$/i, '')
          .replace(/\s*vs_\d+_\d+.*$/i, '')
          .replace(/\)$/, '')
          .trim();
        return clean.length > 28 ? clean.substring(0, 28) + '…' : clean;
      }
    }
    return 'GPU Accelerated';
  } catch {
    return 'GPU Accelerated';
  }
}

/**
 * Pure evaluation function enabling comprehensive mock testing
 */
export function evaluateHardwareProfile(
  nav?: ExtendedNavigator,
  win?: WindowEnvironment
): HardwareCapabilities {
  const safeNav: ExtendedNavigator =
    nav ??
    (typeof navigator !== 'undefined'
      ? (navigator as unknown as ExtendedNavigator)
      : typeof globalThis !== 'undefined' && 'navigator' in globalThis
      ? ((globalThis as unknown as { navigator: ExtendedNavigator }).navigator)
      : {});

  const safeWin: WindowEnvironment =
    win ??
    (typeof window !== 'undefined'
      ? (window as WindowEnvironment)
      : typeof globalThis !== 'undefined'
      ? (globalThis as WindowEnvironment)
      : {});

  const deviceMemoryGB = typeof safeNav.deviceMemory === 'number' ? safeNav.deviceMemory : undefined;
  const hardwareConcurrency = typeof safeNav.hardwareConcurrency === 'number' && safeNav.hardwareConcurrency > 0
    ? safeNav.hardwareConcurrency
    : HARDWARE_THRESHOLDS.DEFAULT_FALLBACK_CORES;

  const hasOffscreenCanvas = typeof safeWin.OffscreenCanvas !== 'undefined';
  const hasConvertToBlob = hasOffscreenCanvas && typeof safeWin.OffscreenCanvas?.prototype?.convertToBlob === 'function';
  const hasCreateImageBitmap = typeof safeWin.createImageBitmap === 'function';
  const navClipboard = safeNav.clipboard as { write?: unknown } | undefined;
  const hasAsyncClipboard = !!(navClipboard && typeof navClipboard.write === 'function');
  const hasWebWorkers = typeof safeWin.Worker !== 'undefined';
  const hasSaveData = !!(safeNav.connection && safeNav.connection.saveData === true);

  // Profile Determination Logic
  let profile: HardwareProfile = 'BALANCED';
  let maxCanvasDimension: number = HARDWARE_THRESHOLDS.MAX_CANVAS_DIM_BALANCED;
  let workerCount: number = Math.min(Math.max(1, hardwareConcurrency - 1), HARDWARE_THRESHOLDS.WORKER_LIMIT_BALANCED_MAX);
  let maxThumbnailDimension: number = HARDWARE_THRESHOLDS.THUMBNAIL_MAX_DIM_DEFAULT;

  const isLowMemory = deviceMemoryGB !== undefined && deviceMemoryGB <= HARDWARE_THRESHOLDS.LOW_RAM_GB;
  const isLowCores = hardwareConcurrency <= HARDWARE_THRESHOLDS.LOW_CORES;

  if (isLowMemory || isLowCores || hasSaveData) {
    profile = 'LOW';
    maxCanvasDimension = HARDWARE_THRESHOLDS.MAX_CANVAS_DIM_LOW;
    workerCount = HARDWARE_THRESHOLDS.WORKER_LIMIT_LOW;
    maxThumbnailDimension = HARDWARE_THRESHOLDS.THUMBNAIL_MAX_DIM_LOW;
  } else if (
    deviceMemoryGB !== undefined &&
    deviceMemoryGB > HARDWARE_THRESHOLDS.BALANCED_RAM_GB &&
    hardwareConcurrency > HARDWARE_THRESHOLDS.BALANCED_CORES
  ) {
    profile = 'HIGH';
    maxCanvasDimension = HARDWARE_THRESHOLDS.MAX_CANVAS_DIM_HIGH;
    workerCount = Math.min(Math.max(2, hardwareConcurrency - 1), HARDWARE_THRESHOLDS.WORKER_LIMIT_HIGH_MAX);
    maxThumbnailDimension = HARDWARE_THRESHOLDS.THUMBNAIL_MAX_DIM_DEFAULT;
  } else {
    profile = 'BALANCED';
    maxCanvasDimension = HARDWARE_THRESHOLDS.MAX_CANVAS_DIM_BALANCED;
    workerCount = Math.min(Math.max(1, hardwareConcurrency - 1), HARDWARE_THRESHOLDS.WORKER_LIMIT_BALANCED_MAX);
    maxThumbnailDimension = HARDWARE_THRESHOLDS.THUMBNAIL_MAX_DIM_DEFAULT;
  }

  // Real System Telemetry
  const platform = detectPlatform(safeNav);
  const gpuRenderer = detectGpuRenderer(safeWin);
  let memoryLabel = 'Dynamic Heap';
  if (deviceMemoryGB) {
    memoryLabel = deviceMemoryGB >= 8 ? '8+ GB RAM' : `${deviceMemoryGB} GB RAM`;
  } else if (safeWin.performance?.memory?.jsHeapSizeLimit) {
    const gb = (safeWin.performance.memory.jsHeapSizeLimit / (1024 * 1024 * 1024)).toFixed(1);
    memoryLabel = `Heap: ${gb} GB`;
  }

  return {
    deviceMemoryGB,
    hardwareConcurrency,
    hasOffscreenCanvas,
    hasConvertToBlob,
    hasCreateImageBitmap,
    hasAsyncClipboard,
    hasWebWorkers,
    hasSaveData,
    profile,
    maxCanvasDimension,
    workerCount,
    maxThumbnailDimension,
    platform,
    memoryLabel,
    gpuRenderer,
  };
}

export class HardwareGovernor {
  private static cachedCapabilities: Readonly<HardwareCapabilities> | null = null;

  public static getCapabilities(): Readonly<HardwareCapabilities> {
    if (!this.cachedCapabilities) {
      this.cachedCapabilities = Object.freeze(evaluateHardwareProfile());
    }
    return this.cachedCapabilities;
  }

  public static applyProfileDOMHints(target: HTMLElement = document.documentElement): void {
    const caps = this.getCapabilities();
    target.setAttribute('data-hardware-profile', caps.profile);
    target.setAttribute('data-low-power', caps.profile === 'LOW' ? 'true' : 'false');
    if (caps.platform) target.setAttribute('data-platform', caps.platform.toLowerCase());
  }

  public static resetCache(): void {
    this.cachedCapabilities = null;
  }
}

// Immutable profile export at application boot
export const INITIAL_HARDWARE_PROFILE = HardwareGovernor.getCapabilities();
