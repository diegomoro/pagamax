/**
 * types.ts — BBVA Argentina promotions scraper types
 *
 * Source: go.bbva.com.ar/willgo/fgo/API/v3 (fully public, no auth)
 * Level 1 — structured REST JSON
 */

// ─── Raw API shapes ───────────────────────────────────────────────────────────

/** One item from GET /v3/communications?pager=N */
export interface BbvaListItem {
  id: string;               // numeric string, e.g. "83424"
  imagen: string;           // image URL
  cabecera: string;         // title: "<Merchant> <descriptor>"
  subcabecera: string;      // preview description + date range
  idCampania: string;       // non-empty if belongs to a campaign group
  esCampania: boolean;      // true = IS a campaign header
  fechaDesde: string;       // "YYYY-MM-DD"
  fechaHasta: string;       // "YYYY-MM-DD"
  diasPromo: string | null; // "1,1,1,1,1,1,1" or null=all days; "0,0,0,0,1,0,0"=Friday
  montoTope: string | null; // cap amount (sometimes in list; usually in detail.tope)
  grupoTarjeta: string;     // always "Tarjetas de crédito BBVA" (misleading — check basesCondiciones)
}

export interface BbvaListResponse {
  code: number;
  message: string;          // "Comunicaciones: 908   paginas: 46"
  data: BbvaListItem[];
}

/** One entry in beneficios[] on the detail record */
export interface BbvaBeneficio {
  cuota: number;            // 0 = no installments; N = N cuotas sin interés
  tope: number | null;      // cap amount in ARS (e.g. 16000)
  tipoTope: string;         // "ninguno" | "Usuario" | " "
  frecuenciaTope: string;   // " " | "Mensual" | ...
  requisitos: string[];     // [human-readable description]
}

export interface BbvaCanalesVenta {
  sucursales: Array<{
    direccion: string;
    localidad: string;
    latitude: string;
    longitude: string;
  }>;
  web: Array<{ name: string; url: string }>;
}

/** Response from GET /v3/communication/<id> */
export interface BbvaDetailItem {
  id: string;
  imagen: string;
  cabecera: string;
  beneficios: BbvaBeneficio[];
  canalesVenta: BbvaCanalesVenta;
  basesCondiciones: string;  // full legal T&C text
  diasPromo: string | null;
  vigencia: string;          // "Del DD/MM/YYYY hasta DD/MM/YYYY"
  grupoTarjeta: string;
  tiempoAcreditacion: string | null;
}

export interface BbvaDetailResponse {
  code: number;
  message: string;
  data: BbvaDetailItem;
}

/** Merged: list item + detail */
export interface BbvaRawPromo {
  listItem: BbvaListItem;
  detail: BbvaDetailItem;
  fetchError?: string;
}

// ─── Normalized output ────────────────────────────────────────────────────────

export interface BbvaPromo {
  // Identity & provenance
  promo_key: string;              // "bbva-<id>"
  source: string;                 // "bbva"
  promo_id_raw: string;           // e.g. "83424"
  promo_id_type: string;          // "sequential_numeric"
  source_url: string;             // https://www.bbva.com.ar/beneficios/beneficio.html?id=<id>
  canonical_request_url: string;  // https://go.bbva.com.ar/willgo/fgo/API/v3/communication/<id>
  source_level: number;           // 1
  source_type: string;            // "rest_json"

  // Content
  promo_title: string;            // full cabecera
  merchant_name: string;          // cabecera minus descriptor suffix
  merchant_logo_url: string;
  category: string;
  subcategory: string;
  description_short: string;      // beneficios[0].requisitos[0]

  // Discount
  discount_percent: number | null;
  discount_amount_ars: number | null;
  discount_type: string;          // "installments" | "cashback" | "direct_discount" | "unknown"
  installments_count: number;     // 0 = N/A
  promo_family: string;           // "cuotas" | "cashback" | "merchant_discount" | "subscription"
  cap_amount_ars: number | null;
  cap_period: string;             // "monthly" | "per_transaction" | ""
  min_purchase_amount_ars: number | null;

  // Dates
  valid_from: string;             // YYYY-MM-DD
  valid_to: string;               // YYYY-MM-DD
  validity_text_raw: string;      // vigencia string

  // Usage
  day_pattern: string;            // "everyday" | "monday; thursday" | ...

  // Instrument & channel
  channel: string;                // "in-store" | "online" | "mixed" | "unknown"
  rail: string;                   // "card" | "qr" | "nfc" | "direct_debit" | "unknown"
  payment_method: string;         // from grupoTarjeta + brand
  instrument_required: string;    // "credit_card" | "debit_card" | "prepaid_card" | "unknown"
  wallet_scope: string;           // "apple_pay; google_pay; modo" or ""
  card_brand_scope: string;       // "Visa" | "Mastercard" | "Visa; Mastercard" | "all"
  card_type_scope: string;        // "credit" | "debit" | "credit; debit"
  program_scope: string;          // "plan_v" | "black" | ""
  geo_scope: string;              // "national" | "capital_federal" | ...

  // Reimbursement
  reimbursement_timing_raw: string;

  // Legal
  terms_text_raw: string;
  exclusions_raw: string;

  // Web channels
  web_urls: string;               // semicolon-joined web URLs from canalesVenta

  // Freshness
  freshness_status: string;       // "active" | "expired" | "future" | "unknown"
  freshness_reason: string;

  // Meta
  scraped_at: string;
  raw_snippet: string;            // compact JSON of key raw fields
}
