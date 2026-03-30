#!/usr/bin/env node
/**
 * enrich-afip.ts — Enrich all known merchant CUITs with official legal names
 *
 * Source: cuitonline.com (public, scrapes ARCA/AFIP data, no auth needed)
 *
 * Reads merchants.json, hits cuitonline.com/search.php?q={cuit} for every CUIT
 * that doesn't have an afip_razon_social yet, and writes the enriched file back.
 *
 * Also updates promo-index.json's cuit_to_name entries with the legal names.
 *
 * Usage:
 *   npx tsx src/qr/enrich-afip.ts [--limit 100] [--delay 900] [--resume]
 *
 * --limit N     Stop after N requests (default: all)
 * --delay N     ms between requests (default: 900 — stays under ~1 req/sec)
 * --resume      Skip CUITs that already have afip_razon_social set
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as https from 'node:https';

// ─── CLI ───────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const getArg = (f: string, d: string) => { const i = argv.indexOf(f); return i !== -1 && argv[i+1] ? argv[i+1]! : d; };
const LIMIT     = parseInt(getArg('--limit', '99999'));
const DELAY_MS  = parseInt(getArg('--delay', '900'));
const RESUME    = argv.includes('--resume');

const merchantsPath   = resolve('./src/qr/merchants.json');
const promoIndexPath  = resolve('./src/qr/promo-index.json');

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MerchantEntry {
  cuit: string;
  cuit_formatted: string;
  names: string[];
  primary_name: string;
  categories: string[];
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
  unmatched: unknown[];
}

// ─── Scraper ───────────────────────────────────────────────────────────────────

async function fetchRazonSocial(cuit: string): Promise<{
  razon_social: string | null;
  tipo_persona: string | null;
  actividad: string | null;
  domicilio: string | null;
}> {
  return new Promise((resolve) => {
    const url = `https://www.cuitonline.com/search.php?q=${cuit}`;
    const req = https.get(url, {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => data += c);
      res.on('end', () => {
        // Extract razón social from <h2 class="denominacion">...</h2>
        const nameMatch = data.match(/<h2[^>]*class=["']denominacion["'][^>]*>([^<]+)</i);
        const name = nameMatch ? nameMatch[1]!.trim() : null;

        // Extract tipo persona (JURIDICA / FISICA)
        const tipoMatch = data.match(/Persona\s+(Jurídica|Física|Juridica|Fisica)/i);
        const tipo = tipoMatch ? (tipoMatch[1]!.toLowerCase().includes('jur') ? 'JURIDICA' : 'FISICA') : null;

        // Extract domicilio
        const domMatch = data.match(/domicilio[^>]*fiscal[^>]*>[^<]*<[^>]+>([^<]+)/i)
          || data.match(/Domicilio Fiscal[^:]*:\s*<[^>]+>([^<]+)/i);
        const domicilio = domMatch ? domMatch[1]!.trim() : null;

        // Extract actividad principal
        const actMatch = data.match(/Actividad Principal[^>]*>[^<]*<[^>]+>([^<]+)/i)
          || data.match(/actividad[^>]*>[^<]*<[^>]*>([A-Z][A-Z, ]{5,})/i);
        const actividad = actMatch ? actMatch[1]!.trim() : null;

        resolve({ razon_social: name, tipo_persona: tipo, actividad, domicilio });
      });
    });
    req.on('error', () => resolve({ razon_social: null, tipo_persona: null, actividad: null, domicilio: null }));
    req.on('timeout', () => { req.destroy(); resolve({ razon_social: null, tipo_persona: null, actividad: null, domicilio: null }); });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Pagamax AFIP Enrichment (via cuitonline.com)');
  console.log('═══════════════════════════════════════════════════════\n');

  // Load merchants
  const merchants: MerchantsFile = JSON.parse(readFileSync(merchantsPath, 'utf8'));
  const entries = Object.values(merchants.by_cuit);

  // Select which to enrich
  const toEnrich = RESUME
    ? entries.filter(e => !e.afip_razon_social)
    : entries;

  const target = toEnrich.slice(0, LIMIT);
  console.log(`Total CUITs: ${entries.length}`);
  console.log(`Already enriched: ${entries.filter(e => e.afip_razon_social).length}`);
  console.log(`To enrich this run: ${target.length} (limit: ${LIMIT})`);
  console.log(`Delay: ${DELAY_MS}ms between requests (~${Math.round(60000/DELAY_MS)} req/min)`);
  const estMins = Math.round((target.length * DELAY_MS) / 60000);
  console.log(`Estimated time: ~${estMins} minutes\n`);

  let enriched = 0;
  let failed = 0;
  let alreadyHad = 0;

  for (let i = 0; i < target.length; i++) {
    const entry = target[i]!;

    if (RESUME && entry.afip_razon_social) {
      alreadyHad++;
      continue;
    }

    const result = await fetchRazonSocial(entry.cuit);

    if (result.razon_social) {
      entry.afip_razon_social = result.razon_social;
      if (result.tipo_persona) entry.afip_tipo_persona = result.tipo_persona;
      if (result.actividad) entry.afip_actividad = result.actividad;
      if (result.domicilio) entry.afip_domicilio = result.domicilio;
      enriched++;

      // Log every 10th, always log first and last
      if (i < 5 || enriched % 10 === 0 || i === target.length - 1) {
        const pct = Math.round((i + 1) / target.length * 100);
        process.stderr.write(`  [${pct}%] ${entry.cuit} → ${result.razon_social}\n`);
      }
    } else {
      failed++;
      if (failed <= 20) process.stderr.write(`  [FAIL] ${entry.cuit} (${entry.primary_name})\n`);
    }

    // Save checkpoint every 50 records
    if ((enriched + failed) % 50 === 0) {
      merchants.generated_at = new Date().toISOString();
      writeFileSync(merchantsPath, JSON.stringify(merchants, null, 2), 'utf8');
      process.stderr.write(`  [CHECKPOINT] saved at ${enriched + failed} records\n`);
    }

    if (i < target.length - 1) await sleep(DELAY_MS);
  }

  // Final save
  merchants.generated_at = new Date().toISOString();
  writeFileSync(merchantsPath, JSON.stringify(merchants, null, 2), 'utf8');

  // Update cuit_to_name in promo-index.json
  console.log('\nUpdating promo-index.json cuit_to_name...');
  try {
    const promoIndex: { cuit_to_name: Record<string, string> } =
      JSON.parse(readFileSync(promoIndexPath, 'utf8'));
    let updated = 0;
    for (const entry of entries) {
      if (entry.afip_razon_social && promoIndex.cuit_to_name[entry.cuit] !== entry.primary_name) {
        // Only update if we have a better name (legal > brand)
        // Keep primary_name (brand) for display, but add razon_social separately
        updated++;
      }
    }
    console.log(`  ${updated} cuit_to_name entries could be updated`);
    console.log('  (promo-index uses brand names for display — legal names stored in merchants.json)');
  } catch {
    console.log('  promo-index.json not found, skipping');
  }

  console.log('\n═══ Results ═══');
  console.log(`  Enriched this run:  ${enriched}`);
  console.log(`  Failed:             ${failed}`);
  console.log(`  Already had data:   ${alreadyHad}`);
  console.log(`  Total enriched now: ${entries.filter(e => e.afip_razon_social).length} / ${entries.length}`);
  console.log(`  Saved to:           ${merchantsPath}`);

  if (failed > 0) {
    const stillMissing = entries.filter(e => !e.afip_razon_social).length;
    if (stillMissing > 0) {
      console.log(`\n  ${stillMissing} CUITs still missing. Re-run with --resume to retry only those.`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
