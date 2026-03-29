#!/usr/bin/env node
/**
 * consolidate.ts — Unified Pagamax dataset builder
 *
 * Reads the latest NDJSON output from each issuer scraper and maps every
 * record to the shared CanonicalPromo schema.
 *
 * Usage:
 *   npx tsx src/consolidate.ts [--out ./output_consolidated] [--active-only] [--today 2026-03-18]
 *
 * Output:
 *   pagamax-YYYY-MM-DD.ndjson   — one JSON object per line, all issuers
 *   pagamax-YYYY-MM-DD.csv      — same, flat CSV
 *   pagamax-YYYY-MM-DD-audit.json
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CanonicalPromo, Issuer } from './shared/types/canonical.js';
import { CANONICAL_COLS } from './shared/types/canonical.js';
import { computeScores } from './shared/scoring.js';

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const getArg     = (f: string, d: string) => { const i = args.indexOf(f); return i !== -1 && args[i+1] ? args[i+1]! : d; };
const outDir     = resolve(getArg('--out', './output_consolidated'));
const activeOnly = args.includes('--active-only');
const TODAY      = getArg('--today', new Date().toISOString().slice(0, 10));
const MAX_SOURCE_AGE_DAYS = parseInt(getArg('--max-age-days', '7'));

mkdirSync(outDir, { recursive: true });

// ─── Issuer source discovery ──────────────────────────────────────────────────

const ISSUER_DIRS: Record<Issuer, { dir: string; prefix: string }> = {
  naranjax:       { dir: 'output_naranjax',       prefix: 'naranjax' },
  modo:           { dir: 'output_modo_final',      prefix: 'modo' },
  bbva:           { dir: 'output_bbva',            prefix: 'bbva' },
  mercadopago:    { dir: 'output_mp',              prefix: 'mercadopago' },
  personalpay:    { dir: 'output_pp',              prefix: 'personalpay' },
  uala:           { dir: 'output_uala',            prefix: 'uala' },
  cuentadni:      { dir: 'output_cuentadni',       prefix: 'cuentadni' },
  ypf:            { dir: 'output_ypf',             prefix: 'ypf' },
  shellbox:       { dir: 'output_shellbox',        prefix: 'shellbox' },
  carrefour_bank: { dir: 'output_carrefour_bank',  prefix: 'carrefour_bank' },
};

/** Find the alphabetically latest NDJSON for an issuer (date-stamped filenames sort correctly). */
function findLatestNdjson(issuer: Issuer): string | null {
  const { dir, prefix } = ISSUER_DIRS[issuer];
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.ndjson') && !f.includes('artifact') && !f.includes('raw'))
    .sort();
  return files.length > 0 ? join(dir, files[files.length - 1]!) : null;
}

function readNdjson(path: string): Record<string, unknown>[] {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>);
}

/** Warn if a source file is older than MAX_SOURCE_AGE_DAYS. Returns age in days. */
function checkSourceAge(filePath: string, issuer: string): number {
  const ageDays = (Date.now() - statSync(filePath).mtimeMs) / 86_400_000;
  if (ageDays > MAX_SOURCE_AGE_DAYS) {
    process.stderr.write(`  [WARN] ${issuer}: source file is ${ageDays.toFixed(1)} days old (>${MAX_SOURCE_AGE_DAYS}d) — consider re-scraping\n`);
  }
  return ageDays;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function freshness(validFrom: string, validTo: string, isActive: unknown): string {
  if (isActive === false) return 'expired';
  if (validTo && validTo < TODAY) return 'expired';
  if (validFrom && validFrom > TODAY) return 'future';
  if (validTo) return 'active';
  // No valid_to but live API confirmed active (e.g. MP benefits hub)
  if (isActive === true) return 'active';
  return 'unknown';
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) || n <= 0 ? null : n;
}

/** Normalize channel strings across issuers */
function normChannel(raw: string): CanonicalPromo['channel'] {
  const lc = raw.toLowerCase();
  if (lc === 'in-store' || lc === 'in_store') return 'in-store';
  if (lc === 'online')  return 'online';
  if (lc === 'mixed' || lc === 'both') return 'mixed';
  return 'unknown';
}

/** Normalize rail strings */
function normRail(raw: string): CanonicalPromo['rail'] {
  const lc = raw.toLowerCase();
  if (lc.includes('qr')) return 'qr';
  if (lc.includes('nfc')) return 'nfc';
  if (lc.includes('online') || lc.includes('web')) return 'online';
  if (lc.includes('card') || lc.includes('tarjeta')) return 'card';
  if (lc.includes('debit') || lc.includes('direct')) return 'direct_debit';
  return 'unknown';
}

/** First rail from semicolon-separated list */
function primaryRail(raw: string): CanonicalPromo['rail'] {
  if (!raw) return 'unknown';
  const first = raw.split(';')[0]!.trim();
  return normRail(first);
}

/** Normalize discount_type */
function normDiscType(raw: string): CanonicalPromo['discount_type'] {
  const lc = raw.toLowerCase();
  if (lc.includes('cashback') || lc === 'reimbursement') return 'cashback';
  if (lc.includes('installment') || lc.includes('cuota') || lc === 'installments') return 'installments';
  if (lc.includes('coupon') || lc.includes('cupon')) return 'coupon_discount';
  if (lc.includes('direct') || lc === 'discount_percentage') return 'direct_discount';
  if (lc === 'payment_promotion') return 'coupon_discount'; // MODO generic benefit (no stated discount)
  return 'unknown';
}

/** Normalize day pattern */
function normDays(raw: string): string {
  if (!raw) return 'everyday';
  const lc = raw.toLowerCase().trim();
  if (!lc || lc === 'todos los días' || lc === 'all' || lc === 'everyday') return 'everyday';
  return lc;
}

/**
 * MODO instrument_required from allowed_rails + card_types.
 * QR rail always means qr_wallet (MODO QR backed by bank card).
 * Online-only rail maps to credit_card / debit_card / any based on card_types.
 */
