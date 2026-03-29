#!/usr/bin/env node
/**
 * scraper.ts — MODO promotions scraper entry point.
 *
 * Outputs:
 *   modo-YYYY-MM-DD.ndjson           — one active promo per line
 *   modo-YYYY-MM-DD.csv              — flat CSV (same columns)
 *   modo-YYYY-MM-DD-artifacts.ndjson — eligibility artifacts (PDFs, merchant URLs)
 *   modo-YYYY-MM-DD-artifacts.csv    — eligibility artifacts CSV
 *   modo-YYYY-MM-DD-audit.json       — completeness audit report
 *
 * Usage:
 *   npx tsx src/issuers/modo/scraper.ts
 *   npx tsx src/issuers/modo/scraper.ts --out ./output
 *   npx tsx src/issuers/modo/scraper.ts --limit 50       # test run: first 50 slugs
 *   npx tsx src/issuers/modo/scraper.ts --skip-discover  # use cached slug list (not yet implemented)
 */

import { createWriteStream, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { discover }           from './discover.js';
import { extract }            from './extract.js';
import { normalize, deduplicate } from './normalize.js';
import { buildArtifacts }     from './artifacts.js';
import { buildAudit }         from './audit.js';
import type { ModoPromo, EligibilityArtifact } from './types.js';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

const outDir = (() => {
  const idx = args.indexOf('--out');
  return idx !== -1 && args[idx + 1] ? resolve(args[idx + 1]!) : process.cwd();
})();

const limitArg = (() => {
  const idx = args.indexOf('--limit');
  if (idx !== -1 && args[idx + 1]) {
    const n = parseInt(args[idx + 1]!, 10);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
})();

const skipDiscover = args.includes('--skip-discover');

// ─── CSV helpers ──────────────────────────────────────────────────────────────

const PROMO_COLS: Array<keyof ModoPromo> = [
  'source', 'source_family', 'source_url', 'discovery_path',
  'promo_key', 'promo_id', 'slug',
  'promo_title', 'description_short', 'where',
  'banks', 'bank_names', 'bcra_codes',
  'payment_methods', 'card_networks', 'card_types',
  'trigger_type', 'discount_percent', 'discount_type',
  'installments', 'installment_type', 'installment_coefficient',
  'cap_amount_ars', 'cap_period', 'min_purchase_amount_ars',
  'days_of_week', 'valid_from', 'valid_to',
  'payment_flow', 'channel', 'allowed_rails',
  'calculated_status', 'is_active', 'is_stale', 'freshness_reason',
  'artifact_url', 'artifact_type',
  'terms_text_raw',
  'raw_snippet', 'scraped_at',
];

const ARTIFACT_COLS: Array<keyof EligibilityArtifact> = [
  'promo_key', 'promo_id', 'slug',
  'artifact_type', 'artifact_url', 'label',
];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.includes(',') || s.includes('\n') || s.includes('"')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cols: unknown[]): string {
  return cols.map(csvCell).join(',') + '\n';
}

async function writeCsv<T extends object>(
  path: string,
  cols: Array<keyof T>,
  rows: T[],
): Promise<void> {
  const stream = createWriteStream(path, { encoding: 'utf8' });
  stream.write(csvRow(cols));
  for (const row of rows) stream.write(csvRow(cols.map(c => row[c])));
  return new Promise((res, rej) => stream.end((err?: Error | null) => err ? rej(err) : res()));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const scrapedAt = new Date().toISOString();
  const dateSlug  = scrapedAt.slice(0, 10);

  mkdirSync(outDir, { recursive: true });

  const ndjsonPath    = join(outDir, `modo-${dateSlug}.ndjson`);
  const csvPath       = join(outDir, `modo-${dateSlug}.csv`);
  const artNdjsonPath = join(outDir, `modo-${dateSlug}-artifacts.ndjson`);
  const artCsvPath    = join(outDir, `modo-${dateSlug}-artifacts.csv`);
  const auditPath     = join(outDir, `modo-${dateSlug}-audit.json`);

  process.stderr.write(`MODO scraper — ${scrapedAt}\n`);
  process.stderr.write(`Output dir: ${outDir}\n`);
  if (limitArg !== undefined) process.stderr.write(`Limit: first ${limitArg} slugs\n`);
  process.stderr.write('\n');

  // ── Step 1: Discover ────────────────────────────────────────────────────────
  process.stderr.write('=== Discover phase ===\n');
  let discoverResult;
  if (skipDiscover) {
    // Placeholder: in a future iteration, load cached slug list from file
    process.stderr.write('--skip-discover: not yet implemented, running discover anyway\n');
    discoverResult = await discover();
  } else {
    discoverResult = await discover();
  }
  process.stderr.write(`Slugs to process: ${discoverResult.slugs.length}\n`);

  // ── Step 2: Extract ─────────────────────────────────────────────────────────
  process.stderr.write('\n=== Extract phase ===\n');
  const extractOpts: { limit?: number; concurrency?: number } = {};
  if (limitArg !== undefined) extractOpts.limit = limitArg;
  const extractResult = await extract(discoverResult.slugs, scrapedAt, extractOpts);
  process.stderr.write(`\nCandidates: ${extractResult.candidates.length}\n`);

  // ── Step 3: Normalize ───────────────────────────────────────────────────────
  process.stderr.write('\n=== Normalize phase ===\n');
  const promos = extractResult.candidates.map(normalize);

  // ── Step 4: Deduplicate ─────────────────────────────────────────────────────
  const { deduped, removedCount } = deduplicate(promos);
  const activeDeduped = deduped.filter(p => p.is_active);
  process.stderr.write(`Deduplicated: ${promos.length} → ${deduped.length} (removed ${removedCount})\n`);
  process.stderr.write(`Active: ${activeDeduped.length}, Stale: ${deduped.filter(p => p.is_stale).length}, Future: ${deduped.filter(p => !p.is_active && !p.is_stale).length}\n`);

  // ── Step 5: Build eligibility artifacts ────────────────────────────────────
  const allArtifacts: EligibilityArtifact[] = [];
  const candidateBySlug = new Map(extractResult.candidates.map(c => [c.slug, c]));

  for (const promo of activeDeduped) {
    const candidate = candidateBySlug.get(promo.slug);
    if (!candidate) continue;
    const arts = buildArtifacts(promo.promo_key, candidate);
    allArtifacts.push(...arts);
  }
  process.stderr.write(`Eligibility artifacts: ${allArtifacts.length}\n`);

  // ── Step 6: Write active promos NDJSON ─────────────────────────────────────
  process.stderr.write(`\nWriting NDJSON         → ${ndjsonPath}\n`);
  const ndjsonStream = createWriteStream(ndjsonPath, { encoding: 'utf8' });
  for (const p of activeDeduped) ndjsonStream.write(JSON.stringify(p) + '\n');
  await new Promise<void>((res, rej) =>
    ndjsonStream.end((err?: Error | null) => err ? rej(err) : res()),
  );

  // ── Step 7: Write active promos CSV ────────────────────────────────────────
  process.stderr.write(`Writing promos CSV     → ${csvPath}\n`);
  await writeCsv(csvPath, PROMO_COLS, activeDeduped);

  // ── Step 8: Write artifacts NDJSON + CSV ───────────────────────────────────
  process.stderr.write(`Writing artifacts NDJSON → ${artNdjsonPath}\n`);
  const artStream = createWriteStream(artNdjsonPath, { encoding: 'utf8' });
  for (const a of allArtifacts) artStream.write(JSON.stringify(a) + '\n');
  await new Promise<void>((res, rej) =>
    artStream.end((err?: Error | null) => err ? rej(err) : res()),
  );

  process.stderr.write(`Writing artifacts CSV  → ${artCsvPath}\n`);
  await writeCsv(artCsvPath, ARTIFACT_COLS, allArtifacts);

  // ── Step 9: Write audit ────────────────────────────────────────────────────
  process.stderr.write(`Writing audit          → ${auditPath}\n`);
  const audit = buildAudit(discoverResult, extractResult, promos, deduped, allArtifacts, scrapedAt);
  writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');

  // ── Summary ────────────────────────────────────────────────────────────────
  const staleCount  = deduped.filter(p => p.is_stale).length;
  const futureCount = deduped.filter(p => !p.is_active && !p.is_stale).length;
  const withBanks   = activeDeduped.filter(p => p.banks).length;
  const withInstall = activeDeduped.filter(p => p.installments !== null).length;
  const withCashback = activeDeduped.filter(p => p.trigger_type === 'cashback').length;

  process.stderr.write('\n=== Summary ===\n');
  process.stderr.write(`Active promos written: ${activeDeduped.length} (${staleCount} stale, ${futureCount} future excluded)\n`);
  process.stderr.write(`With bank data: ${withBanks} | Installments: ${withInstall} | Cashback: ${withCashback}\n`);
  process.stderr.write(`Artifacts: ${allArtifacts.length}\n`);
  process.stderr.write(`Risk: ${audit.gapAnalysis.riskLevel} — ${audit.gapAnalysis.riskReason}\n`);
  process.stderr.write('\nDone.\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
