/**
 * types.ts — Personal Pay benefits scraper types
 */

// ─── Raw API shapes ───────────────────────────────────────────────────────────

export interface PpLevel {
  code: string;          // LVL00 | LVL01 | LVL02 | LVL03 | LVL04
  name: string;          // "Todos los usuarios" | "Nivel 1" … "Nivel 4"
  discountValue: string; // "10%" | "20%"
  limitAmount: string;   // "$3.000"
  renewal: string;       // "Se renueva los Lunes"
  usageLimit: string;    // "1 vez por semana"
  paymentMin: number;    // minimum purchase amount (ARS)
  value: string;         // same as discountValue
  typeLimit: string;     // "1 vez por semana"
}

export interface PpPaymentMethod {
  id: string | number;
  name: string;
}

export interface PpLocation {
  name: string;
  lat: string;
  lon: string;
}

/** Shape returned by GET /api/benefits?offset=N&limit=N (list endpoint) */
export interface PpListItem {
  id: number;
  image: string;
  discounts: string;        // "20%" or "20% reintegro"
  benefitValue: string;     // "20% de reintegro"
  title: string;            // merchant name
  name: string;             // "total de la compra"
  description: string;
  days: string[];
  subtitle: string;
  dueDate: string;          // ISO date string
  legal: string;
  paymentMethods: PpPaymentMethod[];
  liked: boolean;
  channelName: string;
  typeCode: string;         // "Cashback" | "Discount"
  partnerImage: string;
  documentTyc: string;
  heading: string;
  levels: PpLevel[];
  limitAmount: string;      // "$3.000"
  limitAmountSubtitle: string; // "Tope $3.000"
}

export interface PpListResponse {
  data: {
    benefits: PpListItem[];
    meta: { offset: number };
  };
}

/** Shape returned by GET /api/benefits/<id> (detail endpoint — superset of list) */
export interface PpDetailItem extends PpListItem {
  category: string[];       // ["Salud y belleza"]
  locations: PpLocation[];
  generic: boolean;
  idCashback: number | null;
  ecommerce: string | null; // website URL for online-only
  rewardsLinked: unknown[];
  isTeco: number;           // 0 | 1 (int, not bool)
}

export interface PpDetailResponse {
  data: PpDetailItem;
}

/** Merged raw data: list item + detail */
export interface PpRawBenefit {
  listItem: PpListItem;
  detail?: PpDetailItem;
  detailError?: string;
}

// ─── Normalized output schema ─────────────────────────────────────────────────

export interface PpPromo {
  source_id: string;
  issuer: string;

  promo_title: string;
  merchant_name: string;
  merchant_logo_url: string;
  category: string;         // category[0] from detail, or heading
  heading: string;          // broad category bucket

  channel_label: string;    // "Sucursal" | "Online" | etc.
  discount_type: string;    // "cashback" | "direct_discount"
  discount_percent: number | null;  // from LVL00 or max across levels
  cap_amount_ars: number | null;    // parsed from limitAmount; null = no cap
  min_purchase_ars: number | null;  // parsed from legal text

  payment_description: string;  // benefitValue
  days_of_week: string;         // days[] normalized to "monday; friday" or "everyday"
  allowed_rails: string;        // "qr; card; nfc"
  payment_methods_str: string;

  ecommerce_url: string;
  locations_count: number;

  levels_count: number;
  max_discount_percent: number | null;
  levels_json: string;          // JSON-encoded levels[]

  is_teco: boolean;

  valid_from: string;   // YYYY-MM-DD parsed from legal, or ''
  valid_to: string;     // YYYY-MM-DD from dueDate
  legal_text: string;

  is_active: boolean;
  is_stale: boolean;
  freshness_reason: string;
  scraped_at: string;
}
