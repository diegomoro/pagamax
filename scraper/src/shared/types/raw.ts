import { z } from 'zod';

/**
 * PageType distinguishes where a candidate was extracted from.
 * 'landing' = promo card from the issuer's promotions listing page.
 * 'detail'  = full promo page visited after following a card link.
 */
export const PageTypeSchema = z.enum(['landing', 'detail']);
export type PageType = z.infer<typeof PageTypeSchema>;

/**
 * FetchResult is the raw output of BrowserManager or HttpFetcher.
 * It is the universal input to all extraction functions.
 * fetchMethod records which strategy was used, for observability.
 */
export const FetchResultSchema = z.object({
  url: z.string().url(),
  /** Final URL after any redirects. */
  finalUrl: z.string().url(),
  html: z.string(),
  statusCode: z.number(),
  fetchedAt: z.coerce.date(),
  fetchMethod: z.enum(['playwright', 'http']),
});
export type FetchResult = z.infer<typeof FetchResultSchema>;

/**
 * RawPromotionCandidate is everything extracted from a page BEFORE normalization.
 *
 * Design rules:
 * - All text fields are raw strings from the DOM. No parsing, no interpretation.
 * - Arrays of strings capture multiple occurrences (e.g., several benefit lines).
 * - rawPayload stores the full page HTML so normalization can be re-run offline.
 * - rawHtmlHash (SHA-256 of rawPayload) enables deduplication across scrape runs.
 *
 * Extension note: fields are intentionally broad so they cover all issuers.
 * Issuer-specific nuances are handled in each issuer's normalize.ts.
 */
export const RawPromotionCandidateSchema = z.object({
  issuerCode: z.string(),
  sourceUrl: z.string().url(),
  pageType: PageTypeSchema,
  title: z.string(),
  subtitle: z.string().optional(),
  merchantText: z.string().optional(),
  categoryText: z.string().optional(),
  /** One or more benefit description strings, e.g. ["30% de descuento", "hasta $5.000"] */
  benefitText: z.array(z.string()),
  /** Raw payment method strings, e.g. ["Naranja X", "tarjeta de crédito"] */
  paymentMethodText: z.array(z.string()),
  /** Raw rail strings, e.g. ["con QR", "NFC"] */
  railText: z.array(z.string()),
  /** Free-form validity/schedule text, e.g. "los martes de marzo" */
  validityText: z.string().optional(),
  /** Full legal text if found on the page (terms and conditions). */
  legalText: z.string().optional(),

  // ── Detail page fields (populated from promo detail pages) ──────────────
  /** Raw cap/limit text, e.g. "hasta $12.000 por persona por semana" */
  capText: z.string().optional(),
  /** Raw minimum purchase text, e.g. "Mínimo de compra: $5.000" or "Sin monto mínimo" */
  minPurchaseText: z.string().optional(),
  /** Raw expiration text, e.g. "Hasta el 31/MAR" */
  expirationText: z.string().optional(),
  /** Raw stackability text, e.g. "Es acumulable con otras promociones..." */
  stackableText: z.string().optional(),
  /** Named plan type, e.g. "Plan Turbo", "Plan Zeta" */
  planTypeText: z.string().optional(),
  /** Raw exclusion lines from the detail page */
  exclusionTexts: z.array(z.string()).optional(),
  /** Refund method text, e.g. "Reintegro inmediato en tu cuenta" */
  refundText: z.string().optional(),
  /** Scope text, e.g. "Presencial, en sucursales adheridas" */
  scopeText: z.string().optional(),
  /** Brand/promo image URL */
  imageUrl: z.string().optional(),
  /** Issuer's own promo identifier */
  issuerPromoId: z.string().optional(),

  /** All absolute URLs found within the candidate's card or detail page. */
  links: z.array(z.string()),
  /** SHA-256 hex digest of rawPayload. Used for change detection. */
  rawHtmlHash: z.string(),
  extractedAt: z.coerce.date(),
  /** Complete HTML of the source page. Never truncated. */
  rawPayload: z.string(),
});
export type RawPromotionCandidate = z.infer<typeof RawPromotionCandidateSchema>;
