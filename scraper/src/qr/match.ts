/**
 * match.ts — QR scan → promo lookup engine
 *
 * Full flow:
 *   1. Parse EMVCo QR payload → extract CUIT (tag 50), merchant name (tag 59), MCC (tag 52)
 *   2. Resolve merchant via CUIT lookup, then name lookup
 *   3. Load all promos for that merchant from promo-index.json
 *   4. Filter by: day of week, payment method (issuer / card brand / card type / rail)
 *   5. Rank by discount value (best deal first)
 *   6. Return structured result grouped by issuer
 *
 * Usage as module:
 *   import { matchQr } from './match.js';
 *   const result = matchQr(qrPayload, { today: '2026-03-29', issuer: 'modo', cardBrand: 'visa', cardType: 'credit' });
 *
 * Usage as CLI:
 *   npx tsx src/qr/match.ts "<QR payload>" [--today 2026-03-29] [--issuer modo] [--brand visa] [--type credit]
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseQr } from './parse-emv.js';
import type { PromoSummary } from './build-promo-index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MatchOptions {
  /** Today's date as YYYY-MM-DD (default: today) */
  today?: string;
  /** Which wallet/app the user is paying with — filters promos to that issuer's deals */
  issuer?: string;
  /** Card brand selected at payment (visa, master, cabal, naranja x, amex …) */
  cardBrand?: string;
  /** Card type: 'credit' | 'debit' | 'account_money' */
  cardType?: string;
  /** Physical rail: 'qr' | 'nfc' | 'card' (default: 'qr') */
  rail?: string;
  /** If true, include promos from all issuers even when issuer is set */
  allIssuers?: boolean;
}

export interface PromoMatch extends PromoSummary {
  match_reason: string;   // 'cuit' | 'name_exact' | 'name_fuzzy'
  relevance_score: number;
}

export interface IssuerGroup {
  issuer: string;
  promos: PromoMatch[];
  best_discount_percent: number | null;
}

export interface MatchResult {
  /** How the merchant was identified */
  match_method: 'cuit' | 'name_exact' | 'name_fuzzy' | 'none';
  /** Resolved CUIT (if found) */
  cuit: string | null;
  /** Best known name for the merchant */
  merchant_name: string;
  /** Raw fields from the QR */
  qr: {
    cuit: string | null;
    name: string | null;
    mcc: string | null;
    city: string | null;
    cbu: string | null;
  };
  /** All matching promos, best-first */
  promos: PromoMatch[];
  /** Promos grouped by issuer */
  by_issuer: IssuerGroup[];
  /** Total number of promos found before filter */
  total_unfiltered: number;
  /** Applied filters summary */
  filters_applied: string[];
}

// ─── Index loader ───────────────────────────────────────────────────────────────

interface PromoIndex {
  promos: PromoSummary[];
  by_cuit: Record<string, number[]>;
  by_name: Record<string, number[]>;
  cuit_to_name: Record<string, string>;
}

let _index: PromoIndex | null = null;
function loadIndex(): PromoIndex {
  if (_index) return _index;
  const p = resolve(__dirname, 'promo-index.json');
  _index = JSON.parse(readFileSync(p, 'utf8')) as PromoIndex;
  return _index;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const DAYS: Record<string, number> = {
  sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6,
  domingo:0, lunes:1, martes:2, miercoles:3, jueves:4, viernes:5, sabado:6,
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^(el|la|los|las|lo)/, '');
}

function dayOfWeek(dateStr: string): string {
  const names = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  return names[new Date(dateStr + 'T12:00:00').getDay()]!;
}

/** Returns true if the promo is valid on the given day */
function isValidDay(promo: PromoSummary, day: string): boolean {
  const pat = promo.day_pattern.toLowerCase();
  if (!pat || pat === 'everyday' || pat === 'todos los dias') return true;
  const promoDay = DAYS[day];
  if (promoDay === undefined) return true;
  return pat.split(/[;,]\s*/).some(d => {
    const normD = d.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return DAYS[normD] === promoDay;
  });
}

/** Returns true if the promo's channel allows QR in-store payments */
function isQrEligible(promo: PromoSummary): boolean {
  const rail = promo.rail.toLowerCase();
  const chan = promo.channel.toLowerCase();
  return rail.includes('qr') || rail.includes('nfc') || chan.includes('in-store') || chan.includes('mixed') || rail === 'unknown';
}

/** Returns true if the promo matches the selected card brand */
function matchesBrand(promo: PromoSummary, brand: string): boolean {
  if (!brand) return true;
  const scope = promo.card_brand_scope.toLowerCase();
  if (!scope || scope === 'any' || scope === '') return true;
  const normBrand = brand.toLowerCase().replace(/\s+/g, '');
  return scope.split(/[;,]\s*/).some(s => {
    const ns = s.trim().replace(/\s+/g, '');
    return ns.includes(normBrand) || normBrand.includes(ns);
  });
}

