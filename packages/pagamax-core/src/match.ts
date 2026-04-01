import { parseQr, type ParsedQr } from './parse-emv.js';
import type {
  IssuerGroup,
  MatchMethod,
  MatchOptions,
  MatchResult,
  PromoIndex,
  PromoMatch,
  PromoSummary,
} from './types.js';

const AGGREGATOR_CUITS = new Set([
  '30578176470',
  '30715990604',
  '30522624896',
  '30709144940',
  '30500006928',
  '30708246022',
  '30531098359',
]);

const DAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

interface MatchSeed {
  cuit: string | null;
  merchantName: string | null;
  mcc: string | null;
  city: string | null;
  cbu: string | null;
  amountArs: number | null;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^(el|la|los|las|lo)/, '');
}

function dayOfWeek(dateStr: string): string {
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return names[new Date(dateStr + 'T12:00:00').getDay()]!;
}

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

function isQrEligible(promo: PromoSummary): boolean {
  const rail = promo.rail.toLowerCase();
  const chan = promo.channel.toLowerCase();
  return rail.includes('qr') || rail.includes('nfc') || chan.includes('in-store') || chan.includes('mixed') || rail === 'unknown';
}

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

function matchesCardType(promo: PromoSummary, cardType: string): boolean {
  if (!cardType) return true;
  const scope = promo.card_type_scope.toLowerCase();
  if (!scope || scope === 'any' || scope === '') return true;
  const normType = cardType.toLowerCase();
  if (normType === 'account_money') {
    return scope.includes('cuenta') || scope.includes('account') || scope.includes('debito') || scope.includes('debit');
  }
  return scope.split(/[;,]\s*/).some(s => s.trim().includes(normType) || normType.includes(s.trim()));
}

function matchesIssuer(promo: PromoSummary, issuer: string): boolean {
  if (!issuer) return true;
  return promo.issuer.toLowerCase() === issuer.toLowerCase();
}

function scorePromo(promo: PromoSummary): number {
  let score = 0;
  if (promo.discount_percent) score += promo.discount_percent * 2;
  if (promo.discount_type === 'direct_discount') score += 10;
  if (promo.discount_type === 'cashback') score += 6;
  if (promo.discount_type === 'coupon_discount') score += 5;
  if (promo.discount_type === 'installments' && promo.installments_count) {
    score += Math.min(promo.installments_count, 18);
  }
  if (!promo.cap_amount_ars) score += 5;
  if (promo.valid_to) {
    const daysLeft = (new Date(promo.valid_to).getTime() - Date.now()) / 86400000;
    if (daysLeft > 30) score += 2;
  }
  return score;
}

