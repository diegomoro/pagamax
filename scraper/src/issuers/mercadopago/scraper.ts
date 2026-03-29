#!/usr/bin/env node
/**
 * scraper.ts — Mercado Pago Benefits Hub scraper
 *
 * Uses saved session cookies from recon.ts to:
 * 1. Page through /dt/benefits-hub/api/hub/benefits/list (all 530 benefits)
 * 2. Fetch VDP detail for each (/dt/vdp/api/vdp/discount/<id>)
 * 3. Optionally fetch T&C HTML for dates / full legal text (--fetch-tyc)
 * 4. Write NDJSON + CSV output
 *
 * Run:
 *   npx tsx src/issuers/mercadopago/scraper.ts \
 *     [--cookies ./recon_out_mp/recon-cookies.json] \
 *     [--out ./output_mp] \
 *     [--fetch-tyc] \
 *     [--dry-run]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fetchAllBenefits } from './extract.js';
import { normalize } from './normalize.js';
import type { MpPromo } from './types.js';

// ─── CLI args ────────────────────────────────────────────────────────────────

const args        = process.argv.slice(2);
const getArg      = (flag: string, def: string) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1]! : def;
};
const cookiesFile = resolve(getArg('--cookies', './recon_out_mp/recon-cookies.json'));
const outDir      = resolve(getArg('--out', './output_mp'));
const fetchTyc    = args.includes('--fetch-tyc');
const dryRun      = args.includes('--dry-run');

mkdirSync(outDir, { recursive: true });

// ─── CSV writer ──────────────────────────────────────────────────────────────

const PROMO_COLS: Array<keyof MpPromo> = [
  'source_id',
  'issuer',
  'promo_title',
  'merchant_name',
  'merchant_logo_url',
  'category',
  'channel_label',
  'vdp_type',
  'is_meli_plus',
  'benefit_type',
  'discount_type',
  'discount_percent',
  'installments',
  'installment_type',
  'cap_amount_ars',
  'min_purchase_ars',
  'payment_description',
  'days_of_week',
  'flow_type',
  'flow_subtype',
  'allowed_rails',
  'payment_methods_str',
  'disclaimer',
  'store_locator_url',
  'tyc_url',
  'valid_from',
  'valid_to',
  'terms_text_raw',
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

function writeCsv(path: string, rows: MpPromo[]): void {
  const header = PROMO_COLS.join(',') + '\n';
  const lines  = rows.map(r => PROMO_COLS.map(c => csvCell(r[c])).join(','));
  writeFileSync(path, header + lines.join('\n') + '\n', 'utf8');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const scrapedAt = new Date().toISOString();
  const dateStr   = scrapedAt.slice(0, 10);

  process.stderr.write(`[mp/scraper] cookies: ${cookiesFile}\n`);
  process.stderr.write(`[mp/scraper] out:     ${outDir}\n`);
  process.stderr.write(`[mp/scraper] tyc:     ${fetchTyc}\n`);
  process.stderr.write(`[mp/scraper] dry-run: ${dryRun}\n\n`);

  // Load session cookies
  const savedCookies = JSON.parse(readFileSync(cookiesFile, 'utf8')) as Array<{name: string; value: string}>;
  const cookieHeader = savedCookies.map(c => `${c.name}=${c.value}`).join('; ');
  process.stderr.write(`[mp/scraper] Loaded ${savedCookies.length} cookies\n`);

  if (dryRun) {
    // Dry run: fetch only first list page + 3 VDPs
    process.stderr.write('[mp/scraper] DRY RUN: fetching page 1 + 3 VDPs only\n');
    const { fetchListPage, fetchVdp } = await import('./extract.js');
    const page1 = await fetchListPage(cookieHeader, 1, 12);
    process.stderr.write(`  List: ${page1.benefits.length} items, total=${page1.total}\n`);
    const promos: MpPromo[] = [];
    for (const item of page1.benefits.slice(0, 3)) {
      let vdp;
      try { vdp = await fetchVdp(cookieHeader, item.id); } catch(e) { process.stderr.write(`  VDP err: ${e}\n`); }
      const p = normalize({ listItem: item, vdp }, scrapedAt);
      process.stderr.write(`  ${p.merchant_name} — ${p.promo_title} | type=${p.discount_type} days=${p.days_of_week} rails=${p.allowed_rails} cap=${p.cap_amount_ars ?? 'sin_tope'} min=${p.min_purchase_ars ?? '-'}\n`);
      promos.push(p);
    }
    process.stderr.write('\n[mp/scraper] Dry run complete — no files written\n');
    return;
  }

  // Full run
  const rawBenefits = await fetchAllBenefits(cookieHeader, {
    fetchTyc,
    concurrency: 8,
    onProgress: (done, total) => {
      process.stderr.write(`  VDP: ${done}/${total}\r`);
    },
  });
  process.stderr.write(`\n[mp/scraper] Fetched ${rawBenefits.length} benefits\n`);

  const vdpErrors = rawBenefits.filter(r => r.vdpError).length;
  if (vdpErrors > 0) process.stderr.write(`[mp/scraper] VDP errors: ${vdpErrors}\n`);

  const promos = rawBenefits.map(r => normalize(r, scrapedAt));

  const activeCount = promos.filter(p => p.is_active).length;
  process.stderr.write(`[mp/scraper] Active: ${activeCount} / ${promos.length}\n`);

  // Write NDJSON
  const ndjsonPath = join(outDir, `mercadopago-${dateStr}.ndjson`);
  const ndjsonLines = promos.map(p => JSON.stringify(p)).join('\n') + '\n';
  writeFileSync(ndjsonPath, ndjsonLines, 'utf8');
  process.stderr.write(`[mp/scraper] NDJSON → ${ndjsonPath}\n`);

  // Write CSV
  const csvPath = join(outDir, `mercadopago-${dateStr}.csv`);
  writeCsv(csvPath, promos);
  process.stderr.write(`[mp/scraper] CSV   → ${csvPath}\n`);

  // Write raw JSON for debugging
  const rawPath = join(outDir, `mercadopago-${dateStr}-raw.json`);
  writeFileSync(rawPath, JSON.stringify(rawBenefits, null, 2), 'utf8');
  process.stderr.write(`[mp/scraper] Raw   → ${rawPath}\n`);

  // Summary
  const byBenefitType = promos.reduce<Record<string, number>>((acc, p) => {
    acc[p.benefit_type] = (acc[p.benefit_type] ?? 0) + 1;
    return acc;
  }, {});
  const byRails = promos.reduce<Record<string, number>>((acc, p) => {
    acc[p.allowed_rails || '(none)'] = (acc[p.allowed_rails || '(none)'] ?? 0) + 1;
    return acc;
  }, {});

  process.stderr.write('\n=== Summary ===\n');
  process.stderr.write(`Total benefits: ${promos.length}\n`);
  process.stderr.write(`By benefit_type: ${JSON.stringify(byBenefitType)}\n`);
  process.stderr.write(`By allowed_rails: ${JSON.stringify(byRails)}\n`);
  const withDates = promos.filter(p => p.valid_from).length;
  const withCap = promos.filter(p => p.cap_amount_ars !== null).length;
  const withMin = promos.filter(p => p.min_purchase_ars !== null).length;
  if (fetchTyc) {
    process.stderr.write(`With valid dates: ${withDates}\n`);
    process.stderr.write(`With explicit cap: ${withCap} (rest = sin tope)\n`);
    process.stderr.write(`With min purchase: ${withMin}\n`);
  }
}

main().catch(err => { process.stderr.write(`Fatal: ${err}\n`); process.exit(1); });
