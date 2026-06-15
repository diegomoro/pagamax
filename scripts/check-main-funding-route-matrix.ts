import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommendCheckoutRoutes, type PaymentMethodProfile, type PromoSummary } from '@pagamax/core';

type MatrixRow = {
  mainMethodId: string;
  mainProvider: string;
  mainLabel: string;
  targetMethodId: string;
  targetProvider: string;
  targetLabel: string;
  expected: 'direct' | 'blocked_cross_wallet';
  actual: 'direct' | 'blocked' | 'unexpected_cross_wallet' | 'wrong_method';
  pass: boolean;
  topProvider: string | null;
  topMethodId: string | null;
  executionRail: string | null;
  note: string;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultMethodsPath = resolve(root, 'app/assets/data/default-methods.json');
const jsonReportPath = resolve(root, 'reports/main-funding-route-matrix.json');
const markdownReportPath = resolve(root, 'reports/main-funding-route-matrix.md');

function fundedCheckoutRails(method: PaymentMethodProfile): PaymentMethodProfile['checkoutRails'] {
  if (method.rail === 'qr') return ['ready_balance', 'wallet_scanner'];
  return ['unsupported'];
}

function isAccountMoneyQr(method: PaymentMethodProfile): boolean {
  return method.rail === 'qr'
    && method.canPayMerchantQr !== false
    && (method.cardType === undefined || method.cardType === 'account_money');
}

function asStrictSingleFundedPrincipal(
  methods: PaymentMethodProfile[],
  mainMethodId: string,
): PaymentMethodProfile[] {
  return methods.map((method) => {
    if (method.id === mainMethodId) {
      return {
        ...method,
        enabled: true,
        isDefault: true,
        canPayMerchantQr: method.canPayMerchantQr ?? (method.rail === 'qr' || method.rail === 'card'),
        manualFundingRequired: false,
        checkoutRails: fundedCheckoutRails(method),
        checkoutFrictionScore: Math.min(method.checkoutFrictionScore ?? 100, 100),
        handoffFailureRiskScore: Math.min(method.handoffFailureRiskScore ?? 250, 250),
      };
    }

    return {
      ...method,
      enabled: true,
      isDefault: false,
      checkoutRails: [],
      manualFundingRequired: true,
    };
  });
}

function syntheticPromoFor(method: PaymentMethodProfile): PromoSummary {
  return {
    promo_key: `matrix-${method.id}`,
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
    rail: method.rail,
    instrument_required: method.rail === 'qr' ? 'qr_wallet' : `${method.rail}`,
    card_brand_scope: method.cardBrand ?? 'any',
    card_type_scope: method.cardType ?? 'any',
    wallet_scope: method.walletLabel ?? method.provider,
    valid_from: '2026-06-09',
    valid_to: '',
    freshness_status: 'active',
    promo_title: `Controlled ${method.label} promo`,
    description_short: `Synthetic matrix promo for ${method.label}`,
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
  const methods = (JSON.parse(await readFile(defaultMethodsPath, 'utf8')) as PaymentMethodProfile[])
    .filter(isAccountMoneyQr);
  const matrixRows: MatrixRow[] = [];

  for (const mainMethod of methods) {
    const configuredMethods = asStrictSingleFundedPrincipal(methods, mainMethod.id);

    for (const targetMethod of methods) {
      const routes = recommendCheckoutRoutes({
        amountArs: 1000,
        candidates: [{ source: 'merchant', promo: syntheticPromoFor(targetMethod) }],
        methods: configuredMethods,
        topN: 3,
      });

      const top = routes[0] ?? null;
      const expected: MatrixRow['expected'] = mainMethod.id === targetMethod.id ? 'direct' : 'blocked_cross_wallet';
      let actual: MatrixRow['actual'];
      let note: string;

      if (!top) {
        actual = 'blocked';
        note = expected === 'blocked_cross_wallet'
          ? 'Correct: no instant cross-wallet route is claimed.'
          : 'Blocked even though the principal method should be funded.';
      } else if (top.method.id === mainMethod.id && mainMethod.id === targetMethod.id) {
        actual = 'direct';
        note = 'Correct: principal method can pay its own promo route.';
      } else if (mainMethod.id !== targetMethod.id && top.method.id === targetMethod.id) {
        actual = 'unexpected_cross_wallet';
        note = 'Unsafe: target wallet was recommended even though only the principal is funded.';
      } else {
        actual = 'wrong_method';
        note = `Unexpected top method ${top.method.label}.`;
      }

      const pass = expected === 'direct'
        ? actual === 'direct'
        : actual === 'blocked';

      matrixRows.push({
        mainMethodId: mainMethod.id,
        mainProvider: mainMethod.provider,
        mainLabel: mainMethod.label,
        targetMethodId: targetMethod.id,
        targetProvider: targetMethod.provider,
        targetLabel: targetMethod.label,
        expected,
        actual,
        pass,
        topProvider: top?.method.provider ?? null,
        topMethodId: top?.method.id ?? null,
        executionRail: top?.executionRail ?? null,
        note,
      });
    }
  }

  const failures = matrixRows.filter((row) => !row.pass);
  const direct = matrixRows.filter((row) => row.actual === 'direct');
  const blocked = matrixRows.filter((row) => row.actual === 'blocked');
  const unexpectedCrossWallet = matrixRows.filter((row) => row.actual === 'unexpected_cross_wallet');

  const summary = {
    generatedAt: new Date().toISOString(),
    model: 'strict_single_funded_principal',
    mainMethods: methods.length,
    targetMethods: methods.length,
    totalCases: matrixRows.length,
    directCases: direct.length,
    blockedCrossWalletCases: blocked.length,
    unexpectedCrossWalletCases: unexpectedCrossWallet.length,
    failures: failures.length,
  };

  const markdownRows = [
    ['Main', 'Target promo method', 'Expected', 'Actual', 'Top route', 'Pass'],
    ...matrixRows.map((row) => [
      row.mainLabel,
      row.targetLabel,
      row.expected,
      row.actual,
      row.topMethodId ? `${row.topProvider} / ${row.executionRail}` : 'none',
      row.pass ? 'yes' : 'no',
    ]),
  ];

  const markdown = `# Main Funding Route Matrix

Generated: ${summary.generatedAt}

This checks every selectable principal payment method against every target promo/payment method under a strict checkout-line assumption: only the selected principal is known to have immediately usable funds. Cross-wallet routes are marked blocked unless a real fast funding rail exists. This report does not prove external wallet apps can prefill or complete a payment.

## Summary

- Main methods tested: ${summary.mainMethods}
- Target methods tested: ${summary.targetMethods}
- Total combinations: ${summary.totalCases}
- Direct executable routes: ${summary.directCases}
- Correctly blocked cross-wallet routes: ${summary.blockedCrossWalletCases}
- Unexpected cross-wallet recommendations: ${summary.unexpectedCrossWalletCases}
- Failures: ${summary.failures}

## Matrix

${markdownTable(markdownRows)}

## Real-Payment Sampling Rule

Do not pay all combinations. Use this matrix to pick one low-value real QR for each main provider that can actually be funded on the phone, then test only direct executable rows and any future same-owner fast-funding rows. If a row is blocked here, the app should not claim a two-button checkout route for it.
`;

  await mkdir(dirname(jsonReportPath), { recursive: true });
  await writeFile(jsonReportPath, `${JSON.stringify({ summary, rows: matrixRows }, null, 2)}\n`);
  await writeFile(markdownReportPath, markdown);

  console.log(`Wrote ${jsonReportPath}`);
  console.log(`Wrote ${markdownReportPath}`);
  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