function inferResolvedCategory(
  mcc: string | null,
  merchantPromos: PromoMatch[],
  promoIndex: PromoIndex,
): string | null {
  if (mcc && promoIndex.mcc_to_category[mcc]) {
    return promoIndex.mcc_to_category[mcc]!;
  }

  const counts = new Map<string, number>();
  for (const promo of merchantPromos) {
    if (!promo.category || promo.category === 'Otro') continue;
    counts.set(promo.category, (counts.get(promo.category) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }

  return best;
}

function buildGroups(promos: PromoMatch[]): IssuerGroup[] {
  const issuerMap = new Map<string, PromoMatch[]>();
  for (const promo of promos) {
    if (!issuerMap.has(promo.issuer)) issuerMap.set(promo.issuer, []);
    issuerMap.get(promo.issuer)!.push(promo);
  }

  return [...issuerMap.entries()]
    .map(([issuer, issuerPromos]) => ({
      issuer,
      promos: issuerPromos,
      best_discount_percent: issuerPromos.reduce<number | null>((best, promo) => {
        if (promo.discount_percent == null) return best;
        return best == null ? promo.discount_percent : Math.max(best, promo.discount_percent);
      }, null),
    }))
    .sort((a, b) => (b.best_discount_percent ?? 0) - (a.best_discount_percent ?? 0));
}

function buildMatchFromSeed(seed: MatchSeed, promoIndex: PromoIndex, opts: MatchOptions = {}): MatchResult {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const todayName = dayOfWeek(today);
  const filtersApplied: string[] = [];

  let promoIndices: number[] = [];
  let matchMethod: MatchMethod = 'none';
  let resolvedCuit: string | null = null;
  let resolvedName = seed.merchantName ?? '';
  let aggregatorQr = false;

  const qrCuit = seed.cuit;
  const isAggregator = qrCuit != null && AGGREGATOR_CUITS.has(qrCuit);
  if (isAggregator) aggregatorQr = true;

  if (qrCuit && !isAggregator && promoIndex.by_cuit[qrCuit]) {
    promoIndices = promoIndex.by_cuit[qrCuit]!;
    resolvedCuit = qrCuit;
    resolvedName = promoIndex.cuit_to_name[qrCuit] ?? seed.merchantName ?? qrCuit;
    matchMethod = 'cuit';
  }

  if (promoIndices.length === 0 && seed.merchantName) {
    const norm = normalizeName(seed.merchantName);
    if (promoIndex.by_name[norm]) {
      promoIndices = promoIndex.by_name[norm]!;
      matchMethod = 'name_exact';
    }
  }

  if (promoIndices.length === 0 && seed.merchantName && seed.merchantName.length >= 20) {
    const norm = normalizeName(seed.merchantName);
    for (const [indexedName, indices] of Object.entries(promoIndex.by_name)) {
      if (indexedName.startsWith(norm) && norm.length / indexedName.length >= 0.7) {
        promoIndices = indices;
        resolvedName = promoIndex.promos[indices[0] ?? -1]?.merchant_name ?? indexedName;
        matchMethod = 'name_prefix';
        break;
      }
    }
  }

  if (promoIndices.length === 0 && seed.merchantName) {
    const norm = normalizeName(seed.merchantName);
    for (const [indexedName, indices] of Object.entries(promoIndex.by_name)) {
      if (indexedName.length >= 6 && norm.length >= 6) {
        if ((indexedName.includes(norm) || norm.includes(indexedName)) &&
          Math.min(norm.length, indexedName.length) / Math.max(norm.length, indexedName.length) >= 0.7) {
          promoIndices = indices;
          resolvedName = promoIndex.promos[indices[0] ?? -1]?.merchant_name ?? indexedName;
          matchMethod = 'name_fuzzy';
          break;
        }
      }
    }
  }

  if (promoIndices.length === 0 && seed.mcc) {
    const category = promoIndex.mcc_to_category[seed.mcc];
    if (category && promoIndex.by_category[category]) {
      promoIndices = promoIndex.by_category[category]!;
      resolvedName = seed.merchantName ?? `(${category})`;
      matchMethod = 'mcc';
    }
  }

  const totalUnfiltered = promoIndices.length;
  let promos: PromoMatch[] = promoIndices.map(i => ({
    ...promoIndex.promos[i]!,
    match_reason: matchMethod,
    relevance_score: 0,
  }));

  let generalPromos: PromoMatch[] = (promoIndex.general ?? []).map(i => ({
    ...promoIndex.promos[i]!,
    match_reason: 'general',
    relevance_score: 0,
  }));

  const resolvedCategory = inferResolvedCategory(seed.mcc, promos, promoIndex);
  if (resolvedCategory) {
    const before = generalPromos.length;
    generalPromos = generalPromos.filter(p => p.category === resolvedCategory);
    const removed = before - generalPromos.length;
    if (removed > 0) filtersApplied.push(`general_category(${resolvedCategory}, -${removed})`);
  }

  function applyFilters(list: PromoMatch[]): PromoMatch[] {
    if (opts.rail !== 'card') list = list.filter(p => isQrEligible(p));
    list = list.filter(p => isValidDay(p, todayName));
    if (opts.issuer && !opts.allIssuers) list = list.filter(p => matchesIssuer(p, opts.issuer!));
    if (opts.cardBrand) list = list.filter(p => matchesBrand(p, opts.cardBrand!));
    if (opts.cardType) list = list.filter(p => matchesCardType(p, opts.cardType!));
    return list;
  }

  const beforeMerchant = promos.length;
  promos = applyFilters(promos);
  const removedMerchant = beforeMerchant - promos.length;
  if (removedMerchant > 0) filtersApplied.push(`filters(-${removedMerchant})`);

  generalPromos = applyFilters(generalPromos);

  for (const promo of promos) promo.relevance_score = scorePromo(promo);
  promos.sort((a, b) => b.relevance_score - a.relevance_score);
  for (const promo of generalPromos) promo.relevance_score = scorePromo(promo);
  generalPromos.sort((a, b) => b.relevance_score - a.relevance_score);

  return {
    match_method: matchMethod,
    cuit: resolvedCuit,
    merchant_name: resolvedName,
    qr: {
      cuit: seed.cuit,
      name: seed.merchantName,
      mcc: seed.mcc,
      city: seed.city,
      cbu: seed.cbu,
      amount_ars: seed.amountArs,
    },
    promos,
    general_promos: generalPromos,
    by_issuer: buildGroups(promos),
    total_unfiltered: totalUnfiltered,
    filters_applied: filtersApplied,
    aggregator_qr: aggregatorQr,
  };
}

export function matchQr(qrPayload: string, promoIndex: PromoIndex, opts: MatchOptions = {}): MatchResult {
  const parsed = parseQr(qrPayload);
  return buildMatchFromSeed(parsed, promoIndex, opts);
}

export function matchMerchantName(merchantName: string, promoIndex: PromoIndex, opts: MatchOptions = {}): MatchResult {
  return buildMatchFromSeed({
    cuit: null,
    merchantName,
    mcc: null,
    city: null,
    cbu: null,
    amountArs: null,
  }, promoIndex, opts);
}

export function getMatchedCandidates(result: MatchResult): Array<{ promo: PromoSummary; source: 'merchant' | 'general' }> {
  return [
    ...result.promos.map(promo => ({ promo, source: 'merchant' as const })),
    ...result.general_promos.map(promo => ({ promo, source: 'general' as const })),
  ];
}

export type { ParsedQr };
