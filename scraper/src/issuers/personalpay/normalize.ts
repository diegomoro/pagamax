/**
 * normalize.ts — Map raw Personal Pay data → PpPromo schema
 */

import type { PpRawBenefit, PpPromo, PpLevel } from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse discount percent from strings like "20%", "20% reintegro", "15% OFF". */
function parseDiscountPercent(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)%/);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  return isNaN(n) || n <= 0 ? null : n;
}

/** Parse Argentine peso amount from display strings like "$3.000", "$3,000", "3000". */
function parseArgAmount(s: string | undefined | null): number | null {
  if (!s) return null;
  // Strip currency symbol and thousands separators (dot or comma before 3 digits)
  const clean = s
    .replace(/\$/g, '')
    .replace(/[.,](\d{3})(?=$|[^0-9])/g, '$1')
    .replace(',', '.')
    .trim();
  const n = parseFloat(clean);
  return isNaN(n) || n <= 0 ? null : n;
}

/**
 * Normalize a Spanish day-range or list string to semicolon-separated English day names.
 *
 * Examples:
 *   "Todos los días"  → "everyday"
 *   ["Miércoles"]     → "wednesday"
 *   ["Lunes a Jueves"] → "monday; tuesday; wednesday; thursday"
 */
const ES_TO_EN: Record<string, string> = {
  lunes:    'monday',
  martes:   'tuesday',
  miércoles: 'wednesday',
  miercoles: 'wednesday',
  jueves:   'thursday',
  viernes:  'friday',
  sábado:   'saturday',
  sabado:   'saturday',
  domingo:  'sunday',
  // Abbreviations seen in data
  lu: 'monday', ma: 'tuesday', mi: 'wednesday',
  ju: 'thursday', vi: 'friday', sá: 'saturday',
  sa: 'saturday', do: 'sunday',
};

const DAY_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

function expandDayRange(from: string, to: string): string[] {
  const f = ES_TO_EN[from.toLowerCase().trim()];
  const t = ES_TO_EN[to.toLowerCase().trim()];
  if (!f || !t) return [f ?? from, t ?? to].filter(Boolean);
  const fi = DAY_ORDER.indexOf(f);
  const ti = DAY_ORDER.indexOf(t);
  if (fi === -1 || ti === -1) return [f, t];
  if (fi <= ti) return DAY_ORDER.slice(fi, ti + 1);
  // Wraps: e.g. Domingo a Jueves → Sun,Mon,Tue,Wed,Thu
  return [...DAY_ORDER.slice(fi), ...DAY_ORDER.slice(0, ti + 1)];
}

