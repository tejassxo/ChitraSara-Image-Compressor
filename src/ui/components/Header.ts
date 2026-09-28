import { HardwareGovernor } from '../../core/governor/HardwareGovernor';

export class Header {
  private element: HTMLElement;

  constructor() {
    this.element = document.createElement('header');
    this.element.className = 'app-header';
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public render(): void {
    const caps = HardwareGovernor.getCapabilities();
    const platform = caps.platform || 'Universal';
    const memStr = caps.memoryLabel || (caps.deviceMemoryGB ? `${caps.deviceMemoryGB} GB RAM` : 'Dynamic Memory');
    const threadStr = caps.threadsLabel || `${caps.hardwareConcurrency} Threads`;
    const workersStr = `${caps.workerCount} Workers`;
    const gpuStr = caps.gpuRenderer || 'GPU Accelerated';
    const cpuTooltip = caps.cpuTooltip || `Hardware Concurrency: ${caps.hardwareConcurrency} Threads`;
    const memTooltip = caps.memoryTooltip || `${memStr} (System Memory)`;

    this.element.innerHTML = `
      <div class="brand">
        <div class="brand-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
            <path d="M12 12v9" />
            <path d="m8 17 4 4 4-4" />
          </svg>
        </div>
        <div class="brand-text">
          <div class="brand-title-row">
            <h1 class="brand-title">ChitraSara</h1>
            <span class="brand-pill">STUDIO</span>
          </div>
          <span class="brand-sub">Image Optimization Studio</span>
        </div>
      </div>

      <div class="header-status">
        <div class="telemetry-pill" title="Platform detected">
          <span class="pill-dot"></span>
          <span class="pill-strong">${platform}</span>
        </div>

        <div class="telemetry-pill" title="${cpuTooltip}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
            <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" />
          </svg>
          <span>${threadStr}</span>
        </div>

        <div class="telemetry-pill" title="${memTooltip}">
          <span>${memStr}</span>
        </div>

        <div class="telemetry-pill" title="Web Worker Pool Concurrency">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <span class="pill-strong">${workersStr}</span>
        </div>

        <div class="telemetry-pill pill-gpu" title="Graphics Acceleration Engine">
          <span class="pill-dot pill-dot-green"></span>
          <span>${gpuStr}</span>
        </div>

        <div class="telemetry-pill pill-privacy" title="Your files never leave your computer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>100% Offline</span>
        </div>
      </div>
    `;
  }
}
