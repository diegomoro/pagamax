#!/usr/bin/env node
/**
 * build-promo-index.ts — Build a compact promo lookup index from consolidated NDJSON
 *
 * Produces promo-index.json:
 *   - promos_by_cuit:        cuit → PromoSummary[]
 *   - promos_by_name:        normalized_merchant_name → PromoSummary[]
 *   - cuit_to_name:          cuit → primary_name (from merchants.json)
 *
 * PromoSummary is a trimmed-down version of a canonical promo — only the fields
 * needed at scan time (no raw terms text, no scoring metadata).
 *
 * Usage:
 *   npx tsx src/qr/build-promo-index.ts [--consolidated ./output_consolidated] [--out ./src/qr/promo-index.json]
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ─── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (f: string, d: string) => {
  const i = args.indexOf(f);
  return i !== -1 && args[i + 1] ? args[i + 1]! : d;
};

const consolidatedDir = resolve(getArg('--consolidated', './output_consolidated'));
const outPath = resolve(getArg('--out', './src/qr/promo-index.json'));
const activeOnly = !args.includes('--include-expired');

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PromoSummary {
  promo_key: string;
  issuer: string;
  merchant_name: string;
  category: string;
  discount_type: string;
  discount_percent: number | null;
  discount_amount_ars: number | null;
  installments_count: number | null;
  cap_amount_ars: number | null;
  cap_period: string;
  min_purchase_ars: number | null;
  day_pattern: string;          // 'everyday' | 'monday' | 'friday; saturday' | etc.
  channel: string;              // 'in-store' | 'online' | 'mixed'
  rail: string;                 // 'qr' | 'card' | 'qr; nfc' | etc.
  instrument_required: string;  // 'any' | 'qr_wallet' | 'debit_card' | etc.
  card_brand_scope: string;     // 'visa; master' | 'naranja x' | 'any' | etc.
  card_type_scope: string;      // 'credit' | 'debit' | 'credit; debit' | etc.
  wallet_scope: string;
  valid_from: string;
  valid_to: string;
  freshness_status: string;
  promo_title: string;
  description_short: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^(el|la|los|las|lo)/, '');
}

// Generic merchant names — these promos apply to "any merchant" for the issuer,
// not to a specific business. They go in the `general` bucket.
const GENERIC_MERCHANT_PATTERNS = [
  /\badherid/i, /\bcomercio/i, /\blocale?s?\b/i, /\bconsulta\b/i,
  /\btodos los\b/i, /\bvarios\b/i, /^supermercados?$/i, /^alimentos$/i,
  /\btienda online adherid/i, /\bacepten modo\b/i, /^sin datos$/i,
];

function isGenericMerchant(name: string): boolean {
  return GENERIC_MERCHANT_PATTERNS.some(p => p.test(name));
}

// MCC → promo category mapping — category values MUST match the `category` field
// used in the promo NDJSON data (checked: Farmacia, Automotor, Deporte, etc.)
const MCC_TO_CATEGORY: Record<string, string> = {
  '5912': 'Farmacia',       '5122': 'Farmacia',
  '5411': 'Supermercados',  '5422': 'Supermercados',
  '5541': 'Combustible',    '5542': 'Combustible',
  '5812': 'Gastronomía',    '5814': 'Gastronomía',  '5813': 'Gastronomía',
  '5651': 'Indumentaria',   '5699': 'Indumentaria',
  '5661': 'Indumentaria',   // Shoe stores → Indumentaria (closest match)
  '5734': 'Tecnología',     '5045': 'Tecnología',
  '5941': 'Deporte',        '5945': 'Deporte',
  '5533': 'Automotor',      '5511': 'Automotor',    '5521': 'Automotor',
  '7011': 'Viajes',         '4511': 'Viajes',       '7512': 'Viajes',
  '8049': 'Salud',          '8011': 'Salud',        '8099': 'Salud',
  '5999': 'Otro',
};
export { MCC_TO_CATEGORY };

function findLatestNdjson(dir: string): string | null {
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.ndjson') && !f.includes('audit'))
      .sort();
    return files.length > 0 ? join(dir, files[files.length - 1]!) : null;
  } catch { return null; }
}

function toSummary(d: Record<string, unknown>): PromoSummary {
  return {
    promo_key:           String(d.promo_key ?? ''),
    issuer:              String(d.issuer ?? ''),
    merchant_name:       String(d.merchant_name ?? ''),
    category:            String(d.category ?? ''),
    discount_type:       String(d.discount_type ?? ''),
    discount_percent:    d.discount_percent != null ? Number(d.discount_percent) : null,
    discount_amount_ars: d.discount_amount_ars != null ? Number(d.discount_amount_ars) : null,
    installments_count:  d.installments_count != null ? Number(d.installments_count) : null,
    cap_amount_ars:      d.cap_amount_ars != null ? Number(d.cap_amount_ars) : null,
    cap_period:          String(d.cap_period ?? ''),
    min_purchase_ars:    d.min_purchase_ars != null ? Number(d.min_purchase_ars) : null,
    day_pattern:         String(d.day_pattern ?? 'everyday'),
    channel:             String(d.channel ?? ''),
    rail:                String(d.rail ?? ''),
    instrument_required: String(d.instrument_required ?? ''),
    card_brand_scope:    String(d.card_brand_scope ?? ''),
    card_type_scope:     String(d.card_type_scope ?? ''),
    wallet_scope:        String(d.wallet_scope ?? ''),
    valid_from:          String(d.valid_from ?? ''),
    valid_to:            String(d.valid_to ?? ''),
    freshness_status:    String(d.freshness_status ?? ''),
    promo_title:         String(d.promo_title ?? ''),
    description_short:   String(d.description_short ?? ''),
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Pagamax Promo Index Builder');
  console.log('═══════════════════════════════════════════════════════');

  // Load consolidated NDJSON
  const ndjsonPath = findLatestNdjson(consolidatedDir);
  if (!ndjsonPath) { console.error(`No NDJSON in ${consolidatedDir}`); process.exit(1); }
  console.log(`\nSource: ${ndjsonPath}`);

  const allRows: Record<string, unknown>[] = readFileSync(ndjsonPath, 'utf8')
    .trim().split('\n').filter(Boolean)
    .map(l => JSON.parse(l) as Record<string, unknown>);

  const rows = activeOnly
    ? allRows.filter(d => d.freshness_status === 'active')
    : allRows;

  console.log(`Rows: ${allRows.length} total, ${rows.length} active`);

  // Load merchant map (cuit → names)
  const merchantMapPath = resolve('./src/qr/merchants.json');
  const merchantMap: {
    by_cuit: Record<string, { names: string[]; primary_name: string }>;
    name_index: Record<string, string>;
  } = JSON.parse(readFileSync(merchantMapPath, 'utf8'));

  // Build CUIT lookup from merchant_logo_url + name_index
  const cuitByLogoUrl = new Map<string, string>();
  for (const row of allRows) {
    const url = String(row.merchant_logo_url ?? '');
    const m = url.match(/cuit_0*(\d{11})/);
    if (m) cuitByLogoUrl.set(url, m[1]!);
  }

  // Also load curated CUITs so manually verified merchants resolve by CUIT
  const curatedPath = resolve('./src/qr/curated-cuits.json');
  let curatedNameToCuit = new Map<string, string>();
  try {
    const curated: { entries: Array<{ cuit: string; names: string[] }> } =
      JSON.parse(readFileSync(curatedPath, 'utf8'));
    for (const entry of curated.entries) {
      for (const name of entry.names) {
        curatedNameToCuit.set(normalizeName(name), entry.cuit);
      }
    }
    console.log(`Curated CUITs loaded: ${curated.entries.length} entries`);
  } catch {
    console.log('No curated-cuits.json found');
  }

  // Index: cuit → PromoSummary[]
  const promosByCuit = new Map<string, PromoSummary[]>();
  // Index: normalized_name → PromoSummary[]
  const promosByName = new Map<string, PromoSummary[]>();
  // Index: category → PromoSummary[] (for MCC fallback)
  const promosByCategory = new Map<string, PromoSummary[]>();
  // General promos (apply to any merchant, not specific ones)
  const generalPromos: PromoSummary[] = [];

  let indexed = 0;
  let noMerchant = 0;
  let generalCount = 0;

  for (const row of rows) {
    const summary = toSummary(row);
    const name = summary.merchant_name;
    if (!name || name.length < 2) { noMerchant++; continue; }

    // Resolve CUIT: logo URL → curated map → merchant map (in priority order)
    const url = String(row.merchant_logo_url ?? '');
    const norm2 = normalizeName(name);
    let cuit = cuitByLogoUrl.get(url)
      ?? curatedNameToCuit.get(norm2)
      ?? merchantMap.name_index[norm2]
      ?? null;

    // Generic merchants → go into general bucket (not merchant-specific)
    if (isGenericMerchant(name)) {
      generalPromos.push(summary);
      generalCount++;
      indexed++;
      continue;
    }

    // Index by CUIT
    if (cuit) {
      if (!promosByCuit.has(cuit)) promosByCuit.set(cuit, []);
      promosByCuit.get(cuit)!.push(summary);
    }

    // Index by normalized name (always — fallback for unknown CUITs)
    const norm = norm2;
    if (!promosByName.has(norm)) promosByName.set(norm, []);
    promosByName.get(norm)!.push(summary);

    // Index by category (for MCC fallback)
    const cat = summary.category;
    if (cat && cat !== 'Otro') {
      if (!promosByCategory.has(cat)) promosByCategory.set(cat, []);
      promosByCategory.get(cat)!.push(summary);
    }

    indexed++;
  }

  // Build cuit_to_name from merchant map + curated entries
  const cuitToName: Record<string, string> = {};
  for (const [cuit, entry] of Object.entries(merchantMap.by_cuit)) {
    cuitToName[cuit] = entry.primary_name;
  }
  // Curated overrides (more reliable names)
  try {
    const curated2: { entries: Array<{ cuit: string; names: string[] }> } =
      JSON.parse(readFileSync(resolve('./src/qr/curated-cuits.json'), 'utf8'));
    for (const entry of curated2.entries) {
      cuitToName[entry.cuit] = entry.names[0]!;
    }
  } catch { /* already warned above */ }

  // Deduplicate: store promos once in a flat array, use indices in lookups
  const allPromos: PromoSummary[] = [];
  const promoKeyToIdx = new Map<string, number>();

  function getOrAddPromo(p: PromoSummary): number {
    if (promoKeyToIdx.has(p.promo_key)) return promoKeyToIdx.get(p.promo_key)!;
    const idx = allPromos.length;
    allPromos.push(p);
    promoKeyToIdx.set(p.promo_key, idx);
    return idx;
  }

  // Rebuild as index arrays
  const idxByCuit: Record<string, number[]> = {};
  for (const [cuit, promos] of promosByCuit) {
    idxByCuit[cuit] = promos.map(p => getOrAddPromo(p));
  }
  const idxByName: Record<string, number[]> = {};
  for (const [name, promos] of promosByName) {
    idxByName[name] = promos.map(p => getOrAddPromo(p));
  }
  const idxByCategory: Record<string, number[]> = {};
  for (const [cat, promos] of promosByCategory) {
    idxByCategory[cat] = promos.map(p => getOrAddPromo(p));
  }
  const generalIndices = generalPromos.map(p => getOrAddPromo(p));

  const output = {
    generated_at: new Date().toISOString(),
    source: ndjsonPath,
    stats: {
      total_rows: allRows.length,
      active_rows: rows.length,
      indexed,
      no_merchant: noMerchant,
      general_promos: generalCount,
      cuits_with_promos: promosByCuit.size,
      names_with_promos: promosByName.size,
      categories_with_promos: promosByCategory.size,
      total_unique_promos: allPromos.length,
    },
    // Flat promo array — look up by index
    promos: allPromos,
    // CUIT → [promo indices]
    by_cuit: idxByCuit,
    // Normalized merchant name → [promo indices]
    by_name: idxByName,
    // Category → [promo indices] (MCC fallback)
    by_category: idxByCategory,
    // General promos — apply at any merchant, filtered by issuer/day at query time
    general: generalIndices,
    cuit_to_name: cuitToName,
    // MCC → category mapping (shipped with index so client can resolve MCC)
    mcc_to_category: MCC_TO_CATEGORY,
  };

  writeFileSync(outPath, JSON.stringify(output), 'utf8');

  // Pretty stats
  console.log('\n═══ Stats ═══');
  console.log(`  Indexed promos:       ${indexed}`);
  console.log(`  Unique promos stored: ${allPromos.length}`);
  console.log(`  CUITs with promos:    ${promosByCuit.size}`);
  console.log(`  Names with promos:    ${promosByName.size}`);
  console.log(`  Categories indexed:   ${promosByCategory.size}`);
  console.log(`  General promos:       ${generalCount}`);
  console.log(`  Written to:           ${outPath}`);
  const sizeKb = Math.round(Buffer.byteLength(JSON.stringify(output)) / 1024);
  console.log(`  File size:            ${sizeKb} KB`);

  // Show top merchants with most promos
  const topByCount = [...promosByCuit.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);
  console.log('\n─── Top 10 merchants by promo count ───');
  for (const [cuit, promos] of topByCount) {
    const name = cuitToName[cuit] ?? cuit;
    const issuers = [...new Set(promos.map(p => p.issuer))].join(', ');
    console.log(`  ${name.padEnd(28)} ${String(promos.length).padStart(4)} promos  [${issuers}]`);
  }
}

main();