function modoInstrument(rails: string, cardTypes: string): CanonicalPromo['instrument_required'] {
  if (rails.includes('qr')) return 'qr_wallet';
  if (rails.includes('online') || rails.includes('web')) {
    const ct = cardTypes.toLowerCase();
    if (ct.includes('credito') && ct.includes('debito')) return 'any';
    if (ct.includes('credito')) return 'credit_card';
    if (ct.includes('debito')) return 'debit_card';
    return 'any';
  }
  return 'card';
}

/** Stub scores — overwritten by computeScores() in the main loop. */
const SCORE_STUBS = {
  data_quality_score:  0,
  issuer_reliability:  0,
  routing_confidence:  0,
  potential_value_ars: null as number | null,
  routing_ltv:         null as number | null,
};

/**
 * Extract exclusion sentences from raw T&C text.
 * Captures sentences containing "excluye/no incluye/no aplica/no válido/excepto"
 * so the routing engine can surface the constraint without parsing free text.
 */
function extractExclusionText(terms: string): string {
  if (!terms || terms.length < 10) return '';
  // Split on sentence boundaries (period, semicolon) and keep exclusion clauses
  const sentences = terms.split(/[.;]\s+/);
  const EXCL = /exclu(ye|ido|ida|sión)|no\s+incluye|no\s+aplica|no\s+válido|no\s+valido|excepto|salvo\s+que|no\s+acumul/i;
  return sentences
    .filter(s => EXCL.test(s))
    .map(s => s.trim())
    .filter(s => s.length > 5 && s.length < 300)
    .join('. ');
}

/** Ensure instrument_required is a valid single enum value, not a composite string. */
function safeInstrument(raw: string): CanonicalPromo['instrument_required'] {
  const VALID = new Set(['credit_card','debit_card','prepaid_card','qr_wallet','any','unknown']);
  if (VALID.has(raw)) return raw as CanonicalPromo['instrument_required'];
  // Composite like "credit_card; debit_card" → any
  if (raw.includes(';') || raw.includes(',')) return 'any';
  return 'unknown';
}

// ─── Canonical category taxonomy ─────────────────────────────────────────────
//
// Canonical set: Supermercados | Gastronomía | Farmacia | Indumentaria |
//   Tecnología | Entretenimiento | Combustible | Viajes | Educación | Salud |
//   Deporte | Hogar | Transporte | Automotor | Otro

/** Map issuer-native category strings to the canonical vocabulary. */
const CATEGORY_NORM: Record<string, string> = {
  // Supermercados
  'supermercados': 'Supermercados', 'supermercado': 'Supermercados', 'alimentos': 'Supermercados',
  // Gastronomía
  'gastronomía': 'Gastronomía', 'gastronomia': 'Gastronomía', 'fast food': 'Gastronomía',
  'delivery': 'Gastronomía', 'heladerías': 'Gastronomía', 'heladerias': 'Gastronomía',
  'restaurantes': 'Gastronomía',
  // Farmacia / Salud
  'farmacia': 'Farmacia', 'salud': 'Salud', 'salud y belleza': 'Salud',
  'belleza y cuidado': 'Salud',
  // Indumentaria / Moda
  'indumentaria': 'Indumentaria', 'moda': 'Indumentaria',
  'moda y accesorios': 'Indumentaria', 'calzado': 'Indumentaria',
  // Tecnología
  'tecnología': 'Tecnología', 'tecnologia': 'Tecnología',
  'electrónica': 'Tecnología', 'electronica': 'Tecnología',
  'electro y tecno': 'Tecnología', 'electro y tecnología': 'Tecnología',
  // Entretenimiento
  'entretenimiento': 'Entretenimiento', 'cines': 'Entretenimiento',
  'compras': 'Entretenimiento',
  // Combustible
  'combustible': 'Combustible',
  // Viajes
  'viajes': 'Viajes', 'turismo': 'Viajes', 'viajes y turismo': 'Viajes',
  'paseos y viajes': 'Viajes',
  // Educación
  'educación': 'Educación', 'educacion': 'Educación', 'educación ': 'Educación',
  'educación / deporte': 'Educación', 'librerías': 'Educación', 'librerias': 'Educación',
  // Deporte
  'deporte': 'Deporte', 'deportes': 'Deporte',
  // Hogar
  'hogar y construcción': 'Hogar', 'hogar y construccion': 'Hogar', 'hogar': 'Hogar',
  'hogar y deco': 'Hogar', 'construcción': 'Hogar', 'construccion': 'Hogar',
  'infantil': 'Hogar', 'juguetería': 'Hogar', 'jugueteria': 'Hogar',
  // Transporte
  'transporte': 'Transporte', 'transportes': 'Transporte',
  'recargas': 'Transporte', 'qr / pagos': 'Transporte',
  'pago de servicios': 'Transporte',
  // Automotor
  'automotor': 'Automotor', 'autos y motos': 'Automotor',
  // Salud extendida (NaranjaX)
  'salud y bienestar': 'Salud',
  // Mascotas & Servicios → Otro
  'mascotas': 'Otro', 'servicios': 'Otro',
  // Catch-all
  'varios': 'Otro', 'otro': 'Otro', 'otros': 'Otro', 'other': 'Otro', '': 'Otro',
};

function normCategory(raw: string): string {
  const key = raw.trim().toLowerCase();
  return CATEGORY_NORM[key] ?? '';  // '' = unknown issuer category, fall through to inference
}

