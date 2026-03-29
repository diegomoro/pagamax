import { createHash } from 'node:crypto';

/**
 * sha256Hex
 *
 * Returns the SHA-256 digest of a UTF-8 string as a lowercase hex string (64 chars).
 * Used as rawHtmlHash in RawPromotionCandidate for deduplication.
 */
export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
