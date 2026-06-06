import type {
  FundingType,
  PagamaxOwnerRoute,
  PagamaxRoutingInput,
  PagamaxRoutingResult,
  PaymentMethodProfile,
  PaymentRecommendation,
  PromoCandidate,
  PromoSummary,
  RecommendationInput,
} from './types';

const CARD_TYPE_ALIASES: Record<FundingType, string[]> = {
  credit: ['credit', 'credito'],
  debit: ['debit', 'debito'],
  prepaid: ['prepaid', 'prepaga', 'prepagada'],
  account_money: ['account', 'cuenta', 'saldo', 'balance', 'dinero'],
};

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function scopeTokens(scope: string): string[] {
  return scope
    .split(/[;,]/)
    .map(part => normalizeToken(part))
    .filter(Boolean);
}

function formatArs(value: number): string {
  return `$${Math.round(value).toLocaleString('es-AR')}`;
}

function promoMatchesRail(promo: PromoSummary, method: PaymentMethodProfile): boolean {
  const promoRail = normalizeToken(promo.rail);
  if (!promoRail || promoRail === 'unknown' || promoRail === 'any') return true;
  return promoRail === normalizeToken(method.rail);
}

function promoMatchesProvider(promo: PromoSummary, method: PaymentMethodProfile): boolean {
  return normalizeToken(promo.issuer) === normalizeToken(method.provider);
}

function promoMatchesBrand(promo: PromoSummary, method: PaymentMethodProfile): boolean {
  if (!method.cardBrand) return true;
  const tokens = scopeTokens(promo.card_brand_scope);
  if (tokens.length === 0 || tokens.includes('any') || tokens.includes('all')) return true;
  const brand = normalizeToken(method.cardBrand);
  return tokens.some(token => token.includes(brand) || brand.includes(token));
}

function promoMatchesWallet(promo: PromoSummary, method: PaymentMethodProfile): boolean {
  const tokens = scopeTokens(promo.wallet_scope);
  if (tokens.length === 0 || tokens.includes('any') || tokens.includes('all')) return true;

  const provider = normalizeToken(method.provider);
  const wallet = normalizeToken(method.walletLabel ?? method.provider);

  return tokens.some(token =>
    token.includes(wallet) ||
    wallet.includes(token) ||
    token.includes(provider) ||
    provider.includes(token),
  );
}

function promoMatchesCardTypeScope(promo: PromoSummary, method: PaymentMethodProfile): boolean {
  if (!method.cardType) return true;
  const tokens = scopeTokens(promo.card_type_scope);
  if (tokens.length === 0 || tokens.includes('any') || tokens.includes('all')) return true;
  const aliases = CARD_TYPE_ALIASES[method.cardType];
  return tokens.some(token => aliases.some(alias => token.includes(alias) || alias.includes(token)));
}

function promoMatchesInstrument(promo: PromoSummary, method: PaymentMethodProfile): boolean {
  const instrument = normalizeToken(promo.instrument_required);
  if (!instrument || instrument === 'any' || instrument === 'unknown') return true;

  if (instrument === 'qrwallet') {
    return method.rail === 'qr';
  }

  if (instrument === 'creditcard') return method.cardType === 'credit';
  if (instrument === 'debitcard') return method.cardType === 'debit';
  if (instrument === 'prepaidcard') return method.cardType === 'prepaid';

  return true;
}

function promoMatchesMethod(promo: PromoSummary, method: PaymentMethodProfile): boolean {
  return promoMatchesProvider(promo, method) &&
    promoMatchesRail(promo, method) &&
    promoMatchesInstrument(promo, method) &&
    promoMatchesCardTypeScope(promo, method) &&
    promoMatchesBrand(promo, method) &&
    promoMatchesWallet(promo, method);
}

function estimateInstallmentValue(amountArs: number, installmentsCount: number): number {
  const monthlyRate = 0.08;
  const proxy = amountArs * (1 - 1 / (1 + monthlyRate * installmentsCount / 12));
  return Math.max(0, proxy);
}

function applyCap(rawValue: number, promo: PromoSummary): number {
  const cap = promo.cap_amount_ars ?? null;
  if (cap === null || cap <= 0) return rawValue;
  return Math.min(rawValue, cap);
}

