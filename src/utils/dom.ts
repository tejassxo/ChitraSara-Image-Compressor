/**
 * Safe DOM Helper Utilities
 */

export function $<T extends HTMLElement = HTMLElement>(
  selector: string,
  parent: ParentNode = document
): T {
  const el = parent.querySelector<T>(selector);
  if (!el) {
    throw new Error(`DOM Element not found for selector: "${selector}"`);
  }
  return el;
}

export function $$<T extends HTMLElement = HTMLElement>(
  selector: string,
  parent: ParentNode = document
): T[] {
  return Array.from(parent.querySelectorAll<T>(selector));
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

