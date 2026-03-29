/**
 * types.ts — Shell Box scraper types
 *
 * Shell Box is Shell's Argentine payment app.
 * Discounts apply at Shell stations (and partner merchants like VEA/Jumbo)
 * when paying via the Shell Box QR at POS.
 *
 * We only capture Shell Box-funded promos — NOT bank partnership deals
 * (Comafi, Galicia, Nación, etc.) which are already captured via MODO/BBVA.
 */

// ─── Raw promo (before normalization) ─────────────────────────────────────────

export interface ShellboxRawPromo {
  /** "web_page" | "static_fallback" */
  source: 'web_page' | 'static_fallback';
  source_url: string;

  title: string;
  description: string;
  merchant_name: string;
  /** "Combustible" | "Supermercados" */
  category: string;

  discount_type: 'direct_discount' | 'cashback';
  discount_percent: number | null;

  cap_amount_ars: number | null;
  /** "per_transaction" | "weekly" | "monthly" | "" */
  cap_period: string;

  /** "everyday" | "wednesday" | etc. */
  days_of_week: string;

  valid_from: string;
  valid_to: string;

  terms_text_raw: string;

  /** true = came from hardcoded fallback, not live page parse */
  is_static_fallback: boolean;
}

// ─── Normalized output ─────────────────────────────────────────────────────────

export interface ShellboxPromo {
  source_id: string;
  issuer: 'shellbox';

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

  rail: 'qr';
  instrument_required: 'qr_wallet';
  wallet_scope: 'Shell Box';

  terms_text_raw: string;
  is_static_fallback: boolean;
  scraped_at: string;
}
