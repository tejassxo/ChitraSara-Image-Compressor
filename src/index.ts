import { AppController } from './ui/AppController';
import { $ } from './utils/dom';

// Global Error Boundary & Initialization
window.addEventListener('DOMContentLoaded', () => {
  try {
    new AppController();
    console.log('⚡ OptiPulse Phase 1 Engine initialized successfully.');
  } catch (err: any) {
    console.error('Fatal initialization error:', err);
    const errorBanner = $('#error-banner');
    if (errorBanner) {
      errorBanner.textContent = `Initialization Error: ${err.message || err}`;
      errorBanner.classList.remove('hidden');
    }
  }
});

// Window-level unhandled rejection guard
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled async rejection:', event.reason);
  const errorBanner = $('#error-banner');
  if (errorBanner) {
    errorBanner.textContent = `Error: ${event.reason?.message || event.reason || 'Unexpected failure'}`;
    errorBanner.classList.remove('hidden');
  }
});
