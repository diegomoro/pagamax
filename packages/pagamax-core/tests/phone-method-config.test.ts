import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PaymentMethodProfile } from '../src/index.js';

const testsDir = dirname(fileURLToPath(import.meta.url));
const methodsPath = join(testsDir, '..', '..', '..', 'app', 'assets', 'data', 'default-methods.json');
const methods = JSON.parse(readFileSync(methodsPath, 'utf8')) as PaymentMethodProfile[];

describe('phone method config', () => {
  it('contains the public payment methods without bundled receiving aliases', () => {
    const byId = new Map(methods.map(method => [method.id, method]));

    expect(byId.get('naranjax-balance-qr')?.receivingAlias).toBeNull();
    expect(byId.get('bbva-mastercard-black-qr')?.receivingAlias).toBeNull();
    expect(byId.get('bbva-visa-signature-qr')?.receivingAlias).toBeNull();
    expect(byId.get('bbva-debit-qr')?.receivingAlias).toBeNull();
    expect(byId.get('mercadopago-balance-qr')?.receivingAlias).toBeNull();
    expect(byId.get('personalpay-prepaid-qr')?.receivingAlias).toBeNull();
    expect(byId.get('carrefour-bank-qr')?.receivingAlias).toBeNull();
    expect(byId.get('bna-plus-wallet-qr')?.receivingAlias).toBeNull();
    expect(byId.get('ypf-app-wallet-qr')?.receivingAlias).toBeNull();
  });

  it('does not ship owner-phone receiving state in the public build', () => {
    for (const method of methods) {
      expect(method.ownerPhone, method.id).toBe(false);
      expect(method.canReceiveCustomerTransfer, method.id).toBe(false);
      expect(method.receivingAlias, method.id).toBeNull();
      expect(method.availableBalanceArs, method.id).toBeNull();
      expect(method.qrTransferLimitRemainingArs, method.id).toBeNull();
      expect(method.promoCapRemainingArs, method.id).toBeNull();
    }
  });
});
