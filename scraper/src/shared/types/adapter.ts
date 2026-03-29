import type { FetchResult, RawPromotionCandidate } from './raw.js';
import type { NormalizedPromotionBundle } from './normalized.js';

/**
 * IssuerAdapter is the single contract every payment issuer must implement.
 *
 * To add a new issuer:
 * 1. Create src/issuers/<name>/ with config, discover, extractLanding,
 *    extractDetail, normalize, adapter files.
 * 2. Implement this interface in adapter.ts.
 * 3. Register the adapter in src/main.ts ADAPTER_REGISTRY.
 * No changes to core, shared types, or parsers are required.
 *
 * The interface is intentionally minimal. Complexity (retry logic, anti-detection,
 * pagination) lives inside the adapter's private implementation, not here.
 */
export interface IssuerAdapter {
  /**
   * Stable identifier used in DB records, log fields, and CLI flags.
   * Must be lowercase, alphanumeric, no spaces. E.g., "naranjax", "mercadopago".
   */
  readonly issuerCode: string;

  /**
   * Returns the full set of URLs to scrape for this issuer.
   *
   * Implementation responsibilities:
   * - Handle pagination or category filters internally.
   * - Return deduplicated absolute URLs.
   * - Return an empty array if discovery fails non-fatally (log internally).
   * - Never throw for transient discovery failures.
   */
  discoverUrls(): Promise<string[]>;

  /**
   * Fetches one URL using the appropriate strategy (Playwright or HTTP).
   *
   * Implementation responsibilities:
   * - Apply retry logic internally.
   * - Return a FetchResult with statusCode >= 400 or statusCode === 0 on
   *   persistent failure. Never throw for network/timeout errors.
   * - Expand any collapsible sections (accordions, <details>) before
   *   capturing the final HTML so extractCandidates sees full content.
   */
  fetchPage(url: string): Promise<FetchResult>;

  /**
   * Pure DOM → RawPromotionCandidate[] transform.
   *
   * Implementation responsibilities:
   * - Must be side-effect free.
   * - Return an empty array on parse failure; never throw.
   * - One candidate per discrete promotion found on the page.
   * - Set pageType appropriately ('landing' vs 'detail').
   */
  extractCandidates(page: FetchResult): RawPromotionCandidate[];

  /**
   * Interprets one raw candidate into structured normalized data.
   *
   * Implementation responsibilities:
   * - Partial normalization is acceptable. Omit fields that cannot be parsed
   *   rather than inventing values.
   * - May throw if normalization produces an invalid bundle shape
   *   (indicates a code bug in the normalizer, not a data issue).
   */
  normalizeCandidate(candidate: RawPromotionCandidate): NormalizedPromotionBundle;
}
