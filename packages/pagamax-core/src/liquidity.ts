import { recommendPaymentOptions } from './engine';
import type {
  FundingDestination,
  FundingPairCapability,
  FundingPairStatus,
  FundingRail,
  LiquidityAccount,
  LiquidityRouteInput,
  LiquidityRouteRecommendation,
  LiquidityRouteTier,
  PaymentMethodProfile,
  PaymentRecommendation,
  PromoCandidate,
  PromoSummary,
} from './types';

const FAST_FUNDING_RAILS = new Set<FundingRail>(['debin_pull', 'verified_prefilled_transfer']);
const FAST_PAIR_STATUSES = new Set<FundingPairStatus>(['instant', 'prefill_possible']);
const CARD_INSTRUMENTS = new Set(['creditcard', 'debitcard', 'prepaidcard', 'card', 'tarjeta']);
const CARD_RAILS = new Set(['card', 'nfc']);
const TIER_ORDER: Record<LiquidityRouteTier, number> = {
  direct_pay: 0,
  instant_top_up_then_pay: 1,
  prepared_route: 2,
  blocked: 3,
};

function normalizeToken(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function accountKey(provider: string): string {
  return normalizeToken(provider);
}

function formatArs(value: number): string {
  return `$${Math.round(value).toLocaleString('es-AR')}`;
}

function isMoneyInAccountMethod(method: PaymentMethodProfile): boolean {
  if (method.enabled === false || method.canPayMerchantQr === false) return false;
  if (method.rail !== 'qr') return false;
  if (method.cardType && method.cardType !== 'account_money') return false;
  if ((method.checkoutRails ?? []).includes('linked_card')) return false;
  return true;
}

function isMoneyInAccountPromo(promo: PromoSummary): boolean {
  if (normalizeToken(promo.discount_type) === 'installments') return false;
  if (CARD_RAILS.has(normalizeToken(promo.rail))) return false;
  if (CARD_INSTRUMENTS.has(normalizeToken(promo.instrument_required))) return false;
  return true;
}

function filterCandidates(candidates: PromoCandidate[]): PromoCandidate[] {
  return candidates.filter((candidate) => isMoneyInAccountPromo(candidate.promo));
}

function accountHasFunds(account: LiquidityAccount, amountArs: number): boolean {
  if (account.enabled === false) return false;
  if (account.availableBalanceArs !== null && account.availableBalanceArs !== undefined) {
    return account.availableBalanceArs >= amountArs;
  }
  return account.hasUsableFunds === true;
}

function mergeDestination(account: LiquidityAccount, destination: FundingDestination | undefined): LiquidityAccount {
  if (!destination) return account;

  const merged: LiquidityAccount = {
    ...account,
    aliasHash: account.aliasHash ?? destination.aliasHash,
    cvuHash: account.cvuHash ?? destination.cvuHash ?? null,
    checkoutAllowed: account.checkoutAllowed ?? destination.checkoutAllowed,
    ownerIdentityHash: account.ownerIdentityHash ?? destination.ownerIdentityHash ?? null,
    ownerIdentityLast4: account.ownerIdentityLast4 ?? destination.ownerIdentityLast4 ?? null,
  };
  const identityVerificationStatus = account.identityVerificationStatus ?? destination.identityVerificationStatus;
  if (identityVerificationStatus !== undefined) {
    merged.identityVerificationStatus = identityVerificationStatus;
  }

  return merged;
}

function accountForMethod(
  method: PaymentMethodProfile,
  accounts: LiquidityAccount[],
  destinations: FundingDestination[],
): LiquidityAccount {
  const byMethod = accounts.find((account) => account.methodId === method.id);
  const byProvider = accounts.find((account) => accountKey(account.provider) === accountKey(method.provider));
  const destination = destinations.find((item) => accountKey(item.provider) === accountKey(method.provider));
  const fallback: LiquidityAccount = {
    id: `method:${method.id}`,
    methodId: method.id,
    provider: method.provider,
    label: method.label,
    hasUsableFunds: method.isDefault === true && method.manualFundingRequired !== true,
    availableBalanceArs: method.availableBalanceArs ?? null,
    ownerIdentityHash: method.ownerIdentityHash ?? null,
    ownerIdentityLast4: method.ownerIdentityLast4 ?? null,
    checkoutAllowed: true,
  };
  if (method.enabled !== undefined) fallback.enabled = method.enabled;
  if (method.canPayMerchantQr !== undefined) fallback.canPayMerchantQr = method.canPayMerchantQr;
  if (method.identityVerificationStatus !== undefined) fallback.identityVerificationStatus = method.identityVerificationStatus;

  const base: LiquidityAccount = byMethod ?? byProvider ?? fallback;
  const mergedBase: LiquidityAccount = {
    ...base,
    methodId: base.methodId ?? method.id,
    provider: base.provider || method.provider,
    label: base.label || method.label,
  };
  const canPayMerchantQr = base.canPayMerchantQr ?? method.canPayMerchantQr;
  if (canPayMerchantQr !== undefined) mergedBase.canPayMerchantQr = canPayMerchantQr;

  return mergeDestination(mergedBase, destination);
}

function sameProvider(left: LiquidityAccount, right: LiquidityAccount): boolean {
  return accountKey(left.provider) === accountKey(right.provider);
}

function isSameOwnerVerified(
  source: LiquidityAccount,
  target: LiquidityAccount,
  accountIdentityHash: string | null | undefined,
): boolean {
  if (!accountIdentityHash) return false;
  return source.ownerIdentityHash === accountIdentityHash &&
    target.ownerIdentityHash === accountIdentityHash &&
    source.identityVerificationStatus === 'same_owner_verified' &&
    target.identityVerificationStatus === 'same_owner_verified';
}

function findPairCapability(
  source: LiquidityAccount,
  target: LiquidityAccount,
  capabilities: FundingPairCapability[],
): FundingPairCapability | undefined {
  return capabilities.find((capability) =>
    capability.enabled !== false &&
    accountKey(capability.sourceProvider) === accountKey(source.provider) &&
    accountKey(capability.targetProvider) === accountKey(target.provider),
  );
}

function isCapabilityFresh(capability: FundingPairCapability, now: Date): boolean {
  if (!capability.expiresAt) return true;
  const expiresAt = new Date(capability.expiresAt);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}

function capabilitySupportsAmount(capability: FundingPairCapability, amountArs: number): boolean {
  return capability.maxAmountArs === null || capability.maxAmountArs >= amountArs;
}

function aliasReady(target: LiquidityAccount): boolean {
  return Boolean(target.aliasHash || target.cvuHash) && target.checkoutAllowed !== false;
}

function baseFrictionPenalty(capability: FundingPairCapability | null, tier: LiquidityRouteTier): number {
  if (tier === 'direct_pay') return 0;
  if (capability?.frictionScoreArs !== undefined) return Math.max(0, capability.frictionScoreArs);
  if (tier === 'instant_top_up_then_pay') return capability?.status === 'prefill_possible' ? 650 : 450;
  if (tier === 'prepared_route') return 1600;
  return Number.POSITIVE_INFINITY;
}

function baseFailurePenalty(capability: FundingPairCapability | null, tier: LiquidityRouteTier): number {
  if (tier === 'direct_pay') return 0;
  if (capability?.failureRiskScoreArs !== undefined) return Math.max(0, capability.failureRiskScoreArs);
  if (tier === 'instant_top_up_then_pay') return capability?.status === 'prefill_possible' ? 900 : 500;
  if (tier === 'prepared_route') return 2200;
  return Number.POSITIVE_INFINITY;
}

function expectedTimePenalty(expectedSeconds: number, tier: LiquidityRouteTier): number {
  if (tier === 'direct_pay') return 0;
  if (tier === 'prepared_route') return Math.max(1200, expectedSeconds * 8);
  return Math.max(0, expectedSeconds * 5);
}

function buildLiquidityRecommendation(
  recommendation: PaymentRecommendation,
  tier: LiquidityRouteTier,
  sourceAccount: LiquidityAccount,
  targetAccount: LiquidityAccount,
  capability: FundingPairCapability | null,
): LiquidityRouteRecommendation {
  const expectedFundingSeconds = tier === 'direct_pay' ? 0 : Math.max(0, capability?.expectedSeconds ?? 0);
  const transferFrictionPenaltyArs = baseFrictionPenalty(capability, tier) + expectedTimePenalty(expectedFundingSeconds, tier);
  const transferFailureRiskPenaltyArs = baseFailurePenalty(capability, tier);
  const routeNetValueArs = Math.max(
    0,
    recommendation.estimatedSavingsArs - transferFrictionPenaltyArs - transferFailureRiskPenaltyArs,
  );
  const destinationAliasHash = tier === 'direct_pay'
    ? (targetAccount.aliasHash ?? null)
    : (targetAccount.aliasHash ?? targetAccount.cvuHash ?? null);
  const fundingRail: FundingRail = tier === 'direct_pay' ? 'ready_balance' : capability?.rail ?? 'unsupported';
  const fundingStatus: FundingPairStatus = tier === 'direct_pay' ? 'instant' : capability?.status ?? 'blocked';
  const routePrefix = tier === 'direct_pay'
    ? `Paga directo con ${targetAccount.label}.`
    : tier === 'instant_top_up_then_pay'
      ? `Mueve ${formatArs(recommendation.estimatedNetPaymentArs + recommendation.estimatedSavingsArs)} de ${sourceAccount.label} a ${targetAccount.label}, despues paga con ${targetAccount.label}.`
      : `Prepara saldo en ${targetAccount.label} antes de comprar.`;
  const liquidityWarnings = [
    ...recommendation.warnings,
    ...(capability?.notes ?? []),
  ];
  if (tier !== 'direct_pay') {
    liquidityWarnings.push('Pagamax no aprueba transferencias ni pagos automaticamente; el usuario confirma en cada app.');
  }

  return {
    ...recommendation,
    routeTier: tier,
    sourceAccount,
    targetAccount,
    fundingCapability: capability,
    fundingRail,
    fundingStatus,
    amountToMoveArs: tier === 'direct_pay' ? 0 : recommendation.estimatedNetPaymentArs + recommendation.estimatedSavingsArs,
    routeNetValueArs: Math.round(routeNetValueArs),
    transferFrictionPenaltyArs: Math.round(transferFrictionPenaltyArs),
    transferFailureRiskPenaltyArs: Math.round(transferFailureRiskPenaltyArs),
    expectedFundingSeconds,
    requiresFundingConfirmation: tier !== 'direct_pay',
    destinationAliasHash,
    liquidityWarnings,
    blockedReasons: [],
    rankingScore: Math.round(routeNetValueArs),
    reasons: [routePrefix, ...recommendation.reasons],
    warnings: liquidityWarnings,
  };
}

function sourceAccountsWithFunds(accounts: LiquidityAccount[], amountArs: number): LiquidityAccount[] {
  return accounts
    .filter((account) => accountHasFunds(account, amountArs))
    .filter((account) => account.enabled !== false);
}

function canUseInstantCapability(capability: FundingPairCapability, amountArs: number, now: Date): boolean {
  return FAST_PAIR_STATUSES.has(capability.status) &&
    FAST_FUNDING_RAILS.has(capability.rail) &&
    isCapabilityFresh(capability, now) &&
    capabilitySupportsAmount(capability, amountArs);
}

function canUsePreparedCapability(capability: FundingPairCapability, amountArs: number, now: Date): boolean {
  return capability.status === 'prepare_before_checkout' &&
    isCapabilityFresh(capability, now) &&
    capabilitySupportsAmount(capability, amountArs);
}

export function recommendLiquidityRoutes(input: LiquidityRouteInput): LiquidityRouteRecommendation[] {
  if (!Number.isFinite(input.amountArs) || input.amountArs <= 0) {
    throw new Error(`amountArs must be a positive number, got ${input.amountArs}`);
  }

  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now());
  const destinations = input.fundingDestinations ?? [];
  const methods = input.methods.filter(isMoneyInAccountMethod);
  const candidates = filterCandidates(input.candidates);
  const topN = input.topN ?? 5;
  const baseRecommendations = recommendPaymentOptions({
    amountArs: input.amountArs,
    candidates,
    methods,
    topN: Math.max(25, topN * 6),
  });
  const allAccounts = input.accounts.map((account) => {
    const destination = destinations.find((item) => accountKey(item.provider) === accountKey(account.provider));
    return mergeDestination(account, destination);
  });
  const fundedSources = sourceAccountsWithFunds(allAccounts, input.amountArs);
  const routes: LiquidityRouteRecommendation[] = [];

  for (const recommendation of baseRecommendations) {
    const targetAccount = accountForMethod(recommendation.method, allAccounts, destinations);
    if (targetAccount.enabled === false || targetAccount.canPayMerchantQr === false) continue;

    const directSource = fundedSources.find((source) => sameProvider(source, targetAccount));
    if (directSource) {
      routes.push(buildLiquidityRecommendation(recommendation, 'direct_pay', directSource, targetAccount, null));
      continue;
    }

    for (const sourceAccount of fundedSources) {
      if (sameProvider(sourceAccount, targetAccount)) continue;
      if (!isSameOwnerVerified(sourceAccount, targetAccount, input.accountIdentityHash)) continue;
      if (!aliasReady(targetAccount)) continue;

      const capability = findPairCapability(sourceAccount, targetAccount, input.pairCapabilities ?? []);
      if (!capability) continue;

      if (canUseInstantCapability(capability, input.amountArs, now)) {
        routes.push(buildLiquidityRecommendation(
          recommendation,
          'instant_top_up_then_pay',
          sourceAccount,
          targetAccount,
          capability,
        ));
      } else if ((input.allowPreparedRoutes ?? true) && canUsePreparedCapability(capability, input.amountArs, now)) {
        routes.push(buildLiquidityRecommendation(recommendation, 'prepared_route', sourceAccount, targetAccount, capability));
      }
    }
  }

  routes.sort((left, right) => {
    if (right.routeNetValueArs !== left.routeNetValueArs) return right.routeNetValueArs - left.routeNetValueArs;
    if (TIER_ORDER[left.routeTier] !== TIER_ORDER[right.routeTier]) {
      return TIER_ORDER[left.routeTier] - TIER_ORDER[right.routeTier];
    }
    if (right.estimatedSavingsArs !== left.estimatedSavingsArs) return right.estimatedSavingsArs - left.estimatedSavingsArs;
    if (left.method.isDefault !== right.method.isDefault) return left.method.isDefault ? -1 : 1;
    return left.method.label.localeCompare(right.method.label);
  });

  const deduped = new Map<string, LiquidityRouteRecommendation>();
  for (const route of routes) {
    const key = [
      route.routeTier,
      route.sourceAccount.id,
      route.targetAccount.id,
      route.method.id,
      route.promo.promo_key,
    ].join('|');
    if (!deduped.has(key)) deduped.set(key, route);
  }

  return [...deduped.values()].slice(0, topN);
}
