import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

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
writeFileSync(promoIndexTextPath, readFileSync(promoIndexJsonPath, 'utf8'), 'utf8');

console.log('Synced mobile promo data assets');
