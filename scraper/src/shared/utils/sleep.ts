/**
 * sleep
 *
 * Waits for the specified number of milliseconds.
 * Used for polite crawl delays and backoff between retries.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
