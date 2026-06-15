import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const scraperDir = resolve(root, 'scraper');
const npxCommand = 'npx';
const reportPath = process.env.PROMO_REFRESH_REPORT_PATH
  ? resolve(process.env.PROMO_REFRESH_REPORT_PATH)
  : resolve(root, 'reports/promo-refresh-report.json');

function parsePositiveInteger(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const minSuccessfulScrapers = parsePositiveInteger('PROMO_REFRESH_MIN_SUCCESSFUL_SCRAPERS', 1);
const runStartedAt = new Date().toISOString();
const steps = [];

function writeReport(status, extra = {}) {
  const scraperResults = steps.filter((step) => step.kind === 'scraper');
  const failedScrapers = scraperResults.filter((step) => step.status === 'failed');
  const skippedScrapers = scraperResults.filter((step) => step.status === 'skipped');
  const successfulScrapers = scraperResults.filter((step) => step.status === 'success');
  const report = {
    schema_version: 1,
    status,
    started_at: runStartedAt,
    completed_at: new Date().toISOString(),
    min_successful_scrapers: minSuccessfulScrapers,
    successful_scrapers: successfulScrapers.length,
    failed_scrapers: failedScrapers.map((step) => step.label),
    skipped_scrapers: skippedScrapers.map((step) => step.label),
    steps,
    ...extra,
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[refresh] Report written to ${reportPath}`);
}

function runStep(label, command, args, options = {}) {
  const startedAt = new Date();
  console.log(`\n[refresh] ${label}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: 'inherit',
    env: { ...process.env, ...(options.env ?? {}) },
    shell: options.shell ?? process.platform === 'win32',
  });

  const finishedAt = new Date();
  const summary = {
    kind: options.kind ?? 'pipeline',
    label,
    command: [command, ...args].join(' '),
    cwd: options.cwd ?? root,
    status: 'success',
    exit_code: result.status,
    signal: result.signal,
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
  };

  if (result.error) {
    summary.status = 'failed';
    summary.error = result.error.message;
    console.error(`[refresh] ${label} failed to launch: ${result.error.message}`);
  } else if (result.status !== 0) {
    summary.status = 'failed';
    console.error(`[refresh] ${label} exited with code ${result.status ?? 'unknown'}`);
  }

  steps.push(summary);
  return summary.status === 'success';
}

function recordSkippedScraper(label, reason) {
  steps.push({
    kind: 'scraper',
    label,
    command: null,
    cwd: scraperDir,
    status: 'skipped',
    exit_code: null,
    signal: null,
    duration_ms: 0,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    reason,
  });
  console.log(`\n[refresh] ${label} skipped - ${reason}`);
}

const scraperSteps = [
  ['BBVA', ['tsx', 'src/issuers/bbva/scraper.ts']],
  ['Carrefour Bank', ['tsx', 'src/issuers/carrefour_bank/scraper.ts']],
  ['Cuenta DNI', ['tsx', 'src/issuers/cuentadni/scraper.ts', '--out', './output_cuentadni']],
  ['MODO', ['tsx', 'src/issuers/modo/scraper.ts', '--out', './output_modo_final']],
  ['Naranja X', ['tsx', 'src/issuers/naranjax/scraper.ts']],
  ['Personal Pay', ['tsx', 'src/issuers/personalpay/scraper.ts']],
  ['Shell Box', ['tsx', 'src/issuers/shellbox/scraper.ts']],
  ['Uala', ['tsx', 'src/issuers/uala/scraper.ts']],
  ['YPF', ['tsx', 'src/issuers/ypf/scraper.ts']],
];

for (const [label, args] of scraperSteps) {
  runStep(label, npxCommand, args, { cwd: scraperDir, kind: 'scraper' });
}

const mercadoPagoCookiesPath = resolve(scraperDir, 'recon_out_mp/recon-cookies.json');
if (existsSync(mercadoPagoCookiesPath)) {
  runStep('Mercado Pago', npxCommand, ['tsx', 'src/issuers/mercadopago/scraper.ts'], { cwd: scraperDir, kind: 'scraper' });
} else {
  recordSkippedScraper('Mercado Pago', 'missing recon_out_mp/recon-cookies.json');
}

const successfulScrapers = steps.filter((step) => step.kind === 'scraper' && step.status === 'success').length;
if (successfulScrapers < minSuccessfulScrapers) {
  const message = `Only ${successfulScrapers} scraper(s) succeeded; required at least ${minSuccessfulScrapers}.`;
  console.error(`\n[refresh] ${message}`);
  writeReport('failed', { failure_reason: message });
  process.exit(1);
}

if (!runStep('Consolidate', npxCommand, ['tsx', 'src/consolidate.ts'], { cwd: scraperDir })) {
  writeReport('failed', { failure_reason: 'Consolidate failed.' });
  process.exit(1);
}

if (!runStep('Build promo index', npxCommand, ['tsx', 'src/qr/build-promo-index.ts'], { cwd: scraperDir })) {
  writeReport('failed', { failure_reason: 'Build promo index failed.' });
  process.exit(1);
}

if (!runStep('Sync bundled mobile data', process.execPath, [resolve(root, 'scripts/sync-mobile-data.mjs')], { shell: false })) {
  writeReport('failed', { failure_reason: 'Sync bundled mobile data failed.' });
  process.exit(1);
}

const failedScrapers = steps.filter((step) => step.kind === 'scraper' && step.status === 'failed');
if (failedScrapers.length > 0) {
  console.log(`\n[refresh] Completed with scraper failures: ${failedScrapers.map((step) => step.label).join(', ')}`);
  writeReport('degraded');
} else {
  console.log('\n[refresh] Completed successfully');
  writeReport('success');
}
