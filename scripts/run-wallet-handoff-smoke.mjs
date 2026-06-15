import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportJson = resolve(root, 'reports/wallet-handoff-smoke.json');
const reportMd = resolve(root, 'reports/wallet-handoff-smoke.md');
const fakeQrPayload = 'PAGAMAX_FAKE_QR_DO_NOT_PAY_AR_100_MERCHANT_TEST';
const encodedFakeQr = encodeURIComponent(fakeQrPayload);

const providers = [
  {
    provider: 'mercadopago',
    label: 'Mercado Pago',
    pkg: 'com.mercadopago.wallet',
    launchUrls: ['mercadopago://home'],
    scannerUrls: ['mercadopago://qr'],
    fakeQrUrls: [
      `mercadopago://qr?payload=${encodedFakeQr}`,
      `mercadopago://qr?data=${encodedFakeQr}`,
      `mercadopago://qr/${encodedFakeQr}`,
    ],
  },
  {
    provider: 'naranjax',
    label: 'Naranja X',
    pkg: 'com.tarjetanaranja.ncuenta',
    launchUrls: [],
    scannerUrls: ['nx://qr-payments-v2/screen', 'nx://home'],
    fakeQrUrls: [
      `nx://qr-payments-v2/screen?payload=${encodedFakeQr}`,
      `nx://qr-payments-v2/screen?amount=100&payload=${encodedFakeQr}`,
    ],
  },
  {
    provider: 'personalpay',
    label: 'Personal Pay',
    pkg: 'ar.com.personalpay',
    launchUrls: ['ar.com.personalpay://'],
    scannerUrls: ['ar.com.personalpay://qr', 'ar.com.personalpay://pay'],
    fakeQrUrls: [
      `ar.com.personalpay://qr?payload=${encodedFakeQr}`,
      `ar.com.personalpay://pay?amount=100&payload=${encodedFakeQr}`,
    ],
  },
  {
    provider: 'bbva',
    label: 'BBVA Argentina',
    pkg: 'com.bbva.nxt_argentina',
    launchUrls: [],
    scannerUrls: ['bbva://qr', 'bbva://pay'],
    fakeQrUrls: [
      `bbva://qr?payload=${encodedFakeQr}`,
      `bbva://pay?amount=100&payload=${encodedFakeQr}`,
    ],
  },
  {
    provider: 'bna',
    label: 'BNA+',
    pkg: 'com.banconacion.bnamas',
    launchUrls: ['bnamas://'],
    scannerUrls: ['bnamas://qr', 'bnamas://pay'],
    fakeQrUrls: [
      `bnamas://qr?payload=${encodedFakeQr}`,
      `bnamas://pay?amount=100&payload=${encodedFakeQr}`,
    ],
  },
  {
    provider: 'bancon',
    label: 'Bancon',
    pkg: 'ar.com.bancor.bancon',
    launchUrls: ['bancor://'],
    scannerUrls: ['bancor://qr', 'bancor://pay'],
    fakeQrUrls: [
      `bancor://qr?payload=${encodedFakeQr}`,
      `bancor://pay?amount=100&payload=${encodedFakeQr}`,
    ],
  },
  {
    provider: 'carrefour_bank',
    label: 'Banco Carrefour',
    pkg: 'com.carrefour.bancadeserviciosfinancieroscarrefour',
    launchUrls: ['com.carrefour.bancadeserviciosfinancieroscarrefour://'],
    scannerUrls: ['com.carrefour.bancadeserviciosfinancieroscarrefour://qr'],
    fakeQrUrls: [
      `com.carrefour.bancadeserviciosfinancieroscarrefour://qr?payload=${encodedFakeQr}`,
    ],
  },
  {
    provider: 'ypf',
    label: 'YPF App',
    pkg: 'com.ypf.jpm',
    launchUrls: ['ypfjpm://'],
    scannerUrls: ['ypfjpm://qr', 'ypfjpm://pay'],
    fakeQrUrls: [
      `ypfjpm://qr?payload=${encodedFakeQr}`,
      `ypfjpm://pay?amount=100&payload=${encodedFakeQr}`,
    ],
  },
  {
    provider: 'shellbox',
    label: 'Shell Box',
    pkg: 'com.raizen.shellbox',
    launchUrls: ['shellbox://'],
    scannerUrls: ['shellbox://qr', 'shellbox://pay'],
    fakeQrUrls: [
      `shellbox://qr?payload=${encodedFakeQr}`,
      `shellbox://pay?amount=100&payload=${encodedFakeQr}`,
    ],
  },
];

