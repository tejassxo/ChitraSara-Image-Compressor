import { App } from './ui/App';
import { HardwareGovernor } from './core/governor/HardwareGovernor';
import { injectSpeedInsights } from '@vercel/speed-insights';

// Initialize Vercel Speed Insights
injectSpeedInsights();

// Application Bootstrap & Global Error Boundary
window.addEventListener('DOMContentLoaded', () => {
  try {
    HardwareGovernor.applyProfileDOMHints();
    const appContainer = document.querySelector<HTMLElement>('#app');
    if (appContainer) {
      new App(appContainer);
    }

    // Register PWA Service Worker for offline shell capability
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((swErr) => {
        console.warn('Service worker registration bypassed:', swErr);
      });
    }
  } catch (err: unknown) {
    console.error('Fatal initialization error:', err);
    const errorBanner = document.querySelector<HTMLElement>('#error-banner');
    if (errorBanner) {
      const msg = err instanceof Error ? err.message : String(err);
      errorBanner.textContent = `Initialization Error: ${msg}`;
      errorBanner.classList.remove('hidden');
    }
  }
});

// Window-level unhandled rejection guard
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled async rejection:', event.reason);
  const errorBanner = document.querySelector<HTMLElement>('#error-banner');
  if (errorBanner) {
    const reasonMsg = event.reason instanceof Error ? event.reason.message : String(event.reason || 'Unexpected failure');
    errorBanner.textContent = `Error: ${reasonMsg}`;
    errorBanner.classList.remove('hidden');
  }
});
