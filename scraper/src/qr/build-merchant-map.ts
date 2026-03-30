#!/usr/bin/env node
/**
 * build-merchant-map.ts — Build CUIT→merchant mapping from existing promo data
 *
 * Phase 1: Extract CUITs from NaranjaX merchant_logo_url (pattern: cuit_XXXXXXXXXXXXX)
 * Phase 2: Cross-match merchants from all issuers by exact + fuzzy name
 * Phase 3: Enrich with AFIP padron API (optional, needs network)
 * Phase 4: Output merchants.json mapping file
 *
 * Usage:
 *   npx tsx src/qr/build-merchant-map.ts [--consolidated path] [--enrich-afip] [--out path]
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ─── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (f: string, d: string) => {
  const i = args.indexOf(f);
  return i !== -1 && args[i + 1] ? args[i + 1]! : d;
};

const consolidatedDir = resolve(getArg('--consolidated', './output_consolidated'));
const enrichAfip = args.includes('--enrich-afip');
const outPath = resolve(getArg('--out', './src/qr/merchants.json'));

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MerchantEntry {
  cuit: string;
  cuit_formatted: string;
  names: string[];           // all known brand names (Disco, Vea, Jumbo, etc.)
  primary_name: string;      // most frequent name
  categories: string[];
  subcategories: string[];
  mcc_codes: string[];       // Merchant Category Codes (empty until QR scans populate)
  promo_count: number;
  issuers: string[];
  afip_razon_social: string | null;
  afip_tipo_persona: string | null;
  afip_actividad: string | null;
  afip_domicilio: string | null;
  logo_url: string | null;
  source: 'naranjax_url' | 'terms_text' | 'cross_match' | 'afip_lookup';
  confidence: number;        // 0-1, how confident we are in this mapping
}

interface ConsolidatedRow {
  merchant_name: string;
  merchant_logo_url: string | null;
  category: string;
  subcategory: string;
  issuer: string;
  promo_key: string;
  terms_text_raw: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatCuit(cuit: string): string {
  if (cuit.length !== 11) return cuit;
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

/** Normalize a merchant name for fuzzy comparison */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/[^a-z0-9]/g, '')                          // strip non-alnum
    .replace(/^(el|la|los|las|lo)/, '');                // strip articles
}

/** Check if two names are a fuzzy match (conservative) */
function fuzzyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.length < 4 || nb.length < 4) return false;

  // Substring match only if the shorter string is 6+ chars and covers 80%+ of the longer
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length > nb.length ? na : nb;
  if (shorter.length >= 6 && longer.includes(shorter) && shorter.length / longer.length >= 0.7) {
    return true;
  }

  // Levenshtein for names of similar length (max 1 edit for short, 2 for longer)
  if (Math.abs(na.length - nb.length) <= 1) {
    const maxDist = na.length <= 8 ? 1 : 2;
    if (levenshtein(na, nb) <= maxDist) return true;
  }

  return false;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m]![n]!;
}

function findLatestNdjson(dir: string): string | null {
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.ndjson') && !f.includes('audit'))
      .sort();
    return files.length > 0 ? join(dir, files[files.length - 1]!) : null;
  } catch {
    return null;
  }
}

// ─── Phase 1: Extract CUITs from NaranjaX logo URLs ───────────────────────────

