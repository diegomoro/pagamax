import { describe, expect, it } from 'vitest';
import {
  recommendLiquidityRoutes,
  type FundingPairCapability,
  type LiquidityAccount,
  type PaymentMethodProfile,
  type PromoSummary,
} from '../src/index.js';

const identityHash = 'identity:sha256:test-user';

function makePromo(overrides: Partial<PromoSummary> = {}): PromoSummary {
  return {
    promo_key: 'mp-super-30',
    issuer: 'mercadopago',
    merchant_name: 'Carrefour',
    category: 'Supermercados',
    discount_type: 'direct_discount',
    discount_percent: 30,
    discount_amount_ars: null,
    installments_count: null,
    cap_amount_ars: 6000,
    cap_period: 'per_transaction',
    min_purchase_ars: null,
    day_pattern: 'everyday',
    channel: 'in_store',
    rail: 'qr',
    instrument_required: 'qr_wallet',
    card_brand_scope: 'any',
    card_type_scope: 'account_money',
    wallet_scope: 'Mercado Pago',
    valid_from: '2026-06-01',
    valid_to: '2026-07-01',
    freshness_status: 'active',
    promo_title: '30% Mercado Pago',
    description_short: '30% con QR',
    ...overrides,
  };
}

function method(overrides: Partial<PaymentMethodProfile> = {}): PaymentMethodProfile {
  return {
    id: 'mercadopago-balance-qr',
    provider: 'mercadopago',
    label: 'Mercado Pago',
    rail: 'qr',
    walletLabel: 'Mercado Pago',
    cardType: 'account_money',
    canPayMerchantQr: true,
    checkoutRails: ['wallet_scanner'],
    ...overrides,
  };
}

function account(overrides: Partial<LiquidityAccount> = {}): LiquidityAccount {
  return {
    id: 'acct-mp',
    provider: 'mercadopago',
    label: 'Mercado Pago',
    methodId: 'mercadopago-balance-qr',
    enabled: true,
    hasUsableFunds: false,
    availableBalanceArs: null,
    aliasHash: 'alias:hash:mp',
    canPayMerchantQr: true,
    checkoutAllowed: true,
    ownerIdentityHash: identityHash,
    identityVerificationStatus: 'same_owner_verified',
    ...overrides,
  };
}

