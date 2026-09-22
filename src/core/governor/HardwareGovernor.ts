import { HARDWARE_THRESHOLDS } from '../../config/constants';
import type { HardwareCapabilities, HardwareProfile } from '../../types';

interface ExtendedNavigator extends Partial<Navigator> {
  deviceMemory?: number;
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
}

/**
 * Pure evaluation function enabling comprehensive mock testing
 */
export function evaluateHardwareProfile(
  nav: ExtendedNavigator = typeof navigator !== 'undefined' ? navigator : (typeof globalThis !== 'undefined' && 'navigator' in globalThis ? (globalThis as any).navigator : {}),
  win: any = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {})
): HardwareCapabilities {
  const deviceMemoryGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined;
  const hardwareConcurrency = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0
    ? nav.hardwareConcurrency
    : HARDWARE_THRESHOLDS.DEFAULT_FALLBACK_CORES;

  const hasOffscreenCanvas = typeof win.OffscreenCanvas !== 'undefined';
  const hasConvertToBlob = hasOffscreenCanvas && typeof win.OffscreenCanvas.prototype?.convertToBlob === 'function';
  const hasCreateImageBitmap = typeof win.createImageBitmap === 'function';
  const hasAsyncClipboard = !!(nav.clipboard && typeof nav.clipboard.write === 'function');
  const hasWebWorkers = typeof win.Worker !== 'undefined';
  const hasSaveData = !!(nav.connection && nav.connection.saveData === true);

  // Profile Determination Logic
  let profile: HardwareProfile = 'BALANCED';
  let maxCanvasDimension: number = HARDWARE_THRESHOLDS.MAX_CANVAS_DIM_BALANCED;

  const isLowMemory = deviceMemoryGB !== undefined && deviceMemoryGB <= HARDWARE_THRESHOLDS.LOW_RAM_GB;
  const isLowCores = hardwareConcurrency <= HARDWARE_THRESHOLDS.LOW_CORES;

  if (isLowMemory || isLowCores || hasSaveData) {
    profile = 'LOW';
    maxCanvasDimension = HARDWARE_THRESHOLDS.MAX_CANVAS_DIM_LOW;
  } else if (
    deviceMemoryGB !== undefined &&
    deviceMemoryGB > HARDWARE_THRESHOLDS.BALANCED_RAM_GB &&
    hardwareConcurrency > HARDWARE_THRESHOLDS.BALANCED_CORES
  ) {
    profile = 'HIGH';
    maxCanvasDimension = HARDWARE_THRESHOLDS.MAX_CANVAS_DIM_HIGH;
  } else {
    profile = 'BALANCED';
    maxCanvasDimension = HARDWARE_THRESHOLDS.MAX_CANVAS_DIM_BALANCED;
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
  };
}

export class HardwareGovernor {
  private static cachedCapabilities: HardwareCapabilities | null = null;

  public static getCapabilities(): HardwareCapabilities {
    if (!this.cachedCapabilities) {
      this.cachedCapabilities = evaluateHardwareProfile();
    }
    return this.cachedCapabilities;
  }

  public static applyProfileDOMHints(target: HTMLElement = document.documentElement): void {
    const caps = this.getCapabilities();
    target.setAttribute('data-hardware-profile', caps.profile);
    target.setAttribute('data-low-power', caps.profile === 'LOW' ? 'true' : 'false');
  }

  public static resetCache(): void {
    this.cachedCapabilities = null;
  }
}
