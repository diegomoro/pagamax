import { sleep } from './sleep.js';

export interface RetryOptions {
  /** Maximum number of attempts including the first. Default: 3. */
  maxAttempts: number;
  /** Base delay in milliseconds before the first retry. Default: 1000. */
  baseDelayMs: number;
  /** Maximum delay in milliseconds regardless of backoff. Default: 15000. */
  maxDelayMs: number;
  /**
   * Optional predicate to decide whether to retry for a given error.
   * Return false to stop retrying immediately (re-throws the error).
   * Defaults to always retrying.
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const DEFAULTS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 15_000,
};

/**
 * withRetry
 *
 * Executes fn() up to maxAttempts times with exponential backoff + jitter.
 *
 * Backoff formula: delay = min(baseDelay * 2^(attempt-1), maxDelay) * (1 + jitter)
 * Jitter: random factor in [0, 0.2] to avoid thundering-herd on concurrent scrapers.
 *
 * Throws only after all attempts are exhausted, re-throwing the last error.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (opts.shouldRetry && !opts.shouldRetry(err, attempt)) {
        throw err;
      }

      if (attempt === opts.maxAttempts) break;

      // Exponential backoff with jitter
      const base = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt - 1),
        opts.maxDelayMs,
      );
      const jitter = base * Math.random() * 0.2;
      const delay = Math.round(base + jitter);

      await sleep(delay);
    }
  }

  throw lastError;
}