function capability(overrides: Partial<FundingPairCapability> = {}): FundingPairCapability {
  return {
    id: 'nx-to-mp',
    sourceProvider: 'naranjax',
    targetProvider: 'mercadopago',
    rail: 'verified_prefilled_transfer',
    status: 'instant',
    enabled: true,
    requiresUserConfirmation: true,
    expectedSeconds: 20,
    maxAmountArs: 100000,
    frictionScoreArs: 100,
    failureRiskScoreArs: 100,
    sourceAndroidPackage: 'com.naranja.mpos',
    targetAndroidPackage: 'com.mercadopago.wallet',
    verifiedAt: '2026-06-10T12:00:00.000Z',
    expiresAt: '2026-07-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('recommendLiquidityRoutes', () => {
  it('uses direct pay when the promo wallet already has usable money', () => {
    const routes = recommendLiquidityRoutes({
      amountArs: 10000,
      candidates: [{ source: 'merchant', promo: makePromo() }],
      methods: [method()],
      accounts: [
        account({ hasUsableFunds: true, availableBalanceArs: 12000 }),
        account({
          id: 'acct-nx',
          methodId: 'naranjax-balance-qr',
          provider: 'naranjax',
          label: 'Naranja X',
          hasUsableFunds: true,
          availableBalanceArs: 50000,
          aliasHash: 'alias:hash:nx',
        }),
      ],
      pairCapabilities: [capability()],
      accountIdentityHash: identityHash,
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]!.routeTier).toBe('direct_pay');
    expect(routes[0]!.sourceAccount.provider).toBe('mercadopago');
    expect(routes[0]!.amountToMoveArs).toBe(0);
    expect(routes[0]!.fundingRail).toBe('ready_balance');
  });

  it('recommends instant top-up only with a certified same-owner funding pair', () => {
    const routes = recommendLiquidityRoutes({
      amountArs: 10000,
      candidates: [{ source: 'merchant', promo: makePromo() }],
      methods: [method()],
      accounts: [
        account({ hasUsableFunds: false, availableBalanceArs: 0 }),
        account({
          id: 'acct-nx',
          methodId: 'naranjax-balance-qr',
          provider: 'naranjax',
          label: 'Naranja X',
          hasUsableFunds: true,
          availableBalanceArs: 50000,
          aliasHash: 'alias:hash:nx',
        }),
      ],
      pairCapabilities: [capability()],
      accountIdentityHash: identityHash,
      now: '2026-06-10T13:00:00.000Z',
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]!.routeTier).toBe('instant_top_up_then_pay');
    expect(routes[0]!.sourceAccount.provider).toBe('naranjax');
    expect(routes[0]!.targetAccount.provider).toBe('mercadopago');
    expect(routes[0]!.amountToMoveArs).toBe(10000);
    expect(routes[0]!.requiresFundingConfirmation).toBe(true);
  });

  it('shows prepared routes when the pair is valuable but not checkout-fast', () => {
    const routes = recommendLiquidityRoutes({
      amountArs: 10000,
      candidates: [{ source: 'merchant', promo: makePromo({ discount_percent: 50 }) }],
      methods: [method()],
      accounts: [
        account({ hasUsableFunds: false, availableBalanceArs: 0 }),
        account({
          id: 'acct-nx',
          methodId: 'naranjax-balance-qr',
          provider: 'naranjax',
          label: 'Naranja X',
          hasUsableFunds: true,
          availableBalanceArs: 50000,
          aliasHash: 'alias:hash:nx',
        }),
      ],
      pairCapabilities: [capability({ status: 'prepare_before_checkout', rail: 'verified_prefilled_transfer', expectedSeconds: 180 })],
      accountIdentityHash: identityHash,
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]!.routeTier).toBe('prepared_route');
    expect(routes[0]!.fundingStatus).toBe('prepare_before_checkout');
  });

  it('excludes card, linked-card, and installment paths from liquidity mode', () => {
    const routes = recommendLiquidityRoutes({
      amountArs: 10000,
      candidates: [
        { source: 'merchant', promo: makePromo({ discount_type: 'installments', installments_count: 3 }) },
        { source: 'merchant', promo: makePromo({ rail: 'card', instrument_required: 'credit_card' }) },
      ],
      methods: [
        method({ id: 'bbva-credit', provider: 'bbva', label: 'BBVA Visa', cardType: 'credit', checkoutRails: ['linked_card'] }),
        method({ id: 'mp-linked', checkoutRails: ['linked_card'] }),
      ],
      accounts: [account({ hasUsableFunds: true, availableBalanceArs: 20000 })],
      accountIdentityHash: identityHash,
    });

    expect(routes).toHaveLength(0);
  });

  it('blocks unverified, missing-alias, stale, and insufficient-funds funding routes', () => {
    const baseInput = {
      amountArs: 10000,
      candidates: [{ source: 'merchant' as const, promo: makePromo() }],
      methods: [method()],
      accountIdentityHash: identityHash,
      now: '2026-06-10T13:00:00.000Z',
    };
    const fundedNx = account({
      id: 'acct-nx',
      methodId: 'naranjax-balance-qr',
      provider: 'naranjax',
      label: 'Naranja X',
      hasUsableFunds: true,
      availableBalanceArs: 50000,
      aliasHash: 'alias:hash:nx',
    });

    expect(recommendLiquidityRoutes({
      ...baseInput,
      accounts: [account({ aliasHash: null, cvuHash: null }), fundedNx],
      pairCapabilities: [capability()],
    })).toHaveLength(0);

    expect(recommendLiquidityRoutes({
      ...baseInput,
      accounts: [account({ ownerIdentityHash: 'identity:sha256:other-user' }), fundedNx],
      pairCapabilities: [capability()],
    })).toHaveLength(0);

    expect(recommendLiquidityRoutes({
      ...baseInput,
      accounts: [account(), fundedNx],
      pairCapabilities: [capability({ expiresAt: '2026-06-09T13:00:00.000Z' })],
    })).toHaveLength(0);

    expect(recommendLiquidityRoutes({
      ...baseInput,
      accounts: [account(), { ...fundedNx, availableBalanceArs: 9999 }],
      pairCapabilities: [capability()],
    })).toHaveLength(0);
  });
});
