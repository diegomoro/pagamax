import type { IssuerAdapter } from '../../shared/types/adapter.js';
import type { FetchResult, RawPromotionCandidate } from '../../shared/types/raw.js';
import { FetchResultSchema } from '../../shared/types/raw.js';
import type { NormalizedPromotionBundle } from '../../shared/types/normalized.js';
import { browserManager } from '../../core/browser/BrowserManager.js';
import { sha256Hex } from '../../shared/utils/hash.js';
import { withRetry } from '../../shared/utils/retry.js';
import { sleep } from '../../shared/utils/sleep.js';
import { createLogger } from '../../core/logging/logger.js';
import { NARANJAX_CONFIG } from './config.js';
import { discoverNaranjaxUrls } from './discover.js';
import { normalizeNaranjaxCandidate } from './normalize.js';
import { extractDetailPageData, type DetailPageData } from './extractDetailPlaywright.js';

const log = createLogger({ issuerCode: NARANJAX_CONFIG.issuerCode });

/** Raw card data extracted inside the Playwright page context. */
interface RawCardData {
  title: string;
  promoName: string;
  brand: string;
  bodyText: string;
  footerText: string;
  promoId: string;
  index: number;
  imageUrl: string;
  /** Validity text from merchant page (e.g., "Todos los días Hasta el 31/MAR") */
  validityListText: string;
  /** Detail page data — populated by enrichWithDetails() */
  detail: DetailPageData | null;
}

/**
 * NaranjaxAdapter
 *
 * Scrapes https://www.naranjax.com/promociones/
 *
 * Scraping flow (3 levels deep):
 * 1. Category page → extract card data (title, brand, benefit, payment)
 * 2. Click card → merchant page → extract validity/expiration per card
 * 3. Click card on merchant page → promo detail page → extract cap, min purchase,
 *    stackability, refund, plan type, scope, exclusions
 */
export class NaranjaxAdapter implements IssuerAdapter {
  readonly issuerCode = NARANJAX_CONFIG.issuerCode;
  readonly detailPageDelayMs = NARANJAX_CONFIG.detailPageDelayMs;

  async discoverUrls(): Promise<string[]> {
    return discoverNaranjaxUrls();
  }