/** Returns true if the promo matches the selected card type */
function matchesCardType(promo: PromoSummary, cardType: string): boolean {
  if (!cardType) return true;
  const scope = promo.card_type_scope.toLowerCase();
  if (!scope || scope === 'any' || scope === '') return true;
  const normType = cardType.toLowerCase();
  // account_money → matches 'cuenta' / 'dinero en cuenta'
  if (normType === 'account_money') {
    return scope.includes('cuenta') || scope.includes('account') || scope.includes('debito') || scope.includes('debit');
  }
  return scope.split(/[;,]\s*/).some(s => s.trim().includes(normType) || normType.includes(s.trim()));
}

/** Returns true if the promo's issuer matches */
function matchesIssuer(promo: PromoSummary, issuer: string): boolean {
  if (!issuer) return true;
  return promo.issuer.toLowerCase() === issuer.toLowerCase();
}

/** Score a promo for ranking — higher is better */
function scorePromo(promo: PromoSummary): number {
  let score = 0;
  // Discount value
  if (promo.discount_percent) score += promo.discount_percent * 2;
  if (promo.discount_type === 'direct_discount') score += 10; // instant > cashback
  if (promo.discount_type === 'cashback') score += 6;
  if (promo.discount_type === 'coupon_discount') score += 5;
  // Installments — value is in count, not percent
  if (promo.discount_type === 'installments' && promo.installments_count) {
    score += Math.min(promo.installments_count, 18); // cap at 18
  }
  // Penalise low data quality proxies
  if (!promo.cap_amount_ars) score += 5; // uncapped promos are more valuable
  if (promo.valid_to) {
    const daysLeft = (new Date(promo.valid_to).getTime() - Date.now()) / 86400000;
    if (daysLeft > 30) score += 2; // long-validity promos are safer
  }
  return score;
}

// ─── Core match function ───────────────────────────────────────────────────────

export function matchQr(qrPayload: string, opts: MatchOptions = {}): MatchResult {
  const index = loadIndex();
  const parsed = parseQr(qrPayload);
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const todayName = dayOfWeek(today);
  const filtersApplied: string[] = [];

  let promoIndices: number[] = [];
  let matchMethod: MatchResult['match_method'] = 'none';
  let resolvedCuit: string | null = null;
  let resolvedName = parsed.merchantName ?? '';

  // 1. CUIT lookup (most reliable)
  if (parsed.cuit && index.by_cuit[parsed.cuit]) {
    promoIndices = index.by_cuit[parsed.cuit]!;
    resolvedCuit = parsed.cuit;
    resolvedName = index.cuit_to_name[parsed.cuit] ?? parsed.merchantName ?? parsed.cuit;
    matchMethod = 'cuit';
  }

  // 2. Exact name lookup
  if (promoIndices.length === 0 && parsed.merchantName) {
    const norm = normalizeName(parsed.merchantName);
    if (index.by_name[norm]) {
      promoIndices = index.by_name[norm]!;
      matchMethod = 'name_exact';
    }
  }

  // 3. Fuzzy name lookup (substring)
  if (promoIndices.length === 0 && parsed.merchantName) {
    const norm = normalizeName(parsed.merchantName);
    for (const [indexedName, indices] of Object.entries(index.by_name)) {
      if (indexedName.length >= 6 && norm.length >= 6) {
        if (indexedName.includes(norm) || norm.includes(indexedName)) {
          if (Math.min(norm.length, indexedName.length) / Math.max(norm.length, indexedName.length) >= 0.7) {
            promoIndices = indices;
            resolvedName = indexedName;
            matchMethod = 'name_fuzzy';
            break;
          }
        }
      }
    }
  }

  const totalUnfiltered = promoIndices.length;
  let promos: PromoMatch[] = promoIndices.map(i => ({
    ...index.promos[i]!,
    match_reason: matchMethod,
    relevance_score: 0,
  }));

  // ─── Filters ─────────────────────────────────────────────────────────────────

  // Filter: QR-eligible channels
  if (opts.rail !== 'card') { // unless user explicitly said card payment
    const before = promos.length;
    promos = promos.filter(p => isQrEligible(p));
    if (promos.length < before) filtersApplied.push(`qr_eligible(-${before - promos.length})`);
  }

  // Filter: day of week
  {
    const before = promos.length;
    promos = promos.filter(p => isValidDay(p, todayName));
    const removed = before - promos.length;
    if (removed > 0) filtersApplied.push(`day:${todayName}(-${removed})`);
  }

  // Filter: issuer (if specified and not allIssuers)
  if (opts.issuer && !opts.allIssuers) {
    const before = promos.length;
    promos = promos.filter(p => matchesIssuer(p, opts.issuer!));
    const removed = before - promos.length;
    if (removed > 0) filtersApplied.push(`issuer:${opts.issuer}(-${removed})`);
  }

  // Filter: card brand
  if (opts.cardBrand) {
    const before = promos.length;
    promos = promos.filter(p => matchesBrand(p, opts.cardBrand!));
    const removed = before - promos.length;
    if (removed > 0) filtersApplied.push(`brand:${opts.cardBrand}(-${removed})`);
  }

  // Filter: card type
  if (opts.cardType) {
    const before = promos.length;
    promos = promos.filter(p => matchesCardType(p, opts.cardType!));
    const removed = before - promos.length;
    if (removed > 0) filtersApplied.push(`type:${opts.cardType}(-${removed})`);
  }

  // Score and sort
  for (const p of promos) p.relevance_score = scorePromo(p);
  promos.sort((a, b) => b.relevance_score - a.relevance_score);

  // Group by issuer
  const issuerMap = new Map<string, PromoMatch[]>();
  for (const p of promos) {
    if (!issuerMap.has(p.issuer)) issuerMap.set(p.issuer, []);
    issuerMap.get(p.issuer)!.push(p);
  }
  const byIssuer: IssuerGroup[] = [...issuerMap.entries()]
    .map(([issuer, issuerPromos]) => ({
      issuer,
      promos: issuerPromos,
      best_discount_percent: issuerPromos.reduce<number | null>((best, p) => {
        if (p.discount_percent == null) return best;
        return best == null ? p.discount_percent : Math.max(best, p.discount_percent);
      }, null),
    }))
    .sort((a, b) => (b.best_discount_percent ?? 0) - (a.best_discount_percent ?? 0));

  return {
    match_method: matchMethod,
    cuit: resolvedCuit,
    merchant_name: resolvedName,
    qr: {
      cuit: parsed.cuit,
      name: parsed.merchantName,
      mcc: parsed.mcc,
      city: parsed.city,
      cbu: parsed.cbu,
    },
    promos,
    by_issuer: byIssuer,
    total_unfiltered: totalUnfiltered,
    filters_applied: filtersApplied,
  };
}

