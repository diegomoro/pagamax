import { describe, expect, it } from 'vitest';
import { sanitizeTelemetryEvent } from '../src/redaction';

describe('telemetry redaction', () => {
  it('keeps aggregate checkout fields and drops sensitive payload fields', () => {
    const sanitized = sanitizeTelemetryEvent({
      name: 'session_created',
      accountId: 'client-supplied-account',
      payload: {
        merchantName: 'Farmacia Central',
        category: 'Farmacia',
        amountBand: '5000-14999',
        amountCents: 123456,
        rawQrPayload: '000201010212...',
        dni: '12345678',
        email: 'user@example.com',
        topProvider: 'MODO',
        liquidityRouteCount: 2,
        topRouteTier: 'instant_top_up_then_pay',
        topFundingRail: 'verified_prefilled_transfer',
        topFundingStatus: 'instant',
        targetAliasHash: 'alias-hash',
        availableBalanceArs: 9000,
        recommendationCount: 3,
        matchMethod: 'name_exact',
      },
    });

    expect(sanitized).toMatchObject({
      eventName: 'session_created',
      merchantName: 'Farmacia Central',
      merchantCategory: 'Farmacia',
      amountBand: '5000-14999',
      selectedProvider: 'MODO',
    });
    expect(sanitized.payload).toMatchObject({
      topProvider: 'MODO',
      liquidityRouteCount: 2,
      topRouteTier: 'instant_top_up_then_pay',
      topFundingRail: 'verified_prefilled_transfer',
      topFundingStatus: 'instant',
      recommendationCount: 3,
      matchMethod: 'name_exact',
    });
    expect(JSON.stringify(sanitized)).not.toContain('12345678');
    expect(JSON.stringify(sanitized)).not.toContain('000201');
    expect(JSON.stringify(sanitized)).not.toContain('user@example.com');
    expect(JSON.stringify(sanitized)).not.toContain('amountCents');
    expect(JSON.stringify(sanitized)).not.toContain('alias-hash');
    expect(JSON.stringify(sanitized)).not.toContain('availableBalanceArs');
  });
});
