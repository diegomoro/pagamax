import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseQr } from '../src/index.js';

interface QrPaymentScenario {
  id: string;
  payload: string;
  expectedParsed: {
    merchantName: string | null;
    paymentProvider: string | null;
    amountArs: number | null;
    qrType: 'static' | 'dynamic' | 'unknown';
  };
}

const fixturesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'qr-payment-scenarios.json',
);

const scenarios = JSON.parse(readFileSync(fixturesPath, 'utf8')) as QrPaymentScenario[];

describe('QR payment scenario fixtures', () => {
  it.each(scenarios)('parses $id', (scenario) => {
    const parsed = parseQr(scenario.payload);

    expect(parsed.merchantName).toBe(scenario.expectedParsed.merchantName);
    expect(parsed.paymentProvider).toBe(scenario.expectedParsed.paymentProvider);
    expect(parsed.amountArs).toBe(scenario.expectedParsed.amountArs);
    expect(parsed.qrType).toBe(scenario.expectedParsed.qrType);
  });
});
