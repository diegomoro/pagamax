import { recommendPaymentOptions } from './engine';
import type {
  CheckoutRouteInput,
  CheckoutRouteRecommendation,
  FundingRail,
  PaymentMethodProfile,
  PaymentRecommendation,
} from './types';

const RAIL_PRIORITY: FundingRail[] = [
  'ready_balance',
  'linked_card',
  'debin_pull',
  'verified_prefilled_transfer',
  'wallet_scanner',
];

const RAIL_PENALTY_ARS: Record<FundingRail, number> = {
  ready_balance: 0,
  linked_card: 100,
  debin_pull: 350,
  verified_prefilled_transfer: 500,
  wallet_scanner: 750,
  unsupported: Number.POSITIVE_INFINITY,
};

function supportedRails(method: PaymentMethodProfile): FundingRail[] {
  return (method.checkoutRails ?? []).filter((rail) => rail !== 'unsupported');
}

function chooseRail(method: PaymentMethodProfile): FundingRail | null {
  const rails = new Set(supportedRails(method));
  for (const rail of RAIL_PRIORITY) {
    if (rails.has(rail)) return rail;
  }
  return null;
}

function isSameOwnerFundingRail(rail: FundingRail | null): boolean {
  return rail === 'debin_pull' || rail === 'verified_prefilled_transfer';
}

function hasSameOwnerVerifiedIdentity(method: PaymentMethodProfile, accountIdentityHash: string | null | undefined): boolean {
  if (!accountIdentityHash) return false;
  return method.identityVerificationStatus === 'same_owner_verified' && method.ownerIdentityHash === accountIdentityHash;
}

function isFastCheckoutMethod(
  method: PaymentMethodProfile,
  rail: FundingRail | null,
  hideSlowRoutes: boolean,
  accountIdentityHash: string | null | undefined,
  requireSameOwnerForFunding: boolean,
): boolean {
  if (!rail) return false;
  if (method.manualFundingRequired && rail !== 'debin_pull' && rail !== 'verified_prefilled_transfer') return false;
  if (requireSameOwnerForFunding && isSameOwnerFundingRail(rail) && !hasSameOwnerVerifiedIdentity(method, accountIdentityHash)) return false;
  if (!hideSlowRoutes) return true;
  return rail !== 'unsupported';
}

function executionRecommendation(
  recommendation: PaymentRecommendation,
  rail: FundingRail,
): CheckoutRouteRecommendation {
  const frictionPenaltyArs = RAIL_PENALTY_ARS[rail] + Math.max(0, recommendation.method.checkoutFrictionScore ?? 0);
  const failureRiskPenaltyArs = Math.max(0, recommendation.method.handoffFailureRiskScore ?? 0);
  const routeNetValueArs = Math.max(0, recommendation.estimatedSavingsArs - frictionPenaltyArs - failureRiskPenaltyArs);

  return {
    ...recommendation,
    executionRail: rail,
    frictionPenaltyArs,
    failureRiskPenaltyArs,
    routeNetValueArs,
    requiresExternalFundingApproval: rail === 'debin_pull' || rail === 'verified_prefilled_transfer',
    rankingScore: Math.round(routeNetValueArs),
  };
}

export function recommendCheckoutRoutes(input: CheckoutRouteInput): CheckoutRouteRecommendation[] {
  const hideSlowRoutes = input.hideSlowRoutes ?? true;
  const requireSameOwnerForFunding = input.requireSameOwnerForFunding ?? true;
  const executableMethods = input.methods.filter((method) => {
    if (method.canPayMerchantQr === false || method.enabled === false) return false;
    const rail = chooseRail(method);
    return isFastCheckoutMethod(method, rail, hideSlowRoutes, input.accountIdentityHash, requireSameOwnerForFunding);
  });

  const baseRecommendations = recommendPaymentOptions({
    amountArs: input.amountArs,
    candidates: input.candidates,
    methods: executableMethods,
    topN: Math.max(25, (input.topN ?? 5) * 5),
  });

  return baseRecommendations
    .map((recommendation) => {
      const rail = chooseRail(recommendation.method);
      return rail ? executionRecommendation(recommendation, rail) : null;
    })
    .filter((recommendation): recommendation is CheckoutRouteRecommendation => recommendation !== null)
    .filter((recommendation) => !hideSlowRoutes || Number.isFinite(recommendation.frictionPenaltyArs))
    .sort((left, right) => {
      if (right.routeNetValueArs !== left.routeNetValueArs) return right.routeNetValueArs - left.routeNetValueArs;
      if (right.estimatedSavingsArs !== left.estimatedSavingsArs) return right.estimatedSavingsArs - left.estimatedSavingsArs;
      if (left.method.isDefault !== right.method.isDefault) return left.method.isDefault ? -1 : 1;
      return left.method.label.localeCompare(right.method.label);
    })
    .slice(0, input.topN ?? 5);
}
