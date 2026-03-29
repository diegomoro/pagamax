#!/usr/bin/env node
/**
 * scraper.ts — YPF Serviclub benefits scraper
 *
 * Strategy:
 *   1. Probe serviclub.com.ar — if it's under maintenance, use hardcoded fallback.
 *   2. Write NDJSON + CSV output.
 *
 * Run:
 *   npx tsx src/issuers/ypf/scraper.ts [--out ./output_ypf]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractYpfPromos } from './extract.js';
import { normalize } from './normalize.js';
import type { YpfPromo } from './types.js';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const getArg = (flag: string, def: string) => { const i = args.indexOf(flag); return i !== -1 && args[i+1] ? args[i+1]! : def; };
const outDir = resolve(getArg('--out', './output_ypf'));

mkdirSync(outDir, { recursive: true });

// ─── CSV writer ───────────────────────────────────────────────────────────────

const PROMO_COLS: Array<keyof YpfPromo> = [
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

function writeCsv(path: string, rows: YpfPromo[]): void {
  const header = PROMO_COLS.join(',') + '\n';
  const lines  = rows.map(r => PROMO_COLS.map(c => csvCell(r[c])).join(','));
  writeFileSync(path, header + lines.join('\n') + '\n', 'utf8');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const scrapedAt = new Date().toISOString();
  const dateStr   = scrapedAt.slice(0, 10);

  process.stderr.write(`[ypf/scraper] out: ${outDir}\n\n`);

  const { promos: rawPromos, servoclubOnline } = await extractYpfPromos();
  process.stderr.write(`[ypf/scraper] servoclubOnline: ${servoclubOnline}\n`);
  process.stderr.write(`[ypf/scraper] raw promos: ${rawPromos.length}\n`);

  const promos = rawPromos.map(r => normalize(r, scrapedAt));

  // NDJSON
  const ndjsonPath = join(outDir, `ypf-${dateStr}.ndjson`);
  writeFileSync(ndjsonPath, promos.map(p => JSON.stringify(p)).join('\n') + '\n', 'utf8');
  process.stderr.write(`[ypf/scraper] NDJSON → ${ndjsonPath}\n`);

  // CSV
  const csvPath = join(outDir, `ypf-${dateStr}.csv`);
  writeCsv(csvPath, promos);
  process.stderr.write(`[ypf/scraper] CSV   → ${csvPath}\n`);

  // Summary
  process.stderr.write('\n=== Summary ===\n');
  process.stderr.write(`Total promos:   ${promos.length}\n`);
  process.stderr.write(`Static fallback: ${promos.filter(p => p.is_static_fallback).length}\n`);
  if (!servoclubOnline) {
    process.stderr.write(`[WARN] serviclub.com.ar was unreachable — only hardcoded fallback promos emitted.\n`);
    process.stderr.write(`       Re-run when serviclub returns to capture the full Serviclub partner catalog.\n`);
  }
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
