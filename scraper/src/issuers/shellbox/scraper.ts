#!/usr/bin/env node
/**
 * scraper.ts — Shell Box benefits scraper
 *
 * Strategy:
 *   1. Playwright on shell.com.ar/conductores/descuentos-vigentes.html
 *   2. Filter out bank partnership promos (already in MODO/BBVA)
 *   3. Fall back to hardcoded promos if page yields 0 Shell Box rows
 *
 * Run:
 *   npx tsx src/issuers/shellbox/scraper.ts [--out ./output_shellbox]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractShellboxPromos } from './extract.js';
import { normalize } from './normalize.js';
import type { ShellboxPromo } from './types.js';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const getArg = (flag: string, def: string) => { const i = args.indexOf(flag); return i !== -1 && args[i+1] ? args[i+1]! : def; };
const outDir = resolve(getArg('--out', './output_shellbox'));

mkdirSync(outDir, { recursive: true });

// ─── CSV writer ───────────────────────────────────────────────────────────────

const PROMO_COLS: Array<keyof ShellboxPromo> = [
  'source_id', 'issuer', 'promo_title', 'merchant_name', 'category',
  'description_short', 'discount_type', 'discount_percent', 'cap_amount_ars',
  'cap_period', 'day_pattern', 'valid_from', 'valid_to', 'rail',
  'instrument_required', 'wallet_scope', 'terms_text_raw',
  'is_static_fallback', 'scraped_at',
];

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function writeCsv(path: string, rows: ShellboxPromo[]): void {
  const header = PROMO_COLS.join(',') + '\n';
  const lines  = rows.map(r => PROMO_COLS.map(c => csvCell(r[c])).join(','));
  writeFileSync(path, header + lines.join('\n') + '\n', 'utf8');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const scrapedAt = new Date().toISOString();
  const dateStr   = scrapedAt.slice(0, 10);

  process.stderr.write(`[shellbox/scraper] out: ${outDir}\n\n`);

  const { promos: rawPromos, livePageSuccess } = await extractShellboxPromos();
  process.stderr.write(`[shellbox/scraper] livePageSuccess: ${livePageSuccess}\n`);
  process.stderr.write(`[shellbox/scraper] raw promos: ${rawPromos.length}\n`);

  const promos = rawPromos.map(r => normalize(r, scrapedAt));

  // NDJSON
  const ndjsonPath = join(outDir, `shellbox-${dateStr}.ndjson`);
  writeFileSync(ndjsonPath, promos.map(p => JSON.stringify(p)).join('\n') + '\n', 'utf8');
  process.stderr.write(`[shellbox/scraper] NDJSON → ${ndjsonPath}\n`);

  // CSV
  const csvPath = join(outDir, `shellbox-${dateStr}.csv`);
  writeCsv(csvPath, promos);
  process.stderr.write(`[shellbox/scraper] CSV   → ${csvPath}\n`);

  // Summary
  process.stderr.write('\n=== Summary ===\n');
  process.stderr.write(`Total promos:    ${promos.length}\n`);
  process.stderr.write(`Live page parse: ${livePageSuccess}\n`);
  process.stderr.write(`Static fallback: ${promos.filter(p => p.is_static_fallback).length}\n`);
  const byMerchant: Record<string, number> = {};
  for (const p of promos) byMerchant[p.merchant_name] = (byMerchant[p.merchant_name] ?? 0) + 1;
  process.stderr.write(`By merchant: ${JSON.stringify(byMerchant)}\n`);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
