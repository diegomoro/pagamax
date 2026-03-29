/**
 * merchants.ts — Scrape participating merchant lists for active Cuenta DNI promotions.
 *
 * Strategy:
 *  - Banco Provincia buscadores (comerciosdebarrio, supermercados, farmacias, etc.):
 *    Use Playwright to load the buscador page, intercept the DataTables POST to
 *    GetLocalesListadoByIdBuscador, and bump length=9999 to get all merchants at once.
 *
 *  - External chain locators (Carrefour, DIA, Nini, etc.):
 *    Each is a separate JS-heavy app requiring a custom scraper. For now these promos
 *    get merchant_locator_url populated but no individual store rows — flagged in audit.
 *
 * Output: MerchantLocation[] — one row per store, references promo via promo_key + beneficio_id.
 */

import { chromium } from 'playwright';
import type { CuenaDNIPromo } from './types.js';

const BASE = 'https://www.bancoprovincia.com.ar';
const BUSCADOR_TIMEOUT_MS = 60_000;
const CAPTURE_WAIT_MS     = 25_000; // max wait after domcontentloaded for DataTables POST
const PAGINATE_BATCH      = 500;    // rows per paginated request for large buscadors

// ─── Output type ──────────────────────────────────────────────────────────────

export interface MerchantLocation {
  promo_key: string;
  beneficio_id: number | null;
  buscador_url: string;
  merchant_name: string;
  locality: string;
  address: string;
  lat: number | null;
  lon: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBpBuscador(url: string): boolean {
  return url.startsWith(BASE + '/cuentadni/buscadores/');
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ─── Scrape a single Banco Provincia buscador page ───────────────────────────

interface DataTablesRow {
  empresa?: string;
  localidad?: string;
  direccion?: string;
  rubro?: string;
  latitud?: number | null;
  longitud?: number | null;
  [key: string]: unknown;
}

interface DataTablesResponse {
  data?: DataTablesRow[];
  recordsTotal?: number;
  recordsFiltered?: number;
}

async function scrapeBuscadorPage(
  buscadorUrl: string,
): Promise<DataTablesRow[]> {
  const slug = buscadorUrl.split('/').pop() ?? buscadorUrl;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.dismiss().catch(() => {}));

  let apiUrl = '';
  let bodyTemplate: Record<string, unknown> = {};
  let firstBatch: DataTablesRow[] = [];
  let recordsTotal = 0;
  let firstCaptureDone = false;
  let captureResolve: (() => void) | undefined;
  const capturePromise = new Promise<void>(res => { captureResolve = res; });

  // Intercept first DataTables POST — try length=9999 (single-shot for small buscadors),
  // fall back to original length to get recordsTotal for large ones that reject 9999.
  // After the first capture, pass all subsequent requests through unmodified (paginated fetches
  // from page.evaluate already carry the correct start/length and run in the browser session).
  await page.route('**/GetLocalesListadoByIdBuscador**', async route => {
    if (firstCaptureDone) {
      await route.continue();  // paginated fetches — let through unmodified
      return;
    }
    firstCaptureDone = true;

    const request = route.request();
    apiUrl = request.url();
    const originalPostData = request.postData() ?? '';

    let template: Record<string, unknown> = {};
    try { template = JSON.parse(originalPostData) as Record<string, unknown>; } catch { /* keep empty */ }
    bodyTemplate = template;

    // Attempt to get all records in one shot
    const bigBody = JSON.stringify({ ...template, length: 9999, start: 0 });
    let response = await route.fetch({
      method: 'POST',
      headers: { ...request.headers(), 'Content-Type': 'application/json' },
      postData: bigBody,
    });
    let responseText = await response.text();

    // Server rejected 9999 (large dataset) — fall back to original request to learn recordsTotal
    if (responseText.trimStart().startsWith('<')) {
      process.stderr.write(`  [merchants] ${slug} → length=9999 rejected, will paginate\n`);
      response = await route.fetch({ method: 'POST', headers: request.headers(), postData: originalPostData });
      responseText = await response.text();
    }

    try {
      const dt = JSON.parse(responseText) as DataTablesResponse;
      if (Array.isArray(dt.data)) {
        firstBatch  = dt.data;
        recordsTotal = dt.recordsTotal ?? dt.data.length;
        process.stderr.write(
          `  [merchants] ${slug} → ${dt.data.length} fetched (total: ${recordsTotal})\n`,
        );
      } else {
        process.stderr.write(`  [merchants] ${slug} → unexpected shape: ${responseText.slice(0, 120)}\n`);
      }
    } catch {
      process.stderr.write(`  [merchants] ${slug} → parse error: ${responseText.slice(0, 80)}\n`);
    }

    captureResolve?.();
    await route.fulfill({ response, body: responseText });
  });

  try {
    const gotoPromise = page.goto(buscadorUrl, {
      waitUntil: 'domcontentloaded',
      timeout: BUSCADOR_TIMEOUT_MS,
    }).catch(() => {/* timeout OK — we only need domcontentloaded to trigger DataTables */});

    await Promise.race([
      capturePromise,
      new Promise<void>(res => setTimeout(res, CAPTURE_WAIT_MS)),
    ]);
    await gotoPromise;
  } catch (err) {
    process.stderr.write(`  [merchants] Navigation error for ${buscadorUrl}: ${err}\n`);
  }

  // All records fit in first batch — done
  if (firstBatch.length >= recordsTotal || !apiUrl) {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    return firstBatch;
  }

  // Large buscador: paginate using page.evaluate() which runs inside the browser session
  // (automatically carries cookies — no manual cookie extraction needed)
  const allRows: DataTablesRow[] = [...firstBatch];
  process.stderr.write(`  [merchants] ${slug} → paginating ${recordsTotal} total (batch=${PAGINATE_BATCH})...\n`);

  try {
    for (let start = firstBatch.length; start < recordsTotal; start += PAGINATE_BATCH) {
      const batch = await page.evaluate(
        async (args: { url: string; tmpl: Record<string, unknown>; start: number; batchSize: number }) => {
          const body = { ...args.tmpl, start: args.start, length: args.batchSize };
          const r = await fetch(args.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const dt = await r.json() as { data?: unknown[] };
          return dt.data ?? [];
        },
        { url: apiUrl, tmpl: bodyTemplate, start, batchSize: PAGINATE_BATCH },
      ) as DataTablesRow[];

      allRows.push(...batch);

      if (start % 5000 < PAGINATE_BATCH) {
        process.stderr.write(`  [merchants] ${slug} → ${allRows.length}/${recordsTotal}\n`);
      }
    }
    process.stderr.write(`  [merchants] ${slug} → collected ${allRows.length}/${recordsTotal}\n`);
  } catch (err) {
    process.stderr.write(`  [merchants] ${slug} pagination error: ${err}\n`);
  }

  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  return allRows;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function scrapeMerchants(
  activePromos: CuenaDNIPromo[],
): Promise<{
  locations: MerchantLocation[];
  externalChains: Array<{ promo_key: string; promo_title: string; locator_url: string }>;
}> {
  const locations: MerchantLocation[] = [];
  const externalChains: Array<{ promo_key: string; promo_title: string; locator_url: string }> = [];

  // Separate BP buscadores from external chain locators
  const buscadorMap = new Map<string, CuenaDNIPromo[]>(); // buscadorUrl → promos

  for (const promo of activePromos) {
    const url = promo.merchant_locator_url;
    if (!url) continue;

    if (isBpBuscador(url)) {
      const group = buscadorMap.get(url) ?? [];
      group.push(promo);
      buscadorMap.set(url, group);
    } else {
      // External chain — record URL but don't scrape (needs per-chain implementation)
      externalChains.push({
        promo_key: promo.promo_key,
        promo_title: promo.promo_title,
        locator_url: url,
      });
    }
  }

  process.stderr.write(
    `\nMerchant scraping: ${buscadorMap.size} BP buscadores, ${externalChains.length} external chains\n`,
  );

  // Scrape each unique buscador URL (one Playwright session per buscador)
  for (const [buscadorUrl, promos] of buscadorMap) {
    process.stderr.write(`Scraping: ${buscadorUrl}\n`);

    const rows = await scrapeBuscadorPage(buscadorUrl);

    // Associate every store with every promo that shares this buscador
    for (const promo of promos) {
      for (const row of rows) {
        locations.push({
          promo_key: promo.promo_key,
          beneficio_id: promo.beneficio_id,
          buscador_url: buscadorUrl,
          merchant_name: stripAccents(String(row.empresa ?? '')).trim(),
          locality: stripAccents(String(row.localidad ?? '')).trim(),
          address: stripAccents(String(row.direccion ?? '')).trim(),
          lat: typeof row.latitud === 'number' ? row.latitud : null,
          lon: typeof row.longitud === 'number' ? row.longitud : null,
        });
      }
    }
  }

  process.stderr.write(
    `Merchant rows: ${locations.length} from buscadores, ${externalChains.length} external chains noted\n`,
  );

  return { locations, externalChains };
}
