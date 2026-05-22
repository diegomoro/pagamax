import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const sourcePath = resolve(root, 'scraper/src/qr/promo-index.json');
const outputDir = resolve(root, 'site/promo-data');
const baseUrl = (process.env.PROMO_DATA_BASE_URL ?? 'https://diegomoro.github.io/pagamax/promo-data').replace(/\/$/, '');

if (!existsSync(sourcePath)) {
  throw new Error(`Missing promo index: ${sourcePath}`);
}

const raw = readFileSync(sourcePath, 'utf8');
const promoIndex = JSON.parse(raw);
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
const sha256 = createHash('sha256').update(raw).digest('hex');

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

writeFileSync(versionedPath, raw, 'utf8');
writeFileSync(latestPath, raw, 'utf8');

const manifest = {
  version,
  generated_at: generatedAt,
  promo_index_url: `${baseUrl}/${versionedName}`,
  sha256,
  built_at: new Date().toISOString(),
  stats: promoIndex.stats ?? null,
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Published remote promo artifact to ${outputDir}`);
console.log(`Version: ${version}`);
console.log(`File: ${versionedName}`);
