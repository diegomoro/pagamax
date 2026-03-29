/**
 * types.ts — YPF Serviclub scraper types
 *
 * YPF offers fuel discounts via the YPF App (QR payment at station).
 * When serviclub.com.ar is live, additional partner merchant promos are available.
 */

// ─── Raw promo (before normalization) ────────────────────────────────────────

export interface YpfRawPromo {
  /** "static_fallback" | "serviclub_web" | "app_page" */
  source: 'static_fallback' | 'serviclub_web' | 'app_page';
  source_url: string;

  title: string;
  /** Short description of the benefit */
  description: string;
  merchant_name: string;
  /** "Combustible" | "Supermercados" | etc. */
  category: string;

  discount_type: 'direct_discount' | 'cashback';
  discount_percent: number | null;

  /** ARS cap; null = no cap */
  cap_amount_ars: number | null;
  cap_period: string;

  /** Days the discount applies, e.g. "everyday" | "monday; tuesday" */
  days_of_week: string;

  /** "qr" — YPF App uses QR at POS */
  rail: 'qr';

  valid_from: string;
  valid_to: string;

  terms_text_raw: string;

  /**
   * true when this row comes from hardcoded fallback data (not live scrape).
   * Indicates that serviclub.com.ar was unreachable.
   */
  is_static_fallback: boolean;
}

// ─── Normalized output ────────────────────────────────────────────────────────

export interface YpfPromo {
  source_id: string;
  issuer: 'ypf';

  promo_title: string;
  merchant_name: string;
  category: string;
  description_short: string;

  discount_type: string;
  discount_percent: number | null;
  cap_amount_ars: number | null;
  cap_period: string;

  day_pattern: string;
  valid_from: string;
  valid_to: string;

  rail: string;
  instrument_required: 'qr_wallet';
  wallet_scope: 'YPF App';

  terms_text_raw: string;
  is_static_fallback: boolean;
  scraped_at: string;
}
