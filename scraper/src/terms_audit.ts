/**
 * Terms accuracy audit — Supermercados + Combustible rows
 * Checks stored values against terms_text_raw
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NDJSON_PATH = path.join(__dirname, '..', 'output_consolidated', 'pagamax-2026-03-24.ndjson');

const TARGET_CATEGORIES = new Set(['Supermercados', 'Combustible']);
const AUDIT_CATEGORIES = ['Supermercados', 'Combustible'];

// ── Day regex ───────────────────────────────────────────────────────────────
const DAY_PATTERNS: Array<[RegExp, string]> = [
  [/\blunes\b/i,         'monday'],
  [/\bmartes\b/i,        'tuesday'],
  [/\bmi[eé]rcoles\b/i,  'wednesday'],
  [/\bjueves\b/i,        'thursday'],
  [/\bviernes\b/i,       'friday'],
  [/\bs[aá]bados?\b/i,   'saturday'],
  [/\bdomingos?\b/i,     'sunday'],
];

// Strip context lines that mention days for non-promo reasons:
// - Customer service hours: "LUNES A VIERNES DE 8 A 24HS Y SABADOS, DOMINGOS..."
// - Week-calculation periods: "LUNES A DOMINGOS", "de lunes a domingos"
// - Range expressions: "de lunes a viernes" (Mon-Fri is the full weekday range, not just Mon/Fri)
function stripAmbiguousDayContext(text: string): string {
  // Remove lines containing hotline hours ("8 A 24HS", "10 A 18HS", "TEL", "0800")
  const lines = text.split(/\n|(?<=\.)(?=\s*[A-ZÁÉÍÓÚÑ])/);
  return lines.filter(l => !/(?:8\s+a\s+24hs|10\s+a\s+18hs|0800\s+\d|\btel[eé]fono\b|lunes\s+a\s+domingos|entre\s+los\s+d[ií]as\s+lunes\s+y\s+domingo|de\s+lunes\s+a\s+viernes)/i.test(l)).join(' ');
}

function daysFromText(text: string): string[] {
  const cleaned = stripAmbiguousDayContext(text);
  return DAY_PATTERNS.filter(([re]) => re.test(cleaned)).map(([, d]) => d);
}

// ── Cap extraction ──────────────────────────────────────────────────────────
function capsFromText(text: string): number[] {
  // Matches patterns like "$2000", "$ 1.500", "2000 pesos", "hasta $500"
  const caps: number[] = [];
  const matches = text.matchAll(/\$\s?([\d.,]+(?:\.\d{3})*)/g);
  for (const m of matches) {
    const n = parseFloat(m[1]!.replace(/\./g, '').replace(',', '.'));
    if (!isNaN(n) && n >= 100 && n <= 100000) caps.push(n);
  }
  return [...new Set(caps)];
}

// ── Percent extraction ──────────────────────────────────────────────────────
function percentsFromText(text: string): number[] {
  const pcts: number[] = [];
  const matches = text.matchAll(/(\d+)\s*%/g);
  for (const m of matches) {
    const n = parseInt(m[1]!);
    if (n > 0 && n <= 100) pcts.push(n);
  }
  return [...new Set(pcts)];
}

interface AuditIssue {
  merchant_name: string;
  issuer: string;
  category: string;
  promo_id: string;
  field: string;
  stored: unknown;
  found_in_terms: unknown;
  severity: 'HIGH' | 'LOW';
  terms_excerpt: string;
}

function excerpt(text: string, around: string, window = 80): string {
  const idx = text.toLowerCase().indexOf(around.toLowerCase());
  if (idx === -1) return text.slice(0, 100);
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + window);
  return '...' + text.slice(start, end).replace(/\n+/g, ' ') + '...';
}

// ── Main ────────────────────────────────────────────────────────────────────
const rows: Record<string, unknown>[] = fs
  .readFileSync(NDJSON_PATH, 'utf-8')
  .trim()
  .split('\n')
  .map(l => JSON.parse(l));

const targetRows = rows.filter(r => TARGET_CATEGORIES.has(String(r['category'] ?? '')));
console.log(`\nAuditing ${targetRows.length} rows (categories: ${AUDIT_CATEGORIES.join(', ')})\n`);

const issues: AuditIssue[] = [];

for (const row of targetRows) {
  const terms: string = String(row['terms_text_raw'] ?? '');
  if (!terms || terms.length < 20) continue;

  const termsLower = terms.toLowerCase();
  const merchant = String(row['merchant_name'] ?? '');
  const issuer = String(row['issuer'] ?? '');
  const cat = String(row['category'] ?? '');
  const id = String(row['promo_id'] ?? row['id'] ?? '?');
  const discType = String(row['discount_type'] ?? '');
  const storedPct = row['discount_percent'] != null ? Number(row['discount_percent']) : null;
  const storedCap = row['cap_amount_ars'] != null ? Number(row['cap_amount_ars']) : null;
  const storedDayRaw = String(row['day_pattern'] ?? '');

  // 1. Cashback type check
  // Use precise patterns to avoid false positives on "sin tope de reintegro" (= no-cap direct discount).
  // "descuento via reintegro", "reintegro a realizarse", "se acreditará en la caja de ahorro",
  // and "tope de reintegro semanal/mensual/por transacción" are unambiguous cashback indicators.
  const hasCashbackKeyword =
    /descuento\s+v[ií]a\s+reintegro|reintegro\s+a\s+realizarse|se\s+acreditar[áa]\s+en\s+(la\s+)?(caja\s+de\s+ahorro|cuenta)|tope\s+de\s+reintegro\s+(semanal|mensual|por\s+(transacci[oó]n|cliente))/i
      .test(terms);
  if (hasCashbackKeyword && discType === 'direct_discount') {
    issues.push({
      merchant_name: merchant, issuer, category: cat, promo_id: id,
      field: 'discount_type',
      stored: 'direct_discount',
      found_in_terms: 'cashback (reintegro/devolucion keyword)',
      severity: 'HIGH',
      terms_excerpt: excerpt(terms, 'reintegro'),
    });
  }
  // Also flag if stored=cashback but terms have no cashback indicator AND have clear at-POS signal.
  // "en caja de ahorro" = savings account (false positive), only match "en caja al momento".
  // Must not have deferred-credit language (se acreditará dentro de X días) which overrides.
  if (!hasCashbackKeyword && discType === 'cashback' && storedPct != null) {
    const hasAtPos = /en\s+caja\s+al\s+momento|aplicado\s+de\s+manera\s+directa/i.test(terms);
    const hasDeferredCredit = /se\s+acreditar[áa]\s+dentro\s+de\s+los\s+\d+|bonificaci[oó]n\s+se\s+acreditar[aá]\s+dentro/i.test(terms);
    if (hasAtPos && !hasDeferredCredit) {
      issues.push({
        merchant_name: merchant, issuer, category: cat, promo_id: id,
        field: 'discount_type',
        stored: 'cashback',
        found_in_terms: 'direct_discount (en caja al momento / directa)',
        severity: 'HIGH',
        terms_excerpt: excerpt(terms, 'en caja'),
      });
    }
  }

  // 2. Discount percent check
  const foundPcts = percentsFromText(terms);
  if (storedPct != null && foundPcts.length > 0 && !foundPcts.includes(storedPct)) {
    // Only flag if stored pct not found anywhere in terms
    issues.push({
      merchant_name: merchant, issuer, category: cat, promo_id: id,
      field: 'discount_pct',
      stored: storedPct,
      found_in_terms: foundPcts,
      severity: 'HIGH',
      terms_excerpt: excerpt(terms, '%'),
    });
  }

  // 3. Days check (consolidated field is day_pattern)
  const foundDays = daysFromText(terms);
  if (foundDays.length > 0 && foundDays.length < 7) {
    if (!storedDayRaw || storedDayRaw === 'everyday') {
      issues.push({
        merchant_name: merchant, issuer, category: cat, promo_id: id,
        field: 'day_pattern',
        stored: storedDayRaw || 'everyday',
        found_in_terms: foundDays,
        severity: 'HIGH',
        terms_excerpt: excerpt(terms, foundDays[0]!),
      });
    } else {
      const storedSet = new Set(storedDayRaw.split(/;\s*/));
      const missing = foundDays.filter(d => !storedSet.has(d));
      const extra = [...storedSet].filter(d => !foundDays.includes(d));
      if (missing.length > 0 || extra.length > 0) {
        issues.push({
          merchant_name: merchant, issuer, category: cat, promo_id: id,
          field: 'day_pattern',
          stored: storedDayRaw,
          found_in_terms: foundDays.join('; '),
          severity: 'HIGH',
          terms_excerpt: excerpt(terms, foundDays[0]!),
        });
      }
    }
  }

  // 4. Cap check
  const foundCaps = capsFromText(terms);
  if (storedCap != null && foundCaps.length > 0) {
    // Stored cap should appear in the caps found
    const closestCap = foundCaps.reduce((prev, curr) =>
      Math.abs(curr - storedCap) < Math.abs(prev - storedCap) ? curr : prev);
    if (Math.abs(closestCap - storedCap) > 1) {
      issues.push({
        merchant_name: merchant, issuer, category: cat, promo_id: id,
        field: 'max_discount_amount',
        stored: storedCap,
        found_in_terms: foundCaps,
        severity: 'HIGH',
        terms_excerpt: excerpt(terms, '$'),
      });
    }
  }

  // 5. QR/rails check (instrument_required field in consolidated output)
  const instrument = String(row['instrument_required'] ?? '');
  if (instrument === 'qr_wallet' &&
      (termsLower.includes('transferencias 3.0') || termsLower.includes('qr/pei'))) {
    issues.push({
      merchant_name: merchant, issuer, category: cat, promo_id: id,
      field: 'instrument_required',
      stored: instrument,
      found_in_terms: 'Terms exclude QR (Transferencias 3.0 / QR/PEI)',
      severity: 'HIGH',
      terms_excerpt: excerpt(terms, 'transferencias'),
    });
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
const high = issues.filter(i => i.severity === 'HIGH');

console.log(`=== TERMS ACCURACY AUDIT — pagamax-2026-03-24.ndjson ===\n`);
console.log(`Target rows : ${targetRows.length}`);
console.log(`Issues found: ${issues.length} (HIGH: ${high.length})\n`);

// Group by field
const byField: Record<string, AuditIssue[]> = {};
for (const iss of issues) {
  (byField[iss.field] ??= []).push(iss);
}

for (const [field, list] of Object.entries(byField)) {
  console.log(`\n── ${field} (${list.length} issues) ────────────────────────────`);
  for (const iss of list) {
    console.log(`  [${iss.issuer}] ${iss.merchant_name}`);
    console.log(`    stored   : ${JSON.stringify(iss.stored)}`);
    console.log(`    in terms : ${JSON.stringify(iss.found_in_terms)}`);
    console.log(`    excerpt  : ${iss.terms_excerpt.slice(0, 150)}`);
  }
}

if (issues.length === 0) {
  console.log('No issues found — all checked fields match terms.\n');
}

// Save JSON report
const reportPath = path.join(__dirname, '..', 'output_consolidated', 'terms-audit-2026-03-24.json');
fs.writeFileSync(reportPath, JSON.stringify({ total_rows: targetRows.length, issues }, null, 2));
console.log(`\nFull report saved to: ${reportPath}`);
