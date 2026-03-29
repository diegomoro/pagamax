/**
 * discover.ts — Cuenta DNI discovery: find active rubro IDs and hub card beneficio IDs.
 *
 * Strategy:
 *  1. Scan rubro IDs 1–MAX_RUBRO_PROBE via GetBeneficioByRubro → find which ones return data.
 *  2. Fetch the hub page and extract beneficio IDs from card `id` attributes.
 *  3. Return DiscoverResult for the extract phase.
 */

import { load } from 'cheerio';
import type { DiscoveredUrl } from './types.js';

const BASE = 'https://www.bancoprovincia.com.ar';

const HTML_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

const API_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': `${BASE}/cuentadni/`,
};

const MAX_RUBRO_PROBE = 40;
const DELAY_MS = 100;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Seed URLs ────────────────────────────────────────────────────────────────

export const SEED_URLS: DiscoveredUrl[] = [
  { url: `${BASE}/cuentadni/contenidos/cdnibeneficios/`, type: 'benefits_hub', source: 'seed' },
  { url: `${BASE}/cuentadni/buscadores/comerciosdebarrio`, type: 'buscador', source: 'seed' },
  { url: `${BASE}/cuentadni/buscadores/supermercados`, type: 'buscador', source: 'seed' },
  { url: `${BASE}/cuentadni/buscadores/farmaciasyperfumerias`, type: 'buscador', source: 'seed' },
  { url: `${BASE}/cuentadni/buscadores/librerias`, type: 'buscador', source: 'seed' },
  { url: `${BASE}/cuentadni/buscadores/especialdetemporada`, type: 'buscador', source: 'seed' },
  { url: `${BASE}/cuentadni/buscadores/universidades`, type: 'buscador', source: 'seed' },
  { url: `${BASE}/web/especialdetemporada`, type: 'campaign_page', source: 'seed' },
  { url: `${BASE}/web/CDNI_especial_localidades`, type: 'campaign_page', source: 'seed' },
  { url: `${BASE}/web/vuelta_clases_2026`, type: 'js_heavy', source: 'seed' },
];

// ─── Result type ──────────────────────────────────────────────────────────────

export interface DiscoverResult {
  urls: DiscoveredUrl[];
  /** Rubro IDs that returned ≥1 beneficios. */
  activeRubroIds: number[];
  /** Beneficio IDs extracted from hub page card divs. */
  hubBeneficioIds: number[];
  /** Rubro IDs that were probed but returned 0 results. */
  emptyRubroIds: number[];
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: HTML_HEADERS });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

/** Returns the beneficio count for a rubro, or 0 on failure. */
async function probeRubro(rubroId: number): Promise<number> {
  try {
    const url = `${BASE}/cuentadni/Home/GetBeneficioByRubro?idRubro=${rubroId}`;
    const res = await fetch(url, { headers: API_HEADERS });
    if (!res.ok) return 0;
    const data = await res.json() as unknown[];
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

// ─── Hub card ID extraction ───────────────────────────────────────────────────

/**
 * Extracts beneficio IDs from hub page HTML.
 *
 * The hub renders cards with `id="slug-numericId"`, e.g. `id="coto-123"`.
 * We extract the trailing numeric part as the beneficio ID.
 */
function extractHubBeneficioIds(html: string): number[] {
  const $ = load(html);
  const ids = new Set<number>();

  // Primary: callModalCDNI divs with id="slug-N"
  $('div[id]').each((_, el) => {
    const rawId = $(el).attr('id') ?? '';
    const m = /-(\d+)$/.exec(rawId);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > 0) ids.add(n);
    }
  });

  // Secondary: anchor hrefs like /GetBeneficioData2?idBeneficio=N
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const m = /idBeneficio=(\d+)/i.exec(href);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > 0) ids.add(n);
    }
  });

  return [...ids];
}

// ─── Main discover function ───────────────────────────────────────────────────

export async function discover(): Promise<DiscoverResult> {
  process.stderr.write('Cuenta DNI discover: scanning rubro IDs 1–' + MAX_RUBRO_PROBE + '...\n');

  const activeRubroIds: number[] = [];
  const emptyRubroIds: number[] = [];

  for (let id = 1; id <= MAX_RUBRO_PROBE; id++) {
    const count = await probeRubro(id);
    if (count > 0) {
      process.stderr.write(`  rubro ${id}: ${count} beneficios\n`);
      activeRubroIds.push(id);
    } else {
      emptyRubroIds.push(id);
    }
    await sleep(DELAY_MS);
  }

  process.stderr.write(`\nActive rubro IDs: [${activeRubroIds.join(', ')}]\n`);

  // Fetch hub page and extract card beneficio IDs
  process.stderr.write('Fetching hub page for card IDs...\n');
  const hubHtml = await fetchText(`${BASE}/cuentadni/contenidos/cdnibeneficios/`);
  const hubBeneficioIds = hubHtml ? extractHubBeneficioIds(hubHtml) : [];
  process.stderr.write(`  Hub beneficio IDs found: ${hubBeneficioIds.length}\n`);

  return {
    urls: SEED_URLS,
    activeRubroIds,
    hubBeneficioIds,
    emptyRubroIds,
  };
}
