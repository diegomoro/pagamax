import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const DEFAULT_MANIFEST_URL = 'https://pagamenos.app/promo-data/manifest.json';
const manifestRef = process.argv[2] ?? DEFAULT_MANIFEST_URL;
const minPromoCount = parsePositiveInteger(process.env.PROMO_DATA_MIN_PROMOS, 100);
const allowStale = process.env.PROMO_DATA_ALLOW_STALE === '1';

function parsePositiveInteger(raw, fallback) {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

async function readText(ref) {
  if (isUrl(ref)) {
    const response = await fetch(ref);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${ref}`);
    return response.text();
  }

  if (!existsSync(ref)) throw new Error(`Missing file: ${ref}`);
  return readFileSync(ref, 'utf8');
}

function resolvePromoIndexRef(manifest, sourceRef) {
  if (!manifest.promo_index_url || typeof manifest.promo_index_url !== 'string') {
    throw new Error('Manifest missing promo_index_url.');
  }

  if (isUrl(sourceRef)) {
    return new URL(manifest.promo_index_url, sourceRef).toString();
  }

  if (isUrl(manifest.promo_index_url)) {
    return resolve(dirname(sourceRef), basename(new URL(manifest.promo_index_url).pathname));
  }

  return resolve(dirname(sourceRef), manifest.promo_index_url);
}

function assertSha256(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value.trim())) {
    throw new Error('Manifest missing valid sha256.');
  }
  return value.trim().toLowerCase();
}

async function main() {
  const manifestText = await readText(manifestRef);
  const manifest = JSON.parse(manifestText);
  const expectedSha256 = assertSha256(manifest.sha256);
  const promoIndexRef = resolvePromoIndexRef(manifest, manifestRef);
  const promoIndexText = await readText(promoIndexRef);
  const actualSha256 = createHash('sha256').update(promoIndexText).digest('hex');

  if (actualSha256 !== expectedSha256) {
    throw new Error(`SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  }

  const promoIndex = JSON.parse(promoIndexText);
  const promoCount = Array.isArray(promoIndex.promos) ? promoIndex.promos.length : 0;
  if (promoCount < minPromoCount) {
    throw new Error(`Promo count ${promoCount} is below minimum ${minPromoCount}.`);
  }

  const staleAfter = typeof manifest.stale_after === 'string' ? new Date(manifest.stale_after) : null;
  if (!staleAfter || Number.isNaN(staleAfter.getTime())) {
    throw new Error('Manifest missing valid stale_after.');
  }
  if (!allowStale && staleAfter.getTime() < Date.now()) {
    throw new Error(`Promo data is stale: stale_after=${manifest.stale_after}`);
  }

  const report = {
    checked_at: new Date().toISOString(),
    manifest: manifestRef,
    promo_index: promoIndexRef,
    version: manifest.version ?? null,
    generated_at: manifest.generated_at ?? null,
    stale_after: manifest.stale_after,
    sha256: actualSha256,
    promo_count: promoCount,
    scraper_status: manifest.scraper_report?.status ?? 'unknown',
    failed_scrapers: manifest.scraper_report?.failed_scrapers ?? [],
    skipped_scrapers: manifest.scraper_report?.skipped_scrapers ?? [],
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((caught) => {
  const message = caught instanceof Error ? caught.message : String(caught);
  console.error(`[promo-health] ${message}`);
  process.exit(1);
});
