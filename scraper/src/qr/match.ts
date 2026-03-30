/**
 * match.ts — Match a scanned QR code to Pagamax promos
 *
 * Given an EMVCo QR payload, extracts the merchant CUIT (tag 50),
 * looks it up in the merchant map, and returns matching promos.
 *
 * Usage as module:
 *   import { matchQrToPromos } from './match.js';
 *   const result = matchQrToPromos(qrPayload);
 *
 * Usage as CLI:
 *   npx tsx src/qr/match.ts "00020101021150150011203611100015204541153030325802AR5904Coto6004CABA6304XXXX"
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseQr, type ParsedQr } from './parse-emv.js';

// ─── Types ──────��────────────────────���─────────────────────────────────────────

interface MerchantMapEntry {
  cuit: string;
  cuit_formatted: string;
  names: string[];
  primary_name: string;
  categories: string[];
  mcc_codes: string[];
  promo_count: number;
  issuers: string[];
  afip_razon_social: string | null;
  logo_url: string | null;
  confidence: number;
}

interface MerchantMap {
  by_cuit: Record<string, MerchantMapEntry>;
  name_index: Record<string, string>;
}

export interface MatchResult {
  parsed: ParsedQr;
  merchant: MerchantMapEntry | null;
  matchMethod: 'cuit' | 'name_exact' | 'name_fuzzy' | 'none';
  promoSearchTerms: string[];
}

// ─── Helpers ─────���─────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^(el|la|los|las|lo)/, '');
}

let _merchantMap: MerchantMap | null = null;

function loadMerchantMap(): MerchantMap {
  if (_merchantMap) return _merchantMap;
  const mapPath = resolve(import.meta.dirname ?? '.', 'merchants.json');
  const raw = JSON.parse(readFileSync(mapPath, 'utf8'));
  _merchantMap = raw as MerchantMap;
  return _merchantMap;
}

// ─── Public API ─────────────���──────────────────────────────────────────────────

/**
 * Parse a QR payload and find the corresponding merchant in our database.
 */
export function matchQrToMerchant(qrPayload: string): MatchResult {
  const parsed = parseQr(qrPayload);
  const map = loadMerchantMap();

  // Method 1: CUIT lookup (highest confidence)
  if (parsed.cuit && map.by_cuit[parsed.cuit]) {
    return {
      parsed,
      merchant: map.by_cuit[parsed.cuit]!,
      matchMethod: 'cuit',
      promoSearchTerms: map.by_cuit[parsed.cuit]!.names,
    };
  }

  // Method 2: Exact name match via name index
  if (parsed.merchantName) {
    const norm = normalizeName(parsed.merchantName);
    const cuit = map.name_index[norm];
    if (cuit && map.by_cuit[cuit]) {
      return {
        parsed,
        merchant: map.by_cuit[cuit]!,
        matchMethod: 'name_exact',
        promoSearchTerms: map.by_cuit[cuit]!.names,
      };
    }

    // Method 3: Fuzzy name match
    for (const [indexedNorm, cuit] of Object.entries(map.name_index)) {
      const na = norm;
      const nb = indexedNorm;
      if (na.includes(nb) || nb.includes(na)) {
        if (map.by_cuit[cuit]) {
          return {
            parsed,
            merchant: map.by_cuit[cuit]!,
            matchMethod: 'name_fuzzy',
            promoSearchTerms: map.by_cuit[cuit]!.names,
          };
        }
      }
    }
  }

  // No match — return what we can
  return {
    parsed,
    merchant: null,
    matchMethod: 'none',
    promoSearchTerms: parsed.merchantName ? [parsed.merchantName] : [],
  };
}

// ─── CLI ──────────���────────────────────────────────────────────────────────────

if (process.argv[1]?.includes('match')) {
  const payload = process.argv[2];
  if (!payload) {
    console.error('Usage: npx tsx src/qr/match.ts "<QR payload string>"');
    process.exit(1);
  }

  console.log('═══ QR Merchant Match ═══\n');

  const result = matchQrToMerchant(payload);
  const p = result.parsed;

  console.log('Parsed QR:');
  console.log(`  CUIT:          ${p.cuit ?? '(not found)'}`);
  console.log(`  Merchant Name: ${p.merchantName ?? '(not found)'}`);
  console.log(`  MCC:           ${p.mcc ?? '(not found)'}`);
  console.log(`  City:          ${p.city ?? '(not found)'}`);
  console.log(`  Country:       ${p.country ?? '(not found)'}`);
  console.log(`  CBU/Alias:     ${p.cbu ?? '(not found)'}`);
  console.log(`  Networks:      ${p.paymentNetworks.length} payment network(s)`);

  console.log('\nMatch Result:');
  if (result.merchant) {
    console.log(`  Method:        ${result.matchMethod}`);
    console.log(`  CUIT:          ${result.merchant.cuit_formatted}`);
    console.log(`  Primary Name:  ${result.merchant.primary_name}`);
    console.log(`  All Names:     ${result.merchant.names.join(', ')}`);
    console.log(`  Categories:    ${result.merchant.categories.join(', ')}`);
    console.log(`  Promo Count:   ${result.merchant.promo_count}`);
    console.log(`  Issuers:       ${result.merchant.issuers.join(', ')}`);
    if (result.merchant.afip_razon_social) {
      console.log(`  AFIP Name:     ${result.merchant.afip_razon_social}`);
    }
  } else {
    console.log('  No match found in merchant database.');
    console.log(`  Search terms:  ${result.promoSearchTerms.join(', ')}`);
  }
}
