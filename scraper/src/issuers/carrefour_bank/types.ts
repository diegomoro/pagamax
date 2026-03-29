/**
 * types.ts — Carrefour Bank (Banco de Servicios Financieros) scraper types
 *
 * We capture ONLY Tarjeta Mi Carrefour-funded promos:
 *   - Mi Carrefour Crédito
 *   - Mi Carrefour Prepaga
 *   - Cuenta Digital Mi Carrefour
 *
 * External bank partnership promos (Santander, Galicia, BBVA, etc. at Carrefour)
 * are EXCLUDED — those are already captured via MODO / NaranjaX / MercadoPago.
 */

// ─── Raw promo (before normalization) ─────────────────────────────────────────

export type CarrefourCard =
  | 'credito'    // Mi Carrefour Crédito
  | 'prepaga'    // Mi Carrefour Prepaga
  | 'digital'    // Cuenta Digital Mi Carrefour
  | 'unknown';

export interface CarrefourRawPromo {
  /** "web_page" | "static_fallback" */
  source: 'web_page' | 'static_fallback';
  source_url: string;

  title: string;
  description: string;

  /** Always "Carrefour" (in-store) or "Carrefour Online" (carrefour.com.ar) */
  merchant_name: string;
  category: 'Supermercados';

  card: CarrefourCard;
  /** Full card label used for display */
  card_label: string;

  discount_type: 'direct_discount' | 'cashback' | 'installments';
  discount_percent: number | null;
  installments_count: number | null;

  cap_amount_ars: number | null;
  /** "per_transaction" | "daily" | "weekly" | "monthly" | "" */
  cap_period: string;

  /** Age restriction if applicable, e.g. "18-24" | "60+" | "" */
  age_restriction: string;

  /** "everyday" | "tuesday" | "saturday; sunday" | etc. */
  days_of_week: string;

  /** "in-store" | "online" | "mixed" */
  channel: 'in-store' | 'online' | 'mixed';

  /** "card" for card payment, "online" for carrefour.com.ar */
  rail: 'card' | 'online';

  /** "credit_card" | "prepaid_card" */
  instrument_required: 'credit_card' | 'prepaid_card' | 'any';

  valid_from: string;
  valid_to: string;
  terms_text_raw: string;

  is_static_fallback: boolean;
}

// ─── Normalized output ─────────────────────────────────────────────────────────

export interface CarrefourPromo {
  source_id: string;
  issuer: 'carrefour_bank';

  promo_title: string;
  merchant_name: string;
  category: string;
  description_short: string;
  card_label: string;

  discount_type: string;
  discount_percent: number | null;
  installments_count: number | null;
  cap_amount_ars: number | null;
  cap_period: string;
  age_restriction: string;

  day_pattern: string;
  channel: string;
  valid_from: string;
  valid_to: string;

  rail: string;
  instrument_required: string;
  wallet_scope: 'Tarjeta Mi Carrefour';

  terms_text_raw: string;
  is_static_fallback: boolean;
  scraped_at: string;
}