function phase1_extractCuits(rows: ConsolidatedRow[]): Map<string, MerchantEntry> {
  console.log('\n═══ Phase 1: Extract CUITs from NaranjaX logo URLs ═══');

  const cuitMap = new Map<string, MerchantEntry>();
  const nameFreq = new Map<string, Map<string, number>>(); // cuit → {name → count}

  for (const row of rows) {
    const url = row.merchant_logo_url ?? '';
    const m = url.match(/cuit_0*(\d{11})/);
    if (!m) continue;

    const cuit = m[1]!;
    if (!nameFreq.has(cuit)) nameFreq.set(cuit, new Map());
    const freq = nameFreq.get(cuit)!;
    freq.set(row.merchant_name, (freq.get(row.merchant_name) ?? 0) + 1);

    if (!cuitMap.has(cuit)) {
      cuitMap.set(cuit, {
        cuit,
        cuit_formatted: formatCuit(cuit),
        names: [],
        primary_name: '',
        categories: [],
        subcategories: [],
        mcc_codes: [],
        promo_count: 0,
        issuers: [],
        afip_razon_social: null,
        afip_tipo_persona: null,
        afip_actividad: null,
        afip_domicilio: null,
        logo_url: url || null,
        source: 'naranjax_url',
        confidence: 1.0,
      });
    }

    const entry = cuitMap.get(cuit)!;
    if (!entry.names.includes(row.merchant_name)) entry.names.push(row.merchant_name);
    if (!entry.categories.includes(row.category) && row.category) entry.categories.push(row.category);
    if (!entry.subcategories.includes(row.subcategory) && row.subcategory) entry.subcategories.push(row.subcategory);
    if (!entry.issuers.includes(row.issuer)) entry.issuers.push(row.issuer);
    entry.promo_count++;
  }

  // Set primary_name as the most frequent name
  for (const [cuit, entry] of cuitMap) {
    const freq = nameFreq.get(cuit)!;
    let maxCount = 0;
    for (const [name, count] of freq) {
      if (count > maxCount) {
        maxCount = count;
        entry.primary_name = name;
      }
    }
  }

  console.log(`  Found ${cuitMap.size} unique CUITs from NaranjaX URLs`);
  return cuitMap;
}

// ─── Phase 1.25: Load curated CUIT mappings ──────────────────────────────────

function phase1_25_curatedCuits(cuitMap: Map<string, MerchantEntry>): void {
  console.log('\n═══ Phase 1.25: Load curated CUIT mappings ═══');

  const curatedPath = resolve('./src/qr/curated-cuits.json');
  let curated: { entries: Array<{ cuit: string; names: string[]; razon_social: string; categories: string[] }> };
  try {
    curated = JSON.parse(readFileSync(curatedPath, 'utf8'));
  } catch {
    console.log('  No curated-cuits.json found, skipping');
    return;
  }

  let added = 0;
  let merged = 0;
  for (const entry of curated.entries) {
    const cuit = entry.cuit;
    if (cuitMap.has(cuit)) {
      // Merge names
      const existing = cuitMap.get(cuit)!;
      for (const name of entry.names) {
        if (!existing.names.includes(name)) existing.names.push(name);
      }
      if (entry.razon_social) existing.afip_razon_social = entry.razon_social;
      merged++;
    } else {
      cuitMap.set(cuit, {
        cuit,
        cuit_formatted: formatCuit(cuit),
        names: entry.names,
        primary_name: entry.names[0]!,
        categories: entry.categories,
        subcategories: [],
        mcc_codes: [],
        promo_count: 0,
        issuers: [],
        afip_razon_social: entry.razon_social,
        afip_tipo_persona: 'JURIDICA',
        afip_actividad: null,
        afip_domicilio: null,
        logo_url: null,
        source: 'cross_match',
        confidence: 0.85,
      });
      added++;
    }
  }

  console.log(`  Added: ${added} new CUITs`);
  console.log(`  Merged: ${merged} into existing`);
  console.log(`  Total CUITs now: ${cuitMap.size}`);
}

// ─── Phase 1.5: Extract merchant CUITs from terms_text_raw ───────────────────

// Bank/organizer CUITs that appear across many merchants — NOT merchant CUITs
const BANK_CUIT_THRESHOLD = 5; // CUITs appearing for >5 different merchants are likely banks

