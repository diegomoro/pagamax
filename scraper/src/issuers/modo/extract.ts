/**
 * extract.ts — Fetch and parse MODO promo pages.
 *
 * Each promo page (https://modo.com.ar/promos/<slug>) is an SSR Next.js 13+ App Router
 * page. Data arrives via two mechanisms:
 *
 *   1. JSON-LD  <script type="application/ld+json">  →  basic offer metadata
 *   2. RSC flight chunks  self.__next_f.push([N, "..."])  →  full promo data including
 *      banks[], paymentMethodList[], promotion.promotion{}, installments[]
 *
 * No Playwright needed — the full data is in the initial HTML response.
 */

import type { RawModoCandidate, JsonLdOffer, RscPromoData } from './types.js';

const PROMO_BASE = 'https://modo.com.ar/promos/';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
};

const CONCURRENCY = 10;   // parallel requests
const TIMEOUT_MS  = 30_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── JSON-LD extraction ───────────────────────────────────────────────────────

function extractJsonLd(html: string): JsonLdOffer | null {
  // Match all <script type="application/ld+json"> blocks
  const scriptRe = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1]!) as Record<string, unknown>;
      if (obj['@type'] === 'Offer') {
        return obj as JsonLdOffer;
      }
      // Sometimes it's wrapped in @graph
      if (Array.isArray(obj['@graph'])) {
        for (const item of obj['@graph'] as Record<string, unknown>[]) {
          if (item['@type'] === 'Offer') return item as JsonLdOffer;
        }
      }
    } catch { /* skip invalid JSON */ }
  }
  return null;
}

// ─── RSC payload extraction ───────────────────────────────────────────────────

/**
 * Extracts and decodes all self.__next_f.push RSC payload strings from HTML.
 *
 * Next.js 13+ App Router injects RSC flight data via:
 *   <script>self.__next_f.push([N,"<rsc-flight-string>"])</script>
 *
 * The inner string is a JSON string literal encoding RSC flight format:
 *   <hex-id>:<json-content>\n
 *   <hex-id>:<json-content>\n
 *   ...
 */
function extractRscPayloads(html: string): string {
  const payloads: string[] = [];

  // Find each self.__next_f.push( call and extract the [N, "..."] array
  const marker = 'self.__next_f.push(';
  let searchIdx = 0;

  while (true) {
    const pushStart = html.indexOf(marker, searchIdx);
    if (pushStart === -1) break;

    const arrayStart = pushStart + marker.length;

    // Walk forward to find the closing ] of the top-level array, tracking depth and string state
    let depth = 0;
    let inString = false;
    let escape = false;
    let arrayEnd = -1;

    for (let i = arrayStart; i < html.length; i++) {
      const ch = html[i]!;
      if (escape) { escape = false; continue; }
      if (inString) {
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '[') { depth++; continue; }
      if (ch === ']') {
        if (depth === 1) { arrayEnd = i; break; }
        depth--;
      }
    }

    if (arrayEnd === -1) { searchIdx = arrayStart; continue; }

    const rawArray = html.slice(arrayStart, arrayEnd + 1);
    try {
      const arr = JSON.parse(rawArray) as [number, string];
      if (Array.isArray(arr) && typeof arr[1] === 'string') {
        payloads.push(arr[1]);
      }
    } catch { /* skip malformed */ }

    searchIdx = arrayEnd + 1;
  }

  return payloads.join('\n');
}

/**
 * Parses RSC flight data to find the chunk containing MODO promo data.
 *
 * RSC flight format (after decoding the JSON string):
 *   <hex-id>:<json-object>
 *   <hex-id>:<json-object>
 *   ...
 *
 * We look for the chunk that has both `banks` (array) and `promotion.promotion`.
 */
