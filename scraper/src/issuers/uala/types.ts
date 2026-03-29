/**
 * types.ts — Ualá promotions scraper types
 *
 * Source: Next.js _next/data SSR endpoints (Contentful CMS backend)
 * Level 1 — fully structured, no auth required
 */

// ─── Raw CMS shapes (_next/data API) ─────────────────────────────────────────

export interface UalaListPromo {
  fields?: {
    urlDeLaPromocion?: string;    // slug (e.g. "carrefour")
    promotionName?: string;       // internal CMS name
    brand?: { fields?: { brandName?: string } };
    isFeaturedPromotion?: boolean;
    isUalaMas?: boolean;
    previewTitle?: string;
    previewDescription?: string;
    PromotionCategory?: string;
  };
  // Contentful entry shape — fields may be at top level too
  urlDeLaPromocion?: string;
  promotionName?: string;
}

export interface UalaSpecCta {
  text: string;
  href: string;
}

export interface UalaSpec {
  id: string;
  title: string;               // "10% Off", "35% de reintegro en POS Pro"
  description: string;         // "pagando con Ualá"
  cta: UalaSpecCta | null;
  expandCardText: string;
  paymentMethods: string[];    // ["QR"] | ["Tarjeta Prepaga", "Tarjeta de Crédito"]
  days: string[];              // ["Sábado"] | ["Todos los días"] | ["Jueves"]
  place: string[];             // ["Físico"] | ["Online"]
  date: string;                // "Hasta el 31 de marzo 2026"
  cashback: string;            // "Sin tope" | "$20.000 por mes" | "-"
  cashdate: string;            // "En el momento" | "Hasta 15 días hábiles" | "-"
  availability: string[];      // ["Todo el país"]
  legalDisclaimer: string;
}

export interface UalaPromoDetail {
  id: string;
  seo: { title?: string; metaDescription?: string; canonical?: string };
  extraPromotion: boolean | null;
  logo: { src?: string; alt?: string } | null;
  specs: UalaSpec[];
}

export interface UalaDetailResponse {
  pageProps: { promotion: UalaPromoDetail };
}

/** Merged raw: slug + detail fetched from CMS */
export interface UalaRawPromo {
  slug: string;
  detail: UalaPromoDetail;
  spec: UalaSpec;
  specIndex: number;           // index within promo.specs[]
  fetchError?: string;
}

// ─── Normalized output ────────────────────────────────────────────────────────

export interface UalaPromo {
  // Identity
  promo_key: string;           // "uala-{slug}-{spec.id}"
  source_id: string;           // spec.id (Contentful entry ID)
  issuer: string;              // "uala"
  slug: string;
  spec_index: number;

  // Source provenance
  source_url: string;
  source_level: number;        // 1 = _next/data structured JSON
  source_type: string;         // "nextjs_ssr"
  discovery_path: string;      // "list→detail"
  confidence_score: number;

  // Promo content
  promo_title: string;
  merchant_name: string;
  merchant_logo_url: string;
  category: string;
  subcategory: string;

  // Discount
  discount_percent: number | null;
  discount_amount_ars: number | null;
  discount_type: string;       // "direct_discount" | "cashback" | "coupon_discount"
  promo_family: string;        // "merchant_discount" | "cashback" | "partner_promo" | "qr_payment"
  cap_amount_ars: number | null;
  cap_period: string;          // "monthly" | "per_transaction" | ""

  // Dates
  valid_from: string;          // YYYY-MM-DD
  valid_to: string;            // YYYY-MM-DD
  validity_text_raw: string;   // spec.date

  // Usage
  day_pattern: string;         // "everyday" | "saturday" | "thursday"
  payment_method: string;      // raw paymentMethods[] joined

  // Instrument & channel (mandatory)
  instrument_required: string; // "qr_wallet" | "prepaid_card" | "credit_card" | "uala_cards"
  card_brand_scope: string;    // "Mastercard" | "unknown"
  channel: string;             // "in-store" | "online" | "mixed"

  // Reimbursement
  reimbursement_timing_raw: string; // spec.cashdate
  coupon_code: string;         // if coupon detected in description

  // Legal
  terms_text_raw: string;
  exclusions_raw: string;
  cta_url: string;

  // Freshness
  freshness_status: string;    // "active" | "future" | "expired" | "unknown"

  // Meta
  is_active: boolean;
  scraped_at: string;
  raw_snippet: string;         // JSON of UalaSpec (compact)
}