function phase1_5_termsTextCuits(
  cuitMap: Map<string, MerchantEntry>,
  rows: ConsolidatedRow[],
): void {
  console.log('\n═══ Phase 1.5: Extract CUITs from terms text ═══');

  const CUIT_RE = /C\.?U\.?I\.?T\.?\s*(?:N[°o]\.?\s*)?:?\s*(\d{2})[- ]?(\d{7,8})[- ]?(\d)/gi;
  const GENERIC_NAMES = new Set([
    'comercios adheridos', 'comercios que acepten modo', 'consulta los locales adheridos',
    'supermercados adheridos', 'comercios de librerias adheridos', 'estaciones de servicio adheridas',
    'farmacias que acepten modo', 'heladerias adheridas', 'comercios adheridos que acepten modo',
    'supermercados mayoristas',
  ]);

  // Pass 1: count how many unique merchants each CUIT maps to
  const cuitMerchantCount = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.terms_text_raw) continue;
    CUIT_RE.lastIndex = 0;
    let m;
    while ((m = CUIT_RE.exec(row.terms_text_raw)) !== null) {
      const digits = m[1]! + m[2]!.padStart(8, '0') + m[3]!;
      if (digits.length !== 11) continue;
      if (!cuitMerchantCount.has(digits)) cuitMerchantCount.set(digits, new Set());
      cuitMerchantCount.get(digits)!.add(row.merchant_name.toLowerCase());
    }
  }

  // Identify bank CUITs
  const bankCuits = new Set<string>();
  for (const [cuit, merchants] of cuitMerchantCount) {
    if (merchants.size > BANK_CUIT_THRESHOLD) bankCuits.add(cuit);
  }
  console.log(`  Bank/organizer CUITs excluded: ${bankCuits.size}`);

  // Pass 2: add merchant CUITs not already in the map
  let added = 0;
  let merged = 0;
  for (const row of rows) {
    if (!row.terms_text_raw) continue;
    if (GENERIC_NAMES.has(row.merchant_name.toLowerCase())) continue;

    CUIT_RE.lastIndex = 0;
    let m;
    while ((m = CUIT_RE.exec(row.terms_text_raw)) !== null) {
      const digits = m[1]! + m[2]!.padStart(8, '0') + m[3]!;
      if (digits.length !== 11) continue;
      if (bankCuits.has(digits)) continue;
      // Skip if already exists from Phase 1 with this exact CUIT
      if (cuitMap.has(digits)) {
        // Merge: add merchant name if new
        const entry = cuitMap.get(digits)!;
        if (!entry.names.includes(row.merchant_name)) {
          entry.names.push(row.merchant_name);
          merged++;
        }
        if (!entry.issuers.includes(row.issuer)) entry.issuers.push(row.issuer);
        if (!entry.categories.includes(row.category) && row.category) entry.categories.push(row.category);
        entry.promo_count++;
        continue;
      }

      // New CUIT from terms text
      cuitMap.set(digits, {
        cuit: digits,
        cuit_formatted: formatCuit(digits),
        names: [row.merchant_name],
        primary_name: row.merchant_name,
        categories: row.category ? [row.category] : [],
        subcategories: row.subcategory ? [row.subcategory] : [],
        mcc_codes: [],
        promo_count: 1,
        issuers: [row.issuer],
        afip_razon_social: null,
        afip_tipo_persona: null,
        afip_actividad: null,
        afip_domicilio: null,
        logo_url: row.merchant_logo_url ?? null,
        source: 'terms_text',
        confidence: 0.8,
      });
      added++;
      break; // only take the first CUIT per row (most likely the merchant's)
    }
  }

  console.log(`  New CUITs from terms: ${added}`);
  console.log(`  Existing CUITs enriched: ${merged}`);
  console.log(`  Total CUITs now: ${cuitMap.size}`);
}

// ─── Phase 2: Cross-match merchants from all issuers ───────────────────────────

