#!/usr/bin/env node
/**
 * enrich-cuit-lookup.ts — Look up CUITs for top unmatched merchants via dateas.com
 *
 * Reads the current merchants.json, finds unmatched merchants, looks them up
 * on dateas.com, and writes a curated mapping that can be merged into merchants.json.
 *
 * Usage:
 *   npx tsx src/qr/enrich-cuit-lookup.ts [--limit 50] [--out src/qr/curated-cuits.json]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as https from 'node:https';

const args = process.argv.slice(2);
const getArg = (f: string, d: string) => {
  const i = args.indexOf(f);
  return i !== -1 && args[i + 1] ? args[i + 1]! : d;
};

const lookupLimit = parseInt(getArg('--limit', '50'));
const outPath = resolve(getArg('--out', './src/qr/curated-cuits.json'));

// Search term overrides for better results on dateas.com
const SEARCH_OVERRIDES: Record<string, string> = {
  'Adidas': 'ADIDAS ARGENTINA',
  'Samsung': 'SAMSUNG ELECTRONICS ARGENTINA',
  'Sony': 'SONY ARGENTINA',
  'Grimoldi': 'GRIMOLDI',
  'Kevingston': 'KEVINGSTON',
  '47 Street': '47 STREET',
  'Cooperativa Obrera': 'COOPERATIVA OBRERA',
  'Mostaza': 'MOSTAZA',
  'Freddo': 'FREDDO',
  'Essen': 'ESSEN ALUMINIO',
  'Lacoste': 'LACOSTE ARGENTINA',
  'Musimundo': 'MUSIMUNDO',
  'Under Armour': 'UNDER ARMOUR',
  'Parfumerie': 'PARFUMERIE',
  'Grido': 'GRIDO',
  'BURGER KING': 'BURGER KING ARGENTINA',
  'McDonald\'s': 'ARCOS DORADOS',
  'YPF': 'YPF SOCIEDAD ANONIMA',
  'Rapanui': 'RAPANUI',
  'Plataforma 10': 'PLATAFORMA 10',
  'Prune': 'PRUNE',
  'Almundo': 'ALMUNDO',
  'Dexter': 'GRUPO DEXTER',
  'Montagne': 'MONTAGNE OUTDOORS',
  'Topper': 'TOPPER ALPARGATAS',
  'Puppis': 'PUPPIS',
  'Champion': 'CHAMPION ARGENTINA',
  'Luccianos': 'LUCCIANOS',
  'Naldo': 'NALDO LOMBARDI',
  'La Martina': 'LA MARTINA',
  'Tascani': 'TASCANI',
  'Narrow': 'NARROW',
  'Zona Zero': 'ZONA ZERO',
  'Kosiuko': 'KOSIUKO',
  'Farmaonline': 'FARMAONLINE',
  'Simones': 'SIMONES',
  'Equus': 'EQUUS',
  'Legacy': 'LEGACY ARGENTINA',
  'Rouge': 'ROUGE',
  'Macowens': 'MACOWENS',
  'Moov': 'MOOV',
  'Stock Center': 'STOCK CENTER',
  'Supermercados Toledo': 'TOLEDO SUPERMERCADO',
  'Supermercados Arcoiris': 'ARCOIRIS SUPERMERCADO',
  'Milanga': 'MILANGA',
  'Chungo': 'CHUNGO',
};

interface LookupResult {
  merchant_name: string;
  search_term: string;
  cuit: string | null;
  cuit_formatted: string | null;
  razon_social: string | null;
  confidence: number;
  all_results: Array<{ cuit: string; name: string }>;
}

async function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirect = res.headers.location;
        if (redirect) return fetchPage(redirect).then(resolve, reject);
      }
      let data = '';
      res.on('data', (c: Buffer) => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function lookupCuit(merchantName: string): Promise<LookupResult> {
  const searchTerm = SEARCH_OVERRIDES[merchantName] ?? merchantName.toUpperCase();
  const url = `https://www.dateas.com/es/consulta_cuit_cuil?name=${encodeURIComponent(searchTerm)}`;

  try {
    const html = await fetchPage(url);

    // Parse CUIT entries: format "XX-XXXXXXXX-X" followed by company name
    const results: Array<{ cuit: string; name: string }> = [];
    const regex = /(\d{2}-\d{8}-\d)\s*<\/[^>]+>\s*[^<]*<[^>]+>\s*([^<]+)/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
      results.push({ cuit: m[1]!, name: m[2]!.trim() });
    }

    // Fallback: just find CUIT patterns
    if (results.length === 0) {
      const cuitPattern = /(\d{2}-\d{8}-\d)/g;
      let cm;
      while ((cm = cuitPattern.exec(html)) !== null) {
        results.push({ cuit: cm[1]!, name: '(unknown)' });
      }
    }

    // Try to pick the best match
    const searchNorm = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '');
    let best: { cuit: string; name: string } | null = null;
    let bestScore = 0;

    for (const r of results) {
      const nameNorm = r.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      // Prefer results that start with "30-" (juridica) over "20-" (persona fisica)
      const isJuridica = r.cuit.startsWith('30') || r.cuit.startsWith('33') || r.cuit.startsWith('34');
      let score = 0;
      if (nameNorm.includes(searchNorm) || searchNorm.includes(nameNorm)) score += 10;
      if (isJuridica) score += 5;
      if (r.name.toLowerCase().includes('s.a') || r.name.toLowerCase().includes('s.r.l')) score += 3;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    // If no smart match, take the first juridica result
    if (!best) {
      best = results.find(r => r.cuit.startsWith('30') || r.cuit.startsWith('33')) ?? results[0] ?? null;
    }

    return {
      merchant_name: merchantName,
      search_term: searchTerm,
      cuit: best ? best.cuit.replace(/-/g, '') : null,
      cuit_formatted: best?.cuit ?? null,
      razon_social: best?.name ?? null,
      confidence: bestScore >= 10 ? 0.9 : bestScore >= 5 ? 0.7 : 0.5,
      all_results: results.slice(0, 5),
    };
  } catch (err) {
    return {
      merchant_name: merchantName,
      search_term: searchTerm,
      cuit: null,
      cuit_formatted: null,
      razon_social: null,
      confidence: 0,
      all_results: [],
    };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Pagamax CUIT Enrichment (dateas.com lookup)');
  console.log('═══════════════════════════════════════════════════════');

  // Load current merchants.json to find unmatched
  const merchantsPath = resolve('./src/qr/merchants.json');
  const merchants = JSON.parse(readFileSync(merchantsPath, 'utf8'));
  const unmatched: Array<{ merchant_name: string; promo_count: number }> = merchants.unmatched;

  // Filter to actual named businesses
  const candidates = unmatched
    .filter(u =>
      u.merchant_name.length > 3 &&
      !u.merchant_name.toLowerCase().includes('comercios') &&
      !u.merchant_name.toLowerCase().includes('adheridos') &&
      !u.merchant_name.toLowerCase().includes('consulta') &&
      !u.merchant_name.toLowerCase().includes('beneficio para') &&
      !u.merchant_name.toLowerCase().includes('todos los')
    )
    .slice(0, lookupLimit);

  console.log(`\nLooking up ${candidates.length} merchants...\n`);

  const results: LookupResult[] = [];
  let found = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    process.stderr.write(`  [${i + 1}/${candidates.length}] ${c.merchant_name}...`);

    const result = await lookupCuit(c.merchant_name);
    results.push(result);

    if (result.cuit) {
      found++;
      process.stderr.write(` → ${result.cuit_formatted} (${result.razon_social})\n`);
    } else {
      process.stderr.write(` → not found\n`);
    }

    // Rate limit: 1 request per second
    await new Promise(r => setTimeout(r, 1000));
  }

  // Write results
  writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    total_looked_up: candidates.length,
    total_found: found,
    results: results.filter(r => r.cuit),
    not_found: results.filter(r => !r.cuit).map(r => r.merchant_name),
  }, null, 2), 'utf8');

  console.log(`\n═══ Results ═══`);
  console.log(`  Found: ${found} / ${candidates.length}`);
  console.log(`  Written to: ${outPath}`);
}

main().catch(console.error);
