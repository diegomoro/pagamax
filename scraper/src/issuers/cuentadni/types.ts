/**
 * types.ts — Cuenta DNI (Banco Provincia) raw and output types.
 *
 * Source: https://www.bancoprovincia.com.ar/cuentadni/
 * API: /cuentadni/Home/GetBeneficioByRubro?idRubro=N
 *      /cuentadni/Home/GetBeneficioData2?idBeneficio=N
 */

// ─── API Response Types ───────────────────────────────────────────────────────

/** Raw benefit object returned by GetBeneficioByRubro and GetBeneficioData2. */
export interface BeneficioAPI {
  id: number;
  titulo: string;
  subtitulo: string;
  porcentaje: number;
  logo: string;
  /** Short cap/summary text, e.g. "Tope de reintegro: $5.000 por semana y por persona" */
  bajada: string;
  /** Full legal terms text (all caps). Primary extraction source. */
  legal: string;
  /** .NET date: "/Date(UNIX_MS)/" */
  fecha_desde: string;
  /** .NET date: "/Date(UNIX_MS)/" */
  fecha_hasta: string;
  /** URL slug, e.g. "coto", "supermercados" */
  url: string;
  /** Short validity description, e.g. "MARTES Y MIÉRCOLES DE MARZO 2026" */
  titulo_fecha: string;
  orden: number;
  boton_pdf: string;
  oculto: number | null;
  tipo: number;
  urlPagina: string | null;
}

/**
 * Button/action item from Entity.Botones in GetBeneficioData2 response.
 * tipo="link" → URL pointing to a buscador page or external merchant map.
 */
export interface BeneficioBoton {
  id: number;
  tipo: string;
  texto: string;
  link: string | null;
  contenido: string | null;
  idBeneficio?: number;
  orden: number;
}

/**
 * Condition item from Entity.Condiciones — human-readable condition bullet.
 * Useful as structured alternative to raw legal text for edge cases.
 */
export interface BeneficioCondicion {
  id: number;
  id_beneficio: number;
  texto: string;
  orden: number;
}

/** Response envelope from GetBeneficioData2 (single benefit + merchant links). */
export interface BeneficioData2Response {
  Entity: {
    Rubros: Array<{
      id: number;
      nombre: string;
      orden: number;
      icono: string;
      estado: number;
    }>;
    Beneficio: BeneficioAPI;
    /** Merchant locator buttons — tipo="link" items have the buscador URL. */
    Botones?: BeneficioBoton[];
    /** Structured conditions bullets (alternative to raw legal text). */
    Condiciones?: BeneficioCondicion[];
    Imagenes?: unknown[];
  };
  Success?: boolean;
  Message?: string | null;
}

// ─── Discovered URL Types ─────────────────────────────────────────────────────

export type PageType =
  | 'benefits_hub'
  | 'buscador'
  | 'detail_page'
  | 'campaign_page'
  | 'js_heavy'
  | 'non_promo_or_auxiliary';

export interface DiscoveredUrl {
  url: string;
  type: PageType;
  /** How this URL was discovered: 'seed', 'hub_link', 'hub_card', 'js_pattern' */
  source: string;
}

// ─── Raw Candidate (before normalization) ────────────────────────────────────

/**
 * RawCuenaDNICandidate — intermediate representation from a single data source.
 * One candidate maps to one normalized promo output.
 */
export interface RawCuenaDNICandidate {
  /** Which data source produced this candidate */
  dataSource: 'api_rubro' | 'api_data2' | 'hub_card' | 'campaign_page';
  sourceUrl: string;
  pageType: PageType;
  scrapedAt: string; // ISO timestamp

  // From API
  beneficioId?: number;
  rubroId?: number;
  rubroName?: string;

  // Promo identity
  title: string;
  subtitle?: string;
  discountPercent?: number;
  /** Short summary: "Tope de reintegro: $5.000 por semana y por persona" */
  bajada?: string;
  /** Full legal terms (primary source for cap, rails, exclusions) */
  legalText?: string;

  // Dates (as JS timestamps from .NET Date format)
  fechaDesdeMs?: number;
  fechaHastaMs?: number;

  /**
   * Short validity label from API, e.g. "Jueves", "Miércoles y jueves", "Lunes a viernes".
   * Primary source for days_of_week parsing (much more reliable than full legal text).
   */
  tituloFecha?: string;

  /** Slug for buscador merchant list lookup */
  urlSlug?: string;
  /** Merchant list buscador page URL */
  merchantLocatorUrl?: string;

  // For campaign/buscador pages extracted from HTML
  rawSnippet?: string;
}

// ─── Normalized Output (final) ────────────────────────────────────────────────

/** Final flat output object — one per promo, written to NDJSON and CSV. */
export interface CuenaDNIPromo {
  source: 'cuenta_dni';
  source_family: 'banco_provincia';
  source_page_type: PageType;
  source_url: string;
  discovery_path: string;

  /** Deterministic SHA-1 key for deduplication */
  promo_key: string;

  promo_title: string;
  /** E.g. "Supermercados", "Farmacias", "Varios" */
  merchant_group: string;
  category: string;
  subcategory: string;
  description_short: string;

  discount_percent: number | null;
  /** cashback_percentage | discount_percentage | other */
  discount_type: string;

  cap_amount_ars: number | null;
  cap_period: string | null;
  cap_scope: string | null;
  /** true if tope is per-person */
  cap_per_person: boolean | null;
  min_purchase_amount_ars: number | null;

  /** "monday; tuesday; wednesday" */
  days_of_week: string;
  valid_from: string | null;  // ISO date
  valid_to: string | null;    // ISO date
  validity_text_raw: string;

  is_active: boolean;
  is_stale: boolean;
  freshness_reason: string;

  payment_method: 'cuenta_dni';
  funding_source: string;
  /** "qr; clave_dni; posnet; link_de_pago; cuenta_dni_comercios" */
  allowed_rails: string;
  excluded_rails: string;
  /** in_store | online | both */
  channel: string;

  installments: number | null;
  reimbursement_delay_business_days: number | null;

  geo_scope: string;
  merchant_locator_url: string;

  terms_text_raw: string;
  exclusions_raw: string;
  examples_raw: string;
  raw_snippet: string;

  beneficio_id: number | null;
  rubro_id: number | null;
  scraped_at: string;
}

// ─── Audit Report ─────────────────────────────────────────────────────────────

export interface AuditReport {
  scrapedAt: string;
  hubCoverage: {
    cardsSeen: number;
    cardsWithApiData: number;
    cardsMissingApiData: string[];
  };
  surfaceCoverage: {
    rubroIds: number[];
    buscadoresFound: number;
    campaignPagesFound: number;
    jsHeavyPages: string[];
    fetchSuccess: number;
    fetchFailed: Array<{ url: string; status: number; error?: string }>;
  };
  promoCoverage: {
    totalRaw: number;
    totalAfterDedupe: number;
    active: number;
    stale: number;
    duplicatesRemoved: number;
    zeroResultSources: string[];
    byRubro: Record<string, number>;
    byPageType: Record<string, number>;
  };
  fieldCompleteness: {
    missingDiscountPct: number;
    missingCap: number;
    missingDates: number;
    missingPaymentRails: number;
    missingLegalText: number;
  };
  gapAnalysis: {
    merchantListsUnavailable: string[];
    jsHeavyPagesNotScraped: string[];
    unknownRubroIds: string;
    riskLevel: 'low' | 'medium' | 'high';
    riskReason: string;
  };
}
