/**
 * Accessibility Helper: Dispatches live region announcements for screen readers
 */
export function announceA11y(message: string): void {
  try {
    const el = document.getElementById('a11y-announcer');
    if (el) {
      el.textContent = message;
    }
  } catch {
    // Non-critical helper, gracefully ignore if DOM is unavailable
  }
}
