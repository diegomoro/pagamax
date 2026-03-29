/**
 * Naranja X adapter configuration.
 *
 * Selectors verified against the live site (Angular SPA using equis-design-system).
 * Update this file when the site markup changes — no other files need to change.
 */
export const NARANJAX_CONFIG = {
  issuerCode: 'naranjax' as const,
  baseUrl: 'https://www.naranjax.com',
  landingUrl: 'https://www.naranjax.com/promociones/',

  landing: {
    /**
     * Wait for at least one promo card to appear before capturing HTML.
     * The site uses Angular (equis-design-system), cards render asynchronously.
     */
    waitForSelector: '.card-container--hover',
    timeoutMs: 60_000,
    scrollToBottom: true,
    scrollStepPx: 600,
    scrollDelayMs: 400,
    postScrollWaitMs: 2000,
  },

  /**
   * Selectors verified against the live DOM (March 2025).
   * Card structure (Angular / equis-design-system):
   *
   *   equis-card > app-card > div.cards-container
   *     └─ div.card-container.card-container--hover.card-container--ripple
   *          ├─ div.card__box
   *          │    └─ div.card__content
   *          │         ├─ div.card__body
   *          │         │    └─ div.equis-body-1-medium   ← benefit title
   *          │         └─ div.card__footer              ← payment methods
   *          └─ (hidden spans with tracking data)
   *               ├─ span[class="Promo ID"]             ← UUID
   *               ├─ span[class="Promo Name"]           ← clean promo name
   *               └─ span[class="Promo Brand"]          ← merchant name
   *
   * The card body text = "<benefit><validity> en <brand>" (no separator).
   */
  selectors: {
    /** Individual promotion card */
    card: '.card-container--hover',
    /** Benefit/discount title */
    cardTitle: '.equis-body-1-medium',
    /** Full card body text (title + validity + "en " + brand concatenated) */
    cardBody: '.card__body',
    /** Payment method text (e.g. "Dinero en cuenta Débito Crédito") */
    cardFooter: '.card__footer',
    /** Merchant/brand name (exact class match required) */
    cardBrand: '[class="Promo Brand"]',
    /** Unique promo UUID from Angular tracking layer */
    cardPromoId: '[class="Promo ID"]',
    /** Clean promo name from Angular tracking layer */
    cardPromoName: '[class="Promo Name"]',
    /**
     * "Ver más" / "Conocer más" links to category campaign pages.
     * These are discovered on the landing page to get full card lists.
     */
    viewMoreLink: 'a.view-more-text',
  },

  detail: {
    waitForSelector: '.card-container--hover',
    timeoutMs: 45_000,
    selectors: {
      title: '.detail-title, h1',
      subtitle: '.detail-subtitle',
      validityText: '.detail-validity',
      legalText: 'details .legal-text, details',
      benefitText: '.benefit-text',
      paymentMethod: '.detail-payment-method',
    },
  },

  /** Polite crawl delay between consecutive page requests (ms). */
  detailPageDelayMs: 3000,
} as const;
