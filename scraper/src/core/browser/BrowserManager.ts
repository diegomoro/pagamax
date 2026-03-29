import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createLogger } from '../logging/logger.js';
import type { BrowserManagerOptions, ManagedContext } from './types.js';

const log = createLogger({ component: 'BrowserManager' });

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULTS: BrowserManagerOptions = {
  maxContexts: 3,
  headless: false,
  timeoutMs: 30_000,
  userAgent: DEFAULT_UA,
  viewportWidth: 1280,
  viewportHeight: 900,
};

/**
 * BrowserManager
 *
 * Singleton that manages a shared Chromium process and a pool of BrowserContexts.
 *
 * Design:
 * - One Chromium process per CLI run shared across all adapters.
 * - Up to maxContexts browser contexts run concurrently (semaphore-based).
 * - Each acquire() creates a FRESH page within the context and closes it on release().
 *   This avoids stale DOM/Angular SPA state between fetches.
 * - Anti-detection init script applied to every context.
 *
 * Usage:
 *   await browserManager.init();
 *   const ctx = await browserManager.acquire();
 *   try { ... await ctx.page.goto(url) ... }
 *   finally { await ctx.release(); }   // closes the page
 *   await browserManager.shutdown();
 */
class BrowserManager {
  private static _instance: BrowserManager | null = null;

  private browser: Browser | null = null;
  private options: BrowserManagerOptions = { ...DEFAULTS };

  // Idle contexts available for reuse (context itself is reused, page is fresh each time)
  private freeContexts: BrowserContext[] = [];
  private activeCount = 0;
  private queue: Array<() => void> = [];

  private constructor() {}

  static getInstance(): BrowserManager {
    if (!BrowserManager._instance) {
      BrowserManager._instance = new BrowserManager();
    }
    return BrowserManager._instance;
  }

  async init(options: Partial<BrowserManagerOptions> = {}): Promise<void> {
    if (this.browser) return;

    this.options = { ...DEFAULTS, ...options };

    this.browser = await chromium.launch({
      headless: this.options.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    log.info({ headless: this.options.headless }, 'Chromium launched');
  }

  /**
   * Acquire a ManagedContext.
   * Creates a FRESH BrowserContext + Page for every acquire call.
   * On release(), both page and context are closed.
   *
   * Why fresh contexts: Naranja X is an Angular SPA. If a context has already
   * navigated to the landing page, subsequent goto() calls use Angular's
   * client-side router instead of doing a full page load. networkidle then
   * fires before the Angular view finishes rendering, causing 0 cards to
   * appear. A fresh context guarantees a full page load every time.
   *
   * The browser process is still shared — context creation is cheap (~5ms).
   */
  async acquire(): Promise<ManagedContext> {
    if (!this.browser) {
      throw new Error('BrowserManager not initialized. Call init() first.');
    }

    // Semaphore: limit concurrent contexts
    while (this.activeCount >= this.options.maxContexts) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.activeCount++;

    // Fresh context + page every time — no shared SPA router state
    const context = await this.createContext();
    const page = await context.newPage();
    log.debug({ active: this.activeCount }, 'Context + page acquired');

    const release = async (): Promise<void> => {
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
      this.activeCount--;

      const next = this.queue.shift();
      if (next) next();

      log.debug({ active: this.activeCount }, 'Context + page released');
    };

    return { context, page, release };
  }

  async shutdown(): Promise<void> {
    if (!this.browser) return;
    // All contexts are closed on release(); just close the browser process.
    await this.browser.close();
    this.browser = null;
    log.info('Chromium shut down');
  }

  private async createContext(): Promise<BrowserContext> {
    const ctx = await this.browser!.newContext({
      userAgent: this.options.userAgent,
      viewport: {
        width: this.options.viewportWidth,
        height: this.options.viewportHeight,
      },
      locale: 'es-AR',
      timezoneId: 'America/Argentina/Buenos_Aires',
    });

    await ctx.addInitScript(() => {
      // Hide webdriver flag
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // Fake plugins array (headless has 0 plugins)
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Fake languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['es-AR', 'es', 'en-US', 'en'],
      });

      // Override chrome runtime (headless detection vector)
      (window as any).chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };

      // Override permissions query for notifications
      const origQuery = (window as any).Notification?.permission;
      if (origQuery) {
        (window as any).Notification = { permission: 'default' };
      }
    });

    log.debug('Context created');
    return ctx;
  }
}

export const browserManager = BrowserManager.getInstance();
