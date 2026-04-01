import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { matchMerchantName, matchQr, type PromoIndex } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const promoIndex = JSON.parse(
  readFileSync(resolve(__dirname, './fixtures/promo-index.fixture.json'), 'utf8'),
) as PromoIndex;

describe('matchQr', () => {
  it('matches by merchant CUIT when tag 50 is present', () => {
    const result = matchQr(
      '000201010211501130692240142520457325802AR5907Samsung6004CABA6304FFFF',
      promoIndex,
      { today: '2026-04-03', allIssuers: true },
    );

    expect(result.match_method).toBe('cuit');
    expect(result.cuit).toBe('30692240142');
    expect(result.promos).toHaveLength(2);
  });

  it('filters general promos to the resolved merchant category', () => {
    const result = matchQr(
      '000201010211501130692240142520457325802AR5907Samsung6004CABA6304FFFF',
      promoIndex,
      { today: '2026-04-03', allIssuers: true },
    );

    expect(result.general_promos).toHaveLength(0);
    expect(result.filters_applied.some(entry => entry.startsWith('general_category(Tecnología'))).toBe(true);
  });
});

describe('matchMerchantName', () => {
  it('supports manual merchant lookup without a QR payload', () => {
    const result = matchMerchantName('Jumbo', promoIndex, { today: '2026-04-03', allIssuers: true });

    expect(result.match_method).toBe('name_exact');
    expect(result.promos).toHaveLength(1);
    expect(result.general_promos).toHaveLength(1);
    expect(result.merchant_name).toBe('Jumbo');
  });
});
