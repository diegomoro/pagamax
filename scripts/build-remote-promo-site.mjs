import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const sourcePath = resolve(root, 'scraper/src/qr/promo-index.json');
const outputDir = resolve(root, 'site/promo-data');
const baseUrl = (process.env.PROMO_DATA_BASE_URL ?? 'https://pagamenos.app/promo-data').replace(/\/$/, '');
const reportPath = process.env.PROMO_REFRESH_REPORT_PATH
  ? resolve(process.env.PROMO_REFRESH_REPORT_PATH)
  : resolve(root, 'reports/promo-refresh-report.json');
const parsedMaxAgeDays = Number.parseInt(process.env.PROMO_DATA_STALE_AFTER_DAYS ?? '7', 10);
const parsedMinPromoCount = Number.parseInt(process.env.PROMO_DATA_MIN_PROMOS ?? '100', 10);
const maxAgeDays = Number.isFinite(parsedMaxAgeDays) && parsedMaxAgeDays > 0 ? parsedMaxAgeDays : 7;
const minPromoCount = Number.isFinite(parsedMinPromoCount) && parsedMinPromoCount > 0 ? parsedMinPromoCount : 100;

if (!existsSync(sourcePath)) {
  throw new Error(`Missing promo index: ${sourcePath}`);
}

const raw = readFileSync(sourcePath, 'utf8');
const promoIndex = JSON.parse(raw);
const promoCount = Array.isArray(promoIndex.promos) ? promoIndex.promos.length : 0;
if (promoCount < minPromoCount) {
  throw new Error(`Promo index has only ${promoCount} promos; expected at least ${minPromoCount}.`);
}

const generatedAt = typeof promoIndex.generated_at === 'string' && promoIndex.generated_at.length > 0
  ? promoIndex.generated_at
  : new Date().toISOString();

const version = generatedAt;
const versionSlug = version
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || new Date().toISOString().slice(0, 10);

const versionedName = `promo-index-${versionSlug}.json`;
const versionedPath = resolve(outputDir, versionedName);
const latestPath = resolve(outputDir, 'promo-index.json');
const manifestPath = resolve(outputDir, 'manifest.json');
const publishedReportPath = resolve(outputDir, 'promo-refresh-report.json');
const sha256 = createHash('sha256').update(raw).digest('hex');
const staleAfter = new Date(new Date(generatedAt).getTime() + (maxAgeDays * 24 * 60 * 60 * 1000)).toISOString();

function loadRefreshReport() {
  if (!existsSync(reportPath)) return null;
  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    return {
      status: report.status ?? 'unknown',
      completed_at: report.completed_at ?? null,
      min_successful_scrapers: report.min_successful_scrapers ?? null,
      successful_scrapers: report.successful_scrapers ?? null,
      failed_scrapers: Array.isArray(report.failed_scrapers) ? report.failed_scrapers : [],
      skipped_scrapers: Array.isArray(report.skipped_scrapers) ? report.skipped_scrapers : [],
      report_file: basename(reportPath),
    };
  } catch (caught) {
    return {
      status: 'unreadable',
      completed_at: null,
      min_successful_scrapers: null,
      successful_scrapers: null,
      failed_scrapers: [],
      skipped_scrapers: [],
      error: caught instanceof Error ? caught.message : 'Unknown report parse error',
      report_file: basename(reportPath),
    };
  }
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const refreshReport = loadRefreshReport();

writeFileSync(versionedPath, raw, 'utf8');
writeFileSync(latestPath, raw, 'utf8');
if (existsSync(reportPath)) {
  writeFileSync(publishedReportPath, readFileSync(reportPath, 'utf8'), 'utf8');
}

const manifest = {
  schema_version: 1,
  version,
  generated_at: generatedAt,
  stale_after: staleAfter,
  max_age_days: maxAgeDays,
  promo_index_url: `${baseUrl}/${versionedName}`,
  sha256,
  bytes: Buffer.byteLength(raw, 'utf8'),
  built_at: new Date().toISOString(),
  stats: promoIndex.stats ?? null,
  scraper_report: refreshReport,
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Published remote promo artifact to ${outputDir}`);
console.log(`Version: ${version}`);
console.log(`File: ${versionedName}`);
console.log(`SHA-256: ${sha256}`);
console.log(`Stale after: ${staleAfter}`);
