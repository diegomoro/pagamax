import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getMatchedCandidates,
  matchQr,
  type PaymentMethodProfile,
  type PromoIndex,
} from '../src/index.js';
import { recommendPagamaxRoutes } from '../src/owner-routing.js';

interface QrPaymentScenario {
  id: string;
  payload: string;
  amountArs: number | null;
}

const testsDir = dirname(fileURLToPath(import.meta.url));
const scenarios = JSON.parse(readFileSync(join(testsDir, 'fixtures', 'qr-payment-scenarios.json'), 'utf8')) as QrPaymentScenario[];
const promoIndex = JSON.parse(readFileSync(join(testsDir, 'fixtures', 'promo-index.fixture.json'), 'utf8')) as PromoIndex;

const corpusMethods: PaymentMethodProfile[] = [
  {
    id: 'bbva-mastercard-black-qr',
    provider: 'bbva',
    label: 'BBVA Mastercard Black',
    rail: 'qr',
    walletLabel: 'BBVA',
    cardBrand: 'Mastercard',
    cardType: 'credit',
    ownerPhone: true,
    canPayMerchantQr: true,
    creditAvailableArs: 200000,
    qrTransferLimitRemainingArs: 200000,
    promoCapRemainingArs: 200000,
    receivingAlias: 'test.bbva.alias',
    receivingPriority: 20,
  },
  {
    id: 'mercadopago-balance-qr',
    provider: 'mercadopago',
    label: 'Mercado Pago',
    rail: 'qr',
    walletLabel: 'Mercado Pago',
    cardType: 'account_money',
    ownerPhone: true,
    canPayMerchantQr: true,
    availableBalanceArs: 200000,
    qrTransferLimitRemainingArs: 200000,
    promoCapRemainingArs: 200000,
    canReceiveCustomerTransfer: true,
    receivingAlias: 'test.mercadopago.alias',
    receivingPriority: 10,
  },
  {
    id: 'naranjax-balance-qr',
    provider: 'naranjax',
    label: 'Naranja X',
    rail: 'qr',
    walletLabel: 'Naranja X',
    cardType: 'account_money',
    canReceiveCustomerTransfer: true,
    receivingAlias: 'test.naranjax.alias',
    receivingPriority: 30,
  },
];

describe('QR routing corpus', () => {
  it.each(scenarios)('routes $id without unsafe assumptions', (scenario) => {
    const amountArs = scenario.amountArs ?? 45000;
    const match = matchQr(scenario.payload, promoIndex, { allIssuers: true });
    const result = recommendPagamaxRoutes({
      amountArs,
      ownerMethods: corpusMethods,
      candidates: getMatchedCandidates(match),
      topN: 5,
    });

    expect(result.customerRecommendations.length).toBeLessThanOrEqual(5);
    expect(result.ownerRouteCandidates.length).toBeLessThanOrEqual(5);

    if (result.ownerRoute) {
      expect(result.ownerRoute.customerChargeArs).toBeLessThan(amountArs);
      expect(result.ownerRoute.payoutMethod.provider).not.toBe(result.ownerRoute.ownerMethod.provider);
      expect(result.ownerRoute.ownerNetValueArs).toBeGreaterThan(0);
    }
  });
});
