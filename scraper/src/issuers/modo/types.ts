/**
 * types.ts — MODO promotions scraper raw and output types.
 *
 * Source:    https://modo.com.ar/promos/<slug>  (SSR Next.js 13+ App Router)
 * Discovery: https://promoshub.modo.com.ar/sitemap.xml  (4 900+ promo slugs)
 *
 * Data arrives via two mechanisms per page:
 *   1. JSON-LD  <script type="application/ld+json"> — basic offer metadata
 *   2. RSC flight chunks  self.__next_f.push([N, "..."]) — full promo + bank eligibility
 */

// ─── RSC payload types (raw API shapes) ───────────────────────────────────────

export interface RscBank {
  id: string;
  name: string;
  bcra_code: string | null;
  hub_bank_id: string;
  logo?: string | null;
}

export interface RscPaymentMethod {
  /** e.g. "Crédito", "Débito", "Prepaga" */
  name: string;
  /** e.g. "visa", "master", "amex", "cabal", "naranja" */
  card: string;
}

export interface RscInstallment {
  /** "sin_interes" | "fijas" | "ahora12" | etc. */
  type: string;
  number: number;
  /** Coefficient string, e.g. "0.00" means 0% interest */
  coefficient: string;
}

export interface RscPromotion {
  id: string;
  title: string;
  slug: string;
  /** "running" | "finished" | "future" */
  calculated_status: string;
  /** 7-char string: "LMXJVSD" — uppercase = active day */
  days_of_week: string;
  /** Merchant / store name, e.g. "Megatone", "Farmacity" */
  where: string | null;
  start_date: string | null;   // ISO timestamp
  stop_date: string | null;    // ISO timestamp
  /** "online" | "in_store" | "both" */
  payment_flow: string;
  /** "installments" | "cashback" | "discount" | other */
  trigger_type: string;

  // Cashback-specific (present when trigger_type = "cashback")
  cashback_percentage?: number | null;
  max_amount?: number | null;
  min_amount?: number | null;

  // Discount-specific (present when trigger_type = "discount")
  discount_percentage?: number | null;

  // Optional enrichment fields
  description?: string | null;
  terms?: string | null;
  image_url?: string | null;
  /** External merchant list or terms PDF URL */
  external_url?: string | null;
  pdf_url?: string | null;
  [key: string]: unknown;
}

export interface RscPromotionWrapper {
  promotion: RscPromotion;
  installments: RscInstallment[];
}

/** Shape of the RSC data chunk that contains MODO promo data. */
export interface RscPromoData {
  banks: RscBank[];
  paymentMethodList: RscPaymentMethod[];
  promotion: RscPromotionWrapper;
  /** Any additional fields the API may include. */
  [key: string]: unknown;
}

// ─── JSON-LD type ─────────────────────────────────────────────────────────────

export interface JsonLdOffer {
  '@type': 'Offer';
  name?: string;
  description?: string;
  validFrom?: string;
  validThrough?: string;
  availableAtOrFrom?: { '@type': string; name?: string };
  [key: string]: unknown;
}

// ─── Raw candidate (before normalization) ────────────────────────────────────

/**
 * RawModoCandidate — one entry per promo page fetched.
 * Contains all parsed data from JSON-LD + RSC before normalization.
 */
export interface RawModoCandidate {
  slug: string;
  sourceUrl: string;
  scrapedAt: string;   // ISO timestamp

  // From JSON-LD
  jsonLdTitle?: string;
  jsonLdDescription?: string;
  jsonLdValidFrom?: string;
  jsonLdValidThrough?: string;
  jsonLdWhere?: string;

  // From RSC
  rscData?: RscPromoData;

  /**
   * Resolved terms text (plain text, HTML stripped).
   * Sourced from the T-chunk referenced by sections.tyc (e.g. "$1f").
   * Contains: tope de reintegro, reimbursement timing, restrictions.
   */
  termsText?: string;

  /**
   * Resolved body text (plain text, HTML stripped).
   * Sourced from the T-chunk referenced by sections.body.
   * Contains: modalidad de uso, merchant URLs.
   */
  bodyText?: string;

  // Artifact URLs found on the page (PDFs, external merchant lists, merchant URLs in body)
  rawArtifactUrls: Array<{ url: string; label: string }>;

  // For audit
  parseError?: string;
  httpStatus: number;
}

