/**
 * DedupeBackend
 *
 * Interface for tracking which HTML hashes have already been processed
 * in the current scrape run.
 *
 * Extension note: replace InMemoryDedupeStore with a Redis, SQLite, or
 * PostgreSQL implementation to persist dedupe state across runs. The
 * DiscoveryPipeline depends only on this interface, not the implementation.
 */
export interface DedupeBackend {
  hasSeen(hash: string): Promise<boolean>;
  markSeen(hash: string): Promise<void>;
}

/**
 * InMemoryDedupeStore
 *
 * In-process Map-backed deduplication store.
 * State is lost when the process exits — suitable for single-run dedup.
 * Prevents re-normalizing pages that have not changed within one scrape run.
 */
export class InMemoryDedupeStore implements DedupeBackend {
  private seen = new Map<string, Date>();

  async hasSeen(hash: string): Promise<boolean> {
    return this.seen.has(hash);
  }

  async markSeen(hash: string): Promise<void> {
    this.seen.set(hash, new Date());
  }

  /** Returns the number of unique hashes seen so far. */
  get size(): number {
    return this.seen.size;
  }
}
