import { recommendPaymentOptions } from './engine';
import type {
  PagamaxOwnerRoute,
  PagamaxRoutingInput,
  PagamaxRoutingResult,
  PaymentMethodProfile,
  PaymentRecommendation,
} from './types';

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function formatArs(value: number): string {
  return `$${Math.round(value).toLocaleString('es-AR')}`;
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