function parseRscPromoData(flightData: string): RscPromoData | null {
  const lines = flightData.split('\n');

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const prefix = line.slice(0, colonIdx);
    if (!/^[0-9a-f]+$/i.test(prefix)) continue;

    const rest = line.slice(colonIdx + 1);
    if (!rest.startsWith('{')) continue;

    try {
      const obj = JSON.parse(rest) as Record<string, unknown>;
      if (
        Array.isArray(obj['banks']) &&
        obj['banks'].length >= 0 &&
        obj['promotion'] !== null &&
        typeof obj['promotion'] === 'object' &&
        (obj['promotion'] as Record<string, unknown>)['promotion'] !== undefined
      ) {
        return obj as unknown as RscPromoData;
      }
    } catch { /* not JSON or wrong shape */ }
  }

  // Fallback: search for the pattern anywhere in the flight data (handles multi-line chunks)
  const searchStr = '"banks":';
  const idx = flightData.indexOf(searchStr);
  if (idx === -1) return null;

  // Find the start of the enclosing JSON object
  const objStart = flightData.lastIndexOf('{', idx);
  if (objStart === -1) return null;

  // Bracket-match to find the end
  let depth = 0;
  let inString = false;
  let escape = false;
  let objEnd = -1;

  for (let i = objStart; i < flightData.length; i++) {
    const ch = flightData[i]!;
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    if (ch === '}') {
      if (depth === 1) { objEnd = i; break; }
      depth--;
    }
  }

  if (objEnd === -1) return null;

  try {
    const obj = JSON.parse(flightData.slice(objStart, objEnd + 1)) as Record<string, unknown>;
    if (Array.isArray(obj['banks']) && typeof obj['promotion'] === 'object') {
      return obj as unknown as RscPromoData;
    }
  } catch { /* failed */ }

  return null;
}

// ─── T-chunk (text content) extraction ───────────────────────────────────────

/**
 * Parses RSC T-type text chunks from the flight data.
 *
 * RSC T-chunks format: <hex-id>:T<hex-byte-length>,<raw-text>
 * These contain the actual HTML/text content referenced by "$<id>" placeholders
 * in the JSON data chunks (e.g. sections.tyc.description = "$1f").
 *
 * Returns a map of chunkId → plain text (HTML stripped).
 */
function parseTChunks(flightData: string): Map<string, string> {
  const result = new Map<string, string>();
  const re = /([0-9a-f]+):T([0-9a-f]+),/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flightData)) !== null) {
    const chunkId = m[1]!.toLowerCase();
    const byteLen = parseInt(m[2]!, 16);
    const textStart = m.index! + m[0].length;
    // The T-chunk byte length is in UTF-8 bytes, but JS strings use UTF-16 code units.
    // Spanish accented chars are 2 UTF-8 bytes but 1 JS char, so plain char-slice overreads.
    // Fix: take byteLen chars as candidate (always >= actual char count since 1 char ≥ 1 byte),
    // re-encode to UTF-8, slice to exactly byteLen bytes, then decode back.
    // Add a small margin to ensure we capture all accented chars of the content.
    const candidate = flightData.slice(textStart, textStart + byteLen + 16);
    const rawHtmlRaw = Buffer.from(candidate, 'utf8').slice(0, byteLen).toString('utf8');
    // Also strip any incomplete HTML tag cut off at the byte boundary (e.g. "</p" with no ">")
    const rawHtml = rawHtmlRaw.replace(/<[^>]*$/, '');
    // Strip HTML tags to get plain text
    const plain = rawHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (plain.length > 10) result.set(chunkId, plain);
  }
  return result;
}

/**
 * Resolves a "$<id>" RSC reference to its text content using the T-chunk map.
 * Returns empty string if the reference cannot be resolved.
 */
function resolveRef(ref: unknown, tChunks: Map<string, string>): string {
  if (typeof ref !== 'string' || !ref.startsWith('$')) return '';
  const id = ref.slice(1).toLowerCase();
  return tChunks.get(id) ?? '';
}

/**
 * Extracts and resolves section texts from the RSC promo data.
 * Returns plain-text terms and body content.
 */
function resolveSectionTexts(
  rscData: RscPromoData,
  tChunks: Map<string, string>,
): { termsText: string; bodyText: string } {
  const sections = (rscData.promotion as unknown as Record<string, unknown>)?.['sections'] as
    Record<string, unknown> | undefined;

  if (!sections) return { termsText: '', bodyText: '' };

  // sections.tyc.contents[0].description is usually "$1f" → T-chunk with terms HTML
  const tyc     = sections['tyc'] as Record<string, unknown> | undefined;
  const tycContents = (tyc?.['contents'] as Array<Record<string, unknown>> | undefined) ?? [];
  let termsText = '';
  for (const item of tycContents) {
    const desc = resolveRef(item['description'], tChunks);
    if (desc) { termsText = desc; break; }
    // Sometimes the description is already a plain string (non-reference), possibly HTML
    if (typeof item['description'] === 'string' && !item['description'].startsWith('$')) {
      termsText = item['description']
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ').replace(/\s{2,}/g, ' ').trim();
    }
  }

  // sections.body.contents[0].description → T-chunk with "Modalidad de uso" + merchant URLs
  const body     = sections['body'] as Record<string, unknown> | undefined;
  const bodyContents = (body?.['contents'] as Array<Record<string, unknown>> | undefined) ?? [];
  let bodyText = '';
  for (const item of bodyContents) {
    const desc = resolveRef(item['description'], tChunks);
    if (desc) { bodyText = desc; break; }
  }

  return { termsText, bodyText };
}