// ─── CLI ───────────────────────────────────────────────────────────────────────

if (process.argv[1]?.includes('match')) {
  const payload = process.argv[2];
  if (!payload) {
    console.error('Usage: npx tsx src/qr/match.ts "<QR payload>" [--today YYYY-MM-DD] [--issuer modo] [--brand visa] [--type credit]');
    process.exit(1);
  }

  const cliArgs = process.argv.slice(3);
  const cliGet = (f: string) => { const i = cliArgs.indexOf(f); return i !== -1 ? cliArgs[i+1] : undefined; };

  const opts: MatchOptions = {
    today:     cliGet('--today'),
    issuer:    cliGet('--issuer'),
    cardBrand: cliGet('--brand'),
    cardType:  cliGet('--type'),
    allIssuers: cliArgs.includes('--all-issuers'),
  };

  const result = matchQr(payload, opts);

  console.log('\n═══ QR Merchant Match ═══\n');
  console.log(`QR parsed:`);
  console.log(`  CUIT:    ${result.qr.cuit ?? '(none in QR)'}`);
  console.log(`  Name:    ${result.qr.name ?? '(none in QR)'}`);
  console.log(`  MCC:     ${result.qr.mcc ?? '—'}  |  City: ${result.qr.city ?? '—'}  |  CBU: ${result.qr.cbu ?? '—'}`);

  console.log(`\nMerchant resolved:`);
  console.log(`  Method:  ${result.match_method}`);
  console.log(`  CUIT:    ${result.cuit ?? '(unknown)'}`);
  console.log(`  Name:    ${result.merchant_name}`);

  console.log(`\nPromos: ${result.promos.length} found (from ${result.total_unfiltered} total)`);
  if (result.filters_applied.length) console.log(`  Filters: ${result.filters_applied.join(', ')}`);

  if (result.by_issuer.length === 0) {
    console.log('\n  No matching promos found for this merchant / day / payment method.');
  } else {
    for (const group of result.by_issuer) {
      console.log(`\n  ── ${group.issuer.toUpperCase()} (${group.promos.length} promos, best: ${group.best_discount_percent ?? '?'}% off) ──`);
      for (const p of group.promos.slice(0, 5)) {
        const disc = p.discount_type === 'installments'
          ? `${p.installments_count}x cuotas`
          : `${p.discount_percent ?? '?'}% ${p.discount_type === 'cashback' ? 'cashback' : 'off'}`;
        const cap  = p.cap_amount_ars ? ` (cap $${p.cap_amount_ars.toLocaleString('es-AR')}/${p.cap_period})` : '';
        const day  = p.day_pattern && p.day_pattern !== 'everyday' ? ` [${p.day_pattern}]` : '';
        const brand = p.card_brand_scope && p.card_brand_scope !== 'any' ? ` | ${p.card_brand_scope}` : '';
        console.log(`    ${disc}${cap}${day}${brand}`);
        console.log(`      ${p.promo_title}`);
      }
      if (group.promos.length > 5) console.log(`    ... and ${group.promos.length - 5} more`);
    }
  }
}