const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/supermercado|carrefour|walmart|coto|\bdia\b|jumbo|disco|vea|vivot|chango|lalala|ahorro|diarco|changomas|jumbo|walmart/i, 'Supermercados'],
  [/farmaci|drogueria|farmacity|selma|laboratorio/i, 'Farmacia'],
  [/\bsalud\b|clinica|hospital|medico|medica|optica|óptica|odontolog|cosmetic|belleza|nutrici/i, 'Salud'],
  [/ypf|shell|axion|puma\s*energy|petro\s*nac|combustible/i, 'Combustible'],
  [/restaurant|burger|mcdonald|mostaza|starbucks|rappi|pedido|delivery|gastrono|sushi|pizza|heladeria|helados|chungo|freddo|bakery|panaderia|cafeteria|havanna|manolo|the food market/i, 'Gastronomía'],
  [/aerol|hotel|despegar|booking|vuelo|viaje|turismo|airbnb|almundo/i, 'Viajes'],
  [/\bcine\b|netflix|spotify|disney|entreteni|teatro|musica|hoyts|cinemark|show|arena/i, 'Entretenimiento'],
  [/ropa|indumentaria|zara|h&m|adidas|nike|gap|sportline|lacoste|levis|puma\b|moda\b|jean|calzado|zapatilla|shoe|tenis\b|on city|47 street|get the look|parfumerie|simplicity/i, 'Indumentaria'],
  [/samsung|apple|fravega|musimundo|garbar|ribeiro|celular|\btv\b|televisor|notebook|computadora|electronica|tech|digital|megatone|naldo|casa del audio/i, 'Tecnología'],
  [/educac|coderhouse|uala.*bis|\bubi\b|universidad|gimnasio|gym\b|fitness|deporte|sport.?club|yoga|pilates/i, 'Educación'],
  [/uber|cabify|colectivo|subte|sube|metro|peaje|transporte|taxi|tren\b/i, 'Transporte'],
  [/automotor|nafta|lubric|repuesto|taller|neumati|lavadero/i, 'Automotor'],
  [/mueble|hogar|construccion|ferreteria|pinturer|decoracion|bebe\b|pañal|juguete|infantil|essen\b/i, 'Hogar'],
  [/makro|cooperativa obrera|la anonima\b/i, 'Supermercados'],
  [/farmacity|farmaonline|farmacity|farma\b/i, 'Farmacia'],
];

function inferCategory(title: string, merchant: string, existing: string): string {
  // 1. Normalize issuer's own category first
  const normed = normCategory(existing);
  if (normed && normed !== 'Otro') return normed;

  // 2. Keyword inference from merchant name + promo title
  const text = (merchant + ' ' + title).toLowerCase();
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return cat;
  }

  // 3. If issuer said 'Otro/Otros' and inference failed, return 'Otro'
  return 'Otro';
}

// ─── Per-issuer mappers ───────────────────────────────────────────────────────

function mapModo(r: Record<string, unknown>): CanonicalPromo | null {
  // Skip malformed artifact rows: no allowed_rails AND promo_title looks like a raw slug
  if (!str(r['allowed_rails']) && /^[a-z0-9-]{15,}$/.test(str(r['promo_title']))) return null;

  const discType = normDiscType(str(r['discount_type']));
  const channel  = normChannel(str(r['channel']));
  const rails    = str(r['allowed_rails']);
  const cardTypes = str(r['card_types']);
  const isActive = r['is_active'] !== false && r['calculated_status'] !== 'finished';
  const vf = str(r['valid_from']), vt = str(r['valid_to']);
  // 'where' field is the canonical merchant name in MODO data (e.g. "Look", "Megatone").
  // Falls back to promo_title only when where is empty.
  const merchant = str(r['where']) || str(r['promo_title']);

  return {
    promo_key:             `modo-${str(r['promo_id'] || r['slug'])}`,
    source_id:             str(r['promo_id'] || r['slug']),
    issuer:                'modo',
    source_url:            str(r['source_url']),
    promo_title:           str(r['promo_title']),
    merchant_name:         merchant,
    merchant_logo_url:     '',
    category:              inferCategory(str(r['promo_title']), merchant, ''),
    subcategory:           '',
    description_short:     str(r['description_short']),
    discount_type:         discType,
    discount_percent:      num(r['discount_percent']),
    discount_amount_ars:   null,
    installments_count:    num(r['installments']),
    cap_amount_ars:        num(r['cap_amount_ars']),
    cap_period:            str(r['cap_period']),
    min_purchase_ars:      num(r['min_purchase_amount_ars']),
    valid_from:            vf,
    valid_to:              vt,
    validity_text_raw:     '',
    day_pattern:           normDays(str(r['days_of_week'])),
    channel,
    rail:                  primaryRail(rails),
    instrument_required:   modoInstrument(rails, cardTypes),
    card_brand_scope:      str(r['card_networks']),
    card_type_scope:       cardTypes,
    wallet_scope:          str(r['bank_names']),
    geo_scope:             '',
    coupon_code:           '',
    reimbursement_timing_raw: '',
    freshness_status:      freshness(vf, vt, isActive),
    freshness_reason:      str(r['freshness_reason']),
    terms_text_raw:        str(r['terms_text_raw']),
    exclusions_raw:        extractExclusionText(str(r['terms_text_raw'])),
    excluded_rails:        '',
    ...SCORE_STUBS,
    scraped_at:            str(r['scraped_at']),
    raw_snippet:           str(r['raw_snippet']),
  };
}

