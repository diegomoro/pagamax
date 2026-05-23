import { describe, expect, it } from 'vitest';
import { parseQr } from '../src/index.js';

describe('parseQr', () => {
  it('extracts merchant identity fields from a minimal EMV payload', () => {
    const parsed = parseQr('000201010211520454115802AR5905Jumbo6004CABA5405300006304FFFF');

    expect(parsed.merchantName).toBe('Jumbo');
    expect(parsed.mcc).toBe('5411');
    expect(parsed.city).toBe('CABA');
    expect(parsed.amountArs).toBe(30000);
    expect(parsed.qrType).toBe('static');
  });

  it('extracts nested CUITs from tag 50 templates', () => {
    const parsed = parseQr('000201010211501130692240142520457325802AR5907Samsung6004CABA6304FFFF');

    expect(parsed.cuit).toBe('30692240142');
    expect(parsed.merchantName).toBe('Samsung');
  });

  it('extracts provider hints when merchant account templates expose them', () => {
    const parsed = parseQr('00020101021226270011mercadopago010812345678520454115802AR5909Carrefour6004CABA5405123456304FFFF');

    expect(parsed.paymentProvider).toBe('mercadopago');
    expect(parsed.qrType).toBe('dynamic');
    expect(parsed.amountArs).toBe(12345);
  });
});
