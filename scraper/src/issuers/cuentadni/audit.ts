/**
 * audit.ts — Build the completeness audit report for a Cuenta DNI scrape run.
 *
 * The audit is written to cuentadni-YYYY-MM-DD-audit.json and covers:
 *  - Hub coverage (cards seen vs. resolved to API data)
 *  - Surface coverage (rubros, buscadores, campaign pages)
 *  - Promo coverage (total, active, stale, by-rubro, by-page-type)
 *  - Field completeness (% of promos with key fields populated)
 *  - Gap analysis (known limitations: merchant lists, js-heavy pages, etc.)
 */

import type { AuditReport, CuenaDNIPromo } from './types.js';
import type { DiscoverResult } from './discover.js';
import type { ExtractResult } from './extract.js';

// ─── Known gaps ───────────────────────────────────────────────────────────────

const KNOWN_MERCHANT_LIST_GAPS = [
  'GetLocalesListadoByIdBuscador (POST) → HTTP 500 — merchant lists not accessible via direct HTTP',
];

const KNOWN_JS_HEAVY_PAGES = [
  'https://www.bancoprovincia.com.ar/web/vuelta_clases_2026',
];

// ─── Build audit ──────────────────────────────────────────────────────────────

export function buildAudit(
  discoverResult: DiscoverResult,
  extractResult: ExtractResult,
  promos: CuenaDNIPromo[],
  dedupedPromos: CuenaDNIPromo[],
  scrapedAt: string,
): AuditReport {
  const { stats } = extractResult;

  // Hub coverage
  const hubTotal = discoverResult.hubBeneficioIds.length;
  const allBeneficioIds = new Set(dedupedPromos.map(p => p.beneficio_id).filter(Boolean));
  const hubMissing = discoverResult.hubBeneficioIds
    .filter(id => !allBeneficioIds.has(id))
    .map(id => String(id));

  // Promo coverage by rubro
  const byRubro: Record<string, number> = {};
  const byPageType: Record<string, number> = {};
  let active = 0, stale = 0;

  for (const p of dedupedPromos) {
    const rubroKey = p.rubro_id !== null ? String(p.rubro_id) : 'hub_only';
    byRubro[rubroKey] = (byRubro[rubroKey] ?? 0) + 1;
    byPageType[p.source_page_type] = (byPageType[p.source_page_type] ?? 0) + 1;
    if (p.is_active) active++;
    if (p.is_stale) stale++;
  }

  // Field completeness
  const total = dedupedPromos.length;
  const missingDiscountPct = dedupedPromos.filter(p => p.discount_percent === null).length;
  const missingCap = dedupedPromos.filter(p => p.cap_amount_ars === null).length;
  const missingDates = dedupedPromos.filter(p => !p.valid_from && !p.valid_to).length;
  const missingPaymentRails = dedupedPromos.filter(p => !p.allowed_rails).length;
  const missingLegalText = dedupedPromos.filter(p => !p.terms_text_raw).length;

  // Zero-result sources
  const zeroResultSources = stats.rubrosFailed.map(id => `rubro_${id}`);

  // Risk level
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  let riskReason = 'All active rubro IDs successfully fetched.';

  if (stats.rubrosFailed.length > 0) {
    riskLevel = 'medium';
    riskReason = `${stats.rubrosFailed.length} rubro(s) failed to fetch: [${stats.rubrosFailed.join(', ')}]`;
  }
  if (hubMissing.length > 5) {
    riskLevel = 'high';
    riskReason += ` ${hubMissing.length} hub card IDs could not be resolved.`;
  }

  // Fetch success/fail counts for surface coverage
  const fetchSuccess = stats.rubrosFetched.length + stats.data2Fetched;
  const fetchFailed: Array<{ url: string; status: number; error?: string }> = [
    ...stats.rubrosFailed.map(id => ({
      url: `GetBeneficioByRubro?idRubro=${id}`,
      status: 0,
      error: 'Returned empty array',
    })),
  ];

  return {
    scrapedAt,
    hubCoverage: {
      cardsSeen: hubTotal,
      cardsWithApiData: hubTotal - hubMissing.length,
      cardsMissingApiData: hubMissing,
    },
    surfaceCoverage: {
      rubroIds: discoverResult.activeRubroIds,
      buscadoresFound: 6, // known static count from seed URLs
      campaignPagesFound: 2, // /web/especialdetemporada + /web/CDNI_especial_localidades
      jsHeavyPages: KNOWN_JS_HEAVY_PAGES,
      fetchSuccess,
      fetchFailed,
    },
    promoCoverage: {
      totalRaw: promos.length,
      totalAfterDedupe: dedupedPromos.length,
      active,
      stale,
      duplicatesRemoved: promos.length - dedupedPromos.length,
      zeroResultSources,
      byRubro,
      byPageType,
    },
    fieldCompleteness: {
      missingDiscountPct,
      missingCap,
      missingDates,
      missingPaymentRails,
      missingLegalText,
    },
    gapAnalysis: {
      merchantListsUnavailable: KNOWN_MERCHANT_LIST_GAPS,
      jsHeavyPagesNotScraped: KNOWN_JS_HEAVY_PAGES,
      unknownRubroIds: `Probed IDs 1–40; empty IDs: [${discoverResult.emptyRubroIds.slice(0, 10).join(', ')}${discoverResult.emptyRubroIds.length > 10 ? '...' : ''}]`,
      riskLevel,
      riskReason,
    },
  };
}
