import { describe, expect, it } from 'vitest';
import { recommendCheckoutRoutes, type PaymentMethodProfile, type PromoCandidate, type PromoSummary } from '../src/index.js';

function makePromo(overrides: Partial<PromoSummary> = {}): PromoSummary {
  return {
    promo_key: 'nx-super-30',
    issuer: 'naranjax',
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
    card_type_scope: 'any',
    wallet_scope: 'Naranja X',
    valid_from: '2026-06-01',
    valid_to: '2026-07-01',
    freshness_status: 'active',
    promo_title: '30% Naranja X',
    description_short: '30% con QR',
    ...overrides,
  };
}

function method(overrides: Partial<PaymentMethodProfile> = {}): PaymentMethodProfile {
  return {
    id: 'naranjax-balance-qr',
    provider: 'naranjax',
    label: 'Naranja X',
    rail: 'qr',
    walletLabel: 'Naranja X',
    cardType: 'account_money',
    canPayMerchantQr: true,
    checkoutRails: ['wallet_scanner'],
    ...overrides,
  };
}

describe('recommendCheckoutRoutes', () => {
  it('keeps scanner-fast wallet routes eligible for public checkout', () => {
    const routes = recommendCheckoutRoutes({
      amountArs: 30000,
      candidates: [{ source: 'merchant', promo: makePromo() }],
      methods: [method()],
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]!.executionRail).toBe('wallet_scanner');
    expect(routes[0]!.estimatedSavingsArs).toBe(6000);
    expect(routes[0]!.routeNetValueArs).toBe(5250);
  });

  it('hides manual funding routes even when the promo value is high', () => {
    const routes = recommendCheckoutRoutes({
      amountArs: 30000,
      candidates: [{ source: 'merchant', promo: makePromo() }],
      methods: [
        method({
          manualFundingRequired: true,
          checkoutRails: ['wallet_scanner'],
        }),
      ],
    });

    expect(routes).toHaveLength(0);
  });

  it('does not assume an unconfigured wallet has funds at checkout', () => {
    const unconfiguredMethod = method();
    delete unconfiguredMethod.checkoutRails;
    delete unconfiguredMethod.manualFundingRequired;

    const routes = recommendCheckoutRoutes({
      amountArs: 30000,
      candidates: [{ source: 'merchant', promo: makePromo() }],
      methods: [unconfiguredMethod],
    });

    expect(routes).toHaveLength(0);
  });

  it('allows a different principal wallet when it is explicitly marked funded', () => {
    const routes = recommendCheckoutRoutes({
      amountArs: 30000,
      candidates: [{
        source: 'merchant',
        promo: makePromo({
          promo_key: 'pp-super-30',
          issuer: 'personalpay',
          promo_title: '30% Personal Pay',
          wallet_scope: 'Personal Pay',
          card_brand_scope: 'Visa',
          card_type_scope: 'prepaid',
        }),
      }],
      methods: [
        method({
          id: 'personalpay-prepaid-qr',
          provider: 'personalpay',
          label: 'Personal Pay',
          walletLabel: 'Personal Pay',
          cardBrand: 'Visa',
          cardType: 'prepaid',
          isDefault: true,
          checkoutRails: ['ready_balance', 'wallet_scanner'],
          manualFundingRequired: false,
        }),
      ],
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]!.method.provider).toBe('personalpay');
    expect(routes[0]!.executionRail).toBe('ready_balance');
  });

  it('blocks promos for non-principal wallets that have no funded rail', () => {
    const unfundedMercadoPago = method({
      id: 'mercadopago-balance-qr',
      provider: 'mercadopago',
      label: 'Mercado Pago',
      walletLabel: 'Mercado Pago',
    });
    delete unfundedMercadoPago.checkoutRails;
    delete unfundedMercadoPago.manualFundingRequired;

    const routes = recommendCheckoutRoutes({
      amountArs: 30000,
      candidates: [{
        source: 'merchant',
        promo: makePromo({
          promo_key: 'mp-super-30',
          issuer: 'mercadopago',
          promo_title: '30% Mercado Pago',
          wallet_scope: 'Mercado Pago',
        }),
      }],
      methods: [
        method({
          isDefault: true,
          checkoutRails: ['ready_balance', 'wallet_scanner'],
        }),
        unfundedMercadoPago,
      ],
    });

    expect(routes).toHaveLength(0);
  });

  it('allows funding routes only when a verified fast funding rail is configured', () => {
    const identityHash = 'identity:sha256:test-user';
    const routes = recommendCheckoutRoutes({
      amountArs: 30000,
      candidates: [{ source: 'merchant', promo: makePromo() }],
      accountIdentityHash: identityHash,
      methods: [
        method({
          manualFundingRequired: true,
          checkoutRails: ['verified_prefilled_transfer'],
          checkoutFrictionScore: 100,
          ownerIdentityHash: identityHash,
          identityVerificationStatus: 'same_owner_verified',
        }),
      ],
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]!.executionRail).toBe('verified_prefilled_transfer');
    expect(routes[0]!.requiresExternalFundingApproval).toBe(true);
    expect(routes[0]!.frictionPenaltyArs).toBe(600);
  });

  it('hard-stops internal funding routes when DNI/CUIL ownership is not verified', () => {
    const routes = recommendCheckoutRoutes({
      amountArs: 30000,
      candidates: [{ source: 'merchant', promo: makePromo() }],
      accountIdentityHash: 'identity:sha256:user-a',
      methods: [
        method({
          manualFundingRequired: true,
          checkoutRails: ['debin_pull'],
          ownerIdentityHash: 'identity:sha256:user-b',
          identityVerificationStatus: 'same_owner_verified',
        }),
        method({
          id: 'personalpay-unverified',
          provider: 'personalpay',
          label: 'Personal Pay',
          walletLabel: 'Personal Pay',
          manualFundingRequired: true,
          checkoutRails: ['verified_prefilled_transfer'],
          ownerIdentityHash: 'identity:sha256:user-a',
          identityVerificationStatus: 'pending',
        }),
      ],
    });

    expect(routes).toHaveLength(0);
  });

  it('ranks by executable value instead of raw discount only', () => {
    const candidates: PromoCandidate[] = [
      { source: 'merchant', promo: makePromo() },
      {
        source: 'merchant',
        promo: makePromo({
          promo_key: 'mp-super-20',
          issuer: 'mercadopago',
          promo_title: '20% Mercado Pago',
          discount_percent: 20,
          wallet_scope: 'Mercado Pago',
        }),
      },
    ];

    const routes = recommendCheckoutRoutes({
      amountArs: 30000,
      candidates,
      methods: [
        method({
          handoffFailureRiskScore: 5000,
        }),
        method({
          id: 'mercadopago-balance-qr',
          provider: 'mercadopago',
          label: 'Mercado Pago',
          walletLabel: 'Mercado Pago',
          checkoutRails: ['linked_card'],
        }),
      ],
      topN: 2,
    });

    expect(routes[0]!.method.provider).toBe('mercadopago');
    expect(routes[0]!.routeNetValueArs).toBeGreaterThan(routes[1]!.routeNetValueArs);
  });

  it('uses the principal funded method as the tie-breaker when value is equal', () => {
    const candidates: PromoCandidate[] = [
      { source: 'merchant', promo: makePromo() },
      {
        source: 'merchant',
        promo: makePromo({
          promo_key: 'mp-super-30',
          issuer: 'mercadopago',
          promo_title: '30% Mercado Pago',
          wallet_scope: 'Mercado Pago',
        }),
      },
    ];

    const routes = recommendCheckoutRoutes({
      amountArs: 30000,
      candidates,
      methods: [
        method({
          checkoutRails: ['wallet_scanner'],
          isDefault: true,
        }),
        method({
          id: 'mercadopago-balance-qr',
          provider: 'mercadopago',
          label: 'Mercado Pago',
          walletLabel: 'Mercado Pago',
          checkoutRails: ['wallet_scanner'],
        }),
      ],
      topN: 2,
    });

    expect(routes).toHaveLength(2);
    expect(routes[0]!.method.provider).toBe('naranjax');
    expect(routes[0]!.routeNetValueArs).toBe(routes[1]!.routeNetValueArs);
  });
});