function mapBbva(r: Record<string, unknown>): CanonicalPromo {
  const vf = str(r['valid_from']), vt = str(r['valid_to']);
  return {
    promo_key:             str(r['promo_key']) || `bbva-${str(r['promo_id_raw'])}`,
    source_id:             str(r['promo_id_raw']),
    issuer:                'bbva',
    source_url:            str(r['source_url']),
    promo_title:           str(r['promo_title']),
    merchant_name:         str(r['merchant_name']),
    merchant_logo_url:     str(r['merchant_logo_url']),
    category:              inferCategory(str(r['promo_title']), str(r['merchant_name']), str(r['category'])),
    subcategory:           str(r['subcategory']),
    description_short:     str(r['description_short']),
    discount_type:         normDiscType(str(r['discount_type'])),
    discount_percent:      num(r['discount_percent']),
    discount_amount_ars:   num(r['discount_amount_ars']),
    installments_count:    num(r['installments_count']),
    cap_amount_ars:        num(r['cap_amount_ars']),
    cap_period:            str(r['cap_period']),
    min_purchase_ars:      num(r['min_purchase_amount_ars']),
    valid_from:            vf,
    valid_to:              vt,
    validity_text_raw:     str(r['validity_text_raw']),
    day_pattern:           normDays(str(r['day_pattern'])),
    channel:               normChannel(str(r['channel'])),
    rail:                  normRail(str(r['rail'])),
    instrument_required:   safeInstrument(str(r['instrument_required'])),
    card_brand_scope:      str(r['card_brand_scope']),
    card_type_scope:       str(r['card_type_scope']),
    wallet_scope:          str(r['wallet_scope']),
    geo_scope:             str(r['geo_scope']),
    coupon_code:           '',
    reimbursement_timing_raw: str(r['reimbursement_timing_raw']),
    freshness_status:      freshness(vf, vt, true),
    freshness_reason:      str(r['freshness_reason']),
    terms_text_raw:        str(r['terms_text_raw']),
    exclusions_raw:        str(r['exclusions_raw']),
    excluded_rails:        '',
    ...SCORE_STUBS,
    scraped_at:            str(r['scraped_at']),
    raw_snippet:           str(r['raw_snippet']),
  };
}

function mapMercadopago(r: Record<string, unknown>): CanonicalPromo {
  const vf = str(r['valid_from']), vt = str(r['valid_to']);
  const rails = str(r['allowed_rails']);
  const isActive = r['is_active'] !== false && r['is_stale'] !== true;
  const discType = normDiscType(str(r['discount_type']));

  // Instrument from allowed_rails: "qr" → qr_wallet, "online" → any, etc.
  let instrument: CanonicalPromo['instrument_required'] = 'unknown';
  if (rails.includes('qr'))    instrument = 'qr_wallet';
  else if (rails.includes('online')) instrument = 'any';

  return {
    promo_key:             `mercadopago-${str(r['source_id'])}`,
    source_id:             str(r['source_id']),
    issuer:                'mercadopago',
    source_url:            `https://www.mercadopago.com.ar/dt/benefits-hub`,
    promo_title:           str(r['promo_title']),
    merchant_name:         str(r['merchant_name']),
    merchant_logo_url:     str(r['merchant_logo_url']),
    category:              inferCategory(str(r['promo_title']), str(r['merchant_name']), str(r['category'])),
    subcategory:           '',
    description_short:     str(r['payment_description']),
    discount_type:         discType,
    discount_percent:      num(r['discount_percent']),
    discount_amount_ars:   null,
    installments_count:    num(r['installments']),
    cap_amount_ars:        num(r['cap_amount_ars']),
    cap_period:            'per_transaction',
    min_purchase_ars:      num(r['min_purchase_ars']),
    valid_from:            vf,
    valid_to:              vt,
    validity_text_raw:     '',
    day_pattern:           normDays(str(r['days_of_week'])),
    channel:               rails.includes('online') ? 'online' : 'in-store',
    rail:                  primaryRail(rails),
    instrument_required:   instrument,
    card_brand_scope:      '',
    card_type_scope:       '',
    wallet_scope:          'Mercado Pago',
    geo_scope:             '',
    coupon_code:           '',
    reimbursement_timing_raw: '',
    freshness_status:      freshness(vf, vt, isActive),
    freshness_reason:      str(r['freshness_reason']),
    terms_text_raw:        str(r['terms_text_raw']),
    exclusions_raw:        extractExclusionText(str(r['terms_text_raw'])),
    excluded_rails:        '',
    ...SCORE_STUBS,
    scraped_at:            str(r['scraped_at']),
    raw_snippet:           JSON.stringify({ id: r['source_id'], merchant: r['merchant_name'], discount: r['discount_percent'], rails }),
  };
}

function mapPersonalpay(r: Record<string, unknown>): CanonicalPromo {
  const vf = str(r['valid_from']), vt = str(r['valid_to']);
  const isActive = r['is_active'] !== false && r['is_stale'] !== true;
  const rails = str(r['allowed_rails']);

  let instrument: CanonicalPromo['instrument_required'] = 'prepaid_card';
  if (rails.includes('qr')) instrument = 'qr_wallet';
  else if (rails.includes('card') || rails.includes('tarjeta')) instrument = 'prepaid_card';

  return {
    promo_key:             `personalpay-${str(r['source_id'])}`,
    source_id:             str(r['source_id']),
    issuer:                'personalpay',
    source_url:            `https://www.personalpay.com.ar`,
    promo_title:           str(r['promo_title']),
    merchant_name:         str(r['merchant_name']),
    merchant_logo_url:     str(r['merchant_logo_url']),
    category:              inferCategory(str(r['promo_title']), str(r['merchant_name']), str(r['category'])),
    subcategory:           '',
    description_short:     str(r['heading']),
    discount_type:         normDiscType(str(r['discount_type'])),
    discount_percent:      num(r['discount_percent']),
    discount_amount_ars:   null,
    installments_count:    null,
    cap_amount_ars:        num(r['cap_amount_ars']),
    cap_period:            'per_transaction',
    min_purchase_ars:      num(r['min_purchase_ars']),
    valid_from:            vf,
    valid_to:              vt,
    validity_text_raw:     '',
    day_pattern:           normDays(str(r['days_of_week'])),
    channel:               rails.includes('online') ? (rails.includes('card') || rails.includes('qr') ? 'mixed' : 'online') : 'in-store',
    rail:                  primaryRail(rails),
    instrument_required:   instrument,
    card_brand_scope:      'Visa',  // Personal Pay is Visa
    card_type_scope:       'prepaid',
    wallet_scope:          'Personal Pay',
    geo_scope:             '',
    coupon_code:           '',
    reimbursement_timing_raw: '',
    freshness_status:      freshness(vf, vt, isActive),
    freshness_reason:      str(r['freshness_reason']),
    terms_text_raw:        str(r['legal_text']),
    exclusions_raw:        extractExclusionText(str(r['legal_text'])),
    excluded_rails:        '',
    ...SCORE_STUBS,
    scraped_at:            str(r['scraped_at']),
    raw_snippet:           JSON.stringify({ id: r['source_id'], merchant: r['merchant_name'], discount: r['discount_percent'] }),
  };
}