function phase2_crossMatch(
  cuitMap: Map<string, MerchantEntry>,
  rows: ConsolidatedRow[],
): { matched: number; unmatched: Map<string, { count: number; categories: string[]; issuers: string[] }> } {
  console.log('\n═══ Phase 2: Cross-match merchants by name ═══');

  // Build lookup: normalized name → CUIT
  const nameIndex = new Map<string, string>(); // normalized name → cuit
  for (const [cuit, entry] of cuitMap) {
    for (const name of entry.names) {
      nameIndex.set(normalizeName(name), cuit);
    }
  }

  let exactMatches = 0;
  let fuzzyMatches = 0;
  const unmatched = new Map<string, { count: number; categories: string[]; issuers: string[] }>();

  for (const row of rows) {
    const url = row.merchant_logo_url ?? '';
    if (url.includes('cuit_')) continue; // already processed in phase 1

    const norm = normalizeName(row.merchant_name);
    if (norm.length < 2) continue; // skip generic names like "."

    // Exact normalized match
    let matchedCuit = nameIndex.get(norm);
    if (matchedCuit) {
      exactMatches++;
      const entry = cuitMap.get(matchedCuit)!;
      if (!entry.issuers.includes(row.issuer)) entry.issuers.push(row.issuer);
      entry.promo_count++;
      continue;
    }

    // Fuzzy match against all known names
    let bestMatch: string | null = null;
    for (const [knownNorm, cuit] of nameIndex) {
      if (fuzzyMatch(norm, knownNorm)) {
        bestMatch = cuit;
        break;
      }
    }

    if (bestMatch) {
      fuzzyMatches++;
      const entry = cuitMap.get(bestMatch)!;
      if (!entry.names.includes(row.merchant_name)) entry.names.push(row.merchant_name);
      if (!entry.issuers.includes(row.issuer)) entry.issuers.push(row.issuer);
      if (!entry.categories.includes(row.category) && row.category) entry.categories.push(row.category);
      entry.promo_count++;
      // Update name index for future matches
      nameIndex.set(norm, bestMatch);
      continue;
    }

    // Unmatched
    if (!unmatched.has(row.merchant_name)) {
      unmatched.set(row.merchant_name, { count: 0, categories: [], issuers: [] });
    }
    const u = unmatched.get(row.merchant_name)!;
    u.count++;
    if (!u.categories.includes(row.category) && row.category) u.categories.push(row.category);
    if (!u.issuers.includes(row.issuer)) u.issuers.push(row.issuer);
  }

  console.log(`  Exact name matches: ${exactMatches}`);
  console.log(`  Fuzzy name matches: ${fuzzyMatches}`);
  console.log(`  Unmatched merchants: ${unmatched.size} unique names (${[...unmatched.values()].reduce((s, u) => s + u.count, 0)} promos)`);

  return { matched: exactMatches + fuzzyMatches, unmatched };
}

// ─── Phase 3: AFIP enrichment (optional) ───────────────────────────────────────

