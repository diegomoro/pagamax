import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  recommendLiquidityRoutes,
  type LiquidityAccount,
  type PaymentMethodProfile,
  type PromoSummary,
} from '@pagamax/core';

type MatrixRow = {
  sourceProvider: string;
  sourceLabel: string;
  targetProvider: string;
  targetLabel: string;
  expected: 'direct' | 'blocked_no_certified_pair';
  actual: 'direct' | 'instant' | 'prepared' | 'blocked' | 'unexpected';
  topTier: string | null;
  topRail: string | null;
  pass: boolean;
  note: string;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultMethodsPath = resolve(root, 'app/assets/data/default-methods.json');
const jsonReportPath = resolve(root, 'reports/liquidity-pair-capability-matrix.json');
const markdownReportPath = resolve(root, 'reports/liquidity-pair-capability-matrix.md');
const accountIdentityHash = 'identity:sha256:synthetic-certification-user';

function isAccountMoneyQr(method: PaymentMethodProfile): boolean {
  return method.rail === 'qr'
    && method.canPayMerchantQr !== false
    && (method.cardType === undefined || method.cardType === 'account_money');
}

function aliasHash(provider: string): string {
  return createHash('sha256').update(`synthetic-alias:${provider}`).digest('hex');
}

function uniqueAccountMethods(methods: PaymentMethodProfile[]): PaymentMethodProfile[] {
  const byProvider = new Map<string, PaymentMethodProfile>();
  for (const method of methods.filter(isAccountMoneyQr)) {
    const key = method.provider.trim().toLowerCase();
    if (!byProvider.has(key)) byProvider.set(key, method);
  }
  return [...byProvider.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function accountFor(method: PaymentMethodProfile, sourceProvider: string): LiquidityAccount {
  const funded = method.provider === sourceProvider;
  return {
    id: `acct-${method.provider}`,
    methodId: method.id,
    provider: method.provider,
    label: method.walletLabel ?? method.label,
    enabled: true,
    hasUsableFunds: funded,
    availableBalanceArs: funded ? 5000 : 0,
    aliasHash: aliasHash(method.provider),
    canPayMerchantQr: true,
    checkoutAllowed: true,
    ownerIdentityHash: accountIdentityHash,
    identityVerificationStatus: 'same_owner_verified',
  };
}

function promoFor(method: PaymentMethodProfile): PromoSummary {
  return {
    promo_key: `liquidity-matrix-${method.provider}`,
    issuer: method.provider,
    merchant_name: `Controlled ${method.provider} merchant`,
    category: 'Matrix',
    discount_type: 'direct_discount',
    discount_percent: 10,
    discount_amount_ars: null,
    installments_count: null,
    cap_amount_ars: 1000,
    cap_period: 'per_transaction',
    min_purchase_ars: null,
    day_pattern: 'everyday',
    channel: 'in_store',
    rail: 'qr',
    instrument_required: 'qr_wallet',
    card_brand_scope: 'any',
    card_type_scope: 'account_money',
    wallet_scope: method.walletLabel ?? method.provider,
    valid_from: '2026-06-10',
    valid_to: '',
    freshness_status: 'active',
    promo_title: `Controlled ${method.label} promo`,
    description_short: `Synthetic liquidity matrix promo for ${method.label}`,
  };
}

function markdownTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const widths = rows[0]!.map((_, index) => Math.max(...rows.map((row) => row[index]!.length)));
  return rows
    .map((row, rowIndex) => {
      const line = `| ${row.map((cell, index) => cell.padEnd(widths[index]!)).join(' | ')} |`;
      if (rowIndex !== 0) return line;
      return `${line}\n| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;
    })
    .join('\n');
}

async function main() {
  const methods = JSON.parse(await readFile(defaultMethodsPath, 'utf8')) as PaymentMethodProfile[];
  const accountMethods = uniqueAccountMethods(methods);
  const rows: MatrixRow[] = [];

  for (const source of accountMethods) {
    for (const target of accountMethods) {
      const accounts = accountMethods.map((method) => accountFor(method, source.provider));
      const routes = recommendLiquidityRoutes({
        amountArs: 1000,
        candidates: [{ source: 'merchant', promo: promoFor(target) }],
        methods: accountMethods,
        accounts,
        pairCapabilities: [],
        accountIdentityHash,
        topN: 3,
        now: '2026-06-10T12:00:00.000Z',
      });
      const top = routes[0] ?? null;
      const expected: MatrixRow['expected'] = source.provider === target.provider
        ? 'direct'
        : 'blocked_no_certified_pair';
      let actual: MatrixRow['actual'] = 'blocked';
      if (top?.routeTier === 'direct_pay') actual = 'direct';
      else if (top?.routeTier === 'instant_top_up_then_pay') actual = 'instant';
      else if (top?.routeTier === 'prepared_route') actual = 'prepared';
      else if (top) actual = 'unexpected';

      const pass = expected === 'direct'
        ? actual === 'direct' && top?.targetAccount.provider === target.provider
        : actual === 'blocked';

      rows.push({
        sourceProvider: source.provider,
        sourceLabel: source.walletLabel ?? source.label,
        targetProvider: target.provider,
        targetLabel: target.walletLabel ?? target.label,
        expected,
        actual,
        topTier: top?.routeTier ?? null,
        topRail: top?.fundingRail ?? null,
        pass,
        note: pass
          ? expected === 'direct'
            ? 'Direct same-wallet balance route is executable.'
            : 'Correct: no checkout-fast cross-wallet route without certified pair capability.'
          : 'Unexpected liquidity route result; review pair certification and default methods.',
      });
    }
  }

  const failures = rows.filter((row) => !row.pass);
  const summary = {
    generatedAt: new Date().toISOString(),
    model: 'verified_liquidity_pairs_only',
    providers: accountMethods.map((method) => method.provider),
    providersTested: accountMethods.length,
    totalPairs: rows.length,
    directRoutes: rows.filter((row) => row.actual === 'direct').length,
    instantCertifiedRoutes: rows.filter((row) => row.actual === 'instant').length,
    preparedRoutes: rows.filter((row) => row.actual === 'prepared').length,
    blockedRoutes: rows.filter((row) => row.actual === 'blocked').length,
    failures: failures.length,
  };

  const tableRows = [
    ['Source', 'Target promo wallet', 'Expected', 'Actual', 'Top rail', 'Pass'],
    ...rows.map((row) => [
      row.sourceLabel,
      row.targetLabel,
      row.expected,
      row.actual,
      row.topRail ?? 'none',
      row.pass ? 'yes' : 'no',
    ]),
  ];

  const markdown = `# Liquidity Pair Capability Matrix

Generated: ${summary.generatedAt}

This report checks every default account-money provider pair under the MVP rule: cross-wallet checkout routes are executable only when a verified pair capability exists. The current public matrix intentionally ships with no real aliases, no raw CVU/CBU, no balances, and no certified cross-wallet pair.

## Summary

- Providers tested: ${summary.providersTested} (${summary.providers.join(', ')})
- Total pairs: ${summary.totalPairs}
- Direct routes: ${summary.directRoutes}
- Instant certified routes: ${summary.instantCertifiedRoutes}
- Prepared routes: ${summary.preparedRoutes}
- Blocked routes: ${summary.blockedRoutes}
- Failures: ${summary.failures}

## Matrix

${markdownTable(tableRows)}

## Certification Rule

No cross-wallet pair becomes \`instant\` until a timed same-owner low-value funding test proves that the funding source opens, destination and amount are correct or safely confirmed by the user, funds arrive, and the target wallet can then pay the merchant QR.
`;

  await mkdir(dirname(jsonReportPath), { recursive: true });
  await writeFile(jsonReportPath, `${JSON.stringify({ summary, rows }, null, 2)}\n`);
  await writeFile(markdownReportPath, markdown);

  console.log(`Wrote ${jsonReportPath}`);
  console.log(`Wrote ${markdownReportPath}`);
  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