function mapUala(r: Record<string, unknown>): CanonicalPromo {
  const vf = str(r['valid_from']), vt = str(r['valid_to']);
  const inst = str(r['instrument_required']);
  let rail: CanonicalPromo['rail'] = 'card';
  if (inst === 'qr_wallet') rail = 'qr';
  else if (inst === 'uala_nfc') rail = 'nfc';
  else if (inst.includes('card')) rail = 'card';

  return {
    promo_key:             str(r['promo_key']) || `uala-${str(r['source_id'])}`,
    source_id:             str(r['source_id']),
    issuer:                'uala',
    source_url:            str(r['source_url']),
    promo_title:           str(r['promo_title']),
    merchant_name:         str(r['merchant_name']),
    merchant_logo_url:     str(r['merchant_logo_url']),
    category:              inferCategory(str(r['promo_title']), str(r['merchant_name']), str(r['category'])),
    subcategory:           str(r['subcategory']),
    description_short:     '',
    discount_type:         normDiscType(str(r['discount_type'])),
    discount_percent:      num(r['discount_percent']),
    discount_amount_ars:   null,
    installments_count:    null,
    cap_amount_ars:        num(r['cap_amount_ars']),
    cap_period:            str(r['cap_period']),
    min_purchase_ars:      null,
    valid_from:            vf,
    valid_to:              vt,
    validity_text_raw:     str(r['validity_text_raw']),
    day_pattern:           normDays(str(r['day_pattern'])),
    channel:               normChannel(str(r['channel'])),
    rail,
    instrument_required:   (inst === 'uala_cards' ? 'any' : inst || 'unknown') as CanonicalPromo['instrument_required'],
    card_brand_scope:      str(r['card_brand_scope']) || 'Mastercard',
    card_type_scope:       inst.includes('credit') ? 'credit' : inst.includes('prepaid') ? 'prepaid' : 'any',
    wallet_scope:          'Ualá',
    geo_scope:             '',
    coupon_code:           str(r['coupon_code']),
    reimbursement_timing_raw: str(r['reimbursement_timing_raw']),
    freshness_status:      freshness(vf, vt, r['is_active']),
    freshness_reason:      '',
    terms_text_raw:        str(r['terms_text_raw']),
    exclusions_raw:        str(r['exclusions_raw']),
    excluded_rails:        '',
    ...SCORE_STUBS,
    scraped_at:            str(r['scraped_at']),
    raw_snippet:           str(r['raw_snippet']),
  };
}

function mapCuentadni(r: Record<string, unknown>): CanonicalPromo {
  const vf = str(r['valid_from']), vt = str(r['valid_to']);
  const isActive = r['is_active'] !== false && r['is_stale'] !== true;
  const rails = str(r['allowed_rails']);

  return {
    promo_key:             `cuentadni-${str(r['beneficio_id'] || r['promo_key'])}`,
    source_id:             str(r['beneficio_id'] || r['promo_key']),
    issuer:                'cuentadni',
    source_url:            str(r['source_url'] || 'https://www.bancoprovincia.com.ar/cuentadni'),
    promo_title:           str(r['promo_title']),
    merchant_name:         str(r['merchant_group']),
    merchant_logo_url:     '',
    category:              inferCategory(str(r['promo_title']), str(r['merchant_group']), str(r['category'])),
    subcategory:           str(r['subcategory']),
    description_short:     str(r['description_short']),
    discount_type:         normDiscType(str(r['discount_type'])),
    discount_percent:      num(r['discount_percent']),
    discount_amount_ars:   null,
    installments_count:    null,
    cap_amount_ars:        num(r['cap_amount_ars']),
    cap_period:            str(r['cap_period']),
    min_purchase_ars:      num(r['min_purchase_amount_ars']),
    valid_from:            vf,
    valid_to:              vt,
    validity_text_raw:     str(r['validity_text_raw']),
    day_pattern:           normDays(str(r['days_of_week'])),
    channel:               normChannel(str(r['channel'])),
    rail:                  primaryRail(rails) || 'qr',
    instrument_required:   'qr_wallet',
    card_brand_scope:      '',
    card_type_scope:       '',
    wallet_scope:          'Cuenta DNI',
    geo_scope:             str(r['geo_scope']),
    coupon_code:           '',
    reimbursement_timing_raw: r['reimbursement_delay_business_days']
      ? `${r['reimbursement_delay_business_days']} días hábiles`
      : '',
    freshness_status:      freshness(vf, vt, isActive),
    freshness_reason:      str(r['freshness_reason']),
    terms_text_raw:        str(r['terms_text_raw']),
    exclusions_raw:        str(r['exclusions_raw']),
    // excluded_rails: e.g. "mercadopago_qr" = promo cannot use MP's QR network
    excluded_rails:        str(r['excluded_rails']),
    ...SCORE_STUBS,
    scraped_at:            str(r['scraped_at']),
    raw_snippet:           str(r['raw_snippet']),
  };
}