  /**
   * Fetches a Naranja X category page, extracts cards, and enriches each
   * card with detail page data via click-through navigation.
   */
  async fetchPage(url: string): Promise<FetchResult> {
    return withRetry(
      async () => {
        const ctx = await browserManager.acquire();
        try {
          const { page } = ctx;

          log.debug({ url }, 'Navigating');
          await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: NARANJAX_CONFIG.landing.timeoutMs,
          });

          await page
            .waitForSelector(NARANJAX_CONFIG.landing.waitForSelector, {
              timeout: 25_000,
              state: 'visible',
            })
            .catch(() => log.debug({ url }, 'Card selector not found on initial load'));

          // Scroll and collect basic card data
          const allCards: RawCardData[] = await this.scrollAndCollect(page);
          log.info({ url, cards: allCards.length }, 'Cards collected via page.evaluate');

          // Enrich each card with detail page data (uses separate browser contexts)
          await this.enrichWithDetails(page, allCards, url);

          // Capture HTML snapshot (from the original category page context)
          const html = await page.content();
          const finalUrl = url; // Use original URL since enrichment uses separate contexts

          const enrichedHtml =
            html +
            `\n<script id="pagamax-cards" type="application/json">${JSON.stringify(allCards)}</script>`;

          return FetchResultSchema.parse({
            url,
            finalUrl,
            html: enrichedHtml,
            statusCode: 200,
            fetchedAt: new Date(),
            fetchMethod: 'playwright',
          });
        } finally {
          await ctx.release();
        }
      },
      { maxAttempts: 3, baseDelayMs: 2000, maxDelayMs: 10_000 },
    ).catch((err: unknown) => {
      log.warn({ url, error: (err as Error).message }, 'fetchPage failed after retries');
      return {
        url, finalUrl: url, html: '', statusCode: 0,
        fetchedAt: new Date(), fetchMethod: 'playwright' as const,
      };
    });
  }

  extractCandidates(page: FetchResult): RawPromotionCandidate[] {
    try {
      return this.extractFromPayload(page);
    } catch (err) {
      log.warn({ url: page.url, error: (err as Error).message }, 'extractCandidates threw');
      return [];
    }
  }

  normalizeCandidate(candidate: RawPromotionCandidate): NormalizedPromotionBundle {
    return normalizeNaranjaxCandidate(candidate);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Scrolls through the page and collects card data from the live Angular DOM.
   */
  private async scrollAndCollect(page: import('playwright').Page): Promise<RawCardData[]> {
    const seen = new Map<string, RawCardData>();

    const collect = async () => {
      const batch: RawCardData[] = await page.evaluate(() => {
        const cards = document.querySelectorAll('.card-container--hover');
        return Array.from(cards).map((card, index) => ({
          title: (card.querySelector('.equis-body-1-medium') as HTMLElement)?.innerText?.trim() ?? '',
          promoName: (card.querySelector('[class="Promo Name"]') as HTMLElement)?.innerText?.trim() ?? '',
          brand: (card.querySelector('[class="Promo Brand"]') as HTMLElement)?.innerText?.trim() ?? '',
          bodyText: (card.querySelector('.card__body') as HTMLElement)?.innerText?.replace(/\s+/g, ' ')?.trim() ?? '',
          footerText: (card.querySelector('.card__footer') as HTMLElement)?.innerText?.replace(/\s+/g, ' ')?.trim() ?? '',
          promoId: (card.querySelector('[class="Promo ID"]') as HTMLElement)?.innerText?.trim() ?? '',
          index,
          imageUrl: (card.querySelector('.card__brand-logo, .card__brand-img') as HTMLImageElement)?.src ?? '',
          validityListText: (card.querySelector('.validity-list') as HTMLElement)?.innerText?.replace(/\s+/g, ' ')?.trim() ?? '',
          detail: null,
        }));
      });

      for (const card of batch) {
        if (!card.title) continue;
        const key = card.promoId || `${card.title}|${card.brand}`;
        if (!seen.has(key)) {
          seen.set(key, card);
        }
      }
    };

    await collect();

    // /resultados has many more cards than the old featured category pages.
    // Scroll up to 60 steps of 500px = 30 000px to capture everything.
    const stepPx = 500;
    const maxSteps = 60;
    let lastCount = seen.size;
    let stableRounds = 0;

    for (let i = 0; i < maxSteps; i++) {
      await page.evaluate((step: number) => window.scrollBy(0, step), stepPx);
      await sleep(350);
      await collect();
      // Stop early once the count has been stable for 5 consecutive steps
      if (seen.size === lastCount) {
        stableRounds++;
        if (stableRounds >= 5) break;
      } else {
        stableRounds = 0;
        lastCount = seen.size;
      }
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(800);
    await collect();

    return [...seen.values()];
  }

  /**
   * Enriches cards with detail page data using fresh browser contexts.
   *
   * Strategy: For each unique brand, acquire a FRESH BrowserContext and
   * navigate category → merchant → detail.  This avoids Angular SPA
   * navigation issues where goto(categoryUrl) doesn't re-render the
   * virtual scroll.
   *
   * Steps per brand:
   * 1. Fresh context → goto categoryUrl → scroll to find brand card → click
   * 2. Arrives at merchant page → record merchantUrl
   * 3. On merchant page, match cards to our collected data
   * 4. For each card: click → detail page → extract → goto(merchantUrl)
   * 5. Release context
   */
  private async enrichWithDetails(
    _parentPage: import('playwright').Page,
    cards: RawCardData[],
    categoryUrl: string,
  ): Promise<void> {
    // Group cards by brand (merchant)
    const brandMap = new Map<string, RawCardData[]>();
    for (const card of cards) {
      if (!card.brand) continue;
      if (!brandMap.has(card.brand)) brandMap.set(card.brand, []);
      brandMap.get(card.brand)!.push(card);
    }

    const brands = [...brandMap.keys()];
    log.info({ total: cards.length, uniqueBrands: brands.length }, 'Starting detail enrichment');

    for (let bi = 0; bi < brands.length; bi++) {
      const brand = brands[bi]!;
      const brandCards = brandMap.get(brand)!;
      log.info({ bi, totalBrands: brands.length, brand, cards: brandCards.length }, 'Enriching brand');

      const ctx = await browserManager.acquire();
      try {
        const page = ctx.page;

        // Step 1: Navigate to category page in fresh context
        await page.goto(categoryUrl, {
          waitUntil: 'networkidle',
          timeout: NARANJAX_CONFIG.landing.timeoutMs,
        });
        await page.waitForSelector('.card-container--hover', {
          timeout: 25_000,
          state: 'visible',
        }).catch(() => {});

        // Step 2: Scroll to find and click the brand card → merchant page
        const found = await this.scrollToFindCard(page, brand);
        if (!found) {
          log.warn({ brand, bi }, 'Brand card not found on category page, skipping');
          continue;
        }

        const clicked = await this.clickCardByBrand(page, brand);
        if (!clicked) {
          log.warn({ brand }, 'Could not click brand card, skipping');
          continue;
        }

        // Wait for merchant/detail page to load
        await sleep(2000);
        await page.waitForSelector('.card-container--hover', { timeout: 10_000, state: 'visible' })
          .catch(() => {});

        const landedUrl = page.url();

        // Some brands have only one promo — clicking the brand card on the category
        // page navigates directly to the detail page (URL ends with "-C").
        // Detect this and extract immediately, skipping the card-click loop.
        if (isDetailPageUrl(landedUrl)) {
          log.info({ brand, url: landedUrl }, 'Brand card led directly to detail page');
          await sleep(1000);
          const blocked = await page.evaluate(`document.body.innerText.includes('acceso ha sido bloqueado')`);
          if (blocked) {
            log.warn({ brand }, 'Access blocked by site — aborting enrichment');
            return;
          }
          const detail = await extractDetailPageData(page);
          if (detail) {
            // Apply to whichever card matches the detail title, or the first card
            const target = brandCards.find(c => c.title === detail.title) ?? brandCards[0]!;
            target.detail = detail;
            log.info(
              { brand, title: target.title, cap: detail.capText, min: detail.minPurchaseText },
              'Detail data extracted (direct)',
            );
          }
          continue; // next brand
        }

        const merchantUrl = landedUrl;
        log.info({ brand, merchantUrl }, 'On merchant page');

        // Step 4: For each of our cards, scroll to find it by title and click → detail
        for (let ci = 0; ci < brandCards.length; ci++) {
          const card = brandCards[ci]!;
          try {
            // Scroll merchant page to find this card's title, get its validity text
            const titleFound = await this.scrollToFindCardByTitle(page, card.title);
            if (!titleFound) {
              log.warn({ brand, title: card.title }, 'Could not find card title on merchant page');
              continue;
            }

            // Grab validity text while the card is visible, then click it
            const validity = await page.evaluate((t: string) => {
              const cards = document.querySelectorAll('.card-container--hover');
              for (const c of cards) {
                const titleEl = c.querySelector('.card__body-title, .equis-body-1-medium') as HTMLElement;
                if (titleEl?.innerText?.trim() === t) {
                  return (c.querySelector('.validity-list') as HTMLElement)?.innerText?.replace(/\s+/g, ' ')?.trim() ?? '';
                }
              }
              return '';
            }, card.title);
            if (validity) card.validityListText = validity;

            // Click the card → detail page
            const detailClicked = await this.clickCardByTitle(page, card.title);
            if (!detailClicked) {
              log.warn({ brand, title: card.title }, 'Could not click merchant card by title');
              continue;
            }

            // Wait for detail page to render
            await sleep(3000);

            // Check if we've been blocked
            const blocked = await page.evaluate(`document.body.innerText.includes('acceso ha sido bloqueado')`);
            if (blocked) {
              log.warn({ brand }, 'Access blocked by site — aborting enrichment');
              return;
            }

            // Extract detail data
            const detail = await extractDetailPageData(page);
            if (detail) {
              card.detail = detail;
              log.info(
                { brand, title: card.title, cap: detail.capText, min: detail.minPurchaseText, exp: detail.expirationText },
                'Detail data extracted',
              );
            } else {
              log.warn({ brand, title: card.title, url: page.url() }, 'Detail extraction returned null');
            }

            // Navigate back to merchant page (fresh Angular load)
            await page.goto(merchantUrl, { waitUntil: 'networkidle', timeout: 30_000 });
            await page.waitForSelector('.card-container--hover', { timeout: 15_000, state: 'visible' })
              .catch(() => {});
            await sleep(2000);

          } catch (err) {
            log.warn({ brand, title: card.title, error: (err as Error).message }, 'Detail enrichment failed for card');
            try {
              await page.goto(merchantUrl, { waitUntil: 'networkidle', timeout: 30_000 });
              await sleep(1000);
            } catch {
              log.warn({ brand }, 'Merchant page recovery failed, breaking brand loop');
              break;
            }
          }
        }
      } catch (err) {
        log.warn({ brand, error: (err as Error).message }, 'Brand enrichment failed');
      } finally {
        await ctx.release();
      }
    }

    const enrichedCount = cards.filter(c => c.detail !== null).length;
    log.info({ total: cards.length, enriched: enrichedCount }, 'Detail enrichment complete');
  }

  /**
   * Scrolls through the page until the target brand's card is visible in
   * the Angular virtual-scroll DOM.  Returns true if the card was found.
   */
  private async scrollToFindCard(
    page: import('playwright').Page,
    brand: string,
  ): Promise<boolean> {
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);

    for (let step = 0; step < 30; step++) {
      const found = await page.evaluate((b: string) => {
        return !!Array.from(document.querySelectorAll('.card-container--hover'))
          .find(c =>
            ((c.querySelector('[class="Promo Brand"]') as HTMLElement)
              ?.innerText?.trim() ?? '') === b,
          );
      }, brand);
      if (found) return true;
      await page.evaluate(() => window.scrollBy(0, 400));
      await sleep(300);
    }
    return false;
  }

  /** Click a card on the current page by matching the brand text. */
  private async clickCardByBrand(page: import('playwright').Page, brand: string): Promise<boolean> {
    const currentUrl = page.url();
    try {
      const clicked = await page.evaluate((targetBrand: string) => {
        const cards = document.querySelectorAll('.card-container--hover');
        for (const card of cards) {
          const cardBrand = (card.querySelector('[class="Promo Brand"]') as HTMLElement)?.innerText?.trim() ?? '';
          if (cardBrand === targetBrand) {
            (card as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, brand);

      if (!clicked) return false;

      await page.waitForURL((url) => url.href !== currentUrl, { timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Scrolls the merchant page until a card with the given title is visible,
   * then clicks it. Returns true if navigation succeeded.
   */
  private async clickCardByTitle(page: import('playwright').Page, title: string): Promise<boolean> {
    const currentUrl = page.url();
    try {
      const clicked = await page.evaluate((t: string) => {
        const cards = document.querySelectorAll('.card-container--hover');
        for (const card of cards) {
          const titleEl = card.querySelector('.card__body-title, .equis-body-1-medium') as HTMLElement;
          if (titleEl?.innerText?.trim() === t) {
            (card as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, title);
      if (!clicked) return false;
      await page.waitForURL((url) => url.href !== currentUrl, { timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Scrolls through the merchant page until a card with the given title is
   * visible in the Angular virtual-scroll DOM. Returns true if found.
   */
  private async scrollToFindCardByTitle(
    page: import('playwright').Page,
    title: string,
  ): Promise<boolean> {
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);
    for (let step = 0; step < 30; step++) {
      const found = await page.evaluate((t: string) => {
        return !!Array.from(document.querySelectorAll('.card-container--hover'))
          .find(c => {
            const el = c.querySelector('.card__body-title, .equis-body-1-medium') as HTMLElement;
            return el?.innerText?.trim() === t;
          });
      }, title);
      if (found) return true;
      await page.evaluate(() => window.scrollBy(0, 400));
      await sleep(300);
    }
    return false;
  }

  /** Parses the embedded JSON payload from the enriched HTML. */
  private extractFromPayload(page: FetchResult): RawPromotionCandidate[] {
    const match = /<script id="pagamax-cards" type="application\/json">([\s\S]*?)<\/script>/.exec(
      page.html,
    );

    if (!match || !match[1]) {
      log.warn({ url: page.url }, 'No pagamax-cards JSON payload found in HTML');
      return [];
    }

    let cards: RawCardData[];
    try {
      cards = JSON.parse(match[1]) as RawCardData[];
    } catch {
      log.warn({ url: page.url }, 'Failed to parse pagamax-cards JSON');
      return [];
    }

    const rawHtmlHash = sha256Hex(page.html);
    const categoryFromUrl = parseCategoryFromUrl(page.finalUrl);

    return cards
      .filter((c) => c.title.trim())
      .map((card): RawPromotionCandidate => {
        const validityText = card.validityListText ||
          extractValidity(card.bodyText, card.title, card.brand);
        const paymentMethodText = card.footerText ? [card.footerText] : [];
        const railText = detectRailsFromFooter(card.footerText);
        const detail = card.detail;

        // Merge detail page payment methods if available
        if (detail?.paymentMethods?.length) {
          for (const pm of detail.paymentMethods) {
            if (!paymentMethodText.includes(pm)) paymentMethodText.push(pm);
          }
        }

        return {
          issuerCode: NARANJAX_CONFIG.issuerCode,
          sourceUrl: page.finalUrl,
          pageType: detail ? 'detail' : 'landing',
          title: card.promoName || card.title,
          subtitle: card.promoName && card.title !== card.promoName ? card.title : undefined,
          merchantText: card.brand || undefined,
          categoryText: categoryFromUrl ?? undefined,
          benefitText: [card.title],
          paymentMethodText,
          railText,
          validityText: validityText || undefined,
          legalText: undefined,

          // Detail page fields
          capText: detail?.capText ?? undefined,
          minPurchaseText: detail?.minPurchaseText ?? undefined,
          expirationText: detail?.expirationText ?? undefined,
          stackableText: detail?.stackableText ?? undefined,
          planTypeText: detail?.planTypeText ?? undefined,
          exclusionTexts: detail?.exclusionTexts?.length ? detail.exclusionTexts : undefined,
          refundText: detail?.refundText ?? undefined,
          scopeText: detail?.scopeText ?? undefined,
          imageUrl: card.imageUrl || undefined,
          issuerPromoId: card.promoId || undefined,

          links: [],
          rawHtmlHash,
          extractedAt: new Date(),
          rawPayload: page.html,
        };
      });
  }
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

function extractValidity(bodyText: string, title: string, brand: string): string {
  let remaining = bodyText.startsWith(title)
    ? bodyText.slice(title.length).trim()
    : bodyText.replace(title, '').trim();
  if (brand) {
    const re = new RegExp(`\\s+en\\s+${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    remaining = remaining.replace(re, '').trim();
  }
  return remaining.replace(/\s+en\s*$/, '').trim();
}

function parseCategoryFromUrl(url: string): string | null {
  try {
    const slug = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    if (!slug || slug === 'promociones') return null;
    return slug.replace(/_destacada$/, '').replace(/-/g, ' ')
      .split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  } catch { return null; }
}

/**
 * Returns true if the URL is a Naranja X promotion detail page.
 * Detail page URLs end with a promo slug followed by "-C".
 * e.g. /INDUMENTARIA_DEPORTIVA/dexter/plan_zeta_cero_interes-20_de_descuento-C
 */
function isDetailPageUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return /-C$/.test(pathname);
  } catch { return false; }
}

function detectRailsFromFooter(footerText: string): string[] {
  if (!footerText) return [];
  const t = footerText.toLowerCase();
  const rails: string[] = [];
  if (/dinero en cuenta|billetera/.test(t)) rails.push('con billetera Naranja X');
  if (/débito|debito/.test(t)) rails.push('con tarjeta de débito');
  if (/crédito|credito/.test(t)) rails.push('con tarjeta de crédito');
  return rails;
}
