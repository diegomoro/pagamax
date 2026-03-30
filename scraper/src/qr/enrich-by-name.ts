#!/usr/bin/env node
/**
 * enrich-by-name.ts — Find CUITs for unmatched merchants by name search on cuitonline.com
 *
 * Reads the `unmatched` array from merchants.json, filters out generic terms,
 * searches cuitonline.com by name (JURIDICA only), picks best match by name
 * similarity, and adds confident matches to merchants.json as new by_cuit entries.
 *
 * Usage:
 *   npx tsx src/qr/enrich-by-name.ts [--limit 50] [--delay 1200] [--min-score 0.75] [--dry-run]
 *
 * --limit N       Max merchants to process (default: all)
 * --delay N       ms between requests (default: 1200)
 * --min-score N   Minimum similarity score 0–1 to accept a match (default: 0.75)
 * --dry-run       Print matches without writing to merchants.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as https from 'node:https';

// ─── CLI ───────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const getArg = (f: string, d: string) => { const i = argv.indexOf(f); return i !== -1 && argv[i + 1] ? argv[i + 1]! : d; };
const LIMIT     = parseInt(getArg('--limit', '99999'));
const DELAY_MS  = parseInt(getArg('--delay', '1200'));
const MIN_SCORE = parseFloat(getArg('--min-score', '0.75'));
const DRY_RUN   = argv.includes('--dry-run');

const merchantsPath = resolve('./src/qr/merchants.json');

// ─── Types ─────────────────────────────────────────────────────────────────────

interface UnmatchedEntry {
  merchant_name: string;
  promo_count: number;
  categories: string[];
  issuers: string[];
}

interface CuitResult {
  cuit: string;
  name: string;
  tipo: 'JURIDICA' | 'FISICA';
  score: number;
}

interface MerchantEntry {
  cuit: string;
  cuit_formatted: string;
  names: string[];
  primary_name: string;
  categories: string[];
  subcategories: string[];
  mcc_codes: string[];
  promo_count: number;
  issuers: string[];
  afip_razon_social: string | null;
  afip_tipo_persona: string | null;
  afip_actividad: string | null;
  afip_domicilio: string | null;
  logo_url: string | null;
  source: string;
  confidence: number;
}

interface MerchantsFile {
  generated_at: string;
  stats: Record<string, number>;
  by_cuit: Record<string, MerchantEntry>;
  name_index: Record<string, string>;
  unmatched: UnmatchedEntry[];
}

// ─── Generic term filter ───────────────────────────────────────────────────────

// Terms that indicate a catch-all promo (not a specific merchant)
const GENERIC_PATTERNS = [
  /\badherido/i, /\bcomercio/i, /\blocal(es)?\b/i, /\bconsulta\b/i,
  /\btodos los\b/i, /\bvarios\b/i, /\bsupermercado.*adherido/i,
  /\bestaci[oó]n.*servicio.*adherid/i, /\bfarmacias? adherid/i,
  /\baccept/i, /\btienda.*online.*adherid/i, /\bbenefi.*emplead/i,
  /\bseleccionado/i, /^Sin datos$/i, /^N\/A$/i,
];

function isGenericTerm(name: string): boolean {
  return GENERIC_PATTERNS.some(p => p.test(name));
}

// ─── Name normalization ────────────────────────────────────────────────────────

// Remove legal entity suffixes for comparison
const LEGAL_SUFFIXES = /\s+(S\.?A\.?S?\.?|S\.?R\.?L\.?|S\.?C\.?S?\.?|LTDA?\.?|INC\.?|CORP\.?|SCS?|SPA|E\.V|SA\s+DE\s+CV)\s*$/i;
const ACCENTMAP: Record<string, string> = { á:'a',é:'e',í:'i',ó:'o',ú:'u',ü:'u',ñ:'n',Á:'a',É:'e',Í:'i',Ó:'o',Ú:'u',Ü:'u',Ñ:'n' };

function normalize(s: string): string {
  return s
    .replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, c => ACCENTMAP[c] ?? c)
    .replace(LEGAL_SUFFIXES, '')
    .replace(/\s+(SOCIEDAD\s+ANONIMA|SOCIEDAD\s+SIMPLE|SOCIEDAD\s+EN\s+COMANDITA\s+SIMPLE|COOPERATIVA.*LTDA)/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameSimilarity(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);

  if (q === c) return 1.0;

  const qWords = q.split(/\s+/).filter(w => w.length > 1);
  const cWords = c.split(/\s+/).filter(w => w.length > 1);
  if (qWords.length === 0) return 0;

  // Starts-with shortcut: candidate must not have significantly more words than query.
  // "Legacy" (1 word) vs "LEGACY SA" (1 word after strip) → OK
  // "Enigma" (1 word) vs "ENIGMA VIDEO SRL" (2 words) → NOT OK (different business)
  // For single-word queries: zero extra content words allowed (SA/SRL already stripped)
  const extraWords = Math.max(0, cWords.length - qWords.length);
  const maxExtra = qWords.length <= 1 ? 0 : Math.max(1, Math.floor(qWords.length * 0.5));
  if (c.startsWith(q) && q.length >= 5 && extraWords <= maxExtra) return 0.93;

  // Word overlap with length penalty
  const qSet = new Set(qWords);
  let matches = 0;
  for (const w of qSet) {
    if (cWords.includes(w)) matches++;
  }
  const precision = matches / qSet.size;
  const recall    = matches / Math.max(cWords.length, 1);

  if (precision === 0) return 0;

  // When ALL query words found in candidate, it's almost certainly the right entity
  // IF the query forms a significant portion of the candidate string length.
  // "pinturerias del centro" in "GRANDES PINTURERIAS DEL CENTRO" → ok (coverage=0.73)
  // "nube de algodon" in "JARDIN DE INFANTES NUBE DE ALGODON" → reject (coverage=0.50)
  if (precision === 1.0 && qSet.size >= 2) {
    const lengthCoverage = q.length / Math.max(c.length, 1);
    if (c.startsWith(q) || lengthCoverage >= 0.60) {
      const extraWords = Math.max(0, cWords.length - qWords.length);
      return Math.max(0.77, 1.0 - extraWords * 0.08);
    }
    // Coverage too low — fall through to F1 (likely embedded in unrelated name)
  }

  // F1 weighted toward precision, with strong length-ratio penalty
  const f1 = (2 * precision * recall) / (precision + recall);
  const lengthPenalty = Math.min(1, q.length / Math.max(c.length, 1));

  return f1 * (0.4 + 0.6 * lengthPenalty);
}

// ─── CUIT formatter ───────────────────────────────────────────────────────────

function formatCuit(digits: string): string {
  const d = digits.replace(/\D/g, '');
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

// ─── cuitonline.com search ────────────────────────────────────────────────────

function httpsGet(url: string): Promise<string> {
  return new Promise((res) => {
    const req = https.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
    }, (r) => {
      let data = '';
      r.on('data', (c: Buffer) => data += c);
      r.on('end', () => res(data));
    });
    req.on('error', () => res(''));
    req.on('timeout', () => { req.destroy(); res(''); });
  });
}

async function searchByName(brandName: string): Promise<CuitResult[]> {
  const encoded = encodeURIComponent(brandName);
  // f5%5B%5D=persona%3Ajuridica → filter to JURIDICA only
  const url = `https://www.cuitonline.com/search.php?q=${encoded}&f5%5B%5D=persona%3Ajuridica&pn=1`;
  const html = await httpsGet(url);
  if (!html) return [];

  const results: CuitResult[] = [];

  // Parse each .hit block
  // Pattern: <h2 class="denominacion" ...>NAME</h2> ... <span class="cuit">XX-XXXXXXXX-X</span> ... Persona&nbsp;Jurídica/Física
  const hitPattern = /<div class="hit"[^>]*>([\s\S]*?)<div style="clear:both;"><\/div>\s*<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = hitPattern.exec(html)) !== null) {
    const block = m[1]!;

    const nameMatch = block.match(/<h2[^>]*class=["']denominacion["'][^>]*>([^<]+)</i);
    const cuitMatch = block.match(/<span class="cuit">([^<]+)<\/span>/);
    const isFisica  = /Persona\s*&nbsp;\s*F[ií]sica/i.test(block);
    const isJuridica = /Persona\s*&nbsp;\s*Jur[ií]dica/i.test(block);

    if (!nameMatch || !cuitMatch) continue;

    const rawName = nameMatch[1]!.trim();
    const rawCuit = cuitMatch[1]!.replace(/\D/g, '');
    if (rawCuit.length !== 11) continue;

    const tipo: 'JURIDICA' | 'FISICA' = isFisica ? 'FISICA' : 'JURIDICA';
    // Skip physical persons — we only want corporate entities
    if (tipo === 'FISICA') continue;

    const score = nameSimilarity(brandName, rawName);

    results.push({ cuit: rawCuit, name: rawName, tipo, score });
  }

  return results.sort((a, b) => b.score - a.score);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Pagamax — Enrich unmatched merchants by name search');
  console.log('═══════════════════════════════════════════════════════\n');

  const merchants: MerchantsFile = JSON.parse(readFileSync(merchantsPath, 'utf8'));

  // Get unmatched merchants, skip generics, sort by promo_count desc
  const candidates = (merchants.unmatched || [])
    .filter(u => !isGenericTerm(u.merchant_name))
    .filter(u => !merchants.name_index[u.merchant_name.toLowerCase()])  // not already mapped
    .filter(u => !Object.values(merchants.by_cuit).some(e => e.names.includes(u.merchant_name)))
    .sort((a, b) => b.promo_count - a.promo_count)
    .slice(0, LIMIT);

  console.log(`Unmatched in file:    ${(merchants.unmatched || []).length}`);
  console.log(`After generic filter: ${candidates.length} real brand names`);
  console.log(`Min similarity score: ${MIN_SCORE}`);
  console.log(`Delay:                ${DELAY_MS}ms`);
  if (DRY_RUN) console.log('DRY RUN — no writes\n');
  else console.log('');

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i++) {
    const u = candidates[i]!;
    process.stdout.write(`[${i + 1}/${candidates.length}] "${u.merchant_name}" (${u.promo_count}p) → `);

    const results = await searchByName(u.merchant_name);

    if (results.length === 0) {
      console.log('no results');
      failed++;
    } else {
      const best = results[0]!;
      if (best.score >= MIN_SCORE) {
        // Check not already in by_cuit
        if (merchants.by_cuit[best.cuit]) {
          // Merge: just add the merchant name to existing entry
          const existing = merchants.by_cuit[best.cuit]!;
          if (!existing.names.includes(u.merchant_name)) {
            existing.names.push(u.merchant_name);
            existing.promo_count = Math.max(existing.promo_count, u.promo_count);
          }
          console.log(`merged → ${best.cuit} (${best.name}) [score=${best.score.toFixed(2)}] [already existed]`);
          added++;
        } else {
          // Add new entry
          const newEntry: MerchantEntry = {
            cuit: best.cuit,
            cuit_formatted: formatCuit(best.cuit),
            names: [u.merchant_name],
            primary_name: u.merchant_name,
            categories: u.categories,
            subcategories: [],
            mcc_codes: [],
            promo_count: u.promo_count,
            issuers: u.issuers,
            afip_razon_social: best.name,
            afip_tipo_persona: best.tipo,
            afip_actividad: null,
            afip_domicilio: null,
            logo_url: null,
            source: 'name_search',
            confidence: best.score,
          };
          if (!DRY_RUN) {
            merchants.by_cuit[best.cuit] = newEntry;
            merchants.name_index[u.merchant_name.toLowerCase()] = best.cuit;
          }
          console.log(`✓ ${best.cuit} → "${best.name}" [score=${best.score.toFixed(2)}]`);
          added++;
        }
      } else {
        const top3 = results.slice(0, 3).map(r => `"${r.name}"(${r.score.toFixed(2)})`).join(', ');
        console.log(`low score — best: ${top3}`);
        skipped++;
      }
    }

    // Save every 20 records
    if (!DRY_RUN && (added + skipped + failed) % 20 === 0 && i > 0) {
      merchants.generated_at = new Date().toISOString();
      writeFileSync(merchantsPath, JSON.stringify(merchants, null, 2), 'utf8');
      console.log(`  [CHECKPOINT] saved`);
    }

    if (i < candidates.length - 1) await sleep(DELAY_MS);
  }

  if (!DRY_RUN) {
    merchants.generated_at = new Date().toISOString();
    writeFileSync(merchantsPath, JSON.stringify(merchants, null, 2), 'utf8');
  }

  console.log('\n═══ Results ═══');
  console.log(`  Added/merged: ${added}`);
  console.log(`  Low score:    ${skipped}`);
  console.log(`  No results:   ${failed}`);
  console.log(`  Total CUITs:  ${Object.keys(merchants.by_cuit).length}`);
  if (!DRY_RUN) console.log(`  Saved to: ${merchantsPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