function mapNaranjax(r: Record<string, unknown>): CanonicalPromo {
  // Supports both the new NDJSON format (snake_case, from scraper.ts)
  // and the legacy CSV format (camelCase, from fetch-api-binder.ts).
  const sourceId    = str(r['source_id']   || r['binderId']);
  const vf          = str(r['valid_from']  || r['startDate']);
  const vt          = str(r['valid_to']    || r['endDate']);
  const benefitType = str(r['benefit_type'] || r['benefitType']);
  const merchantName = str(r['merchant_name'] || r['merchantName']);
  const promoTitle  = str(r['promo_title'] || r['title']);
  const logoUrl     = str(r['merchant_logo_url'] || r['logoUrl']);
  const descShort   = str(r['description_short'] || r['subtitle']);
  const dayPat      = str(r['day_pattern']  || r['weekdays']);
  const purchaseMode = str(r['purchase_mode'] || r['purchaseMode'] || '').toLowerCase();
  const payMethods  = str(r['payment_methods'] || r['paymentMethods'] || '').toLowerCase();
  const category    = str(r['category']);
  const subcategory = str(r['subcategory']);
  const capPeriod   = str(r['cap_period']  || r['capPeriod']);
  const reimbText   = str(r['reimbursement_timing_raw'] || r['refundText']);
  const rawFreshness = str(r['freshness_status']);

  let discType: CanonicalPromo['discount_type'] = 'unknown';
  if (benefitType === 'discount_percentage') {
    const reimb = reimbText.toLowerCase();
    if (reimb.includes('inmediato')) discType = 'direct_discount';
    else if (reimb.includes('reintegro')) discType = 'cashback';
    else discType = 'direct_discount'; // no text → assume direct POS discount
  } else if (benefitType === 'installments_interest_free') discType = 'installments';

  let channel: CanonicalPromo['channel'] = 'unknown';
  if (purchaseMode.includes('online') && (purchaseMode.includes('in_store') || purchaseMode.includes('instore'))) channel = 'mixed';
  else if (purchaseMode.includes('online')) channel = 'online';
  else if (purchaseMode.includes('in_store') || purchaseMode.includes('instore')) channel = 'in-store';

  // Rail: prefer explicit capture_methods (QR/NFC from plan-level data); fall back to channel
  const captureMethods = str(r['capture_methods'] || r['captureMethods'] || '').toLowerCase();
  let rail: CanonicalPromo['rail'] = channel === 'online' ? 'online' : 'card';
  if (captureMethods.includes('qr'))       rail = 'qr';
  else if (captureMethods.includes('nfc')) rail = 'nfc';

  let instrument: CanonicalPromo['instrument_required'] = 'credit_card';
  if (payMethods.includes('wallet') || payMethods.includes('dinero')) instrument = 'any';
  else if (payMethods.includes('debit')) instrument = 'any';

  // Discount percent: new format has numeric field; legacy CSV had benefitValue
  const discPct = num(r['discount_percent'] ?? r['benefitValue']);
  const installCount = num(r['installments_count'] ?? r['installments']);
  const capArs = num(r['cap_amount_ars'] ?? r['maxBenefit']);

  return {
    promo_key:             `naranjax-${sourceId}`,
    source_id:             sourceId,
    issuer:                'naranjax',
    source_url:            str(r['source_url'] || r['sourceUrl'] || r['detailUrl']),
    promo_title:           promoTitle,
    merchant_name:         merchantName,
    merchant_logo_url:     logoUrl,
    category:              inferCategory(promoTitle, merchantName, category),
    subcategory:           subcategory,
    description_short:     descShort,
    discount_type:         discType,
    discount_percent:      discPct,
    discount_amount_ars:   null,
    installments_count:    installCount,
    cap_amount_ars:        capArs,
    cap_period:            capPeriod,
    min_purchase_ars:      null,
    valid_from:            vf,
    valid_to:              vt,
    validity_text_raw:     '',
    day_pattern:           normDays(dayPat),
    channel,
    rail,
    instrument_required:   instrument,
    card_brand_scope:      'Naranja X',
    card_type_scope:       'credit',
    wallet_scope:          'Naranja X',
    geo_scope:             '',
    coupon_code:           '',
    reimbursement_timing_raw: reimbText,
    freshness_status:      freshness(vf, vt, true),
    freshness_reason:      '',
    terms_text_raw:        '',
    exclusions_raw:        '',
    excluded_rails:        '',
    ...SCORE_STUBS,
    scraped_at:            str(r['scraped_at']) || new Date().toISOString(),
    raw_snippet:           JSON.stringify({ id: sourceId, merchant: merchantName, benefit: benefitType, pct: discPct }),
  };
}

// For Naranja X: read from CSV (fetch-api-binder outputs CSV, not NDJSON)
function readNaranjaxCsv(path: string): Record<string, unknown>[] {
  const lines = readFileSync(path, 'utf8').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const cols: string[] = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
      else cur += ch;
    }
    cols.push(cur);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = cols[i]?.replace(/^"|"$/g, '') ?? ''; });
    return obj;
  });
}

function mapYpf(r: Record<string, unknown>): CanonicalPromo {
  const vf = str(r['valid_from']), vt = str(r['valid_to']);
  return {
    promo_key:             `ypf-${str(r['source_id'])}`,
    source_id:             str(r['source_id']),
    issuer:                'ypf',
    source_url:            str(r['source_url'] || 'https://app.ypf.com/'),
    promo_title:           str(r['promo_title']),
    merchant_name:         str(r['merchant_name']),
    merchant_logo_url:     '',
    category:              str(r['category']) || 'Combustible',
    subcategory:           '',
    description_short:     str(r['description_short']),
    discount_type:         normDiscType(str(r['discount_type'])),
    discount_percent:      num(r['discount_percent']),
    discount_amount_ars:   null,
    installments_count:    null,
    cap_amount_ars:        num(r['cap_amount_ars']),
    cap_period:            str(r['cap_period']),
    min_purchase_ars:      null,
    valid_from:            vf,
    valid_to:              vt,
    validity_text_raw:     '',
    day_pattern:           normDays(str(r['day_pattern'])),
    channel:               'in-store',
    rail:                  'qr',
    instrument_required:   'qr_wallet',
    card_brand_scope:      '',
    card_type_scope:       '',
    wallet_scope:          'YPF App',
    geo_scope:             'Todo el país',
    coupon_code:           '',
    reimbursement_timing_raw: '',
    freshness_status:      freshness(vf, vt, true),
    freshness_reason:      r['is_static_fallback'] ? 'static_fallback' : '',
    terms_text_raw:        str(r['terms_text_raw']),
    exclusions_raw:        '',
    excluded_rails:        '',
    ...SCORE_STUBS,
    scraped_at:            str(r['scraped_at']),
    raw_snippet:           JSON.stringify({ id: r['source_id'], pct: r['discount_percent'], fallback: r['is_static_fallback'] }),
  };
}