function normalizeDays(days: string[]): string {
  if (!days || days.length === 0) return 'everyday';

  const expanded: string[] = [];

  for (const raw of days) {
    const s = raw.trim();
    const lower = s.toLowerCase();

    if (lower.includes('todos') || lower.includes('todos los días') || lower === 'todos') {
      return 'everyday';
    }

    // "Lunes a Viernes" / "Lunes a Jueves" style
    const rangeMatch = s.match(/^(.+?)\s+a\s+(.+)$/i);
    if (rangeMatch) {
      expanded.push(...expandDayRange(rangeMatch[1]!, rangeMatch[2]!));
      continue;
    }

    // Semicolon-separated abbreviations like "Do;Vi;Sá"
    if (s.includes(';')) {
      for (const part of s.split(';')) {
        const en = ES_TO_EN[part.trim().toLowerCase()];
        if (en) expanded.push(en);
      }
      continue;
    }

    // Single day
    const en = ES_TO_EN[lower];
    if (en) expanded.push(en);
    else expanded.push(s);
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const unique = expanded.filter(d => { if (seen.has(d)) return false; seen.add(d); return true; });

  if (unique.length === 7) return 'everyday';
  return unique.join('; ');
}

/**
 * Map Personal Pay paymentMethods[] to canonical rail tokens.
 * Returns semicolon-joined string like "qr; card; nfc".
 */
function buildAllowedRails(paymentMethods: Array<{name: string}>): string {
  const rails: string[] = [];
  const seen = new Set<string>();

  for (const pm of paymentMethods) {
    const name = pm.name.toLowerCase();
    const add = (r: string) => { if (!seen.has(r)) { seen.add(r); rails.push(r); } };

    if (name.includes('qr')) add('qr');
    if (name.includes('nfc') || name.includes('sin contacto')) add('nfc');
    if (name.includes('visa') || name.includes('tarjeta')) add('card');
    if (name.includes('débito automático') || name.includes('debito automatico')) add('direct_debit');
    if (name.includes('tu app') && !name.includes('qr') && !name.includes('visa')) add('app');
    if (name.includes('cupón') || name.includes('cupon')) add('coupon');
  }

  return rails.join('; ');
}

/**
 * Parse valid_from from legal text.
 * Handles:
 *   "desde el DD/MM/YYYY"  "Vigencia desde DD/MM/YYYY"
 *   "del DD/MM/YYYY hasta" "DEL DD/MM/YY AL"
 *   "válido los días … DD/MM/YYYY hasta" (bare date after day list)
 *   "DD/MM/YYYY hasta el"  (date-first pattern)
 */
function parseLegalFrom(legal: string): string {
  if (!legal) return '';

  // 1. "desde [el] DD/MM/YYYY"
  const re1 = /desde\s+(?:el\s+)?(\d{1,2}\/\d{2}\/\d{2,4})/i;
  const m1 = re1.exec(legal);
  if (m1) return ddmmToIso(m1[1]!);

  // 2. "del DD/MM/YYYY" (followed by anything, captures the start date)
  const re2 = /\bdel?\s+(\d{1,2}\/\d{2}\/\d{2,4})\b/i;
  const m2 = re2.exec(legal);
  if (m2) return ddmmToIso(m2[1]!);

  // 3. Bare date followed by " hasta" — "19/11/2025 hasta"
  const re3 = /(\d{2}\/\d{2}\/\d{2,4})\s+hasta/i;
  const m3 = re3.exec(legal);
  if (m3) return ddmmToIso(m3[1]!);

  return '';
}

/** Convert D/MM/YY, DD/MM/YY, or DD/MM/YYYY → YYYY-MM-DD. */
function ddmmToIso(dmy: string): string {
  const parts = dmy.split('/');
  if (parts.length !== 3) return '';
  let [dd, mm, yy] = parts as [string, string, string];
  if (yy.length === 2) yy = '20' + yy;
  if (dd.length === 1) dd = '0' + dd;
  if (mm.length === 1) mm = '0' + mm;
  return `${yy}-${mm}-${dd}`;
}

/**
 * Parse min_purchase_ars from description or legal text.
 * Looks for "compra mínima $X", "monto mínimo $X", "paymentMin" from levels.
 */
function parseMinPurchase(text: string, levels: PpLevel[]): number | null {
  // First try text
  const re = /(?:compra|monto|importe)\s+m[ií]nima?\s+\$?([\d.,]+)/i;
  const m = re.exec(text);
  if (m) {
    const n = parseArgAmount(m[1]);
    if (n) return n;
  }

  // Fallback: use paymentMin from the first (LVL00) level
  const lvl0 = levels.find(l => l.code === 'LVL00') ?? levels[0];
  if (lvl0 && lvl0.paymentMin > 0) return lvl0.paymentMin;

  return null;
}

/** Get max discount percent across all levels. */
function maxDiscountAcrossLevels(levels: PpLevel[]): number | null {
  let max: number | null = null;
  for (const lv of levels) {
    const n = parseDiscountPercent(lv.discountValue);
    if (n !== null && (max === null || n > max)) max = n;
  }
  return max;
}

// ─── Main normalize function ──────────────────────────────────────────────────

export function normalize(raw: PpRawBenefit, scrapedAt: string): PpPromo {
  const list = raw.listItem;
  const det  = raw.detail;

  // Prefer detail fields (richer) with list fallback
  const levels       = det?.levels ?? list.levels ?? [];
  const locations    = det?.locations ?? [];
  const legal        = det?.legal ?? list.legal ?? '';
  const payMethods   = det?.paymentMethods ?? list.paymentMethods ?? [];
  const days         = det?.days ?? list.days ?? [];
  const dueDate      = (det?.dueDate ?? list.dueDate ?? '').slice(0, 10); // YYYY-MM-DD
  const categoryArr  = det?.category ?? [];
  const heading      = det?.heading ?? list.heading ?? '';
  const channelLabel = det?.channelName ?? list.channelName ?? '';
  const ecommerce    = det?.ecommerce ?? null;
  const isTeco       = Boolean(det?.isTeco);

  // Discount percent: use LVL00 (all-users level) if available, else parse from discounts
  const lvl0 = levels.find(l => l.code === 'LVL00');
  const discountPercent =
    lvl0
      ? parseDiscountPercent(lvl0.discountValue)
      : parseDiscountPercent(list.discounts);

  const maxDiscount = maxDiscountAcrossLevels(levels) ?? discountPercent;

  // Cap: from LVL00 limitAmount, or list limitAmount, or detail limitAmount
  const capSource = lvl0?.limitAmount ?? det?.limitAmount ?? list.limitAmount ?? '';
  const capAmount = parseArgAmount(capSource);

  // Min purchase
  const descText = det?.description ?? list.description ?? '';
  const minPurchase = parseMinPurchase(descText + ' ' + legal, levels);

  // Dates
  const validFrom = parseLegalFrom(legal);
  const validTo   = dueDate; // dueDate is always present and authoritative

  // discount_type
  const typeCode = det?.typeCode ?? list.typeCode ?? '';
  const discountType = typeCode === 'Cashback' ? 'cashback' : 'direct_discount';

  // Promo title: benefitValue is human-readable ("20% de reintegro"), title is merchant
  const promoTitle = list.benefitValue || list.discounts || '';

  // Logo
  const logo = det?.partnerImage ?? list.partnerImage ?? det?.image ?? list.image ?? '';

  return {
    source_id:            String(list.id),
    issuer:               'personalpay',
    promo_title:          promoTitle,
    merchant_name:        list.title,
    merchant_logo_url:    logo,
    category:             categoryArr[0] ?? heading,
    heading,
    channel_label:        channelLabel,
    discount_type:        discountType,
    discount_percent:     discountPercent,
    cap_amount_ars:       capAmount,
    min_purchase_ars:     minPurchase,
    payment_description:  list.benefitValue ?? '',
    days_of_week:         normalizeDays(days),
    allowed_rails:        buildAllowedRails(payMethods),
    payment_methods_str:  payMethods.map(p => p.name).join('; '),
    ecommerce_url:        ecommerce ?? '',
    locations_count:      locations.length,
    levels_count:         levels.length,
    max_discount_percent: maxDiscount,
    levels_json:          levels.length > 0 ? JSON.stringify(levels) : '',
    is_teco:              isTeco,
    valid_from:           validFrom,
    valid_to:             validTo,
    legal_text:           legal,
    is_active:            true,
    is_stale:             false,
    freshness_reason:     'PP benefits API live',
    scraped_at:           scrapedAt,
  };
}
