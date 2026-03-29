/**
 * extract.ts — Personal Pay benefits API fetchers
 *
 * Two-endpoint strategy:
 *   1. List:   GET /api/benefits?offset=N&limit=100  — discovers all benefit IDs
 *   2. Detail: GET /api/benefits/<id>               — full legal, locations, levels
 */

import type {
  PpListItem,
  PpListResponse,
  PpDetailItem,
  PpDetailResponse,
  PpRawBenefit,
} from './types.js';

const BASE = 'https://www.personalpay.com.ar';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function baseHeaders(): Record<string, string> {
  return {
    'User-Agent': UA,
    'Accept': 'application/json',
    'Accept-Language': 'es-AR,es;q=0.9',
    'Referer': BASE + '/beneficios',
  };
}

/** Fetch one page of the benefits list. */
export async function fetchListPage(
  offset: number,
  limit = 100,
): Promise<PpListResponse> {
  const url = `${BASE}/api/benefits?offset=${offset}&limit=${limit}`;
  const r = await fetch(url, {
    headers: baseHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`List offset=${offset}: HTTP ${r.status}`);
  return r.json() as Promise<PpListResponse>;
}

/** Paginate through all list pages and return all list items. */
export async function fetchAllListItems(
  onProgress?: (fetched: number) => void,
): Promise<PpListItem[]> {
  const LIMIT = 100;
  const items: PpListItem[] = [];
  let offset = 0;

  while (true) {
    const resp = await fetchListPage(offset, LIMIT);
    const batch = resp.data.benefits ?? [];
    if (batch.length === 0) break;
    items.push(...batch);
    onProgress?.(items.length);
    if (batch.length < LIMIT) break;
    offset = resp.data.meta.offset;
    await new Promise(r => setTimeout(r, 200));
  }

  return items;
}

/** Fetch the full detail for a single benefit ID. */
export async function fetchDetail(id: number): Promise<PpDetailItem> {
  const url = `${BASE}/api/benefits/${id}`;
  const r = await fetch(url, {
    headers: baseHeaders(),
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`Detail ${id}: HTTP ${r.status}`);
  const resp = (await r.json()) as PpDetailResponse;
  return resp.data;
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

/** Fetch all benefit data: list + detail for each item. */
export async function fetchAllBenefits(opts: {
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
} = {}): Promise<PpRawBenefit[]> {
  const { concurrency = 8, onProgress } = opts;

  process.stderr.write('[pp/extract] Fetching list…\n');
  const items = await fetchAllListItems(n => {
    process.stderr.write(`  list: ${n} items fetched\r`);
  });
  process.stderr.write(`\n[pp/extract] ${items.length} benefits in list\n`);

  const results: PpRawBenefit[] = items.map(listItem => ({ listItem }));
  let done = 0;

  await runBatched(results, concurrency, 250, async raw => {
    try {
      raw.detail = await fetchDetail(raw.listItem.id);
    } catch (e) {
      raw.detailError = String(e);
    }
    done++;
    onProgress?.(done, items.length);
  });

  return results;
}