function mapShellbox(r: Record<string, unknown>): CanonicalPromo {
  const vf = str(r['valid_from']), vt = str(r['valid_to']);
  return {
    promo_key:             `shellbox-${str(r['source_id'])}`,
    source_id:             str(r['source_id']),
    issuer:                'shellbox',
    source_url:            str(r['source_url'] || 'https://www.shell.com.ar/conductores/descuentos-vigentes.html'),
    promo_title:           str(r['promo_title']),
    merchant_name:         str(r['merchant_name']),
    merchant_logo_url:     '',
    category:              str(r['category']) || 'Combustible',
    subcategory:           '',
    description_short:     str(r['description_short']),
    discount_type:         normDiscType(str(r['discount_type'])),
    discount_percent:      num(r['discount_percent']),
    discount_amount_ars:   null,
    installments_count:    null,
    cap_amount_ars:        num(r['cap_amount_ars']),
    cap_period:            str(r['cap_period']),
    min_purchase_ars:      null,
    valid_from:            vf,
    valid_to:              vt,
    validity_text_raw:     '',
    day_pattern:           normDays(str(r['day_pattern'])),
    channel:               'in-store',
    rail:                  'qr',
    instrument_required:   'qr_wallet',
    card_brand_scope:      '',
    card_type_scope:       '',
    wallet_scope:          'Shell Box',
    geo_scope:             'Todo el país',
    coupon_code:           '',
    reimbursement_timing_raw: '',
    freshness_status:      freshness(vf, vt, true),
    freshness_reason:      r['is_static_fallback'] ? 'static_fallback' : '',
    terms_text_raw:        str(r['terms_text_raw']),
    exclusions_raw:        '',
    excluded_rails:        '',
    ...SCORE_STUBS,
    scraped_at:            str(r['scraped_at']),
    raw_snippet:           JSON.stringify({ id: r['source_id'], pct: r['discount_percent'], days: r['day_pattern'], fallback: r['is_static_fallback'] }),
  };
}

function mapCarrefourBank(r: Record<string, unknown>): CanonicalPromo {
  const vf = str(r['valid_from']), vt = str(r['valid_to']);
  const ch = str(r['channel']);
  const rail = str(r['rail']) || (ch === 'online' ? 'online' : 'card');
  const inst = str(r['instrument_required']);

  return {
    promo_key:             `carrefour_bank-${str(r['source_id'])}`,
    source_id:             str(r['source_id']),
    issuer:                'carrefour_bank',
    source_url:            str(r['source_url'] || 'https://www.bancodeserviciosfinancieros.com.ar/beneficios-credito/'),
    promo_title:           str(r['promo_title']),
    merchant_name:         str(r['merchant_name']),
    merchant_logo_url:     '',
    category:              'Supermercados',
    subcategory:           '',
    description_short:     str(r['description_short']),
    discount_type:         normDiscType(str(r['discount_type'])),
    discount_percent:      num(r['discount_percent']),
    discount_amount_ars:   null,
    installments_count:    num(r['installments_count']),
    cap_amount_ars:        num(r['cap_amount_ars']),
    cap_period:            str(r['cap_period']),
    min_purchase_ars:      null,
    valid_from:            vf,
    valid_to:              vt,
    validity_text_raw:     '',
    day_pattern:           normDays(str(r['day_pattern'])),
    channel:               normChannel(ch),
    rail:                  normRail(rail),
    instrument_required:   (inst as CanonicalPromo['instrument_required']) || 'any',
    card_brand_scope:      '',   // Carrefour's own network, not Visa/MC
    card_type_scope:       inst.includes('credit') ? 'credit' : inst.includes('prepaid') ? 'prepaid' : 'any',
    wallet_scope:          'Tarjeta Mi Carrefour',
    geo_scope:             'Todo el país',
    coupon_code:           '',
    reimbursement_timing_raw: '',
    freshness_status:      freshness(vf, vt, true),
    freshness_reason:      r['is_static_fallback'] ? 'static_fallback' : '',
    terms_text_raw:        str(r['terms_text_raw']),
    exclusions_raw:        '',
    excluded_rails:        '',
    ...SCORE_STUBS,
    scraped_at:            str(r['scraped_at']),
    raw_snippet:           JSON.stringify({ id: r['source_id'], card: r['card_label'], pct: r['discount_percent'], inst: r['installments_count'], days: r['day_pattern'] }),
  };
}

// ─── Issuer config registry ───────────────────────────────────────────────────

const MAPPER: Record<Issuer, (r: Record<string, unknown>) => CanonicalPromo | null> = {
  modo:           mapModo,
  bbva:           mapBbva,
  mercadopago:    mapMercadopago,
  personalpay:    mapPersonalpay,
  uala:           mapUala,
  cuentadni:      mapCuentadni,
  naranjax:       mapNaranjax,
  ypf:            mapYpf,
  shellbox:       mapShellbox,
  carrefour_bank: mapCarrefourBank,
};

