/**
 * One-off post-processor: applies terms-based cashback override to the existing MODO output.
 * Reads modo-2026-03-24.ndjson, corrects discount_type, writes in place.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODO_PATH = path.join(__dirname, '..', 'output_modo_final', 'modo-2026-03-24.ndjson');

const CASHBACK_TERMS_RE =
  /descuento\s+v[ií]a\s+reintegro|reintegro\s+a\s+realizarse|se\s+acreditar[áa]\s+en\s+(la\s+)?(caja\s+de\s+ahorro|cuenta)|tope\s+de\s+reintegro\s+(semanal|mensual|por\s+(transacci[oó]n|cliente))/i;

const lines = fs.readFileSync(MODO_PATH, 'utf-8').trim().split('\n');
let fixed = 0;

const out = lines.map(l => {
  const row = JSON.parse(l) as Record<string, unknown>;
  if (
    row['discount_type'] === 'discount_percentage' &&
    typeof row['terms_text_raw'] === 'string' &&
    CASHBACK_TERMS_RE.test(row['terms_text_raw'])
  ) {
    row['discount_type'] = 'cashback_percentage';
    fixed++;
  }
  return JSON.stringify(row);
});

fs.writeFileSync(MODO_PATH, out.join('\n') + '\n');
console.log(`Fixed ${fixed} / ${lines.length} MODO rows: discount_percentage → cashback_percentage`);