/**
 * Extracts merchant URLs from the resolved body text.
 * The body section typically lists participating store URLs one per line.
 */
function extractBodyArtifacts(bodyText: string): Array<{ url: string; label: string }> {
  if (!bodyText) return [];
  const results: Array<{ url: string; label: string }> = [];
  const seen = new Set<string>();
  const urlRe = /https?:\/\/[^\s,;)>\]"']+/g;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(bodyText)) !== null) {
    const url = m[0]!.replace(/[.,;)>]+$/, ''); // strip trailing punctuation
    if (!seen.has(url)) {
      seen.add(url);
      results.push({ url, label: 'comercio_adherido' });
    }
  }
  return results;
}

// ─── Artifact URL extraction ──────────────────────────────────────────────────

/**
 * Extracts eligibility artifact URLs from the page HTML and RSC data.
 * Looks for PDF links, merchant list URLs, and external promo pages.
 */
function extractArtifactUrls(
  html: string,
  rscData: RscPromoData | null,
): Array<{ url: string; label: string }> {
  const artifacts: Array<{ url: string; label: string }> = [];
  const seen = new Set<string>();

  const add = (url: string, label: string) => {
    const clean = url.trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    artifacts.push({ url: clean, label: label.trim() });
  };

  // 1. Look in RSC data for explicit URL fields
  if (rscData?.promotion?.promotion) {
    const p = rscData.promotion.promotion;
    if (typeof p['external_url'] === 'string' && p['external_url']) {
      add(p['external_url'], 'external_url');
    }
    if (typeof p['pdf_url'] === 'string' && p['pdf_url']) {
      add(p['pdf_url'], 'pdf');
    }
    if (typeof p['terms_url'] === 'string' && p['terms_url']) {
      add(p['terms_url'], 'terms');
    }
    if (typeof p['merchant_url'] === 'string' && p['merchant_url']) {
      add(p['merchant_url'], 'merchant_list');
    }
    // Generic scan of all string values in the promotion object
    for (const [key, val] of Object.entries(p)) {
      if (
        typeof val === 'string' &&
        val.startsWith('http') &&
        (val.includes('.pdf') || val.includes('comercios') || val.includes('adheridos'))
      ) {
        add(val, key);
      }
    }
  }

  // Also scan top-level RSC data fields
  if (rscData) {
    for (const [key, val] of Object.entries(rscData)) {
      if (
        typeof val === 'string' &&
        val.startsWith('http') &&
        (val.includes('.pdf') || val.includes('comercios') || val.includes('adheridos'))
      ) {
        add(val, key);
      }
    }
  }

  // 2. Scan HTML <a href> for PDF links and merchant-related links
  const hrefRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const href  = m[1]!.trim();
    const label = m[2]!.replace(/<[^>]+>/g, '').trim();

    if (href.startsWith('http') || href.startsWith('/')) {
      const lower = href.toLowerCase() + label.toLowerCase();
      if (
        href.endsWith('.pdf') ||
        /comercios|adheridos|establecimientos|locales/i.test(lower)
      ) {
        const fullUrl = href.startsWith('/') ? `https://modo.com.ar${href}` : href;
        add(fullUrl, label || 'link');
      }
    }
  }

  return artifacts;
}

// ─── Fetch one promo page ─────────────────────────────────────────────────────

