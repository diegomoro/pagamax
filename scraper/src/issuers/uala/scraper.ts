#!/usr/bin/env node
/**
 * scraper.ts — Ualá promotions scraper
 *
 * Source: _next/data SSR JSON endpoints (Level 1 — Contentful CMS via Next.js proxy)
 * No auth required. BuildId extracted live from HTML.
 *
 * Run:
 *   npx tsx src/issuers/uala/scraper.ts [--out ./output_uala] [--dry-run]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fetchAllPromos } from './extract.js';
import { normalize } from './normalize.js';
import type { UalaPromo } from './types.js';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const getArg = (flag: string, def: string) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1]! : def;
};
const outDir = resolve(getArg('--out', './output_uala'));
const dryRun = args.includes('--dry-run');

mkdirSync(outDir, { recursive: true });

// ─── CSV writer ───────────────────────────────────────────────────────────────

const PROMO_COLS: Array<keyof UalaPromo> = [
  'promo_key',
  'source_id',
  'issuer',
  'slug',
  'spec_index',
  'source_url',
  'source_level',
  'source_type',
  'discovery_path',
  'confidence_score',
  'promo_title',
  'merchant_name',
  'merchant_logo_url',
  'category',
  'subcategory',
  'discount_percent',
  'discount_amount_ars',
  'discount_type',
  'promo_family',
  'cap_amount_ars',
  'cap_period',
  'valid_from',
  'valid_to',
  'validity_text_raw',
  'day_pattern',
  'payment_method',
  'instrument_required',
  'card_brand_scope',
  'channel',
  'reimbursement_timing_raw',
  'coupon_code',
  'terms_text_raw',
  'exclusions_raw',
  'cta_url',
  'freshness_status',
  'is_active',
  'scraped_at',
  'raw_snippet',
];

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function writeCsv(path: string, rows: UalaPromo[]): void {
  const header = PROMO_COLS.join(',') + '\n';
  const lines  = rows.map(r => PROMO_COLS.map(c => csvCell(r[c])).join(','));
  writeFileSync(path, header + lines.join('\n') + '\n', 'utf8');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const scrapedAt = new Date().toISOString();
  const dateStr   = scrapedAt.slice(0, 10);

  process.stderr.write(`[uala/scraper] out:     ${outDir}\n`);
  process.stderr.write(`[uala/scraper] dry-run: ${dryRun}\n\n`);

  const rawPromos = await fetchAllPromos({
    onProgress: msg => process.stderr.write(`  ${msg}\n`),
  });
  process.stderr.write(`\n[uala/scraper] Fetched ${rawPromos.length} raw spec rows\n`);

  const fetchErrors = rawPromos.filter(r => r.fetchError).length;
  if (fetchErrors > 0) process.stderr.write(`[uala/scraper] Fetch errors: ${fetchErrors}\n`);

  const promos = rawPromos
    .filter(r => !r.fetchError)
    .map(r => normalize(r, scrapedAt));

  if (dryRun) {
    process.stderr.write('\n[uala/scraper] DRY RUN — printing rows, no files written:\n');
    for (const p of promos) {
      process.stderr.write(
        `  ${p.promo_key}\n` +
        `    title:      ${p.promo_title}\n` +
        `    merchant:   ${p.merchant_name}  category=${p.category}\n` +
        `    discount:   ${p.discount_percent ?? '-'}%  type=${p.discount_type}  family=${p.promo_family}\n` +
        `    cap:        ${p.cap_amount_ars ?? 'sin_tope'}  period=${p.cap_period}\n` +
        `    channel:    ${p.channel}  instrument=${p.instrument_required}  days=${p.day_pattern}\n` +
        `    dates:      ${p.valid_from} → ${p.valid_to}  freshness=${p.freshness_status}\n` +
        `    coupon:     ${p.coupon_code || '(none)'}\n` +
        `    confidence: ${p.confidence_score}  source_level=${p.source_level}\n` +
        `\n`
      );
    }
    return;
  }

  // ─── NDJSON ───────────────────────────────────────────────────────────────
  const ndjsonPath = join(outDir, `uala-${dateStr}.ndjson`);
  writeFileSync(ndjsonPath, promos.map(p => JSON.stringify(p)).join('\n') + '\n', 'utf8');
  process.stderr.write(`[uala/scraper] NDJSON → ${ndjsonPath}\n`);

  // ─── CSV ──────────────────────────────────────────────────────────────────
  const csvPath = join(outDir, `uala-${dateStr}.csv`);
  writeCsv(csvPath, promos);
  process.stderr.write(`[uala/scraper] CSV   → ${csvPath}\n`);

  // ─── Raw JSON ─────────────────────────────────────────────────────────────
  const rawPath = join(outDir, `uala-${dateStr}-raw.json`);
  writeFileSync(rawPath, JSON.stringify(rawPromos, null, 2), 'utf8');
  process.stderr.write(`[uala/scraper] Raw   → ${rawPath}\n`);

  // ─── Audit ───────────────────────────────────────────────────────────────
  const byFreshness: Record<string, number> = {};
  const byFamily: Record<string, number>    = {};
  const byChannel: Record<string, number>   = {};
  const byInstrument: Record<string, number> = {};
  const byConfidence: Record<string, number> = { high: 0, medium: 0, low: 0 };

  let missingFrom = 0, missingTo = 0, missingPct = 0, missingInstrument = 0;

  for (const p of promos) {
    byFreshness[p.freshness_status]  = (byFreshness[p.freshness_status]  ?? 0) + 1;
    byFamily[p.promo_family]         = (byFamily[p.promo_family]         ?? 0) + 1;
    byChannel[p.channel]             = (byChannel[p.channel]             ?? 0) + 1;
    byInstrument[p.instrument_required] = (byInstrument[p.instrument_required] ?? 0) + 1;

    if (p.confidence_score >= 0.85)      byConfidence.high++;
    else if (p.confidence_score >= 0.60) byConfidence.medium++;
    else                                  byConfidence.low++;

    if (!p.valid_from)           missingFrom++;
    if (!p.valid_to)             missingTo++;
    if (!p.discount_percent)     missingPct++;
    if (p.instrument_required === 'unknown') missingInstrument++;
  }

  const audit = {
    run_at:          scrapedAt,
    total_promos:    promos.length,
    total_slugs:     new Set(promos.map(p => p.slug)).size,
    fetch_errors:    fetchErrors,
    source_level:    1,
    source_type:     'nextjs_ssr',

    coverage: {
      by_freshness:     byFreshness,
      by_promo_family:  byFamily,
      by_channel:       byChannel,
      by_instrument:    byInstrument,
    },

    field_completeness: {
      missing_valid_from:       missingFrom,
      missing_valid_to:         missingTo,
      missing_discount_percent: missingPct,
      missing_instrument:       missingInstrument,
    },

    confidence: byConfidence,

    gap_analysis: {
      note: 'Ualá exposes only currently active promotions via its CMS. ' +
            'No historical or expired promos are accessible without Contentful API credentials. ' +
            'Blog/help pages may contain additional promo mentions but are unstructured (Level 3). ' +
            'Check /locales-adheridos-ualabis-promo35-26 for merchant location data (not yet scraped).',
      unexplored: [
        'https://www.uala.com.ar/locales-adheridos-ualabis-promo35-26  (Ualá Bis partner locations)',
        'https://www.uala.com.ar/blog (Level 3 — unstructured promo mentions)',
        'Contentful CMS REST API (requires server-side access token — not exposed in client bundle)',
      ],
    },
  };

  const auditPath = join(outDir, `uala-${dateStr}-audit.json`);
  writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');
  process.stderr.write(`[uala/scraper] Audit → ${auditPath}\n`);

  // ─── Summary ─────────────────────────────────────────────────────────────
  process.stderr.write('\n=== Summary ===\n');
  process.stderr.write(`Total promo rows: ${promos.length} (from ${new Set(promos.map(p=>p.slug)).size} slugs)\n`);
  process.stderr.write(`Fetch errors: ${fetchErrors}\n`);
  process.stderr.write(`By freshness: ${JSON.stringify(byFreshness)}\n`);
  process.stderr.write(`By family: ${JSON.stringify(byFamily)}\n`);
  process.stderr.write(`By channel: ${JSON.stringify(byChannel)}\n`);
  process.stderr.write(`By instrument: ${JSON.stringify(byInstrument)}\n`);
  process.stderr.write(`Confidence: ${JSON.stringify(byConfidence)}\n`);
  process.stderr.write(`With discount_percent: ${promos.length - missingPct}/${promos.length}\n`);
  process.stderr.write(`With valid dates: ${promos.length - missingFrom}/${promos.length} from, ${promos.length - missingTo}/${promos.length} to\n`);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