// ─── CSV writer ───────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const runAt  = new Date().toISOString();
  const dateStr = runAt.slice(0, 10);
  process.stderr.write(`[consolidate] today=${TODAY} active-only=${activeOnly}\n\n`);

  const all: CanonicalPromo[] = [];
  const stats: Record<string, { loaded: number; mapped: number; skipped: number; source: string }> = {};

  const issuers = Object.keys(ISSUER_DIRS) as Issuer[];

  for (const issuer of issuers) {
    // Special case: Naranja X may only have a CSV
    if (issuer === 'naranjax') {
      const ndjsonPath = findLatestNdjson('naranjax');
      const csvDir = ISSUER_DIRS.naranjax.dir;
      const csvFiles = existsSync(csvDir)
        ? readdirSync(csvDir).filter(f => f.startsWith('naranjax') && f.endsWith('.csv')).sort()
        : [];
      const csvPath = csvFiles.length > 0 ? join(csvDir, csvFiles[csvFiles.length - 1]!) : null;
      const source = ndjsonPath ?? csvPath;

      if (!source) {
        process.stderr.write(`  naranjax: no output found (run src/issuers/naranjax/scraper.ts first)\n`);
        stats['naranjax'] = { loaded: 0, mapped: 0, skipped: 0, source: 'missing' };
        continue;
      }

      const rows = source.endsWith('.ndjson') ? readNdjson(source) : readNaranjaxCsv(source);
      process.stderr.write(`  naranjax: ${rows.length} rows from ${source}\n`);
      let mapped = 0, skipped = 0;
      for (const row of rows) {
        const p = mapNaranjax(row);
        if (activeOnly && p.freshness_status !== 'active') { skipped++; continue; }
        Object.assign(p, computeScores(p));
        all.push(p);
        mapped++;
      }
      stats['naranjax'] = { loaded: rows.length, mapped, skipped, source };
      continue;
    }

    const ndjsonPath = findLatestNdjson(issuer);
    if (!ndjsonPath) {
      process.stderr.write(`  ${issuer}: no NDJSON found\n`);
      stats[issuer] = { loaded: 0, mapped: 0, skipped: 0, source: 'missing' };
      continue;
    }

    const ageDays = checkSourceAge(ndjsonPath, issuer);
    const rows = readNdjson(ndjsonPath);
    process.stderr.write(`  ${issuer}: ${rows.length} rows from ${ndjsonPath} (${ageDays.toFixed(1)}d old)\n`);
    const mapper = MAPPER[issuer];
    let mapped = 0, skipped = 0;
    for (const row of rows) {
      try {
        const p = mapper(row);
        if (p === null) { skipped++; continue; }
        if (activeOnly && p.freshness_status !== 'active') { skipped++; continue; }
        Object.assign(p, computeScores(p));
        all.push(p);
        mapped++;
      } catch (e) {
        process.stderr.write(`    [warn] ${issuer} row failed: ${e}\n`);
        skipped++;
      }
    }
    stats[issuer] = { loaded: rows.length, mapped, skipped, source: ndjsonPath };
  }

  process.stderr.write(`\n[consolidate] Total rows: ${all.length}\n`);

  // ── NDJSON ──────────────────────────────────────────────────────────────────
  const ndjsonPath = join(outDir, `pagamax-${dateStr}.ndjson`);
  writeFileSync(ndjsonPath, all.map(p => JSON.stringify(p)).join('\n') + '\n', 'utf8');
  process.stderr.write(`[consolidate] NDJSON → ${ndjsonPath}\n`);

  // ── CSV ─────────────────────────────────────────────────────────────────────
  const csvPath = join(outDir, `pagamax-${dateStr}.csv`);
  const csvHeader = CANONICAL_COLS.join(',') + '\n';
  const csvRows   = all.map(p => CANONICAL_COLS.map(c => csvCell(p[c])).join(','));
  writeFileSync(csvPath, csvHeader + csvRows.join('\n') + '\n', 'utf8');
  process.stderr.write(`[consolidate] CSV   → ${csvPath}\n`);

  // ── Audit ───────────────────────────────────────────────────────────────────
  const byIssuer: Record<string, number>      = {};
  const byFreshness: Record<string, number>   = {};
  const byDiscType: Record<string, number>    = {};
  const byChannel: Record<string, number>     = {};
  let missingValidTo = 0, missingDiscount = 0, missingCap = 0, missingInstrument = 0;

  for (const p of all) {
    byIssuer[p.issuer]              = (byIssuer[p.issuer] ?? 0) + 1;
    byFreshness[p.freshness_status] = (byFreshness[p.freshness_status] ?? 0) + 1;
    byDiscType[p.discount_type]     = (byDiscType[p.discount_type] ?? 0) + 1;
    byChannel[p.channel]            = (byChannel[p.channel] ?? 0) + 1;
    if (!p.valid_to)              missingValidTo++;
    if (!p.discount_percent && !p.installments_count) missingDiscount++;
    if (p.cap_amount_ars === null) missingCap++;
    if (!p.instrument_required || p.instrument_required === 'unknown') missingInstrument++;
  }

  const audit = {
    run_at:      runAt,
    today:       TODAY,
    active_only: activeOnly,
    total_rows:  all.length,
    by_issuer:   byIssuer,
    sources:     stats,
    coverage: {
      by_freshness: byFreshness,
      by_discount_type: byDiscType,
      by_channel: byChannel,
    },
    field_completeness: {
      missing_valid_to:    missingValidTo,
      missing_discount:    missingDiscount,
      cap_is_null:         missingCap,
      missing_instrument:  missingInstrument,
      pct_with_valid_to:   `${Math.round((all.length - missingValidTo) / all.length * 100)}%`,
    },
  };

  const auditPath = join(outDir, `pagamax-${dateStr}-audit.json`);
  writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');
  process.stderr.write(`[consolidate] Audit → ${auditPath}\n`);

  // Summary
  process.stderr.write('\n=== Consolidation Summary ===\n');
  process.stderr.write(`Total rows: ${all.length}\n`);
  for (const [issuer, count] of Object.entries(byIssuer)) {
    process.stderr.write(`  ${issuer.padEnd(14)}: ${count}\n`);
  }
  process.stderr.write(`Freshness: ${JSON.stringify(byFreshness)}\n`);
  process.stderr.write(`Discount types: ${JSON.stringify(byDiscType)}\n`);
  process.stderr.write(`valid_to coverage: ${all.length - missingValidTo}/${all.length} (${Math.round((all.length - missingValidTo)/all.length*100)}%)\n`);
}

main().catch(err => { process.stderr.write(`Fatal: ${err}\n`); process.exit(1); });
