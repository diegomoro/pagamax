/**
 * canonical.ts — Unified promo schema for Pagamax.
 *
 * Every issuer adapter MUST produce this shape.
 * consolidate.ts reads per-issuer NDJSON and maps to this.
 *
 * Design rules:
 *  - null  = field does not apply / truly unknown
 *  - ""    = field applies but value is empty (avoid — use null)
 *  - all dates are YYYY-MM-DD strings
 *  - all ARS amounts are plain numbers (no symbols, no thousands separators)
 */

// ─── Controlled vocabulary ────────────────────────────────────────────────────

export type Issuer =
  | 'naranjax'
  | 'modo'
  | 'bbva'
  | 'mercadopago'
  | 'personalpay'
  | 'uala'
  | 'cuentadni'
  | 'ypf'
  | 'shellbox'
  | 'carrefour_bank';

export type DiscountType =
  | 'direct_discount'   // applied at POS instantly (MP, Carrefour QR)
  | 'cashback'          // reimbursed after payment (MODO, CuentaDNI, PersonalPay)
  | 'installments'      // cuotas sin/con interés (BBVA, NaranjaX)
  | 'coupon_discount'   // coupon code applied at checkout (Ualá Coderhouse)
  | 'unknown';

export type Channel =
  | 'in-store'
  | 'online'
  | 'mixed'
  | 'unknown';

export type Rail =
  | 'qr'
  | 'nfc'
  | 'card'         // generic card swipe / chip
  | 'online'       // e-commerce / web
  | 'direct_debit' // CBU/CVU debit
  | 'any'
  | 'unknown';

export type Instrument =
  | 'credit_card'
  | 'debit_card'
  | 'prepaid_card'
  | 'qr_wallet'    // QR without a card (account money)
  | 'any'          // multiple accepted
  | 'unknown';

export type FreshnessStatus =
  | 'active'
  | 'future'
  | 'expired'
  | 'unknown';

// ─── Canonical promo ─────────────────────────────────────────────────────────

export interface CanonicalPromo {
  // ── Identity ────────────────────────────────────────────────────────────────
  /** Globally unique key: "{issuer}-{source_id}" */
  promo_key:            string;
  /** Original ID from the issuer's data system */
  source_id:            string;
  issuer:               Issuer;
  /** Direct link to the promo page/card */
  source_url:           string;

  // ── Content ─────────────────────────────────────────────────────────────────
  promo_title:          string;
  /** Canonical merchant name (after normalization) */
  merchant_name:        string;
  merchant_logo_url:    string;
  /** Unified category (Gastronomía, Supermercados, Farmacia, Indumentaria,
   *  Tecnología, Entretenimiento, Combustible, Viajes, Educación, Salud, Otro) */
  category:             string;
  subcategory:          string;
  description_short:    string;

  // ── Discount ────────────────────────────────────────────────────────────────
  discount_type:        DiscountType;
  /** % off (e.g. 20 = 20%). null for installment-only or unknown promos */
  discount_percent:     number | null;
  /** Fixed ARS amount off. Mutually exclusive with discount_percent. */
  discount_amount_ars:  number | null;
  /** Number of installments for 'installments' type. null otherwise. */
  installments_count:   number | null;
  /** Max reimbursement / discount cap. null = no cap (sin tope). */
  cap_amount_ars:       number | null;
  /** Renewal period for the cap: "per_transaction" | "daily" | "weekly" | "monthly" | "" */
  cap_period:           string;
  /** Minimum purchase required. null = no minimum. */
  min_purchase_ars:     number | null;

  // ── Validity ────────────────────────────────────────────────────────────────
  valid_from:           string;   // YYYY-MM-DD or ""
  valid_to:             string;   // YYYY-MM-DD or ""
  /** Raw validity text from the promo card/API */
  validity_text_raw:    string;
  /** "everyday" | "monday" | "saturday; sunday" etc. */
  day_pattern:          string;