function estimatePromoValue(
  promo: PromoSummary,
  amountArs: number,
): {
  valueType: PaymentRecommendation['valueType'];
  estimatedSavingsArs: number;
  warnings: string[];
} | null {
  if (promo.min_purchase_ars !== null && amountArs < promo.min_purchase_ars) {
    return null;
  }

  const warnings: string[] = [];
  if (promo.cap_amount_ars !== null && promo.cap_period && promo.cap_period !== 'per_transaction') {
    warnings.push(`Assumes full ${promo.cap_period} cap is still available`);
  }

  if (promo.discount_percent !== null && promo.discount_percent > 0) {
    const savings = applyCap(amountArs * (promo.discount_percent / 100), promo);
    if (promo.discount_type === 'cashback') {
      warnings.push('Cashback timing is not modeled; gross value only');
      return { valueType: 'cashback', estimatedSavingsArs: savings, warnings };
    }
    if (promo.discount_type === 'coupon_discount') {
      warnings.push('Coupon application may still be required at checkout');
    }
    return { valueType: 'discount', estimatedSavingsArs: savings, warnings };
  }

  if (promo.discount_amount_ars !== null && promo.discount_amount_ars > 0) {
    return {
      valueType: promo.discount_type === 'cashback' ? 'cashback' : 'discount',
      estimatedSavingsArs: applyCap(promo.discount_amount_ars, promo),
      warnings,
    };
  }

  if (promo.discount_type === 'installments' && promo.installments_count && promo.installments_count > 0) {
    warnings.push('Installment value is an estimate, not a guaranteed cash discount');
    return {
      valueType: 'financing_estimate',
      estimatedSavingsArs: estimateInstallmentValue(amountArs, promo.installments_count),
      warnings,
    };
  }

  return null;
}

function rankingMultiplier(valueType: PaymentRecommendation['valueType']): number {
  if (valueType === 'discount') return 1.0;
  if (valueType === 'cashback') return 0.96;
  if (valueType === 'fallback') return 0;
  return 0.82;
}

function buildReasons(
  promo: PromoSummary,
  method: PaymentMethodProfile,
  amountArs: number,
  estimatedSavingsArs: number,
): string[] {
  const reasons: string[] = [];

  if (promo.discount_percent !== null && promo.discount_percent > 0) {
    let headline = `${promo.discount_percent}%`;
    if (promo.discount_type === 'cashback') headline += ' cashback';
    else if (promo.discount_type === 'coupon_discount') headline += ' coupon discount';
    else headline += ' discount';

    if (promo.cap_amount_ars !== null) {
      headline += ` capped at ${formatArs(promo.cap_amount_ars)}`;
    }
    reasons.push(headline);
  } else if (promo.discount_amount_ars !== null && promo.discount_amount_ars > 0) {
    reasons.push(`Fixed ${formatArs(promo.discount_amount_ars)} benefit`);
  } else if (promo.installments_count) {
    reasons.push(`${promo.installments_count} installments estimated as financing value`);
  }

  reasons.push(`Estimated savings ${formatArs(estimatedSavingsArs)} on ${formatArs(amountArs)}`);
  reasons.push(`Use ${method.label}`);
  return reasons;
}

export function recommendPaymentOptions(input: RecommendationInput): PaymentRecommendation[] {
  if (!Number.isFinite(input.amountArs) || input.amountArs <= 0) {
    throw new Error(`amountArs must be a positive number, got ${input.amountArs}`);
  }

  const recommendations: PaymentRecommendation[] = [];

  for (const candidate of input.candidates) {
    for (const method of input.methods) {
      if (!promoMatchesMethod(candidate.promo, method)) continue;

      const estimate = estimatePromoValue(candidate.promo, input.amountArs);
      if (!estimate) continue;

      const rankingScore = estimate.estimatedSavingsArs *
        rankingMultiplier(estimate.valueType) *
        (candidate.source === 'merchant' ? 1.02 : 1.0);

      recommendations.push({
        method,
        promo: candidate.promo,
        source: candidate.source,
        valueType: estimate.valueType,
        estimatedSavingsArs: Math.round(estimate.estimatedSavingsArs),
        estimatedNetPaymentArs: Math.max(0, Math.round(input.amountArs - estimate.estimatedSavingsArs)),
        rankingScore: Math.round(rankingScore),
        reasons: buildReasons(candidate.promo, method, input.amountArs, estimate.estimatedSavingsArs),
        warnings: estimate.warnings,
      });
    }
  }

  recommendations.sort((a, b) => {
    if (b.rankingScore !== a.rankingScore) return b.rankingScore - a.rankingScore;
    if (b.estimatedSavingsArs !== a.estimatedSavingsArs) return b.estimatedSavingsArs - a.estimatedSavingsArs;
    return a.method.label.localeCompare(b.method.label);
  });

  const deduped = new Map<string, PaymentRecommendation>();
  for (const recommendation of recommendations) {
    const key = [
      recommendation.method.id,
      recommendation.promo.issuer,
      recommendation.promo.promo_title,
      recommendation.source,
    ].join('|');

    if (!deduped.has(key)) deduped.set(key, recommendation);
  }

  return [...deduped.values()].slice(0, input.topN ?? 5);
}

function isEnabled(method: PaymentMethodProfile): boolean {
  return method.enabled !== false;
}

function positiveFinite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function availablePaymentCapacity(method: PaymentMethodProfile): number | null {
  const balance = positiveFinite(method.availableBalanceArs);
  const credit = positiveFinite(method.creditAvailableArs);

  if (balance === null && credit === null) return null;
  return Math.max(balance ?? 0, credit ?? 0);
}

