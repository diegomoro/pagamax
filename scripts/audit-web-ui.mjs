import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname, '..');
const webDir = resolve(root, 'app', 'web-dist');
const outputDir = resolve(root, 'tmp', 'web-audit');
const requireFromScraper = createRequire(resolve(root, 'scraper', 'package.json'));
const { chromium } = requireFromScraper('playwright');

if (!existsSync(webDir)) {
  throw new Error(`Missing web export at ${webDir}. Run: cd app && npx expo export --platform web --output-dir web-dist`);
}

mkdirSync(outputDir, { recursive: true });

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.ttf': 'font/ttf',
};

function createStaticServer(rootDir) {
  return createServer((req, res) => {
    const requestPath = req.url?.split('?')[0] || '/';
    const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(rootDir, safePath === '/' ? '/index.html' : safePath);

    try {
      if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        filePath = join(filePath, 'index.html');
      }

      if (!existsSync(filePath)) {
        filePath = join(rootDir, 'index.html');
      }

      const ext = extname(filePath).toLowerCase();
      const body = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(body);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error instanceof Error ? error.message : 'Unknown error');
    }
  });
}

function logSection(title) {
  console.log(`\n=== ${title} ===`);
}

const server = createStaticServer(webDir);
await new Promise((resolvePromise) => server.listen(4173, '127.0.0.1', resolvePromise));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
});
await context.addInitScript(() => {
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {}
});
const page = await context.newPage();

const findings = [];
const consoleMessages = [];
const pageErrors = [];

page.on('console', (message) => {
  const type = message.type();
  const text = message.text();
  consoleMessages.push(`${type}: ${text}`);
  if (type === 'error') {
    findings.push(`Console error: ${text}`);
  }
});

page.on('pageerror', (error) => {
  pageErrors.push(error.message);
  findings.push(`Page error: ${error.message}`);
});

async function snapshot(name) {
  await page.screenshot({ path: resolve(outputDir, `${name}.png`), fullPage: true });
}

async function clickText(text) {
  const locator = page.getByText(text, { exact: true }).first();
  await locator.waitFor({ timeout: 10000 });
  await locator.click();
}

async function dumpPageState(label) {
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log(`\n[${label}] URL: ${page.url()}`);
  console.log(`[${label}] BODY:\n${bodyText.slice(0, 3000)}\n`);
}

try {
  logSection('Onboarding');
  await page.goto('http://127.0.0.1:4173/onboarding', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByText(/Paga Menos/i).first().waitFor();
  await snapshot('01-onboarding');

  for (let i = 0; i < 4; i += 1) {
    const startButton = page.getByText('Empezar a usar Paga Menos', { exact: true }).first();
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click();
      break;
    }

    const nextButton = page.getByText('Siguiente', { exact: true }).first();
    if (await nextButton.isVisible().catch(() => false)) {
      await nextButton.click();
      await page.waitForTimeout(250);
      continue;
    }

    const skipButton = page.getByText('Omitir y empezar', { exact: true }).first();
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click();
      break;
    }
  }
  await page.waitForURL(/\/$/, { timeout: 10000 });
  await page.waitForTimeout(1200);

  logSection('Home');
  try {
    await page.getByText('Escanear QR').waitFor({ timeout: 10000 });
  } catch (error) {
    await dumpPageState('home-missing-cta');
    throw error;
  }
  await snapshot('02-home');

  logSection('Manual flow');
  await page.goto('http://127.0.0.1:4173/manual', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  try {
    await page.getByPlaceholder('30.000').fill('30000');
  } catch (error) {
    await dumpPageState('manual-missing-amount-input');
    throw error;
  }
  await page.getByPlaceholder('Jumbo, Farmacity, YPF').fill('Farmacity');
  await page.getByText('Farmacity', { exact: true }).first().click();
  await snapshot('03-manual');
  try {
    await page.getByText('Ver mejores opciones', { exact: true }).first().click();
  } catch (error) {
    await dumpPageState('manual-before-submit');
    throw error;
  }
  await page.waitForURL(/\/results/, { timeout: 10000 });
  await page.waitForTimeout(1500);

  logSection('Results');
  await page.getByText(/Farmacity/i).first().waitFor();
  await snapshot('04-results');
  if (await page.getByText(/No encontramos opciones elegibles/i).count()) {
    findings.push('Manual Farmacity flow returned no eligible options for a common case.');
  }

  const detailButton = page.getByText(/Por que funciona/i).first();
  if (await detailButton.isVisible()) {
    await detailButton.click();
  } else {
    await page.locator('text=2').first().click();
  }
  await page.waitForURL(/\/detail/, { timeout: 10000 });
  await page.waitForTimeout(500);

  logSection('Detail');
  await snapshot('05-detail');
  await page.goto('http://127.0.0.1:4173/profile', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  logSection('Profile');
  await page.getByText(/Preferencias y control/i).waitFor();
  await snapshot('06-profile');

  await page.goto('http://127.0.0.1:4173/history', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  logSection('History');
  await page.getByText(/Historial de ahorro/i).waitFor();
  await snapshot('07-history');
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolvePromise) => server.close(resolvePromise));
}

const report = {
  generatedAt: new Date().toISOString(),
  findings,
  consoleMessages,
  pageErrors,
};

const reportPath = resolve(outputDir, 'report.json');
mkdirSync(outputDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`\nAudit report written to ${reportPath}`);
console.log(`Findings: ${findings.length}`);
for (const finding of findings) {
  console.log(`- ${finding}`);
}
