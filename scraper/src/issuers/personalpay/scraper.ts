#!/usr/bin/env node
/**
 * scraper.ts — Personal Pay benefits scraper
 *
 * Strategy:
 *   1. List:   GET /api/benefits?offset=N&limit=100  → all 211 benefit IDs
 *   2. Detail: GET /api/benefits/<id>               → full legal, locations, levels
 *   3. Normalize → PpPromo[]
 *   4. Write NDJSON + CSV + raw JSON + audit
 *
 * Run:
 *   npx tsx src/issuers/personalpay/scraper.ts [--out ./output_pp] [--dry-run]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fetchAllBenefits } from './extract.js';
import { normalize } from './normalize.js';
import type { PpPromo } from './types.js';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const getArg = (flag: string, def: string) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1]! : def;
};
const outDir  = resolve(getArg('--out', './output_pp'));
const dryRun  = args.includes('--dry-run');

mkdirSync(outDir, { recursive: true });

// ─── CSV writer ───────────────────────────────────────────────────────────────

const PROMO_COLS: Array<keyof PpPromo> = [
  'source_id',
  'issuer',
  'promo_title',
  'merchant_name',
  'merchant_logo_url',
  'category',
  'heading',
  'channel_label',
  'discount_type',
  'discount_percent',
  'cap_amount_ars',
  'min_purchase_ars',
  'payment_description',
  'days_of_week',
  'allowed_rails',
  'payment_methods_str',
  'ecommerce_url',
  'locations_count',
  'levels_count',
  'max_discount_percent',
  'levels_json',
  'is_teco',
  'valid_from',
  'valid_to',
  'legal_text',
  'is_active',
  'is_stale',
  'freshness_reason',
  'scraped_at',
];

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function writeCsv(path: string, rows: PpPromo[]): void {
  const header = PROMO_COLS.join(',') + '\n';
  const lines  = rows.map(r => PROMO_COLS.map(c => csvCell(r[c])).join(','));
  writeFileSync(path, header + lines.join('\n') + '\n', 'utf8');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const scrapedAt = new Date().toISOString();
  const dateStr   = scrapedAt.slice(0, 10);

  process.stderr.write(`[pp/scraper] out:     ${outDir}\n`);
  process.stderr.write(`[pp/scraper] dry-run: ${dryRun}\n\n`);

  if (dryRun) {
    process.stderr.write('[pp/scraper] DRY RUN: fetching first 5 benefits only\n');
    const { fetchListPage, fetchDetail } = await import('./extract.js');
    const page = await fetchListPage(0, 5);
    const items = page.data.benefits;
    process.stderr.write(`  List: ${items.length} items\n`);
    for (const item of items) {
      let detail;
      try {
        detail = await fetchDetail(item.id);
      } catch(e) {
        process.stderr.write(`  Detail err ${item.id}: ${e}\n`);
      }
      const p = normalize({ listItem: item, detail }, scrapedAt);
      process.stderr.write(
        `  ${p.merchant_name} — ${p.promo_title} | ` +
        `type=${p.discount_type} pct=${p.discount_percent ?? '-'} ` +
        `cap=${p.cap_amount_ars ?? 'sin_tope'} min=${p.min_purchase_ars ?? '-'} ` +
        `rails=${p.allowed_rails} days=${p.days_of_week} ` +
        `levels=${p.levels_count} locs=${p.locations_count} ` +
        `valid=${p.valid_from}→${p.valid_to}\n`
      );
    }
    process.stderr.write('\n[pp/scraper] Dry run complete — no files written\n');
    return;
  }

  // Full run
  const rawBenefits = await fetchAllBenefits({
    concurrency: 8,
    onProgress: (done, total) => {
      process.stderr.write(`  detail: ${done}/${total}\r`);
    },
  });
  process.stderr.write(`\n[pp/scraper] Fetched ${rawBenefits.length} benefits\n`);

  const detailErrors = rawBenefits.filter(r => r.detailError).length;
  if (detailErrors > 0) {
    process.stderr.write(`[pp/scraper] Detail errors: ${detailErrors}\n`);
    for (const r of rawBenefits.filter(r => r.detailError)) {
      process.stderr.write(`  ${r.listItem.id} ${r.listItem.title}: ${r.detailError}\n`);
    }
  }

  const promos = rawBenefits.map(r => normalize(r, scrapedAt));

  // ─── NDJSON ───────────────────────────────────────────────────────────────
  const ndjsonPath = join(outDir, `personalpay-${dateStr}.ndjson`);
  writeFileSync(ndjsonPath, promos.map(p => JSON.stringify(p)).join('\n') + '\n', 'utf8');
  process.stderr.write(`[pp/scraper] NDJSON → ${ndjsonPath}\n`);

  // ─── CSV ──────────────────────────────────────────────────────────────────
  const csvPath = join(outDir, `personalpay-${dateStr}.csv`);
  writeCsv(csvPath, promos);
  process.stderr.write(`[pp/scraper] CSV   → ${csvPath}\n`);

  // ─── Raw JSON (debug) ─────────────────────────────────────────────────────
  const rawPath = join(outDir, `personalpay-${dateStr}-raw.json`);
  writeFileSync(rawPath, JSON.stringify(rawBenefits, null, 2), 'utf8');
  process.stderr.write(`[pp/scraper] Raw   → ${rawPath}\n`);

  // ─── Audit ───────────────────────────────────────────────────────────────
  const byType: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byRails: Record<string, number> = {};
  let withDates = 0, withCap = 0, withMin = 0, withLocations = 0, multiLevel = 0, tecoCount = 0;

  for (const p of promos) {
    byType[p.discount_type]  = (byType[p.discount_type]  ?? 0) + 1;
    byCategory[p.category]   = (byCategory[p.category]   ?? 0) + 1;
    byRails[p.allowed_rails || '(none)'] = (byRails[p.allowed_rails || '(none)'] ?? 0) + 1;
    if (p.valid_from) withDates++;
    if (p.cap_amount_ars !== null) withCap++;
    if (p.min_purchase_ars !== null) withMin++;
    if (p.locations_count > 0) withLocations++;
    if (p.levels_count > 1) multiLevel++;
    if (p.is_teco) tecoCount++;
  }

  const audit = {
    run_at: scrapedAt,
    total: promos.length,
    detail_errors: detailErrors,
    by_discount_type: byType,
    by_category: byCategory,
    by_allowed_rails: byRails,
    with_valid_from: withDates,
    with_cap: withCap,
    with_min_purchase: withMin,
    with_locations: withLocations,
    multi_level: multiLevel,
    is_teco: tecoCount,
  };

  const auditPath = join(outDir, `personalpay-${dateStr}-audit.json`);
  writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');
  process.stderr.write(`[pp/scraper] Audit → ${auditPath}\n`);

  // ─── Summary ─────────────────────────────────────────────────────────────
  process.stderr.write('\n=== Summary ===\n');
  process.stderr.write(`Total benefits: ${promos.length}\n`);
  process.stderr.write(`Detail errors:  ${detailErrors}\n`);
  process.stderr.write(`By discount_type: ${JSON.stringify(byType)}\n`);
  process.stderr.write(`By allowed_rails: ${JSON.stringify(byRails)}\n`);
  process.stderr.write(`With valid_from: ${withDates}/${promos.length}\n`);
  process.stderr.write(`With cap:        ${withCap}/${promos.length}\n`);
  process.stderr.write(`With min:        ${withMin}/${promos.length}\n`);
  process.stderr.write(`With locations:  ${withLocations}/${promos.length}\n`);
  process.stderr.write(`Multi-level:     ${multiLevel}/${promos.length}\n`);
  process.stderr.write(`Telecom (isTeco):${tecoCount}/${promos.length}\n`);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
