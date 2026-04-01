/**
 * match.ts - QR scan -> promo lookup engine
 *
 * Scraper wrapper around the shared @pagamax/core matcher.
 * Keeps the local CLI and filesystem-based index loading used by existing scripts.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  matchQr as matchQrWithIndex,
  type MatchOptions,
  type MatchResult,
  type PromoIndex,
} from '@pagamax/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _index: PromoIndex | null = null;

function loadIndex(): PromoIndex {
  if (_index) return _index;
  const path = resolve(__dirname, 'promo-index.json');
  _index = JSON.parse(readFileSync(path, 'utf8')) as PromoIndex;
  return _index;
}

export type { MatchOptions, MatchResult };

export function matchQr(qrPayload: string, opts: MatchOptions = {}): MatchResult {
  return matchQrWithIndex(qrPayload, loadIndex(), opts);
}

if (process.argv[1]?.includes('match')) {
  const payload = process.argv[2];
  if (!payload) {
    console.error('Usage: npx tsx src/qr/match.ts "<QR payload>" [--today YYYY-MM-DD] [--issuer modo] [--brand visa] [--type credit]');
    process.exit(1);
  }

  const cliArgs = process.argv.slice(3);
  const cliGet = (flag: string) => {
    const index = cliArgs.indexOf(flag);
    return index !== -1 ? cliArgs[index + 1] : undefined;
  };

  const opts: MatchOptions = {
    allIssuers: cliArgs.includes('--all-issuers'),
  };
  const today = cliGet('--today');
  const issuer = cliGet('--issuer');
  const cardBrand = cliGet('--brand');
  const cardType = cliGet('--type');
  if (today) opts.today = today;
  if (issuer) opts.issuer = issuer;
  if (cardBrand) opts.cardBrand = cardBrand;
  if (cardType) opts.cardType = cardType;

  const result = matchQr(payload, opts);

  console.log('\n=== QR Merchant Match ===\n');
  console.log('QR parsed:');
  console.log(`  CUIT:    ${result.qr.cuit ?? '(none in QR)'}`);
  console.log(`  Name:    ${result.qr.name ?? '(none in QR)'}`);
  console.log(`  MCC:     ${result.qr.mcc ?? '-'}  |  City: ${result.qr.city ?? '-'}  |  CBU: ${result.qr.cbu ?? '-'}`);
  if (result.qr.amount_ars !== null) {
    console.log(`  Amount:  $${result.qr.amount_ars.toLocaleString('es-AR')}`);
  }

  console.log('\nMerchant resolved:');
  console.log(`  Method:  ${result.match_method}`);
  console.log(`  CUIT:    ${result.cuit ?? '(unknown)'}`);
  console.log(`  Name:    ${result.merchant_name}`);

  if (result.aggregator_qr) console.log(`  Warning: Aggregator QR - CUIT ${result.qr.cuit} is a PSP, used name matching`);
  console.log(`\nPromos: ${result.promos.length} merchant-specific + ${result.general_promos.length} general (from ${result.total_unfiltered} total)`);
  if (result.filters_applied.length) console.log(`  Filters: ${result.filters_applied.join(', ')}`);

  if (result.general_promos.length > 0) {
    const bestGeneral = result.general_promos.slice(0, 3);
    console.log(`\nGeneral promos (top ${Math.min(3, result.general_promos.length)}):`);
    for (const promo of bestGeneral) {
      const discount = promo.discount_type === 'installments'
        ? `${promo.installments_count}x cuotas`
        : `${promo.discount_percent ?? '?'}% ${promo.discount_type === 'cashback' ? 'cashback' : 'off'}`;
      const day = promo.day_pattern && promo.day_pattern !== 'everyday' ? ` [${promo.day_pattern}]` : '';
      console.log(`    ${promo.issuer.toUpperCase()}: ${discount}${day} - ${promo.promo_title}`);
    }
  }

  if (result.by_issuer.length === 0) {
    console.log('\n  No merchant-specific promos for this merchant / day / payment method.');
  } else {
    for (const group of result.by_issuer) {
      console.log(`\n  -- ${group.issuer.toUpperCase()} (${group.promos.length} promos, best: ${group.best_discount_percent ?? '?'}% off) --`);
      for (const promo of group.promos.slice(0, 5)) {
        const discount = promo.discount_type === 'installments'
          ? `${promo.installments_count}x cuotas`
          : `${promo.discount_percent ?? '?'}% ${promo.discount_type === 'cashback' ? 'cashback' : 'off'}`;
        const cap = promo.cap_amount_ars ? ` (cap $${promo.cap_amount_ars.toLocaleString('es-AR')}/${promo.cap_period})` : '';
        const day = promo.day_pattern && promo.day_pattern !== 'everyday' ? ` [${promo.day_pattern}]` : '';
        const brand = promo.card_brand_scope && promo.card_brand_scope !== 'any' ? ` | ${promo.card_brand_scope}` : '';
        console.log(`    ${discount}${cap}${day}${brand}`);
        console.log(`      ${promo.promo_title}`);
      }
      if (group.promos.length > 5) console.log(`    ... and ${group.promos.length - 5} more`);
    }
  }
}
