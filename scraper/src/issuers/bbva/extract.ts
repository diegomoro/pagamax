/**
 * extract.ts — BBVA Argentina promotions fetchers
 *
 * Source: go.bbva.com.ar/willgo/fgo/API/v3
 * No auth required, but Akamai Bot Manager protection requires:
 *   - Carrying Set-Cookie from each response into the next request
 *   - Mimicking browser sec-fetch headers
 *   - Low concurrency (2–3) with randomized delays
 *
 * Level 1 — structured REST JSON
 */

import * as https from 'node:https';
import * as http from 'node:http';
import type { BbvaListItem, BbvaListResponse, BbvaDetailItem, BbvaDetailResponse, BbvaRawPromo } from './types.js';

const API_BASE = 'https://go.bbva.com.ar/willgo/fgo/API';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ─── Cookie jar ───────────────────────────────────────────────────────────────

/**
 * Simple persistent cookie jar.
 * Akamai sends ak_bmsc, bm_sz, akavpau_* on each successful response.
 * We must carry those in subsequent requests to avoid bot detection.
 */
class CookieJar {
  private cookies = new Map<string, string>();

  /** Parse Set-Cookie headers from a response. */
  ingest(setCookieHeader: string | string[] | undefined): void {
    const entries = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
    for (const entry of entries) {
      const parts = entry.split(';')[0]!.trim().split('=');
      const name  = parts[0]!.trim();
      const value = parts.slice(1).join('=').trim();
      if (name && value) this.cookies.set(name, value);
    }
  }

  /** Build Cookie header string. */
  serialize(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  get size(): number { return this.cookies.size; }
}

const cookieJar = new CookieJar();

// ─── HTTP helper (Node.js https module, not fetch) ────────────────────────────

interface RawResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
}

function rawGet(url: string, extraHeaders: Record<string, string> = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const cookieStr = cookieJar.serialize();

    const headers: Record<string, string> = {
      'User-Agent':        UA,
      'Accept':            'application/json, text/plain, */*',
      'Accept-Language':   'es-AR,es;q=0.9',
      'Accept-Encoding':   'identity',
      'Referer':           'https://www.bbva.com.ar/beneficios/',
      'sec-fetch-site':    'cross-site',
      'sec-fetch-mode':    'cors',
      'sec-fetch-dest':    'empty',
      ...(cookieStr ? { 'Cookie': cookieStr } : {}),
      ...extraHeaders,
    };

    const req = (mod as typeof https).get(url, { headers }, res => {
      // Ingest any Set-Cookie headers immediately
      cookieJar.ingest(res.headers['set-cookie'] as string | string[] | undefined);

      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({
        status:  res.statusCode ?? 0,
        headers: res.headers as Record<string, string | string[]>,
        body,
      }));
    });

    req.on('error', reject);
    req.setTimeout(25_000, () => { req.destroy(); reject(new Error(`timeout: ${url}`)); });
  });
}

// ─── API request with retry ───────────────────────────────────────────────────

/** Jitter: returns a random delay between min and max ms. */
function jitter(minMs: number, maxMs: number): number {
  return Math.round(minMs + Math.random() * (maxMs - minMs));
}