export async function fetchPromo(slug: string, scrapedAt: string): Promise<RawModoCandidate> {
  const url = `${PROMO_BASE}${slug}`;
  const base: RawModoCandidate = {
    slug,
    sourceUrl: url,
    scrapedAt,
    rawArtifactUrls: [],
    httpStatus: 0,
  };

  let html = '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timer);

    base.httpStatus = res.status;

    if (!res.ok) {
      base.parseError = `HTTP ${res.status}`;
      return base;
    }

    html = await res.text();
  } catch (err) {
    base.parseError = String(err);
    return base;
  }

  // Parse JSON-LD
  const jsonLd = extractJsonLd(html);
  if (jsonLd) {
    if (jsonLd.name)                        base.jsonLdTitle        = jsonLd.name;
    if (jsonLd.description)                 base.jsonLdDescription  = jsonLd.description;
    if (jsonLd.validFrom)                   base.jsonLdValidFrom    = jsonLd.validFrom;
    if (jsonLd.validThrough)                base.jsonLdValidThrough = jsonLd.validThrough;
    if (jsonLd.availableAtOrFrom?.name)     base.jsonLdWhere        = jsonLd.availableAtOrFrom.name;
  }

  // Parse RSC payload + T-chunks
  const flightData = extractRscPayloads(html);
  if (flightData) {
    const tChunks = parseTChunks(flightData);
    const rscData = parseRscPromoData(flightData);
    if (rscData) {
      base.rscData = rscData;
      const { termsText, bodyText } = resolveSectionTexts(rscData, tChunks);
      if (termsText) base.termsText = termsText;
      if (bodyText)  base.bodyText  = bodyText;
      const bodyArtifacts = extractBodyArtifacts(bodyText);
      base.rawArtifactUrls = [...extractArtifactUrls(html, rscData), ...bodyArtifacts];
    } else {
      base.rawArtifactUrls = extractArtifactUrls(html, null);
      if (!jsonLd) base.parseError = 'RSC data not found and no JSON-LD';
    }
  } else {
    base.rawArtifactUrls = extractArtifactUrls(html, null);
    if (!jsonLd) base.parseError = 'No RSC payloads found and no JSON-LD';
  }

  return base;
}

// ─── Extract result type ──────────────────────────────────────────────────────

export interface ExtractResult {
  candidates: RawModoCandidate[];
  stats: {
    attempted: number;
    succeeded: number;
    failedHttp: Array<{ slug: string; httpStatus: number; error?: string }>;
    withRscData: number;
    withJsonLdOnly: number;
    withParseError: number;
  };
}

// ─── Main extract function ────────────────────────────────────────────────────

export async function extract(
  slugs: string[],
  scrapedAt: string,
  opts: { limit?: number; concurrency?: number } = {},
): Promise<ExtractResult> {
  const limit       = opts.limit       ?? slugs.length;
  const concurrency = opts.concurrency ?? CONCURRENCY;
  const batch       = slugs.slice(0, limit);

  // Pre-allocate result array to preserve sitemap order
  const candidates: RawModoCandidate[] = new Array(batch.length);
  const failedHttp: Array<{ slug: string; httpStatus: number; error?: string }> = [];
  let withRscData    = 0;
  let withJsonLdOnly = 0;
  let withParseError = 0;
  let completed      = 0;

  // Semaphore-based concurrent pool: always keep `concurrency` requests in-flight
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIdx++;
      if (i >= batch.length) return;

      const slug = batch[i]!;
      const candidate = await fetchPromo(slug, scrapedAt);
      candidates[i] = candidate;
      completed++;

      if (completed % 100 === 0 || completed === 1) {
        process.stderr.write(`  [extract] ${completed}/${batch.length} — slug: ${slug}\n`);
      }

      if (candidate.httpStatus !== 200 && candidate.httpStatus !== 0) {
        const entry: { slug: string; httpStatus: number; error?: string } = { slug, httpStatus: candidate.httpStatus };
        if (candidate.parseError) entry.error = candidate.parseError;
        failedHttp.push(entry);
      } else if (candidate.rscData) {
        withRscData++;
      } else if (candidate.jsonLdTitle) {
        withJsonLdOnly++;
      } else {
        withParseError++;
      }
    }
  }

  // Launch `concurrency` workers, all sharing the same nextIdx counter
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  process.stderr.write(
    `\nExtract done: ${candidates.length} fetched, ` +
    `${withRscData} with RSC, ${withJsonLdOnly} JSON-LD only, ` +
    `${withParseError} parse errors, ${failedHttp.length} HTTP failures\n`,
  );

  return {
    candidates: candidates as RawModoCandidate[],
    stats: {
      attempted: batch.length,
      succeeded: batch.length - failedHttp.length,
      failedHttp,
      withRscData,
      withJsonLdOnly,
      withParseError,
    },
  };
}
