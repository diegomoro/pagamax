import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const scraperDir = resolve(root, 'scraper');
const npxCommand = 'npx';

function runStep(label, command, args, options = {}) {
  console.log(`\n[refresh] ${label}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: 'inherit',
    env: { ...process.env, ...(options.env ?? {}) },
    shell: options.shell ?? process.platform === 'win32',
  });

  if (result.error) {
    console.error(`[refresh] ${label} failed to launch: ${result.error.message}`);
    return false;
  }

  if (result.status !== 0) {
    console.error(`[refresh] ${label} exited with code ${result.status ?? 'unknown'}`);
    return false;
  }

  return true;
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

const optionalFailures = [];

for (const [label, args] of scraperSteps) {
  const ok = runStep(label, npxCommand, args, { cwd: scraperDir });
  if (!ok) optionalFailures.push(label);
}

const mercadoPagoCookiesPath = resolve(scraperDir, 'recon_out_mp/recon-cookies.json');
if (existsSync(mercadoPagoCookiesPath)) {
  const ok = runStep('Mercado Pago', npxCommand, ['tsx', 'src/issuers/mercadopago/scraper.ts'], { cwd: scraperDir });
  if (!ok) optionalFailures.push('Mercado Pago');
} else {
  console.log('\n[refresh] Mercado Pago skipped - missing recon_out_mp/recon-cookies.json');
}

if (!runStep('Consolidate', npxCommand, ['tsx', 'src/consolidate.ts'], { cwd: scraperDir })) {
  process.exit(1);
}

if (!runStep('Build promo index', npxCommand, ['tsx', 'src/qr/build-promo-index.ts'], { cwd: scraperDir })) {
  process.exit(1);
}

if (!runStep('Sync bundled mobile data', process.execPath, [resolve(root, 'scripts/sync-mobile-data.mjs')], { shell: false })) {
  process.exit(1);
}

if (optionalFailures.length > 0) {
  console.log(`\n[refresh] Completed with scraper failures: ${optionalFailures.join(', ')}`);
} else {
  console.log('\n[refresh] Completed successfully');
}