  // ── Payment instrument & channel ────────────────────────────────────────────
  channel:              Channel;
  /** Primary payment rail */
  rail:                 Rail;
  instrument_required:  Instrument;
  /** "Visa" | "Mastercard" | "Amex" | "any" | "" */
  card_brand_scope:     string;
  /** "credit" | "debit" | "prepaid" | "any" | "" */
  card_type_scope:      string;
  /** "Ualá" | "Naranja X" | "Personal Pay" | "" (for app-level promos) */
  wallet_scope:         string;
  /** "Todo el país" | "CABA" | "Buenos Aires" | etc. */
  geo_scope:            string;
  /** Coupon/promo code if required */
  coupon_code:          string;

  // ── Reimbursement ───────────────────────────────────────────────────────────
  /** Raw text describing when cashback is credited */
  reimbursement_timing_raw: string;

  // ── Legal ───────────────────────────────────────────────────────────────────
  terms_text_raw:       string;
  exclusions_raw:       string;
  /**
   * Structured payment-rail exclusions extracted from T&C.
   * Semicolon-separated tokens from: mercadopago_qr | other_wallets |
   * credit_card | debit_card | transfer | prepaid_card | naranjax | qr
   * e.g. "mercadopago_qr" means the promo CANNOT be used when the QR
   * is processed by MercadoPago — only by this issuer's own network.
   */
  excluded_rails:       string;

  // ── Freshness ───────────────────────────────────────────────────────────────
  freshness_status:     FreshnessStatus;
  freshness_reason:     string;

  // ── Scores (computed at consolidation time) ──────────────────────────────────
  /**
   * 0–1. How complete and trustworthy the promo's routing-critical fields are.
   * Inputs: valid_to, discount_percent, cap_amount_ars, channel, exclusions, valid_from.
   * Used as a signal in routing_confidence.
   */
  data_quality_score:   number;

  /**
   * 0–1. Per-issuer baseline reliability derived from observed field coverage
   * and structural data quality across all scraped promos for that issuer.
   * Static per issuer; updated when scraper coverage changes.
   */
  issuer_reliability:   number;

  /**
   * 0–1. Confidence the promo will actually fire at payment time.
   * Combines: data_quality_score × issuer_reliability × freshness × payment-type risk.
   * Use this to gate routing decisions: < 0.4 = do not route; 0.4–0.7 = route with hedge.
   */
  routing_confidence:   number;

  /**
   * Max ARS discount capturable in a single transaction.
   * = min(cap_amount_ars, discount_pct/100 × category_avg_ticket_ars).
   * null when discount_percent is unknown (e.g. installments-only without known IRR).
   */
  potential_value_ars:  number | null;

  /**
   * Expected ARS value delivered to the business per routing decision, per month.
   * = potential_value_ars × routing_confidence × usage_freq_monthly × day_coverage × (1 − collection_risk).
   * This is the primary ranking signal for the routing engine.
   * Treat as a relative score — absolute values improve once real transaction data is fed back.
   */
  routing_ltv:          number | null;

  // ── Meta ────────────────────────────────────────────────────────────────────
  scraped_at:           string;   // ISO timestamp
  /** Compact JSON of original raw record for debugging */
  raw_snippet:          string;
}

// ─── CSV column order (canonical, used by consolidate.ts) ────────────────────

export const CANONICAL_COLS: Array<keyof CanonicalPromo> = [
  'promo_key',
  'source_id',
  'issuer',
  'source_url',
  'promo_title',
  'merchant_name',
  'merchant_logo_url',
  'category',
  'subcategory',
  'description_short',
  'discount_type',
  'discount_percent',
  'discount_amount_ars',
  'installments_count',
  'cap_amount_ars',
  'cap_period',
  'min_purchase_ars',
  'valid_from',
  'valid_to',
  'validity_text_raw',
  'day_pattern',
  'channel',
  'rail',
  'instrument_required',
  'card_brand_scope',
  'card_type_scope',
  'wallet_scope',
  'geo_scope',
  'coupon_code',
  'reimbursement_timing_raw',
  'freshness_status',
  'freshness_reason',
  'data_quality_score',
  'issuer_reliability',
  'routing_confidence',
  'potential_value_ars',
  'routing_ltv',
  'terms_text_raw',
  'exclusions_raw',
  'excluded_rails',
  'scraped_at',
  'raw_snippet',
];
