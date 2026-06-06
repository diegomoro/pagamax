import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PaymentMethodProfile } from '../src/index.js';

const testsDir = dirname(fileURLToPath(import.meta.url));
const methodsPath = join(testsDir, '..', '..', '..', 'app', 'assets', 'data', 'default-methods.json');
const methods = JSON.parse(readFileSync(methodsPath, 'utf8')) as PaymentMethodProfile[];

describe('phone method config', () => {
  it('contains the configured owner-phone payment methods and aliases', () => {
    const byId = new Map(methods.map(method => [method.id, method]));

    expect(byId.get('naranjax-balance-qr')?.receivingAlias).toBe('ddmoro.nx');
    expect(byId.get('bbva-mastercard-black-qr')?.receivingAlias).toBe('diego.daniel.moro');
    expect(byId.get('bbva-visa-signature-qr')?.receivingAlias).toBe('diego.daniel.moro');
    expect(byId.get('bbva-debit-qr')?.receivingAlias).toBe('diego.daniel.moro');
    expect(byId.get('mercadopago-balance-qr')?.receivingAlias).toBe('buceo.deseo.curso.mp');
    expect(byId.get('personalpay-prepaid-qr')?.receivingAlias).toBe('dmoro17.ppay');
    expect(byId.get('carrefour-bank-qr')?.receivingAlias).toBe('Paga.Menos.CF');
    expect(byId.get('bna-plus-wallet-qr')?.receivingAlias).toBe('Paga.Menos.BNA');
    expect(byId.get('ypf-app-wallet-qr')?.receivingAlias).toBeNull();
  });

  it('does not mark a method as customer-transfer receivable without an alias', () => {
    for (const method of methods) {
      if (method.canReceiveCustomerTransfer === false) continue;
      expect(method.receivingAlias?.trim(), method.id).toBeTruthy();
    }
  });
});
