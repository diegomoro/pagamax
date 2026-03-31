#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchQr } from '../qr/match.js';
import {
  recommendPaymentOptions,
  type PaymentMethodProfile,
  type PromoCandidate,
} from './engine.js';
import { parseRecommendationCliArgs } from './cli-args.js';

function usage(): never {
  console.error(
    'Usage: npx tsx src/recommendation/cli.ts --qr "<payload>" --amount 30000 --methods ./src/recommendation/demo-methods.example.json [--today YYYY-MM-DD] [--top 5] [--json]',
  );
  console.error(
    '   or: npm run recommend:demo -- "<payload>" 30000 ./src/recommendation/demo-methods.example.json',
  );
  process.exit(1);
}

function formatArs(value: number): string {
  return `$${Math.round(value).toLocaleString('es-AR')}`;
}

function loadMethods(pathArg: string): PaymentMethodProfile[] {
  const raw = JSON.parse(readFileSync(resolve(pathArg), 'utf8')) as unknown;
  if (!Array.isArray(raw)) throw new Error('Methods file must contain a JSON array');
  return raw as PaymentMethodProfile[];
}

const parsedArgs = parseRecommendationCliArgs(process.argv.slice(2));
if (!parsedArgs) usage();

const amountArs = Number(parsedArgs.amountArg);
if (!Number.isFinite(amountArs) || amountArs <= 0) {
  throw new Error(`--amount must be a positive number, got ${parsedArgs.amountArg}`);
}

const topN = Number(parsedArgs.topArg ?? '5');

const methods = loadMethods(parsedArgs.methodsPath);
const match = matchQr(
  parsedArgs.qrPayload,
  parsedArgs.today ? { today: parsedArgs.today, allIssuers: true } : { allIssuers: true },
);

const candidates: PromoCandidate[] = [
  ...match.promos.map(promo => ({ promo, source: 'merchant' as const })),
  ...match.general_promos.map(promo => ({ promo, source: 'general' as const })),
];

const recommendations = recommendPaymentOptions({
  amountArs,
  methods,
  candidates,
  topN: Number.isFinite(topN) && topN > 0 ? topN : 5,
});

if (parsedArgs.asJson) {
  console.log(JSON.stringify({
    merchant: {
      match_method: match.match_method,
      merchant_name: match.merchant_name,
      cuit: match.cuit,
      aggregator_qr: match.aggregator_qr,
    },
    amount_ars: amountArs,
    recommendations,
  }, null, 2));
  process.exit(0);
}

console.log('\n=== PagaMax Demo Recommendations ===\n');
console.log(`Merchant: ${match.merchant_name} (${match.match_method})`);
console.log(`Amount:   ${formatArs(amountArs)}`);
if (match.aggregator_qr) console.log('Note:     QR CUIT belongs to a PSP aggregator, so name/category fallback was used');

if (recommendations.length === 0) {
  console.log('\nNo eligible payment options were found for the supplied methods and amount.');
  process.exit(0);
}

for (const [index, rec] of recommendations.entries()) {
  console.log(`\n${index + 1}. ${rec.method.label}`);
  console.log(`   Promo:    ${rec.promo.promo_title}`);
  console.log(`   Issuer:   ${rec.promo.issuer} (${rec.source})`);
  console.log(`   Value:    ${formatArs(rec.estimatedSavingsArs)} estimated ${rec.valueType}`);
  console.log(`   Net pay:  ${formatArs(rec.estimatedNetPaymentArs)}`);
  for (const reason of rec.reasons) {
    console.log(`   Why:      ${reason}`);
  }
  for (const warning of rec.warnings) {
    console.log(`   Warning:  ${warning}`);
  }
}
