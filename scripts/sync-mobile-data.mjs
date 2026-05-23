import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const mobileHotMerchantCount = Number.parseInt(process.env.MOBILE_HOT_MERCHANT_COUNT ?? '250', 10);
const alwaysIncludeMerchants = [
  'jumbo',
  'farmacity',
  'ypf',
  'carrefour',
  'vea',
  'fravega',
  'samsung',
  'dexter',
  'shellbox',
  'movistararena',
];

const sources = [
  {
    from: resolve(root, 'scraper/src/qr/promo-index.json'),
    to: resolve(root, 'app/assets/data/promo-index.json'),
  },
  {
    from: resolve(root, 'scraper/src/recommendation/demo-methods.example.json'),
    to: resolve(root, 'app/assets/data/default-methods.json'),
  },
];

for (const entry of sources) {
  if (!existsSync(entry.from)) {
    throw new Error(`Missing source asset: ${entry.from}`);
  }
  mkdirSync(dirname(entry.to), { recursive: true });
  cpSync(entry.from, entry.to, { force: true });
}

const promoIndexTextPath = resolve(root, 'app/assets/data/promo-index.bundle.txt');
const promoIndexJsonPath = resolve(root, 'app/assets/data/promo-index.json');
const fullPromoIndex = JSON.parse(readFileSync(promoIndexJsonPath, 'utf8'));

function remapIndex(index, idMap) {
  return Object.fromEntries(
    Object.entries(index ?? {})
      .map(([key, promoIds]) => [
        key,
        promoIds
          .filter((promoId) => idMap.has(promoId))
          .map((promoId) => idMap.get(promoId)),
      ])
      .filter(([, promoIds]) => promoIds.length > 0),
  );
}

function buildMobileHotPromoIndex(promoIndex) {
  const selectedNames = new Set(alwaysIncludeMerchants);
  const topNames = Object.entries(promoIndex.by_name ?? {})
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, mobileHotMerchantCount);

  for (const [name] of topNames) selectedNames.add(name);

  const selectedPromoIds = new Set(promoIndex.general ?? []);
  for (const name of selectedNames) {
    for (const promoId of promoIndex.by_name?.[name] ?? []) {
      selectedPromoIds.add(promoId);
    }
  }

  const sortedPromoIds = [...selectedPromoIds].sort((left, right) => left - right);
  const idMap = new Map(sortedPromoIds.map((promoId, nextPromoId) => [promoId, nextPromoId]));
  const promos = sortedPromoIds.map((promoId) => promoIndex.promos[promoId]);
  const byCuit = remapIndex(promoIndex.by_cuit, idMap);
  const cuitToName = Object.fromEntries(
    Object.keys(byCuit).map((cuit) => [cuit, promoIndex.cuit_to_name?.[cuit] ?? '']),
  );

  return {
    ...promoIndex,
    source: `${promoIndex.source ?? 'promo-index'} mobile-hot-subset`,
    stats: {
      ...promoIndex.stats,
      indexed: promos.length,
      total_unique_promos: promos.length,
      names_with_promos: Object.keys(remapIndex(promoIndex.by_name, idMap)).length,
      cuits_with_promos: Object.keys(byCuit).length,
    },
    promos,
    by_cuit: byCuit,
    by_name: remapIndex(promoIndex.by_name, idMap),
    by_category: remapIndex(promoIndex.by_category, idMap),
    general: (promoIndex.general ?? [])
      .filter((promoId) => idMap.has(promoId))
      .map((promoId) => idMap.get(promoId)),
    cuit_to_name: cuitToName,
  };
}

const mobilePromoIndex = buildMobileHotPromoIndex(fullPromoIndex);
writeFileSync(promoIndexTextPath, JSON.stringify(mobilePromoIndex), 'utf8');

console.log('Synced mobile promo data assets');
console.log(`Mobile bundle promos: ${mobilePromoIndex.promos.length}`);
console.log(`Mobile bundle bytes: ${Buffer.byteLength(JSON.stringify(mobilePromoIndex))}`);
