import * as cheerio from 'cheerio';
import { sha256Hex } from '../../shared/utils/hash.js';
import type { FetchResult, RawPromotionCandidate } from '../../shared/types/raw.js';
import { NARANJAX_CONFIG } from './config.js';
import { createLogger } from '../../core/logging/logger.js';

const log = createLogger({ issuerCode: NARANJAX_CONFIG.issuerCode, phase: 'extractDetail' });

/**
 * extractDetailCandidates
 *
 * Parses the fully-rendered HTML of a Naranja X promotion detail page.
 * Returns an array (usually one element) of RawPromotionCandidate objects.
 *
 * Key difference from landing extraction:
 * - Detail pages contain the full legal text (terms and conditions).
 * - <details> elements should be pre-expanded by the adapter's fetchPage()
 *   before HTML is captured, so this function sees expanded content.
 * - pageType is set to 'detail'.
 *
 * If the detail page has no recognizable structure, returns an empty array
 * so the DiscoveryPipeline falls back to the landing candidate.
 */
export function extractDetailCandidates(page: FetchResult): RawPromotionCandidate[] {
  const rawHtmlHash = sha256Hex(page.html);
  const $ = cheerio.load(page.html);
  const sel = NARANJAX_CONFIG.detail.selectors;

  const title = extractText($, sel.title);
  if (!title) {
    log.debug({ url: page.url }, 'No title on detail page');
    return [];
  }

  const subtitle = extractText($, sel.subtitle) ?? undefined;
  const validityText = extractText($, sel.validityText) ?? undefined;
  const legalRaw = extractLegal($, sel.legalText);
  const benefitText = extractTexts($, sel.benefitText);
  const paymentMethodText = extractTexts($, sel.paymentMethod);

  // Collect all in-page links (useful for sub-page discovery in some issuers)
  const links = extractLinks($, page.finalUrl, NARANJAX_CONFIG.baseUrl);

  const candidate: RawPromotionCandidate = {
    issuerCode: NARANJAX_CONFIG.issuerCode,
    sourceUrl: page.finalUrl,
    pageType: 'detail',
    title,
    subtitle,
    merchantText: undefined, // usually not present on detail pages
    categoryText: undefined,
    benefitText,
    paymentMethodText,
    railText: [],
    validityText,
    legalText: legalRaw ?? undefined,
    links,
    rawHtmlHash,
    extractedAt: new Date(),
    rawPayload: page.html,
  };

  return [candidate];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractText($: cheerio.CheerioAPI, selector: string): string | null {
  const text = $(selector).first().text().trim();
  return text || null;
}

function extractTexts($: cheerio.CheerioAPI, selector: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  $(selector).each((_i, node) => {
    const text = $(node).text().trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      results.push(text);
    }
  });
  return results;
}

/**
 * extractLegal
 *
 * Extracts legal/terms text. Concatenates all matching elements (some
 * sites split T&Cs across multiple <p> tags inside a container).
 * Returns the joined text, or null if none found.
 */
function extractLegal($: cheerio.CheerioAPI, selector: string): string | null {
  const parts: string[] = [];

  $(selector).each((_i, node) => {
    // If it's a <details> element, grab the text of its <summary> + content
    const text = $(node).text().trim();
    if (text) parts.push(text);
  });

  if (parts.length === 0) return null;
  return parts.join('\n\n');
}

function extractLinks(
  $: cheerio.CheerioAPI,
  finalUrl: string,
  baseUrl: string,
): string[] {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const links: string[] = [];

  $('a[href]').each((_i, node) => {
    const href = $(node).attr('href') ?? '';
    try {
      const u = new URL(href, finalUrl);
      if (u.origin === base.origin) {
        const abs = u.origin + u.pathname;
        if (!seen.has(abs)) {
          seen.add(abs);
          links.push(abs);
        }
      }
    } catch {
      // skip
    }
  });

  return links;
}
