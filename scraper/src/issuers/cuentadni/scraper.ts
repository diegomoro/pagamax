#!/usr/bin/env node
/**
 * scraper.ts — Cuenta DNI (Banco Provincia) promotions scraper entry point.
 *
 * Outputs:
 *   cuentadni-YYYY-MM-DD.ndjson          — one promo per line
 *   cuentadni-YYYY-MM-DD.csv             — flat CSV (same columns)
 *   cuentadni-YYYY-MM-DD-merchants.csv   — participating stores per active promo (requires --merchants)
 *   cuentadni-YYYY-MM-DD-audit.json      — completeness audit report
 *
 * Usage:
 *   npx tsx src/issuers/cuentadni/scraper.ts
 *   npx tsx src/issuers/cuentadni/scraper.ts --out ./output
 *   npx tsx src/issuers/cuentadni/scraper.ts --skip-discover   # use known rubro IDs only
 *   npx tsx src/issuers/cuentadni/scraper.ts --merchants       # also scrape store lists (Playwright)
 */

import { createWriteStream, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { discover } from './discover.js';
import { extract, enrichMerchantLocators } from './extract.js';
import { normalize, deduplicate } from './normalize.js';
import { buildAudit } from './audit.js';
import { scrapeMerchants, type MerchantLocation } from './merchants.js';
import type { CuenaDNIPromo } from './types.js';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outDir = (() => {
  const idx = args.indexOf('--out');
  return idx !== -1 && args[idx + 1] ? resolve(args[idx + 1]!) : process.cwd();
})();
const skipDiscover  = args.includes('--skip-discover');
const withMerchants = args.includes('--merchants');

// ─── CSV helpers ──────────────────────────────────────────────────────────────

const PROMO_COLS: Array<keyof CuenaDNIPromo> = [
  'source', 'source_family', 'source_page_type', 'source_url', 'discovery_path',
  'promo_key', 'promo_title', 'merchant_group', 'category', 'subcategory',
  'description_short', 'discount_percent', 'discount_type',
  'cap_amount_ars', 'cap_period', 'cap_scope', 'cap_per_person', 'min_purchase_amount_ars',
  'days_of_week', 'valid_from', 'valid_to', 'validity_text_raw',
  'is_active', 'is_stale', 'freshness_reason',
  'payment_method', 'funding_source', 'allowed_rails', 'excluded_rails', 'channel',
  'installments', 'reimbursement_delay_business_days', 'geo_scope', 'merchant_locator_url',
  'terms_text_raw', 'exclusions_raw', 'examples_raw', 'raw_snippet',
  'beneficio_id', 'rubro_id', 'scraped_at',
];

const MERCHANT_COLS: Array<keyof MerchantLocation> = [
  'promo_key', 'beneficio_id', 'buscador_url', 'merchant_name', 'locality', 'address', 'lat', 'lon',
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

  const ndjsonPath    = join(outDir, `cuentadni-${dateSlug}.ndjson`);
  const csvPath       = join(outDir, `cuentadni-${dateSlug}.csv`);
  const merchantsPath = join(outDir, `cuentadni-${dateSlug}-merchants.csv`);
  const auditPath     = join(outDir, `cuentadni-${dateSlug}-audit.json`);

  process.stderr.write(`Cuenta DNI scraper — ${scrapedAt}\n`);
  process.stderr.write(`Output dir: ${outDir}\n`);
  if (withMerchants) process.stderr.write('Mode: promos + merchant store lists (Playwright)\n');
  process.stderr.write('\n');

  // ── Step 1: Discover ───────────────────────────────────────────────────────
  let discoverResult;
  if (skipDiscover) {
    process.stderr.write('--skip-discover: using known rubro IDs [1, 18, 21, 26, 27, 29, 31, 32]\n');
    discoverResult = {
      urls: [],
      activeRubroIds: [1, 18, 21, 26, 27, 29, 31, 32],
      hubBeneficioIds: [],
      emptyRubroIds: [],
    };
  } else {
    discoverResult = await discover();
  }

  // ── Step 2: Extract ────────────────────────────────────────────────────────
  process.stderr.write('\n=== Extract phase ===\n');
  const extractResult = await extract(discoverResult, scrapedAt);
  process.stderr.write(`\nRaw candidates: ${extractResult.candidates.length}\n`);

  // ── Step 3: Normalize ──────────────────────────────────────────────────────
  process.stderr.write('\n=== Normalize phase ===\n');
  const promos = extractResult.candidates.map(normalize);

  // ── Step 4: Enrich active promos with merchant locator URLs (from Botones) ─
  const activePromos = promos.filter(p => p.is_active);
  const locatorMap   = await enrichMerchantLocators(activePromos);
  for (const p of promos) {
    if (p.is_active && p.beneficio_id !== null && !p.merchant_locator_url) {
      const url = locatorMap.get(p.beneficio_id);
      if (url) p.merchant_locator_url = url;
    }
  }

  // ── Step 5: Deduplicate ────────────────────────────────────────────────────
  const { deduped, removedCount } = deduplicate(promos);
  const activeDeduped = deduped.filter(p => p.is_active);
  process.stderr.write(`Deduplicated: ${promos.length} → ${deduped.length} (removed ${removedCount})\n`);

  // ── Step 6: Write active promos NDJSON (stale excluded for daily DB accumulation) ──
  process.stderr.write(`\nWriting NDJSON    → ${ndjsonPath}\n`);
  const ndjsonStream = createWriteStream(ndjsonPath, { encoding: 'utf8' });
  for (const p of activeDeduped) ndjsonStream.write(JSON.stringify(p) + '\n');
  await new Promise<void>((res, rej) =>
    ndjsonStream.end((err?: Error | null) => err ? rej(err) : res()),
  );

  // ── Step 7: Write active promos CSV ───────────────────────────────────────
  process.stderr.write(`Writing promos CSV → ${csvPath}\n`);
  await writeCsv(csvPath, PROMO_COLS, activeDeduped);

  // ── Step 8: Scrape merchant store lists (Playwright, BP buscadores only) ───
  if (withMerchants) {
    process.stderr.write('\n=== Merchant scraping phase (Playwright) ===\n');
    const activeDed = activeDeduped;
    const { locations, externalChains } = await scrapeMerchants(activeDed);

    process.stderr.write(`Writing merchants CSV → ${merchantsPath}\n`);
    await writeCsv(merchantsPath, MERCHANT_COLS, locations);

    if (externalChains.length > 0) {
      process.stderr.write('\nExternal chain locators (not scraped — need per-chain implementation):\n');
      for (const c of externalChains) {
        process.stderr.write(`  ${c.promo_title.slice(0, 40)} → ${c.locator_url}\n`);
      }
    }
  }

  // ── Step 9: Write audit ────────────────────────────────────────────────────
  process.stderr.write(`Writing audit      → ${auditPath}\n`);
  const audit = buildAudit(discoverResult, extractResult, promos, deduped, scrapedAt);
  writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');

  // ── Summary ────────────────────────────────────────────────────────────────
  const staleCount = deduped.length - activeDeduped.length;
  const hasCap     = activeDeduped.filter(p => p.cap_amount_ars !== null).length;

  process.stderr.write('\n=== Summary ===\n');
  process.stderr.write(`Active promos written: ${activeDeduped.length} (${staleCount} stale excluded)\n`);
  process.stderr.write(`Has cap: ${hasCap} | Has days: ${activeDeduped.filter(p => p.days_of_week).length}\n`);
  process.stderr.write(`Risk: ${audit.gapAnalysis.riskLevel} — ${audit.gapAnalysis.riskReason}\n`);
  process.stderr.write('\nDone.\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