function choosePayoutMethod(
  ownerMethod: PaymentMethodProfile,
  methods: PaymentMethodProfile[],
): PaymentMethodProfile | null {
  const candidates = methods
    .filter(isEnabled)
    .filter(method => method.id !== ownerMethod.id)
    .filter(method => normalizeToken(method.provider) !== normalizeToken(ownerMethod.provider))
    .filter(method => method.canReceiveCustomerTransfer !== false)
    .filter(method => Boolean(method.receivingAlias?.trim()))
    .sort((left, right) => {
      const leftPriority = left.receivingPriority ?? 999;
      const rightPriority = right.receivingPriority ?? 999;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
      return left.label.localeCompare(right.label);
    });

  return candidates[0] ?? null;
}

function buildOwnerRoute(
  recommendation: PaymentRecommendation,
  ownerMethods: PaymentMethodProfile[],
  amountArs: number,
): PagamaxOwnerRoute | null {
  if (recommendation.valueType === 'fallback' || recommendation.estimatedSavingsArs <= 0) return null;

  const ownerMethod = recommendation.method;
  if (ownerMethod.ownerPhone === false || ownerMethod.canPayMerchantQr === false) return null;

  const warnings: string[] = [];
  const capacity = availablePaymentCapacity(ownerMethod);
  if (capacity === null) return null;
  if (capacity < amountArs) return null;

  if (ownerMethod.qrTransferLimitRemainingArs == null) return null;
  const transferLimit = positiveFinite(ownerMethod.qrTransferLimitRemainingArs);
  if (transferLimit === null || transferLimit < amountArs) return null;

  if (ownerMethod.promoCapRemainingArs == null) return null;
  const capRemaining = positiveFinite(ownerMethod.promoCapRemainingArs);
  if (capRemaining === null) return null;
  const grossDiscountArs = Math.round(Math.min(recommendation.estimatedSavingsArs, capRemaining));
  if (grossDiscountArs <= 0) return null;
  if (capRemaining !== null && capRemaining < recommendation.estimatedSavingsArs) {
    warnings.push(`Owner promo value capped by remaining configured cap at ${formatArs(capRemaining)}`);
  }

  const payoutMethod = choosePayoutMethod(ownerMethod, ownerMethods);
  if (!payoutMethod?.receivingAlias) return null;

  const customerDiscountShareArs = Math.round(grossDiscountArs / 2);
  const ownerCaptureArs = grossDiscountArs - customerDiscountShareArs;
  const customerChargeArs = Math.max(0, amountArs - customerDiscountShareArs);

  const adjustedRecommendation: PaymentRecommendation = {
    ...recommendation,
    estimatedSavingsArs: grossDiscountArs,
    estimatedNetPaymentArs: Math.max(0, amountArs - grossDiscountArs),
    rankingScore: grossDiscountArs,
    warnings: [...recommendation.warnings, ...warnings],
  };

  return {
    recommendation: adjustedRecommendation,
    ownerMethod,
    payoutMethod,
    payoutAlias: payoutMethod.receivingAlias,
    originalAmountArs: amountArs,
    customerChargeArs,
    ownerPaysMerchantArs: amountArs,
    grossDiscountArs,
    customerDiscountShareArs,
    ownerCaptureArs,
    ownerNetValueArs: ownerCaptureArs,
    eligibilityWarnings: warnings,
  };
}

export function recommendPagamaxRoutes(input: PagamaxRoutingInput): PagamaxRoutingResult {
  if (!Number.isFinite(input.amountArs) || input.amountArs <= 0) {
    throw new Error(`amountArs must be a positive number, got ${input.amountArs}`);
  }

  const ownerMethods = input.ownerMethods.filter(isEnabled);
  const customerMethods = (input.customerMethods ?? input.ownerMethods).filter(isEnabled);
  const topN = input.topN ?? 5;

  const ownerRecommendations = recommendPaymentOptions({
    amountArs: input.amountArs,
    methods: ownerMethods.filter(method => method.canPayMerchantQr !== false),
    candidates: input.candidates,
    topN: Math.max(25, topN * 5),
  });

  const ownerRouteCandidates = ownerRecommendations
    .map(recommendation => buildOwnerRoute(recommendation, ownerMethods, input.amountArs))
    .filter((route): route is PagamaxOwnerRoute => route !== null)
    .sort((left, right) => {
      if (right.ownerNetValueArs !== left.ownerNetValueArs) return right.ownerNetValueArs - left.ownerNetValueArs;
      if (left.customerChargeArs !== right.customerChargeArs) return left.customerChargeArs - right.customerChargeArs;
      return left.ownerMethod.label.localeCompare(right.ownerMethod.label);
    })
    .slice(0, topN);

  const customerRecommendations = recommendPaymentOptions({
    amountArs: input.amountArs,
    methods: customerMethods,
    candidates: input.candidates,
    topN,
  });

  return {
    ownerRoute: ownerRouteCandidates[0] ?? null,
    ownerRouteCandidates,
    customerRecommendations,
  };
}