async function phase3_enrichAfip(cuitMap: Map<string, MerchantEntry>): Promise<void> {
  console.log('\n═══ Phase 3: AFIP Padron Enrichment ═══');

  if (!enrichAfip) {
    console.log('  Skipped (use --enrich-afip to enable)');
    return;
  }

  const https = await import('node:https');
  let enriched = 0;
  let failed = 0;

  // Rate-limit to 2 requests/second
  for (const [cuit, entry] of cuitMap) {
    try {
      const data = await new Promise<string>((resolve, reject) => {
        // Try the sistemasagiles mirror of the old AFIP REST API
        const url = `https://www.sistemasagiles.com.ar/padron/consulta/persona/${cuit}`;
        const req = https.get(url, { timeout: 10000 }, (res) => {
          let body = '';
          res.on('data', (c: Buffer) => body += c);
          res.on('end', () => resolve(body));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });

      const json = JSON.parse(data);
      if (json.denominacion || json.nombre) {
        entry.afip_razon_social = json.denominacion || `${json.apellido}, ${json.nombre}`;
        entry.afip_tipo_persona = json.tipo_persona || null;
        entry.afip_actividad = json.actividades?.[0]?.descripcion || null;
        entry.afip_domicilio = json.direccion
          ? `${json.direccion}, ${json.localidad}, ${json.provincia}`
          : null;
        enriched++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));

    if ((enriched + failed) % 50 === 0) {
      process.stderr.write(`  Progress: ${enriched} enriched, ${failed} failed / ${cuitMap.size}\n`);
    }
  }

  console.log(`  Enriched: ${enriched} / ${cuitMap.size}`);
  console.log(`  Failed: ${failed}`);
}

// ─── Phase 4: Output ───────────────────────────────────────────────────────────

function phase4_output(
  cuitMap: Map<string, MerchantEntry>,
  unmatched: Map<string, { count: number; categories: string[]; issuers: string[] }>,
): void {
  console.log('\n═══ Phase 4: Output ═══');

  // Sort by promo_count descending
  const merchants = [...cuitMap.values()].sort((a, b) => b.promo_count - a.promo_count);

  // Build the name→cuit reverse index for quick lookups
  const nameIndex: Record<string, string> = {};
  for (const m of merchants) {
    for (const name of m.names) {
      nameIndex[normalizeName(name)] = m.cuit;
    }
  }

  // Top unmatched merchants by promo count (for manual review)
  const topUnmatched = [...unmatched.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 200)
    .map(([name, info]) => ({
      merchant_name: name,
      promo_count: info.count,
      categories: info.categories,
      issuers: info.issuers,
    }));

  const output = {
    generated_at: new Date().toISOString(),
    stats: {
      total_cuits: merchants.length,
      total_brand_names: merchants.reduce((s, m) => s + m.names.length, 0),
      total_promos_covered: merchants.reduce((s, m) => s + m.promo_count, 0),
      unmatched_merchants: unmatched.size,
      unmatched_promos: [...unmatched.values()].reduce((s, u) => s + u.count, 0),
    },
    // CUIT → merchant mapping (primary lookup for QR scanning)
    by_cuit: Object.fromEntries(merchants.map(m => [m.cuit, m])),
    // Normalized name → CUIT reverse index (for fast name-based lookup)
    name_index: nameIndex,
    // Unmatched merchants needing manual CUIT assignment
    unmatched: topUnmatched,
  };

  mkdirSync(resolve(outPath, '..'), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`  Wrote ${outPath}`);
  console.log(`  ${merchants.length} CUITs covering ${output.stats.total_promos_covered} promos`);
  console.log(`  ${output.stats.total_brand_names} brand names indexed`);
  console.log(`  ${unmatched.size} merchants still unmatched (top ${topUnmatched.length} in file for review)`);

  // Summary of top merchants
  console.log('\n─── Top 20 Merchants by Promo Count ───');
  for (const m of merchants.slice(0, 20)) {
    console.log(`  ${m.cuit_formatted}  ${m.primary_name.padEnd(25)} ${String(m.promo_count).padStart(4)} promos  [${m.names.join(', ')}]`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Pagamax Merchant Map Builder');
  console.log('═══════════════════════════════════════════════════════');

  // Load consolidated data
  const ndjsonPath = findLatestNdjson(consolidatedDir);
  if (!ndjsonPath) {
    console.error(`No NDJSON found in ${consolidatedDir}`);
    process.exit(1);
  }
  console.log(`\nSource: ${ndjsonPath}`);

  const rows: ConsolidatedRow[] = readFileSync(ndjsonPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const d = JSON.parse(line);
      return {
        merchant_name: d.merchant_name ?? '',
        merchant_logo_url: d.merchant_logo_url ?? null,
        category: d.category ?? '',
        subcategory: d.subcategory ?? '',
        issuer: d.issuer ?? '',
        promo_key: d.promo_key ?? '',
        terms_text_raw: d.terms_text_raw ?? '',
      };
    });

  console.log(`Loaded ${rows.length} promo rows`);

  // Phase 1: NaranjaX logo URLs
  const cuitMap = phase1_extractCuits(rows);

  // Phase 1.25: Curated CUIT mappings
  phase1_25_curatedCuits(cuitMap);

  // Phase 1.5: Terms text CUIT extraction
  phase1_5_termsTextCuits(cuitMap, rows);

  // Phase 2: Cross-match by name
  const { unmatched } = phase2_crossMatch(cuitMap, rows);

  // Phase 3
  await phase3_enrichAfip(cuitMap);

  // Phase 4
  phase4_output(cuitMap, unmatched);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
