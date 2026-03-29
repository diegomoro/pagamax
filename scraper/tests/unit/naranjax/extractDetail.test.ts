import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDetailCandidates } from '@issuers/naranjax/extractDetail.js';
import type { FetchResult } from '@shared/types/raw.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '../../fixtures/naranjax');

function makeFetchResult(filename: string, url: string): FetchResult {
  const html = readFileSync(resolve(FIXTURE_DIR, filename), 'utf-8');
  return {
    url,
    finalUrl: url,
    html,
    statusCode: 200,
    fetchedAt: new Date('2025-03-01T00:00:00Z'),
    fetchMethod: 'playwright',
  };
}

describe('extractDetailCandidates (offline fixture)', () => {
  const detailUrl = 'https://www.naranjax.com/promociones/30-reintegro-dia-qr';
  const page = makeFetchResult('detail-sample.html', detailUrl);
  const candidates = extractDetailCandidates(page);

  it('returns exactly one candidate for a detail page', () => {
    expect(candidates).toHaveLength(1);
  });

  it('sets pageType to "detail"', () => {
    expect(candidates[0]!.pageType).toBe('detail');
  });

  it('extracts the title', () => {
    expect(candidates[0]!.title).toContain('30%');
    expect(candidates[0]!.title.toLowerCase()).toContain('reintegro');
  });

  it('extracts the subtitle', () => {
    expect(candidates[0]!.subtitle).toBeDefined();
    expect(candidates[0]!.subtitle!.toLowerCase()).toContain('dia');
  });

  it('extracts validity text', () => {
    expect(candidates[0]!.validityText).toBeDefined();
    expect(candidates[0]!.validityText).toContain('marzo');
  });

  it('extracts legal text from <details>', () => {
    expect(candidates[0]!.legalText).toBeDefined();
    expect(candidates[0]!.legalText).toContain('72 horas');
  });

  it('extracts benefit text', () => {
    expect(candidates[0]!.benefitText.length).toBeGreaterThan(0);
    expect(candidates[0]!.benefitText.some((t) => t.includes('30%'))).toBe(true);
  });

  it('sets rawHtmlHash', () => {
    expect(candidates[0]!.rawHtmlHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('sourceUrl matches detail URL', () => {
    expect(candidates[0]!.sourceUrl).toBe(detailUrl);
  });
});
