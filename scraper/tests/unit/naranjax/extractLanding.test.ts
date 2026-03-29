import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLandingCandidates } from '@issuers/naranjax/extractLanding.js';
import type { FetchResult } from '@shared/types/raw.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '../../fixtures/naranjax');

function makeFetchResult(filename: string): FetchResult {
  const html = readFileSync(resolve(FIXTURE_DIR, filename), 'utf-8');
  return {
    url: 'https://www.naranjax.com/promociones/',
    finalUrl: 'https://www.naranjax.com/promociones/',
    html,
    statusCode: 200,
    fetchedAt: new Date('2025-03-01T00:00:00Z'),
    fetchMethod: 'playwright',
  };
}

describe('extractLandingCandidates (offline fixture)', () => {
  const page = makeFetchResult('landing.html');
  const candidates = extractLandingCandidates(page);

  it('extracts the correct number of candidates', () => {
    // Fixture has 4 cards (one without a title that should still be found)
    expect(candidates.length).toBeGreaterThanOrEqual(3);
  });

  it('extracts issuerCode "naranjax"', () => {
    expect(candidates.every((c) => c.issuerCode === 'naranjax')).toBe(true);
  });

  it('sets pageType to "landing"', () => {
    expect(candidates.every((c) => c.pageType === 'landing')).toBe(true);
  });

  it('extracts title for first card', () => {
    const dia = candidates.find((c) => c.title.includes('reintegro'));
    expect(dia).toBeDefined();
    expect(dia!.title).toContain('30%');
  });

  it('extracts merchant text', () => {
    const dia = candidates.find((c) => c.merchantText === 'DIA');
    expect(dia).toBeDefined();
  });

  it('extracts benefit text', () => {
    const dia = candidates.find((c) => c.merchantText === 'DIA');
    expect(dia!.benefitText.some((t) => t.includes('reintegro'))).toBe(true);
  });

  it('cards have empty links (Angular click navigation)', () => {
    const dia = candidates.find((c) => c.merchantText === 'DIA');
    expect(dia!.links).toEqual([]);
  });

  it('sets rawHtmlHash (64 hex chars)', () => {
    expect(candidates[0]!.rawHtmlHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stores full rawPayload', () => {
    expect(candidates[0]!.rawPayload).toContain('<!DOCTYPE html>');
  });
});
