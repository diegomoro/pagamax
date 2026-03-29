/**
 * extract.ts — Ualá _next/data fetchers
 *
 * Source hierarchy: Level 1 — Next.js SSR JSON endpoints (__N_SSP: true)
 * No authentication required. BuildId extracted live from HTML.
 */

import type { UalaListPromo, UalaPromoDetail, UalaDetailResponse, UalaRawPromo } from './types.js';

const BASE = 'https://www.uala.com.ar';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function baseHeaders(): Record<string, string> {
  return {
    'User-Agent': UA,
    'Accept': 'application/json, text/html, */*',
    'Accept-Language': 'es-AR,es;q=0.9',
    'Referer': BASE + '/promociones',
  };
}

/**
 * Extract the Next.js buildId from the /promociones HTML page.
 * The buildId appears in script src paths like:
 *   /_next/static/{BUILD_ID}/_buildManifest.js
 */
export async function fetchBuildId(): Promise<string> {
  const r = await fetch(`${BASE}/promociones`, {
    headers: { ...baseHeaders(), Accept: 'text/html' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Homepage: HTTP ${r.status}`);
  const html = await r.text();
  const m = html.match(/_next\/static\/([^/"']+)\/_buildManifest/);
  if (!m) throw new Error('BuildId not found in HTML');
  return m[1]!;
}

/** Fetch the promotions list page and return all slugs. */
export async function fetchPromoList(buildId: string): Promise<string[]> {
  const url = `${BASE}/_next/data/${buildId}/promociones.json`;
  const r = await fetch(url, {
    headers: baseHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`List: HTTP ${r.status} (buildId may be stale)`);

  const data = await r.json() as { pageProps?: { page?: { components?: unknown[] } } };
  const components = (data.pageProps?.page?.components ?? []) as Record<string, unknown>[];
  const promoComp = components.find(c => Array.isArray(c['promociones']));
  if (!promoComp) throw new Error('No promociones component found in list response');

  const promos = promoComp['promociones'] as UalaListPromo[];
  const slugs: string[] = [];
  for (const p of promos) {
    const slug = p.fields?.urlDeLaPromocion ?? (p as Record<string, string>)['urlDeLaPromocion'];
    if (slug) slugs.push(slug);
  }
  return slugs;
}

/** Fetch the full detail JSON for a single promo slug. */
export async function fetchPromoDetail(buildId: string, slug: string): Promise<UalaPromoDetail> {
  const url = `${BASE}/_next/data/${buildId}/promociones/${slug}.json`;
  const r = await fetch(url, {
    headers: baseHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Detail ${slug}: HTTP ${r.status}`);
  const data = (await r.json()) as UalaDetailResponse;
  const promo = data.pageProps?.promotion;
  if (!promo) throw new Error(`Detail ${slug}: no promotion in pageProps`);
  return promo;
}

/**
 * Discover all promos and fetch full details.
 * Returns one UalaRawPromo per spec (a promo can have multiple specs).
 */
export async function fetchAllPromos(opts: {
  onProgress?: (msg: string) => void;
} = {}): Promise<UalaRawPromo[]> {
  const { onProgress } = opts;

  process.stderr.write('[uala/extract] Fetching buildId from HTML…\n');
  const buildId = await fetchBuildId();
  process.stderr.write(`[uala/extract] BuildId: ${buildId}\n`);

  process.stderr.write('[uala/extract] Fetching promo list…\n');
  const slugs = await fetchPromoList(buildId);
  process.stderr.write(`[uala/extract] ${slugs.length} slugs: ${slugs.join(', ')}\n`);

  const results: UalaRawPromo[] = [];

  for (const slug of slugs) {
    onProgress?.(`Fetching ${slug}…`);
    try {
      const detail = await fetchPromoDetail(buildId, slug);
      if (!detail.specs || detail.specs.length === 0) {
        process.stderr.write(`  [warn] ${slug}: no specs\n`);
        continue;
      }
      for (let i = 0; i < detail.specs.length; i++) {
        results.push({ slug, detail, spec: detail.specs[i]!, specIndex: i });
      }
      process.stderr.write(`  ${slug}: ${detail.specs.length} spec(s)\n`);
    } catch (e) {
      process.stderr.write(`  [error] ${slug}: ${e}\n`);
      results.push({ slug, detail: {} as UalaPromoDetail, spec: {} as never, specIndex: 0, fetchError: String(e) });
    }
    await new Promise(r => setTimeout(r, 200));
  }

  return results;
}
