/**
 * extract.ts — Mercado Pago Benefits Hub HTTP fetchers
 */

import type { MpListResponse, MpVdpResponse, MpRawBenefit, MpListItem } from './types.js';

const BASE = 'https://www.mercadopago.com.ar';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function baseHeaders(cookieHeader: string): Record<string, string> {
  return {
    'User-Agent': UA,
    'Accept': 'application/json',
    'Accept-Language': 'es-AR,es;q=0.9',
    'Cookie': cookieHeader,
    'Referer': BASE + '/dt/benefits-hub',
  };
}

/** Fetch one page from the benefits list endpoint (size ≤ 24). */
export async function fetchListPage(
  cookieHeader: string,
  page: number,
  size = 24,
): Promise<MpListResponse> {
  const url = `${BASE}/dt/benefits-hub/api/hub/benefits/list?page=${page}&size=${size}`;
  const r = await fetch(url, {
    headers: baseHeaders(cookieHeader),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`List page ${page}: HTTP ${r.status}`);
  return r.json() as Promise<MpListResponse>;
}

/** Fetch all benefit list items across all pages. */
export async function fetchAllListItems(
  cookieHeader: string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<MpListItem[]> {
  const PAGE_SIZE = 24;
  const items: MpListItem[] = [];

  // First page — discover total
  const first = await fetchListPage(cookieHeader, 1, PAGE_SIZE);
  items.push(...(first.benefits ?? []));
  const total = first.total ?? 0;
  onProgress?.(items.length, total);

  // Remaining pages
  let page = 2;
  let hasNext = first.hasNextPage;
  while (hasNext) {
    const resp = await fetchListPage(cookieHeader, page, PAGE_SIZE);
    const batch = resp.benefits ?? [];
    if (batch.length === 0) break;
    items.push(...batch);
    hasNext = resp.hasNextPage;
    onProgress?.(items.length, total);
    page++;
    // Small delay to be polite
    await new Promise(r => setTimeout(r, 120));
  }

  return items;
}

/** Fetch VDP discount detail for a single benefit ID. */
export async function fetchVdp(
  cookieHeader: string,
  id: string,
): Promise<MpVdpResponse> {
  const url = `${BASE}/dt/vdp/api/vdp/discount/${id}?from=dt-benefits-frontend`;
  const r = await fetch(url, {
    headers: baseHeaders(cookieHeader),
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`VDP ${id}: HTTP ${r.status}`);
  return r.json() as Promise<MpVdpResponse>;
}

/** Fetch T&C HTML for a single benefit ID. Returns raw HTML string. */
export async function fetchTyc(
  cookieHeader: string,
  id: string,
): Promise<string> {
  const url = `${BASE}/dt/vdp/${id}/tyc?from=vdp`;
  const r = await fetch(url, {
    headers: { ...baseHeaders(cookieHeader), Accept: 'text/html' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`TYC ${id}: HTTP ${r.status}`);
  return r.text();
}

/** Run a concurrency-limited batch of async tasks. */
async function runBatched<T>(
  items: T[],
  concurrency: number,
  delayMs: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(fn));
    if (i + concurrency < items.length && delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

/** Fetch all raw benefit data: list + VDP for each item, optional T&C in a separate pass. */
export async function fetchAllBenefits(
  cookieHeader: string,
  opts: {
    fetchTyc?: boolean;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<MpRawBenefit[]> {
  const { fetchTyc: doTyc = false, concurrency = 8, onProgress } = opts;

  process.stderr.write('[mp/extract] Fetching list pages…\n');
  const items = await fetchAllListItems(cookieHeader, (f, t) => {
    process.stderr.write(`  list: ${f}/${t}\n`);
  });
  process.stderr.write(`[mp/extract] ${items.length} benefits in list\n`);

  // Phase 1: VDP for all items
  const results: MpRawBenefit[] = items.map(listItem => ({ listItem }));
  let done = 0;

  await runBatched(results, concurrency, 300, async (raw) => {
    try {
      raw.vdp = await fetchVdp(cookieHeader, raw.listItem.id);
    } catch (e) {
      raw.vdpError = String(e);
    }
    done++;
    onProgress?.(done, items.length);
  });

  // Phase 2: T&C in a separate pass (lower concurrency to avoid rate limits)
  if (doTyc) {
    process.stderr.write('\n[mp/extract] Fetching T&C pages…\n');
    let tycDone = 0;
    await runBatched(results, 4, 500, async (raw) => {
      try {
        raw.tycHtml = await fetchTyc(cookieHeader, raw.listItem.id);
      } catch (e) {
        raw.tycError = String(e);
      }
      tycDone++;
      process.stderr.write(`  tyc: ${tycDone}/${items.length}\r`);
    });
    process.stderr.write('\n');
  }

  return results;
}
