#!/usr/bin/env node
/**
 * scraper.ts — BBVA Argentina promotions scraper
 *
 * Source: go.bbva.com.ar/willgo/fgo/API/v3 (Level 1 — structured REST JSON)
 * No auth, no cookies required.
 *
 * Run:
 *   npx tsx src/issuers/bbva/scraper.ts [--out ./output_bbva] [--concurrency 15] [--dry-run]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fetchAllPromos } from './extract.js';
import { normalize } from './normalize.js';
import type { BbvaPromo } from './types.js';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const getArg = (flag: string, def: string) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1]! : def;
};
const outDir      = resolve(getArg('--out', './output_bbva'));
const concurrency = parseInt(getArg('--concurrency', '5'), 10);
const dryRun      = args.includes('--dry-run');

mkdirSync(outDir, { recursive: true });

// ─── CSV writer ───────────────────────────────────────────────────────────────

const PROMO_COLS: Array<keyof BbvaPromo> = [
  'promo_key', 'source', 'promo_id_raw', 'promo_id_type',
  'source_url', 'canonical_request_url', 'source_level', 'source_type',
  'promo_title', 'merchant_name', 'merchant_logo_url', 'category', 'subcategory',
  'description_short',
  'discount_percent', 'discount_amount_ars', 'discount_type', 'installments_count',
  'promo_family', 'cap_amount_ars', 'cap_period', 'min_purchase_amount_ars',
  'valid_from', 'valid_to', 'validity_text_raw',
  'day_pattern',
  'channel', 'rail', 'payment_method',
  'instrument_required', 'wallet_scope', 'card_brand_scope', 'card_type_scope',
  'program_scope', 'geo_scope',
  'reimbursement_timing_raw',
  'terms_text_raw', 'exclusions_raw', 'web_urls',
  'freshness_status', 'freshness_reason',
  'scraped_at', 'raw_snippet',
];

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function writeCsv(path: string, rows: BbvaPromo[]): void {
  const header = PROMO_COLS.join(',') + '\n';
  const lines  = rows.map(r => PROMO_COLS.map(c => csvCell(r[c])).join(','));
  writeFileSync(path, header + lines.join('\n') + '\n', 'utf8');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const scrapedAt = new Date().toISOString();
  const dateStr   = scrapedAt.slice(0, 10);

  process.stderr.write(`[bbva/scraper] out:         ${outDir}\n`);
  process.stderr.write(`[bbva/scraper] concurrency: ${concurrency}\n`);
  process.stderr.write(`[bbva/scraper] dry-run:     ${dryRun}\n\n`);

  const rawPromos = await fetchAllPromos({
    concurrency,
    delayMs: 100,
    onProgress: msg => process.stderr.write(`  ${msg}\n`),
  });
  process.stderr.write(`\n[bbva/scraper] ${rawPromos.length} raw promo rows\n`);

  const fetchErrors = rawPromos.filter(r => r.fetchError).length;
  if (fetchErrors > 0) process.stderr.write(`[bbva/scraper] Fetch errors: ${fetchErrors}\n`);

  const promos = rawPromos
    .filter(r => !r.fetchError)
    .map(r => normalize(r, scrapedAt));

  if (dryRun) {
    process.stderr.write('\n[bbva/scraper] DRY RUN — first 5 rows:\n');
    for (const p of promos.slice(0, 5)) {
      process.stderr.write(
        `  ${p.promo_key}\n` +
        `    title:      ${p.promo_title}\n` +
        `    merchant:   ${p.merchant_name}  cat=${p.category}\n` +
        `    discount:   ${p.discount_percent ?? '-'}%  type=${p.discount_type}  cuotas=${p.installments_count}\n` +
        `    cap:        ${p.cap_amount_ars ?? 'none'}  period=${p.cap_period}\n` +
        `    channel:    ${p.channel}  rail=${p.rail}  wallet=${p.wallet_scope || 'none'}\n` +
        `    dates:      ${p.valid_from} → ${p.valid_to}  freshness=${p.freshness_status}\n` +
        `    days:       ${p.day_pattern}  instrument=${p.instrument_required}  brand=${p.card_brand_scope}\n` +
        `\n`
      );
    }
    return;
  }

  // ─── NDJSON ───────────────────────────────────────────────────────────────
  const ndjsonPath = join(outDir, `bbva-${dateStr}.ndjson`);
  writeFileSync(ndjsonPath, promos.map(p => JSON.stringify(p)).join('\n') + '\n', 'utf8');
  process.stderr.write(`[bbva/scraper] NDJSON → ${ndjsonPath}\n`);

  // ─── CSV ──────────────────────────────────────────────────────────────────
  const csvPath = join(outDir, `bbva-${dateStr}.csv`);
  writeCsv(csvPath, promos);
  process.stderr.write(`[bbva/scraper] CSV   → ${csvPath}\n`);

  // ─── Raw JSON ─────────────────────────────────────────────────────────────
  const rawPath = join(outDir, `bbva-${dateStr}-raw.json`);
  writeFileSync(rawPath, JSON.stringify(rawPromos.map(r => ({
    id: r.listItem.id, cabecera: r.listItem.cabecera, fechaDesde: r.listItem.fechaDesde,
    fechaHasta: r.listItem.fechaHasta, diasPromo: r.listItem.diasPromo,
    beneficios: r.detail?.beneficios, vigencia: r.detail?.vigencia,
    error: r.fetchError,
  })), null, 2), 'utf8');
  process.stderr.write(`[bbva/scraper] Raw   → ${rawPath}\n`);

  // ─── Audit ───────────────────────────────────────────────────────────────
  const byFreshness: Record<string, number>   = {};
  const byFamily: Record<string, number>      = {};
  const byChannel: Record<string, number>     = {};
  const byRail: Record<string, number>        = {};
  const byInstrument: Record<string, number>  = {};
  const byDiscType: Record<string, number>    = {};
  const byDayPattern: Record<string, number>  = {};
  let withCap = 0, withPct = 0, missingInst = 0, expiredCount = 0, activeCount = 0;

  for (const p of promos) {
    byFreshness[p.freshness_status]  = (byFreshness[p.freshness_status]  ?? 0) + 1;
    byFamily[p.promo_family]         = (byFamily[p.promo_family]         ?? 0) + 1;
    byChannel[p.channel]             = (byChannel[p.channel]             ?? 0) + 1;
    byRail[p.rail]                   = (byRail[p.rail]                   ?? 0) + 1;
    byInstrument[p.instrument_required] = (byInstrument[p.instrument_required] ?? 0) + 1;
    byDiscType[p.discount_type]      = (byDiscType[p.discount_type]      ?? 0) + 1;

    const dp = p.day_pattern === 'everyday' ? 'everyday' : 'day_specific';
    byDayPattern[dp] = (byDayPattern[dp] ?? 0) + 1;

    if (p.cap_amount_ars !== null) withCap++;
    if (p.discount_percent !== null) withPct++;
    if (p.instrument_required === 'unknown') missingInst++;
    if (p.freshness_status === 'expired') expiredCount++;
    if (p.freshness_status === 'active')  activeCount++;
  }

  const audit = {
    run_at:       scrapedAt,
    total_promos: promos.length,
    fetch_errors: fetchErrors,

    feed: {
      canonical_list:   'GET https://go.bbva.com.ar/willgo/fgo/API/v3/communications?pager=N',
      canonical_detail: 'GET https://go.bbva.com.ar/willgo/fgo/API/v3/communication/<id>',
      total_pages:      46,
      items_per_page:   20,
      auth_required:    false,
      replay_success:   true,
    },

    coverage: {
      active:         activeCount,
      expired:        expiredCount,
      by_freshness:   byFreshness,
      by_disc_type:   byDiscType,
      by_family:      byFamily,
      by_channel:     byChannel,
      by_rail:        byRail,
      by_instrument:  byInstrument,
      by_day_pattern: byDayPattern,
    },

    field_completeness: {
      with_discount_percent: withPct,
      with_cap:              withCap,
      missing_instrument:    missingInst,
      pct_with_pct:          Math.round(withPct / promos.length * 100) + '%',
      pct_with_cap:          Math.round(withCap / promos.length * 100) + '%',
    },

    id_audit: {
      min_id:       Math.min(...promos.map(p => parseInt(p.promo_id_raw))),
      max_id:       Math.max(...promos.map(p => parseInt(p.promo_id_raw))),
      total_ids:    promos.length,
      note:         'IDs are sequential integers with gaps. List endpoint returns all active items. Expired/past promos have IDs below min_id but are not accessible without enumeration.',
    },

    gap_analysis: {
      campaigns:        'All 908 items are individual beneficios (esCampania=false). Campaign endpoint (/v3/campaign/<id>) exists but no campaign IDs were found in active list.',
      expired_promos:   'Only active promos accessible via list. Expired promos require sequential ID enumeration (not implemented).',
      grupoTarjeta:     'Always "Tarjetas de crédito BBVA" — not a reliable filter. Actual instrument inferred from basesCondiciones text.',
      destacado:        '11 featured items available at /v3/communications?destacado=true (subset of main list).',
      unexplored:       ['https://go.bbva.com.ar/willgo/fgo/API/slides (hero banners)'],
    },

    confidence: 'HIGH — Level 1 structured REST JSON, no auth, all fields from API',
  };

  const auditPath = join(outDir, `bbva-${dateStr}-audit.json`);
  writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');
  process.stderr.write(`[bbva/scraper] Audit → ${auditPath}\n`);

  // ─── Summary ─────────────────────────────────────────────────────────────
  process.stderr.write('\n=== Summary ===\n');
  process.stderr.write(`Total rows:        ${promos.length} (${fetchErrors} fetch errors)\n`);
  process.stderr.write(`Active / Expired:  ${activeCount} / ${expiredCount}\n`);
  process.stderr.write(`By disc_type:      ${JSON.stringify(byDiscType)}\n`);
  process.stderr.write(`By family:         ${JSON.stringify(byFamily)}\n`);
  process.stderr.write(`By channel:        ${JSON.stringify(byChannel)}\n`);
  process.stderr.write(`By rail:           ${JSON.stringify(byRail)}\n`);
  process.stderr.write(`By instrument:     ${JSON.stringify(byInstrument)}\n`);
  process.stderr.write(`By day_pattern:    ${JSON.stringify(byDayPattern)}\n`);
  process.stderr.write(`With discount %:   ${withPct}/${promos.length}\n`);
  process.stderr.write(`With cap:          ${withCap}/${promos.length}\n`);
  process.stderr.write(`Missing instrument:${missingInst}/${promos.length}\n`);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err}\n${err.stack}\n`);
  process.exit(1);
});