// ─── Eligibility artifact ─────────────────────────────────────────────────────

export interface EligibilityArtifact {
  promo_key: string;
  promo_id: string | null;
  slug: string;
  /** "pdf" | "merchant_list_url" | "external_url" | "unknown" */
  artifact_type: string;
  artifact_url: string;
  label: string;
}

// ─── Normalized output ────────────────────────────────────────────────────────

/** Final flat output object — one row per active MODO promo. */
export interface ModoPromo {
  source: 'modo';
  source_family: 'modo';
  source_url: string;
  discovery_path: string;

  /** Deterministic SHA-1 key for deduplication (slug-based). */
  promo_key: string;
  /** MODO internal promo UUID from RSC. */
  promo_id: string | null;
  slug: string;

  promo_title: string;
  description_short: string;
  /** Merchant / store from promotion.where or JSON-LD availableAtOrFrom. */
  where: string;

  // Bank eligibility
  /** Semicolon-separated hub_bank_id values: "macro; bbva" */
  banks: string;
  /** Semicolon-separated display names: "Macro; BBVA Francés" */
  bank_names: string;
  /** Semicolon-separated BCRA codes: "0285; 0017" */
  bcra_codes: string;

  // Payment method eligibility
  /** e.g. "credito_visa; credito_master" */
  payment_methods: string;
  /** e.g. "visa; master" */
  card_networks: string;
  /** e.g. "credito; debito" */
  card_types: string;

  // Benefit
  /** "cashback" | "installments" | "discount" | "other" */
  trigger_type: string;
  discount_percent: number | null;
  /** "cashback_percentage" | "discount_percentage" | "installments_interest_free" | "installments_fixed_rate" */
  discount_type: string;

  installments: number | null;
  /** "sin_interes" | "fijas" | "" */
  installment_type: string;
  installment_coefficient: string;

  // Limits
  cap_amount_ars: number | null;
  cap_period: string | null;
  min_purchase_amount_ars: number | null;

  // Schedule
  /** "monday; wednesday; friday" */
  days_of_week: string;
  valid_from: string | null;    // ISO date YYYY-MM-DD
  valid_to: string | null;      // ISO date YYYY-MM-DD

  // Channel + payment modality
  /** "online" | "in_store" | "both" */
  payment_flow: string;
  channel: string;
  /**
   * Payment rails supported by this promo.
   * Derived from payment_flow: instore→qr, instore_nfc→nfc, online→online.
   * e.g. "qr; nfc; online"
   */
  allowed_rails: string;

  // Freshness
  /** Raw value from RSC: "running" | "finished" | "future" */
  calculated_status: string;
  is_active: boolean;
  is_stale: boolean;
  freshness_reason: string;

  // Eligibility artifact (primary artifact for this promo)
  artifact_url: string;
  artifact_type: string;

  /** Full legal terms text (plain text, HTML stripped). Contains tope, conditions, exclusions. */
  terms_text_raw: string;

  raw_snippet: string;
  scraped_at: string;
}

// ─── Audit report ──────────────────────────────────────────────────────────────

export interface ModoAuditReport {
  scrapedAt: string;
  discovery: {
    sitemapUrl: string;
    slugsFound: number;
    slugsAttempted: number;
    slugsSucceeded: number;
    slugsFailed: number;
    failedSlugs: Array<{ slug: string; httpStatus: number; error?: string }>;
  };
  extraction: {
    withRscData: number;
    withJsonLdOnly: number;
    withParseError: number;
    parseErrors: string[];
  };
  promoCoverage: {
    totalRaw: number;
    totalAfterDedupe: number;
    active: number;
    stale: number;
    future: number;
    duplicatesRemoved: number;
    byStatus: Record<string, number>;
    byTriggerType: Record<string, number>;
    byPaymentFlow: Record<string, number>;
  };
  fieldCompleteness: {
    missingRscData: number;
    missingBanks: number;
    missingPaymentMethods: number;
    missingDiscountInfo: number;
    missingDates: number;
    missingWhere: number;
  };
  artifactCoverage: {
    totalArtifacts: number;
    byType: Record<string, number>;
    promosWithArtifact: number;
    promosWithoutArtifact: number;
  };
  gapAnalysis: {
    riskLevel: 'low' | 'medium' | 'high';
    riskReason: string;
    notes: string[];
  };
}
