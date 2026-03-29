/**
 * artifacts.ts — Classify and normalize eligibility artifact URLs.
 *
 * An eligibility artifact is any external resource that tells the user
 * which merchants / locations / products qualify for a MODO promo:
 *   - PDF file with list of participating stores
 *   - External merchant locator URL (e.g. a brand's own "find a store" page)
 *   - External promo landing page with eligibility details
 *
 * Called after extract.ts: receives raw { url, label } pairs scraped from
 * each promo page and returns typed EligibilityArtifact records.
 */

import type { RawModoCandidate, EligibilityArtifact } from './types.js';

// ─── Artifact type classification ─────────────────────────────────────────────

function classifyArtifact(url: string, label: string): EligibilityArtifact['artifact_type'] {
  const u = url.toLowerCase();
  const l = label.toLowerCase();

  if (u.endsWith('.pdf') || u.includes('.pdf?')) return 'pdf';
  if (/comercios|adheridos|establecimientos|locales|tiendas/.test(u + l)) return 'merchant_list_url';
  if (url.startsWith('http')) return 'external_url';
  return 'unknown';
}

// ─── Build artifacts for one candidate ────────────────────────────────────────

export function buildArtifacts(
  promoKey: string,
  candidate: RawModoCandidate,
): EligibilityArtifact[] {
  const results: EligibilityArtifact[] = [];
  const promoId = candidate.rscData?.promotion?.promotion?.id ?? null;

  for (const { url, label } of candidate.rawArtifactUrls) {
    results.push({
      promo_key:     promoKey,
      promo_id:      promoId,
      slug:          candidate.slug,
      artifact_type: classifyArtifact(url, label),
      artifact_url:  url,
      label,
    });
  }

  return results;
}
