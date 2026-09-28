/**
 * ChitraSaraFooter Component
 * ==========================
 * Clean, engineering-oriented, responsive global footer.
 * Features semantic landmarks, zero-bloat tactile interactions,
 * and a restrained, physics-smoothed interactive Trident (🔱) badge.
 */

export interface FooterConfig {
  brandName: string;
  brandSubtitle: string;
  githubUrl: string;
  portfolioUrl: string;
  creatorName: string;
}

export const CHITRASARA_FOOTER_CONFIG: FooterConfig = {
  brandName: 'ChitraSara',
  brandSubtitle: 'Image Optimization Studio',
  githubUrl: 'https://github.com/tejassxo',
  portfolioUrl: 'https://github.com/tejassxo',
  creatorName: 'Tejas',
};

export class ChitraSaraFooter {
  private element: HTMLElement;
  private tridentEl: HTMLElement | null = null;
  private signatureEl: HTMLElement | null = null;
  private config: FooterConfig;

  // Interaction State
  private isHovered = false;
  private rafId: number | null = null;
  private currentTilt = 0;
  private currentY = 0;
  private currentScale = 1;
  private targetTilt = 0;
  private targetY = 0;
  private targetScale = 1;

  // Bound Handlers for Clean Teardown
  private boundPointerEnter: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerLeave: (e: PointerEvent) => void;
  private boundClick: (e: MouseEvent) => void;

  constructor(config: FooterConfig = CHITRASARA_FOOTER_CONFIG) {
    this.config = config;
    this.element = document.createElement('footer');
    this.element.className = 'app-footer chitrasara-footer';
    this.element.setAttribute('role', 'contentinfo');

    this.boundPointerEnter = this.handlePointerEnter.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerLeave = this.handlePointerLeave.bind(this);
    this.boundClick = this.handleClick.bind(this);

    this.render();
    this.initTridentInteraction();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public render(): void {
    this.element.innerHTML = `
      <div class="footer-container">
        <!-- Brand & Identity Landmark -->
        <div class="footer-col-brand">
          <div class="footer-brand-title-row">
            <span class="footer-brand-name">${this.config.brandName}</span>
            <span class="footer-dot-sep" aria-hidden="true">&bull;</span>
            <span class="footer-brand-sub">${this.config.brandSubtitle}</span>
          </div>
          <p class="footer-subtext">
            Zero Frameworks &bull; Thread-Isolated Web Workers &bull; 100% Client-Side Privacy
          </p>
        </div>

        <!-- Navigation Links Landmark -->
        <nav class="footer-col-nav" aria-label="Developer Resources">
          <a href="${this.config.githubUrl}" target="_blank" rel="noopener noreferrer" class="footer-link" aria-label="GitHub Profile (opens in new tab)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
            <span>GitHub</span>
          </a>

          <span class="footer-dot-sep" aria-hidden="true">&bull;</span>

          <a href="${this.config.portfolioUrl}" target="_blank" rel="noopener noreferrer" class="footer-link" aria-label="Creator Portfolio (opens in new tab)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>Portfolio</span>
          </a>
        </nav>

        <!-- Creator Signature with Interactive 🔱 -->
        <div class="footer-col-signature">
          <div class="footer-signature-pill" id="footer-signature-badge">
            <span class="signature-text">Made with passion by <strong>${this.config.creatorName}</strong></span>
            <span class="signature-trident" id="footer-trident-icon" aria-hidden="true">🔱</span>
          </div>
        </div>
      </div>
    `;

    this.tridentEl = this.element.querySelector<HTMLElement>('#footer-trident-icon');
    this.signatureEl = this.element.querySelector<HTMLElement>('#footer-signature-badge');
  }

  /**
   * Initializes the subtle, non-flashy 🔱 micro-interaction.
   * Uses lerped requestAnimationFrame physics with automatic prefers-reduced-motion bypass.
   */
  private initTridentInteraction(): void {
    if (!this.signatureEl || !this.tridentEl) return;

    // Check prefers-reduced-motion
    if (this.prefersReducedMotion()) {
      return; // Respect accessibility: disable motion loops
    }

    this.signatureEl.addEventListener('pointerenter', this.boundPointerEnter);
    this.signatureEl.addEventListener('pointermove', this.boundPointerMove);
    this.signatureEl.addEventListener('pointerleave', this.boundPointerLeave);
    this.signatureEl.addEventListener('click', this.boundClick);
  }

  private prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private handlePointerEnter(): void {
    if (this.prefersReducedMotion()) return;
    this.isHovered = true;
    this.targetScale = 1.14;
    this.targetY = -2;
    this.targetTilt = -3;
    this.startAnimationLoop();
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.prefersReducedMotion() || !this.signatureEl) return;

    const rect = this.signatureEl.getBoundingClientRect();
    const relX = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const relY = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);

    // Subtle parallax tilt: max 5 deg rotation, 2.5px vertical lift
    this.targetTilt = relX * 6;
    this.targetY = -2 + relY * 1.5;
  }

  private handlePointerLeave(): void {
    if (this.prefersReducedMotion()) return;
    this.isHovered = false;
    this.targetScale = 1;
    this.targetY = 0;
    this.targetTilt = 0;
  }

  private handleClick(): void {
    if (this.prefersReducedMotion() || !this.tridentEl) return;

    // Tactile micro-rotation click pulse
    this.targetTilt = 12;
    this.targetScale = 1.25;

    window.setTimeout(() => {
      if (this.isHovered) {
        this.targetTilt = -3;
        this.targetScale = 1.14;
      } else {
        this.targetTilt = 0;
        this.targetScale = 1;
      }
    }, 180);
  }

  /**
   * Physics Lerp Loop:
   * Smoothly dampens values to resting state without sudden snaps.
   */
  private startAnimationLoop(): void {
    if (this.rafId !== null) return;

    const update = () => {
      // Lerp factor
      const alpha = 0.18;
      this.currentTilt += (this.targetTilt - this.currentTilt) * alpha;
      this.currentY += (this.targetY - this.currentY) * alpha;
      this.currentScale += (this.targetScale - this.currentScale) * alpha;

      if (this.tridentEl) {
        this.tridentEl.style.transform = `translate3d(0, ${this.currentY.toFixed(2)}px, 0) rotate(${this.currentTilt.toFixed(2)}deg) scale(${this.currentScale.toFixed(3)})`;
      }

      // Check if settled to resting values when not hovered
      const settled = !this.isHovered &&
        Math.abs(this.currentTilt) < 0.05 &&
        Math.abs(this.currentY) < 0.05 &&
        Math.abs(this.currentScale - 1) < 0.005;

      if (!settled) {
        this.rafId = requestAnimationFrame(update);
      } else {
        if (this.tridentEl) {
          this.tridentEl.style.transform = '';
        }
        this.rafId = null;
      }
    };

    this.rafId = requestAnimationFrame(update);
  }

  /**
   * Cleanup lifecycle to guarantee zero memory or event leaks
   */
  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.signatureEl) {
      this.signatureEl.removeEventListener('pointerenter', this.boundPointerEnter);
      this.signatureEl.removeEventListener('pointermove', this.boundPointerMove);
      this.signatureEl.removeEventListener('pointerleave', this.boundPointerLeave);
      this.signatureEl.removeEventListener('click', this.boundClick);
    }

    this.tridentEl = null;
    this.signatureEl = null;
    this.element.remove();
  }
}
