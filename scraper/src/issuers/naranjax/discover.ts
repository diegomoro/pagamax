import { createLogger } from '../../core/logging/logger.js';
import { browserManager } from '../../core/browser/BrowserManager.js';
import { sleep } from '../../shared/utils/sleep.js';
import { NARANJAX_CONFIG } from './config.js';

const log = createLogger({ issuerCode: NARANJAX_CONFIG.issuerCode, phase: 'discovery' });

/**
 * discoverNaranjaxUrls
 *
 * Returns the canonical "all promotions" results page as the single entry
 * point for scraping.
 *
 * Previous strategy: scrape the landing page for "Ver más" links → 5 curated
 * featured category pages (~100 promos total). Problem: only covers the
 * highlighted campaigns visible on the landing page, missing the majority of
 * merchants.
 *
 * Current strategy: use /promociones/resultados directly — this is the page
 * you land on when clicking any filter on the landing page, and it contains
 * all active promotions across every merchant.  The adapter's scrollAndCollect
 * + enrichWithDetails logic handles the larger virtual-scroll list identically
 * to how it handled the smaller category pages.
 */
export async function discoverNaranjaxUrls(): Promise<string[]> {
  const resultsUrl = `${NARANJAX_CONFIG.baseUrl}/promociones/resultados`;
  log.info({ url: resultsUrl }, 'Using resultados as scrape entry point');
  return [resultsUrl];
}

async function scrollToBottom(
  page: import('playwright').Page,
  stepPx: number,
  delayMs: number,
): Promise<void> {
  let lastHeight = 0;
  let stableCount = 0;
  while (stableCount < 3) {
    const newHeight: number = await page.evaluate((step: number) => {
      window.scrollBy(0, step);
      return document.body.scrollHeight;
    }, stepPx);
    stableCount = newHeight === lastHeight ? stableCount + 1 : 0;
    lastHeight = newHeight;
    await sleep(delayMs);
  }
}
