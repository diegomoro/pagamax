#!/usr/bin/env node
/**
 * scraper.ts — Carrefour Bank benefits scraper
 *
 * Strategy:
 *   1. Playwright on bancodeserviciosfinancieros.com.ar/beneficios-credito/
 *      (bypasses the 403 that plain HTTP fetch gets)
 *   2. Filter to Tarjeta Mi Carrefour promos ONLY (skip external bank deals)
 *   3. Fall back to hardcoded promos if Playwright yields 0 rows
 *
 * IMPORTANT: External bank promos AT Carrefour (Santander, Galicia, BBVA, etc.)
 * are already captured via MODO / NaranjaX / MercadoPago. Do NOT emit them here.
 *
 * Run:
 *   npx tsx src/issuers/carrefour_bank/scraper.ts [--out ./output_carrefour_bank]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractCarrefourPromos } from './extract.js';
import { normalize } from './normalize.js';
import type { CarrefourPromo } from './types.js';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const getArg = (flag: string, def: string) => { const i = args.indexOf(flag); return i !== -1 && args[i+1] ? args[i+1]! : def; };
const outDir = resolve(getArg('--out', './output_carrefour_bank'));

mkdirSync(outDir, { recursive: true });

// ─── CSV writer ───────────────────────────────────────────────────────────────

const PROMO_COLS: Array<keyof CarrefourPromo> = [
  'source_id', 'issuer', 'promo_title', 'merchant_name', 'category',
  'description_short', 'card_label', 'discount_type', 'discount_percent',
  'installments_count', 'cap_amount_ars', 'cap_period', 'age_restriction',
  'day_pattern', 'channel', 'valid_from', 'valid_to',
  'rail', 'instrument_required', 'wallet_scope',
  'terms_text_raw', 'is_static_fallback', 'scraped_at',
];

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function writeCsv(path: string, rows: CarrefourPromo[]): void {
  const header = PROMO_COLS.join(',') + '\n';
  const lines  = rows.map(r => PROMO_COLS.map(c => csvCell(r[c])).join(','));
  writeFileSync(path, header + lines.join('\n') + '\n', 'utf8');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const scrapedAt = new Date().toISOString();
  const dateStr   = scrapedAt.slice(0, 10);

  process.stderr.write(`[carrefour_bank/scraper] out: ${outDir}\n\n`);

  const { promos: rawPromos, livePageSuccess } = await extractCarrefourPromos();
  process.stderr.write(`[carrefour_bank/scraper] livePageSuccess: ${livePageSuccess}\n`);
  process.stderr.write(`[carrefour_bank/scraper] raw promos: ${rawPromos.length}\n`);

  const promos = rawPromos.map(r => normalize(r, scrapedAt));

  // NDJSON
  const ndjsonPath = join(outDir, `carrefour_bank-${dateStr}.ndjson`);
  writeFileSync(ndjsonPath, promos.map(p => JSON.stringify(p)).join('\n') + '\n', 'utf8');
  process.stderr.write(`[carrefour_bank/scraper] NDJSON → ${ndjsonPath}\n`);

  // CSV
  const csvPath = join(outDir, `carrefour_bank-${dateStr}.csv`);
  writeCsv(csvPath, promos);
  process.stderr.write(`[carrefour_bank/scraper] CSV   → ${csvPath}\n`);

  // Summary
  process.stderr.write('\n=== Summary ===\n');
  process.stderr.write(`Total promos:    ${promos.length}\n`);
  process.stderr.write(`Live page parse: ${livePageSuccess}\n`);
  process.stderr.write(`Static fallback: ${promos.filter(p => p.is_static_fallback).length}\n`);

  const byCard: Record<string, number> = {};
  for (const p of promos) byCard[p.card_label] = (byCard[p.card_label] ?? 0) + 1;
  process.stderr.write(`By card: ${JSON.stringify(byCard)}\n`);

  if (!livePageSuccess) {
    process.stderr.write(`[WARN] bancodeserviciosfinancieros.com.ar was unreachable or returned 0 Mi Carrefour rows.\n`);
    process.stderr.write(`       Emitted ${promos.length} hardcoded fallback promos.\n`);
    process.stderr.write(`       Re-run to attempt live page parse.\n`);
  }
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
