import { describe, expect, it } from 'vitest';
import { recommendPaymentOptions, type PaymentMethodProfile, type PromoCandidate } from '../../../src/recommendation/engine.js';
import type { PromoSummary } from '../../../src/qr/build-promo-index.js';

function makePromo(overrides: Partial<PromoSummary> = {}): PromoSummary {
  return {
    promo_key: 'promo-1',
    issuer: 'modo',
    merchant_name: 'Jumbo',
    category: 'Supermercados',
    discount_type: 'cashback',
    discount_percent: 20,
    discount_amount_ars: null,
    installments_count: null,
    cap_amount_ars: 5000,
    cap_period: 'per_transaction',
    min_purchase_ars: null,
    day_pattern: 'everyday',
    channel: 'in-store',
    rail: 'qr',
    instrument_required: 'qr_wallet',
    card_brand_scope: 'visa; master',
    card_type_scope: 'credito; debito',
    wallet_scope: 'Santander; Comafi',
    valid_from: '2026-03-01',
    valid_to: '2026-04-01',
    freshness_status: 'active',
    promo_title: '20% en Jumbo',
    description_short: 'Aprovecha 20% de reintegro',
    ...overrides,
  };
}

const santanderVisaCredit: PaymentMethodProfile = {
  id: 'modo-santander-visa-credit',
  provider: 'modo',
  label: 'MODO + Santander Visa credit',
  rail: 'qr',
  walletLabel: 'Santander',
  cardBrand: 'Visa',
  cardType: 'credit',
};

describe('recommendPaymentOptions', () => {
  it('caps percent-based promos using the purchase amount', () => {
    const candidates: PromoCandidate[] = [
      { source: 'merchant', promo: makePromo() },
    ];

    const result = recommendPaymentOptions({
      amountArs: 30000,
      methods: [santanderVisaCredit],
      candidates,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.estimatedSavingsArs).toBe(5000);
    expect(result[0]!.estimatedNetPaymentArs).toBe(25000);
  });

  it('filters out promos that do not meet minimum purchase', () => {
    const candidates: PromoCandidate[] = [
      { source: 'merchant', promo: makePromo({ min_purchase_ars: 20000 }) },
    ];

    const result = recommendPaymentOptions({
      amountArs: 10000,
      methods: [santanderVisaCredit],
      candidates,
    });

    expect(result).toHaveLength(0);
  });

  it('requires provider, wallet and brand compatibility', () => {
    const candidates: PromoCandidate[] = [
      { source: 'merchant', promo: makePromo({ wallet_scope: 'Comafi', card_brand_scope: 'master' }) },
    ];

    const result = recommendPaymentOptions({
      amountArs: 25000,
      methods: [santanderVisaCredit],
      candidates,
    });

    expect(result).toHaveLength(0);
  });

  it('ranks higher-value promos ahead of lower-value ones', () => {
    const candidates: PromoCandidate[] = [
      {
        source: 'merchant',
        promo: makePromo({
          promo_key: 'low',
          promo_title: '10% en Jumbo',
          discount_percent: 10,
          cap_amount_ars: 999999,
        }),
      },
      {
        source: 'merchant',
        promo: makePromo({
          promo_key: 'high',
          promo_title: '25% en Jumbo',
          discount_percent: 25,
          cap_amount_ars: 999999,
        }),
      },
    ];

    const result = recommendPaymentOptions({
      amountArs: 20000,
      methods: [santanderVisaCredit],
      candidates,
      topN: 2,
    });

    expect(result).toHaveLength(2);
    expect(result[0]!.promo.promo_key).toBe('high');
    expect(result[0]!.estimatedSavingsArs).toBe(5000);
    expect(result[1]!.estimatedSavingsArs).toBe(2000);
  });

  it('estimates installment value when there is no direct discount', () => {
    const candidates: PromoCandidate[] = [
      {
        source: 'merchant',
        promo: makePromo({
          promo_key: 'installments',
          discount_type: 'installments',
          discount_percent: null,
          cap_amount_ars: null,
          installments_count: 12,
          card_type_scope: 'credito',
        }),
      },
    ];

    const result = recommendPaymentOptions({
      amountArs: 120000,
      methods: [santanderVisaCredit],
      candidates,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.valueType).toBe('financing_estimate');
    expect(result[0]!.estimatedSavingsArs).toBeGreaterThan(0);
    expect(result[0]!.warnings[0]).toContain('Installment value');
  });
});