async function apiFetch<T>(path: string, retries = 4): Promise<T> {
  const url = `${API_BASE}${path}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await rawGet(url);

    if (r.status === 200) {
      // Try to parse JSON
      try {
        return JSON.parse(r.body) as T;
      } catch {
        // HTML response despite 200 — sometimes Akamai serves HTML challenge
        if (attempt < retries) {
          const wait = jitter(2000, 5000);
          process.stderr.write(`  [retry ${attempt + 1}/${retries}] Non-JSON 200 ${url.slice(-50)} — waiting ${wait}ms\n`);
          await new Promise(res => setTimeout(res, wait));
          continue;
        }
        throw new Error(`Non-JSON response after ${retries} retries: ${url}`);
      }
    }

    if (r.status === 403 || r.status === 429 || r.status >= 500) {
      if (attempt < retries) {
        const wait = jitter(3000, 8000) * (attempt + 1);
        process.stderr.write(`  [retry ${attempt + 1}/${retries}] HTTP ${r.status} ${url.slice(-50)} — waiting ${wait}ms\n`);
        await new Promise(res => setTimeout(res, wait));
        continue;
      }
      throw new Error(`HTTP ${r.status} after ${retries} retries: ${url}`);
    }

    throw new Error(`Unexpected HTTP ${r.status}: ${url}`);
  }
  throw new Error(`apiFetch exhausted retries: ${url}`);
}

// ─── Public fetch functions ───────────────────────────────────────────────────

export async function fetchListPage(page: number): Promise<BbvaListResponse> {
  return apiFetch<BbvaListResponse>(`/v3/communications?pager=${page}`);
}

export async function fetchAllListItems(
  opts: { onProgress?: (msg: string) => void } = {}
): Promise<BbvaListItem[]> {
  // Warm-up: establish Akamai cookie session
  process.stderr.write('[bbva/extract] Warming up Akamai session…\n');
  const first = await fetchListPage(0);

  const m = first.message.match(/paginas:\s*(\d+)/i);
  const totalPages = m ? parseInt(m[1]!, 10) : 1;
  const totalItems = parseInt(first.message.match(/Comunicaciones:\s*(\d+)/i)?.[1] ?? '0', 10);

  opts.onProgress?.(`Page 0/${totalPages - 1} — ${first.data.length} items. Total: ${totalItems} across ${totalPages} pages`);
  process.stderr.write(`[bbva/extract] ${totalItems} items across ${totalPages} pages. Cookies: ${cookieJar.size}\n`);

  const allItems: BbvaListItem[] = [...first.data];

  for (let page = 1; page < totalPages; page++) {
    // Small delay between list pages
    await new Promise(res => setTimeout(res, jitter(120, 280)));
    const r = await fetchListPage(page);
    allItems.push(...r.data);
    if (page % 10 === 0) {
      opts.onProgress?.(`Page ${page}/${totalPages - 1} — ${allItems.length} items so far`);
      process.stderr.write(`  page ${page}/${totalPages - 1}: ${allItems.length} items\n`);
    }
  }

  return allItems;
}

export async function fetchDetail(id: string): Promise<BbvaDetailItem | null> {
  const r = await apiFetch<BbvaDetailResponse>(`/v3/communication/${id}`);
  return r.data ?? null;
}

/** Batched execution with per-item delay (sequential within batches). */
async function runBatched<T, R>(
  items: T[],
  concurrency: number,
  delayMs: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<(R | Error)[]> {
  const results: (R | Error)[] = new Array(items.length);

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    // Process batch sequentially (not in parallel) to respect Akamai
    for (let j = 0; j < batch.length; j++) {
      try {
        results[i + j] = await fn(batch[j]!, i + j);
      } catch (e) {
        results[i + j] = e instanceof Error ? e : new Error(String(e));
      }
      if (j < batch.length - 1) await new Promise(res => setTimeout(res, delayMs));
    }
    // Longer pause between batches
    if (i + concurrency < items.length) {
      await new Promise(res => setTimeout(res, jitter(delayMs, delayMs * 2)));
    }
  }
  return results;
}

export async function fetchAllPromos(opts: {
  concurrency?: number;
  delayMs?: number;
  onProgress?: (msg: string) => void;
} = {}): Promise<BbvaRawPromo[]> {
  const { concurrency = 3, delayMs = 400, onProgress } = opts;

  process.stderr.write('[bbva/extract] Fetching list pages…\n');
  const listItems = await fetchAllListItems({ onProgress });
  process.stderr.write(`[bbva/extract] ${listItems.length} items collected\n`);

  process.stderr.write(`[bbva/extract] Fetching details (concurrency=${concurrency}, delay=${delayMs}ms)…\n`);
  let done = 0;

  const detailResults = await runBatched(
    listItems,
    concurrency,
    delayMs,
    async (item) => {
      const detail = await fetchDetail(item.id);
      done++;
      if (done % 50 === 0) {
        onProgress?.(`Details: ${done}/${listItems.length}`);
        process.stderr.write(`  ${done}/${listItems.length}\n`);
      }
      return detail;
    }
  );

  const results: BbvaRawPromo[] = [];
  let errors = 0;
  for (let i = 0; i < listItems.length; i++) {
    const dr = detailResults[i]!;
    if (dr instanceof Error) {
      errors++;
      results.push({ listItem: listItems[i]!, detail: {} as BbvaDetailItem, fetchError: dr.message });
    } else {
      const detail = dr as BbvaDetailItem | null;
      results.push({
        listItem: listItems[i]!,
        detail:   (detail ?? {}) as BbvaDetailItem,
        fetchError: detail ? undefined : 'no_data',
      });
    }
  }

  if (errors > 0) process.stderr.write(`[bbva/extract] Detail errors: ${errors}\n`);
  return results;
}
