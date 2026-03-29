import type { BrowserContext, Page } from 'playwright';

/** Configuration for the BrowserManager singleton. */
export interface BrowserManagerOptions {
  /** Maximum number of concurrent BrowserContext instances in the pool. Default: 3. */
  maxContexts: number;
  /** Run Chromium in headless mode. Default: true. */
  headless: boolean;
  /** Navigation timeout in milliseconds. Default: 30000. */
  timeoutMs: number;
  /** User-agent string sent with every request. Defaults to a real Chrome UA. */
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * ManagedContext is the handle returned by BrowserManager.acquire().
 * Callers must call release() when done so the context returns to the pool.
 */
export interface ManagedContext {
  context: BrowserContext;
  page: Page;
  /** Return this context to the pool and make it available for the next caller. */
  release(): Promise<void>;
}
