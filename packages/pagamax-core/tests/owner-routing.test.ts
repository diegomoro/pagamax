import { describe, expect, it } from 'vitest';
import { recommendPagamaxRoutes, type PaymentMethodProfile, type PromoCandidate, type PromoSummary } from '../src/index.js';

function makePromo(overrides: Partial<PromoSummary> = {}): PromoSummary {
  return {
    promo_key: 'carrefour-bank-20',
    issuer: 'carrefour_bank',
    merchant_name: 'Carrefour',
    category: 'Supermercados',
    discount_type: 'direct_discount',
    discount_percent: 20,
    discount_amount_ars: null,
    installments_count: null,
    cap_amount_ars: 50000,
    cap_period: 'per_transaction',
    min_purchase_ars: null,
    day_pattern: 'everyday',
    channel: 'in_store',
    rail: 'qr',
    instrument_required: 'qr_wallet',
    card_brand_scope: 'any',
    card_type_scope: 'any',
    wallet_scope: 'Banco Carrefour',
    valid_from: '2026-06-01',
    valid_to: '2026-07-01',
    freshness_status: 'active',
    promo_title: '20% Banco Carrefour',
    description_short: '20% pagando QR con Banco Carrefour',
    ...overrides,
  };
}

function ownerMethod(overrides: Partial<PaymentMethodProfile> = {}): PaymentMethodProfile {
  return {
    id: 'carrefour-bank-qr',
    provider: 'carrefour_bank',
    label: 'Banco Carrefour',
    rail: 'qr',
    walletLabel: 'Banco Carrefour',
    cardType: 'account_money',
    ownerPhone: true,
    canPayMerchantQr: true,
    availableBalanceArs: 150000,
    qrTransferLimitRemainingArs: 150000,
    promoCapRemainingArs: 50000,
    ...overrides,
  };
}

function payoutMethod(overrides: Partial<PaymentMethodProfile> = {}): PaymentMethodProfile {
  return {
    id: 'mercadopago-balance-qr',
    provider: 'mercadopago',
    label: 'Mercado Pago',
    rail: 'qr',
    walletLabel: 'Mercado Pago',
    cardType: 'account_money',
    canReceiveCustomerTransfer: true,
    receivingAlias: 'test.mercadopago.alias',
    receivingPriority: 10,
    ...overrides,
  };
}

describe('recommendPagamaxRoutes', () => {
  it('builds an owner-phone route and splits the discount in half', () => {
    const result = recommendPagamaxRoutes({
      amountArs: 100000,
      ownerMethods: [ownerMethod(), payoutMethod()],
      candidates: [{ source: 'merchant', promo: makePromo() }],
    });

    expect(result.ownerRoute).not.toBeNull();
    expect(result.ownerRoute!.grossDiscountArs).toBe(20000);
    expect(result.ownerRoute!.customerDiscountShareArs).toBe(10000);
    expect(result.ownerRoute!.ownerCaptureArs).toBe(10000);
    expect(result.ownerRoute!.customerChargeArs).toBe(90000);
    expect(result.ownerRoute!.payoutAlias).toBe('test.mercadopago.alias');
  });

  it('does not default to an owner route without enough configured balance', () => {
    const result = recommendPagamaxRoutes({
      amountArs: 100000,
      ownerMethods: [
        ownerMethod({ availableBalanceArs: 50000, creditAvailableArs: null }),
        payoutMethod(),
      ],
      candidates: [{ source: 'merchant', promo: makePromo() }],
    });

    expect(result.ownerRoute).toBeNull();
    expect(result.customerRecommendations[0]!.method.id).toBe('carrefour-bank-qr');
  });

  it('uses remaining promo cap when it is lower than the nominal discount', () => {
    const result = recommendPagamaxRoutes({
      amountArs: 100000,
      ownerMethods: [
        ownerMethod({ promoCapRemainingArs: 8000 }),
        payoutMethod(),
      ],
      candidates: [{ source: 'merchant', promo: makePromo() }],
    });

    expect(result.ownerRoute!.grossDiscountArs).toBe(8000);
    expect(result.ownerRoute!.customerChargeArs).toBe(96000);
    expect(result.ownerRoute!.ownerCaptureArs).toBe(4000);
  });

  it('does not default to an owner route without configured QR limit and remaining cap', () => {
    const missingLimit = recommendPagamaxRoutes({
      amountArs: 100000,
      ownerMethods: [
        ownerMethod({ qrTransferLimitRemainingArs: null }),
        payoutMethod(),
      ],
      candidates: [{ source: 'merchant', promo: makePromo() }],
    });

    const missingCap = recommendPagamaxRoutes({
      amountArs: 100000,
      ownerMethods: [
        ownerMethod({ promoCapRemainingArs: null }),
        payoutMethod(),
      ],
      candidates: [{ source: 'merchant', promo: makePromo() }],
    });

    expect(missingLimit.ownerRoute).toBeNull();
    expect(missingCap.ownerRoute).toBeNull();
  });

  it('requires the customer payout alias to be on a different provider', () => {
    const result = recommendPagamaxRoutes({
      amountArs: 100000,
      ownerMethods: [
        ownerMethod(),
        payoutMethod({
          id: 'carrefour-payout',
          provider: 'carrefour_bank',
          receivingAlias: 'test.carrefour.alias',
        }),
      ],
      candidates: [{ source: 'merchant', promo: makePromo() }],
    });

    expect(result.ownerRoute).toBeNull();
  });

  it('ignores disabled methods for owner routing', () => {
    const result = recommendPagamaxRoutes({
      amountArs: 100000,
      ownerMethods: [
        ownerMethod({ enabled: false }),
        payoutMethod(),
      ],
      candidates: [{ source: 'merchant', promo: makePromo() }],
    });

    expect(result.ownerRoute).toBeNull();
    expect(result.customerRecommendations).toHaveLength(0);
  });
});
