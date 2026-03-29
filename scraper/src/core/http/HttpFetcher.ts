import { withRetry } from '../../shared/utils/retry.js';
import { createLogger } from '../logging/logger.js';
import type { FetchResult } from '../../shared/types/raw.js';

const log = createLogger({ component: 'HttpFetcher' });

export interface HttpFetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  maxAttempts?: number;
}

const DEFAULT_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

/**
 * fetchHttp
 *
 * Fetches a URL using Node's built-in fetch (Node 18+).
 * Returns a FetchResult — never throws.
 *
 * Use this for issuers that serve static HTML or JSON APIs.
 * For JS-rendered pages (most modern issuers), use BrowserManager instead.
 *
 * Extension note: future issuers may need custom cookie handling or
 * OAuth tokens — extend HttpFetchOptions as needed.
 */
export async function fetchHttp(
  url: string,
  options: HttpFetchOptions = {},
): Promise<FetchResult> {
  const fetchedAt = new Date();
  const timeoutMs = options.timeoutMs ?? 15_000;

  try {
    const html = await withRetry(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const res = await fetch(url, {
            headers: { ...DEFAULT_HEADERS, ...options.headers },
            signal: controller.signal,
          });

          const text = await res.text();
          if (!res.ok) {
            const err = Object.assign(new Error(`HTTP ${res.status}`), { statusCode: res.status });
            throw err;
          }

          return text;
        } finally {
          clearTimeout(timer);
        }
      },
      { maxAttempts: options.maxAttempts ?? 3 },
    );

    return {
      url,
      finalUrl: url,
      html,
      statusCode: 200,
      fetchedAt,
      fetchMethod: 'http',
    };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 0;
    log.warn({ url, statusCode, error: (err as Error).message }, 'HTTP fetch failed');

    return {
      url,
      finalUrl: url,
      html: '',
      statusCode,
      fetchedAt,
      fetchMethod: 'http',
    };
  }
}
