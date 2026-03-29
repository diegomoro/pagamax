import * as cheerio from 'cheerio';
import { sha256Hex } from '../../shared/utils/hash.js';
import type { FetchResult, RawPromotionCandidate } from '../../shared/types/raw.js';
import { NARANJAX_CONFIG } from './config.js';
import { createLogger } from '../../core/logging/logger.js';

const log = createLogger({ issuerCode: NARANJAX_CONFIG.issuerCode, phase: 'extractLanding' });

/**
 * extractLandingCandidates
 *
 * Parses the HTML of a Naranja X landing or category page and returns one
 * RawPromotionCandidate per `.card-container--hover` element found.
 *
 * Card DOM structure (verified against live site, March 2025):
 *   .card-container--hover
 *     .card__body
 *       .equis-body-1-medium     ← benefit title, e.g. "Hasta 25% off"
 *                                  (body text = title + validity + " en " + brand)
 *     .card__footer              ← payment methods, e.g. "Débito Crédito"
 *     [class="Promo Brand"]      ← merchant name, e.g. "Disco"
 *     [class="Promo ID"]         ← UUID
 *     [class="Promo Name"]       ← clean promo name
 *
 * Category is inferred from the page URL slug (strips "_destacada" suffix).
 * Validity text is extracted from the card body by removing the title and
 * the " en <brand>" suffix.
 *
 * This function works for both the main landing page and individual category pages.
 */
export function extractLandingCandidates(page: FetchResult): RawPromotionCandidate[] {
  const rawHtmlHash = sha256Hex(page.html);
  const $ = cheerio.load(page.html);
  const sel = NARANJAX_CONFIG.selectors;
  const candidates: RawPromotionCandidate[] = [];

  // Infer category name from URL slug for context (best-effort)
  const categoryFromUrl = parseCategoryFromUrl(page.finalUrl);

  const cards = $(sel.card);
  log.debug({ count: cards.length, url: page.finalUrl }, 'Cards found in HTML');

  cards.each((_i, el) => {
    const $card = $(el);

    const title = $card.find(sel.cardTitle).first().text().trim();
    if (!title) return; // skip cards without a title

    const brand = $card.find(sel.cardBrand).first().text().trim() || undefined;
    const bodyText = $card.find(sel.cardBody).first().text().replace(/\s+/g, ' ').trim();
    const footerText = $card.find(sel.cardFooter).first().text().replace(/\s+/g, ' ').trim();
    const promoId = $card.find(sel.cardPromoId).first().text().trim() || undefined;
    const promoName = $card.find(sel.cardPromoName).first().text().trim() || undefined;

    // Extract validity text from body:
    // bodyText = "<title><validityText> en <brand>" (all concatenated without separator)
    const validityText = extractValidity(bodyText, title, brand);

    // Payment methods from footer
    const paymentMethodText = footerText ? [footerText] : [];

    // Rail detection: Naranja X footer says "Dinero en cuenta" (wallet/QR) or "Crédito"/"Débito"
    const railText = detectRails(footerText);

    // Use promoId (UUID) as a stable identifier in rawPayload if available
    const extraMeta = promoId ? `<!-- promoId:${promoId} promoName:${promoName ?? ''} -->` : '';

    const candidate: RawPromotionCandidate = {
      issuerCode: NARANJAX_CONFIG.issuerCode,
      sourceUrl: page.finalUrl,
      pageType: 'landing',
      title: promoName ?? title,       // prefer the clean "Promo Name" if available
      subtitle: title !== (promoName ?? title) ? title : undefined,
      merchantText: brand,
      categoryText: categoryFromUrl ?? undefined,
      benefitText: [title],
      paymentMethodText,
      railText,
      validityText: validityText || undefined,
      legalText: undefined,
      links: [],                        // Naranja X cards have no individual detail URLs
      rawHtmlHash,
      extractedAt: new Date(),
      rawPayload: page.html + extraMeta,
    };

    candidates.push(candidate);
  });

  if (candidates.length === 0) {
    log.warn({ url: page.finalUrl }, 'No candidates extracted. Site markup may have changed.');
  } else {
    log.info({ count: candidates.length, url: page.finalUrl }, 'Extraction complete');
  }

  return candidates;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts the validity/schedule text from the card body.
 * Body format: "<title><validity> en <brand>" (no separator between title and validity).
 *
 * Examples:
 *   body="Hasta 25% offLos Martes en Disco" title="Hasta 25% off" brand="Disco"
 *   → "Los Martes"
 *
 *   body="Hasta 15 cuotas cero interésTodos los dias en Samsung" title="Hasta 15 cuotas cero interés" brand="Samsung"
 *   → "Todos los dias"
 */
function extractValidity(
  bodyText: string,
  title: string,
  brand: string | undefined,
): string {
  // Remove the title from the front of body text
  let remaining = bodyText.startsWith(title)
    ? bodyText.slice(title.length).trim()
    : bodyText.replace(title, '').trim();

  // Remove " en <brand>" suffix (case-insensitive brand match)
  if (brand) {
    const brandSuffix = new RegExp(`\\s+en\\s+${escapeRegex(brand)}\\s*$`, 'i');
    remaining = remaining.replace(brandSuffix, '').trim();
  }

  // Also strip standalone " en " at the end if brand wasn't found
  remaining = remaining.replace(/\s+en\s*$/, '').trim();

  return remaining;
}

/** Infers category from URL slug. "/promociones/cuotas-en-tecno-y-electro_destacada" → "Electro y tecnología" */
function parseCategoryFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const slug = path.split('/').filter(Boolean).pop() ?? '';
    if (!slug || slug === 'promociones') return null;
    // Remove trailing "_destacada" qualifier
    const clean = slug.replace(/_destacada$/, '').replace(/-/g, ' ');
    // Title-case the result
    return clean.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  } catch {
    return null;
  }
}

/** Detects payment rails from the card footer text. */
function detectRails(footerText: string): string[] {
  if (!footerText) return [];
  const t = footerText.toLowerCase();
  const rails: string[] = [];
  if (/dinero en cuenta|billetera/.test(t)) rails.push('con billetera Naranja X');
  if (/débito|debito/.test(t)) rails.push('con tarjeta de débito');
  if (/crédito|credito/.test(t)) rails.push('con tarjeta de crédito');
  return rails;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