function runAdb(args, timeoutMs = 15000) {
  try {
    const stdout = execFileSync('adb', args, {
      cwd: root,
      timeout: timeoutMs,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output: stdout };
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error.stderr === 'string' ? error.stderr : '';
    return { ok: false, output: `${stdout}${stderr}`.trim() };
  }
}

function shell(command, timeoutMs = 15000) {
  return runAdb(['shell', command], timeoutMs);
}

function installedPackages() {
  return shell('pm list packages', 30000).output
    .split(/\r?\n/)
    .map((line) => line.replace(/^package:/, '').trim())
    .filter(Boolean);
}

function currentFocus() {
  const output = shell('dumpsys window | grep -E "mCurrentFocus|mFocusedApp"', 30000).output;
  const packageMatch = output.match(/\s([a-zA-Z0-9_.]+)\/[a-zA-Z0-9_.$]+/);
  return {
    packageName: packageMatch?.[1] ?? null,
    raw: output,
  };
}

function classify(output, expectedPackage) {
  const focus = currentFocus();
  const text = output.toLowerCase();
  if (text.includes('securityexception') || text.includes('permission denial') || text.includes('deeplink_permission')) {
    return { status: 'permission_denied', focus };
  }
  if (text.includes('unable to resolve intent') || text.includes('activity not started') || text.includes('error: activity not started')) {
    return { status: 'not_resolved', focus };
  }
  if (!text.includes('status: ok') && !text.includes('events injected')) {
    return { status: 'not_started', focus };
  }
  if (focus.packageName === expectedPackage) return { status: 'opened_target', focus };
  if (focus.packageName) return { status: 'opened_other_or_existing', focus };
  return { status: 'unknown', focus };
}

function resolveUrl(url) {
  return shell(`cmd package resolve-activity -a android.intent.action.VIEW -d '${url}'`, 10000).output;
}

function launchPackage(pkg) {
  shell('input keyevent KEYCODE_HOME', 10000);
  const result = runAdb(['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'], 20000);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
  return {
    ...classify(result.output, pkg),
    output: result.output,
  };
}

function launchUrl(url, expectedPackage) {
  shell(`am force-stop ${expectedPackage}`, 10000);
  shell('input keyevent KEYCODE_HOME', 10000);
  const result = runAdb(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', url], 20000);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
  return {
    url,
    resolvedTo: resolveUrl(url),
    ...classify(result.output, expectedPackage),
    output: result.output,
  };
}

function markdownTable(rows) {
  if (rows.length === 0) return '';
  const widths = rows[0].map((_, index) => Math.max(...rows.map((row) => String(row[index]).length)));
  return rows.map((row, index) => {
    const line = `| ${row.map((cell, cellIndex) => String(cell).padEnd(widths[cellIndex])).join(' | ')} |`;
    if (index === 0) return `${line}\n| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;
    return line;
  }).join('\n');
}

async function main() {
  const installed = new Set(installedPackages());
  const rows = [];

  for (const provider of providers) {
    const packageInstalled = installed.has(provider.pkg);
    const packageLaunch = packageInstalled ? launchPackage(provider.pkg) : { status: 'not_installed', focus: { packageName: null, raw: '' }, output: '' };
    const tests = [];

    for (const url of provider.launchUrls) tests.push({ kind: 'launch_url', ...launchUrl(url, provider.pkg) });
    for (const url of provider.scannerUrls) tests.push({ kind: 'scanner_url', ...launchUrl(url, provider.pkg) });
    for (const url of provider.fakeQrUrls) tests.push({ kind: 'fake_qr_url', ...launchUrl(url, provider.pkg) });

    shell('input keyevent KEYCODE_HOME', 10000);

    rows.push({
      provider: provider.provider,
      label: provider.label,
      package: provider.pkg,
      packageInstalled,
      packageLaunchStatus: packageLaunch.status,
      tests,
      canOpenPackage: packageLaunch.status === 'opened_target',
      scannerPromptAccepted: tests.some((test) => test.kind === 'scanner_url' && test.status === 'opened_target'),
      fakeQrPayloadAccepted: tests.some((test) => test.kind === 'fake_qr_url' && test.status === 'opened_target'),
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    fakeQrPayload,
    providersTested: rows.length,
    installedProviders: rows.filter((row) => row.packageInstalled).length,
    packageLaunches: rows.filter((row) => row.canOpenPackage).length,
    scannerPromptsAccepted: rows.filter((row) => row.scannerPromptAccepted).length,
    fakeQrUrlOpenedTarget: rows.filter((row) => row.fakeQrPayloadAccepted).length,
    qrPayloadPrefillProven: 0,
  };

  const table = markdownTable([
    ['Provider', 'Installed', 'Package launch', 'Scanner URL accepted', 'Fake QR URL opened target', 'QR/amount prefill proven', 'Conclusion'],
    ...rows.map((row) => [
      row.label,
      row.packageInstalled ? 'yes' : 'no',
      row.packageLaunchStatus,
      row.scannerPromptAccepted ? 'yes' : 'no',
      row.fakeQrPayloadAccepted ? 'yes' : 'no',
      'no',
      row.fakeQrPayloadAccepted
        ? 'scheme opened target; payload parsing still unproven'
        : row.scannerPromptAccepted
          ? 'can open scanner only; cannot pass QR/amount'
          : row.canOpenPackage
            ? 'can open app only'
            : 'blocked/not installed',
    ]),
  ]);

  const markdown = `# Wallet Handoff Smoke Test

Generated: ${summary.generatedAt}

Scope: no real transfers, no real QR payloads, no payment approval. The fake payload was \`${fakeQrPayload}\`. A pass here means only that Android accepted a prompt or app launch; it does not mean the wallet can prefill a real merchant, amount, transfer, or payment.

## Summary

- Providers tested: ${summary.providersTested}
- Installed providers: ${summary.installedProviders}
- Package launches: ${summary.packageLaunches}
- Scanner prompts accepted: ${summary.scannerPromptsAccepted}
- Fake QR URLs opened target app: ${summary.fakeQrUrlOpenedTarget}
- QR/amount prefill proven: ${summary.qrPayloadPrefillProven}

## Results

${table}

## Safety Interpretation

If \`Fake QR URL opened target\` is \`yes\`, it only means Android routed the URL to that app. Pagamax must still treat the flow as manual scanner handoff until visual inspection proves the wallet shows the expected merchant and amount before user approval.
`;

  mkdirSync(dirname(reportJson), { recursive: true });
  writeFileSync(reportJson, `${JSON.stringify({ summary, rows }, null, 2)}\n`);
  writeFileSync(reportMd, markdown);

  console.log(`Wrote ${reportJson}`);
  console.log(`Wrote ${reportMd}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
