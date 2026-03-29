import type { IssuerAdapter } from '../../shared/types/adapter.js';
import type { NormalizedPromotionBundle } from '../../shared/types/normalized.js';
import type { RawPromotionCandidate } from '../../shared/types/raw.js';
import { RawPromotionCandidateSchema } from '../../shared/types/raw.js';
import type { DedupeBackend } from '../dedupe/DedupeStore.js';
import { sha256Hex } from '../../shared/utils/hash.js';
import { sleep } from '../../shared/utils/sleep.js';
import { createLogger } from '../logging/logger.js';

/**
 * OutputSink
 *
 * Where normalized bundles are written after scraping.
 * Implement this interface to write to stdout, files, PostgreSQL, etc.
 *
 * Extension note: swap implementations without changing DiscoveryPipeline.
 */
export interface OutputSink {
  write(bundle: NormalizedPromotionBundle): Promise<void>;
}

/**
 * JsonStdoutSink
 *
 * Writes each bundle as a newline-delimited JSON record to stdout.
 * Suitable for piping into a downstream processor or for debugging.
 */
export class JsonStdoutSink implements OutputSink {
  async write(bundle: NormalizedPromotionBundle): Promise<void> {
    process.stdout.write(JSON.stringify(bundle) + '\n');
  }
}

export interface RunSummary {
  issuerCode: string;
  totalDiscovered: number;
  totalExtracted: number;
  totalNormalized: number;
  skippedDedupe: number;
  skippedFetchFailed: number;
  durationMs: number;
}

/**
 * DiscoveryPipeline
 *
 * Orchestrates a full scrape run for a single issuer adapter.
 * It drives the adapter through the complete pipeline:
 *   discoverUrls → fetchPage → extractCandidates → (fetchDetail) → normalizeCandidate → sink
 *
 * The pipeline is intentionally separate from IssuerAdapter so adapters
 * remain testable in isolation. The pipeline is the runner; the adapter
 * is the strategy.
 *
 * Polite crawl delay between detail page requests is read from the adapter's
 * optional detailPageDelayMs property (default: 1000ms).
 */
export class DiscoveryPipeline {
  constructor(
    private readonly adapter: IssuerAdapter & { detailPageDelayMs?: number },
    private readonly dedupe: DedupeBackend,
    private readonly sink: OutputSink,
  ) {}

  async run(): Promise<RunSummary> {
    const log = createLogger({ issuerCode: this.adapter.issuerCode, phase: 'pipeline' });
    const startedAt = Date.now();

    const summary: Omit<RunSummary, 'durationMs'> = {
      issuerCode: this.adapter.issuerCode,
      totalDiscovered: 0,
      totalExtracted: 0,
      totalNormalized: 0,
      skippedDedupe: 0,
      skippedFetchFailed: 0,
    };

    log.info('Starting discovery');

    // Step 1: Discover all target URLs from the issuer
    const urls = await this.adapter.discoverUrls();
    summary.totalDiscovered = urls.length;
    log.info({ count: urls.length }, 'URLs discovered');

    // Step 2: For each URL, fetch → extract → normalize
    for (const url of urls) {
      log.debug({ url }, 'Fetching page');

      const page = await this.adapter.fetchPage(url);

      if (page.statusCode === 0 || page.html === '') {
        log.warn({ url }, 'Skipping: fetch returned no content');
        summary.skippedFetchFailed++;
        continue;
      }

      // Page-level dedup: skip if HTML hasn't changed
      const pageHash = sha256Hex(page.html);
      if (await this.dedupe.hasSeen(pageHash)) {
        log.debug({ url }, 'Skipping: page unchanged since last run');
        summary.skippedDedupe++;
        continue;
      }
      await this.dedupe.markSeen(pageHash);

      // Step 3: Extract candidates from this page
      const rawCandidates = this.adapter.extractCandidates(page);
      log.info({ url, count: rawCandidates.length }, 'Candidates extracted');

      // Step 4: Validate each candidate, then optionally enrich via detail page
      for (const raw of rawCandidates) {
        const validation = RawPromotionCandidateSchema.safeParse(raw);
        if (!validation.success) {
          log.warn(
            { url, issues: validation.error.issues },
            'Candidate failed validation, skipping',
          );
          continue;
        }

        const candidate: RawPromotionCandidate = validation.data;
        summary.totalExtracted++;

        // If the candidate has a detail URL and the issuer supports it,
        // fetch the detail page and produce an enriched candidate.
        const enriched = await this.fetchDetailIfAvailable(candidate, log);

        // Step 5: Normalize
        try {
          const bundle = this.adapter.normalizeCandidate(enriched);
          await this.sink.write(bundle);
          summary.totalNormalized++;
        } catch (err) {
          log.error(
            { url, error: (err as Error).message },
            'Normalization failed — this is a code bug in normalize.ts',
          );
          // Do not increment totalNormalized; continue with other candidates
        }

        // Polite crawl delay
        const delay = this.adapter.detailPageDelayMs ?? 1000;
        await sleep(delay);
      }
    }

    const result: RunSummary = {
      ...summary,
      durationMs: Date.now() - startedAt,
    };

    log.info(result, 'Run complete');
    return result;
  }

  /**
   * If the candidate has an associated detail URL, fetch and merge it.
   * Falls back to the original candidate if the detail fetch fails.
   */
  private async fetchDetailIfAvailable(
    candidate: RawPromotionCandidate,
    log: ReturnType<typeof createLogger>,
  ): Promise<RawPromotionCandidate> {
    const detailUrl = candidate.links[0];
    if (!detailUrl || candidate.pageType === 'detail') return candidate;

    // Only fetch if the detail URL differs from the source (prevents infinite loops)
    if (detailUrl === candidate.sourceUrl) return candidate;

    const detailPage = await this.adapter.fetchPage(detailUrl);
    if (detailPage.statusCode === 0 || detailPage.html === '') {
      log.warn({ detailUrl }, 'Detail page fetch failed, using landing candidate');
      return candidate;
    }

    const detailCandidates = this.adapter.extractCandidates(detailPage);
    if (detailCandidates.length === 0) return candidate;

    // Merge: detail candidate enriches the landing candidate
    const detail = detailCandidates[0]!;
    return {
      ...candidate,
      pageType: 'detail',
      subtitle: detail.subtitle ?? candidate.subtitle,
      benefitText:
        detail.benefitText.length > 0 ? detail.benefitText : candidate.benefitText,
      paymentMethodText:
        detail.paymentMethodText.length > 0
          ? detail.paymentMethodText
          : candidate.paymentMethodText,
      railText: detail.railText.length > 0 ? detail.railText : candidate.railText,
      validityText: detail.validityText ?? candidate.validityText,
      legalText: detail.legalText ?? candidate.legalText,
      rawHtmlHash: detail.rawHtmlHash,
      rawPayload: detail.rawPayload,
      extractedAt: detail.extractedAt,
    };
  }
}
