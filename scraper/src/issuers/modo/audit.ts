/**
 * audit.ts — Build the completeness audit report for a MODO scrape run.
 *
 * Written to modo-YYYY-MM-DD-audit.json after every run.
 * Covers discovery coverage, extraction quality, promo field completeness,
 * artifact coverage, and gap analysis.
 */

import type { ModoAuditReport, ModoPromo, EligibilityArtifact } from './types.js';
import type { DiscoverResult } from './discover.js';
import type { ExtractResult } from './extract.js';

export function buildAudit(
  discoverResult: DiscoverResult,
  extractResult: ExtractResult,
  promos: ModoPromo[],
  dedupedPromos: ModoPromo[],
  artifacts: EligibilityArtifact[],
  scrapedAt: string,
): ModoAuditReport {
  const { stats } = extractResult;

  // Promo coverage
  let active = 0, stale = 0, future = 0;
  const byStatus:      Record<string, number> = {};
  const byTriggerType: Record<string, number> = {};
  const byPaymentFlow: Record<string, number> = {};

  for (const p of dedupedPromos) {
    if (p.is_active) active++;
    else if (p.is_stale) stale++;
    else future++;

    byStatus[p.calculated_status || 'unknown']     = (byStatus[p.calculated_status || 'unknown'] ?? 0) + 1;
    byTriggerType[p.trigger_type || 'unknown']     = (byTriggerType[p.trigger_type || 'unknown'] ?? 0) + 1;
    byPaymentFlow[p.payment_flow || 'unknown']     = (byPaymentFlow[p.payment_flow || 'unknown'] ?? 0) + 1;
  }

  // Field completeness
  const total             = dedupedPromos.length;
  const missingRscData    = dedupedPromos.filter(p => !p.promo_id).length;
  const missingBanks      = dedupedPromos.filter(p => !p.banks).length;
  const missingPM         = dedupedPromos.filter(p => !p.payment_methods).length;
  const missingDiscount   = dedupedPromos.filter(p => p.discount_percent === null && !p.installments).length;
  const missingDates      = dedupedPromos.filter(p => !p.valid_from && !p.valid_to).length;
  const missingWhere      = dedupedPromos.filter(p => !p.where).length;

  // Artifact coverage
  const promosWithArtifact  = new Set(artifacts.map(a => a.promo_key));
  const byArtifactType: Record<string, number> = {};
  for (const a of artifacts) {
    byArtifactType[a.artifact_type] = (byArtifactType[a.artifact_type] ?? 0) + 1;
  }

  // Risk level
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  let riskReason = 'All promos extracted and parsed successfully.';
  const notes: string[] = [];

  if (stats.failedHttp.length > stats.succeeded * 0.1) {
    riskLevel = 'high';
    riskReason = `High failure rate: ${stats.failedHttp.length}/${stats.attempted} slugs failed HTTP.`;
  } else if (stats.withParseError > stats.succeeded * 0.2) {
    riskLevel = 'medium';
    riskReason = `${stats.withParseError} promos could not be parsed (RSC layout may have changed).`;
  } else if (stats.failedHttp.length > 0) {
    riskLevel = 'low';
    riskReason = `${stats.failedHttp.length} slugs failed HTTP (likely deleted/archived promos).`;
  }

  if (stats.withJsonLdOnly > 0) {
    notes.push(`${stats.withJsonLdOnly} promos parsed from JSON-LD only (no RSC) — missing bank/payment data.`);
  }
  if (missingBanks > total * 0.3) {
    notes.push(`${missingBanks}/${total} active promos have no bank eligibility data.`);
  }
  notes.push(
    `rewards-handler.playdigital.com.ar: all endpoints return 404 — no cashback API available.`,
    `External chain merchant lists (non-modo.com.ar URLs) not scraped — flagged in artifact_type.`,
  );

  return {
    scrapedAt,
    discovery: {
      sitemapUrl: discoverResult.sitemapUrl,
      slugsFound: discoverResult.totalFound,
      slugsAttempted: stats.attempted,
      slugsSucceeded: stats.succeeded,
      slugsFailed:    stats.failedHttp.length,
      failedSlugs:    stats.failedHttp,
    },
    extraction: {
      withRscData:      stats.withRscData,
      withJsonLdOnly:   stats.withJsonLdOnly,
      withParseError:   stats.withParseError,
      parseErrors:      extractResult.candidates
        .filter(c => c.parseError)
        .slice(0, 20)
        .map(c => `${c.slug}: ${c.parseError}`),
    },
    promoCoverage: {
      totalRaw:          promos.length,
      totalAfterDedupe:  dedupedPromos.length,
      active,
      stale,
      future,
      duplicatesRemoved: promos.length - dedupedPromos.length,
      byStatus,
      byTriggerType,
      byPaymentFlow,
    },
    fieldCompleteness: {
      missingRscData,
      missingBanks,
      missingPaymentMethods: missingPM,
      missingDiscountInfo:   missingDiscount,
      missingDates,
      missingWhere,
    },
    artifactCoverage: {
      totalArtifacts:       artifacts.length,
      byType:               byArtifactType,
      promosWithArtifact:   promosWithArtifact.size,
      promosWithoutArtifact: active - Math.min(promosWithArtifact.size, active),
    },
    gapAnalysis: {
      riskLevel,
      riskReason,
      notes,
    },
  };
}
