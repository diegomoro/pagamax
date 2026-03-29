/**
 * normalize.ts — Map raw Ualá spec data → UalaPromo schema
 *
 * Source level 1 (_next/data): HIGH confidence baseline.
 * All fields are drawn from structured JSON — no DOM scraping.
 */

import type { UalaRawPromo, UalaPromo, UalaSpec } from './types.js';

const BASE_URL = 'https://www.uala.com.ar';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse discount percent from titles like "10% Off", "35% de reintegro en POS Pro", "20% de descuento". */
function parseDiscountPercent(title: string): number | null {
  const m = title.match(/(\d+(?:\.\d+)?)%/);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  return isNaN(n) || n <= 0 ? null : n;
}

/** Parse ARS amount from cashback field like "$20.000 por mes", "Sin tope" → null. */
function parseCashbackCap(cashback: string): { cap: number | null; period: string } {
  if (!cashback || cashback === '-' || /sin tope/i.test(cashback)) {
    return { cap: null, period: '' };
  }
  // "$20.000 por mes" → 20000, "monthly"
  const m = cashback.match(/\$([\d.,]+)\s*(?:por\s*(mes|semana|día|transacci[oó]n))?/i);
  if (!m) return { cap: null, period: '' };

  const raw = m[1]!.replace(/[.,](\d{3})(?=$|[^0-9])/g, '$1').replace(',', '.');
  const n = parseFloat(raw);
  const cap = isNaN(n) || n <= 0 ? null : n;

  const periodWord = (m[2] ?? '').toLowerCase();
  const period = periodWord === 'mes' ? 'monthly'
    : periodWord === 'semana' ? 'weekly'
    : periodWord.startsWith('d') ? 'daily'
    : periodWord.includes('transac') ? 'per_transaction'
    : cap !== null ? 'monthly'   // default when amount present
    : '';

  return { cap, period };
}

/** Normalize Spanish day names → English. */
const ES_DAY: Record<string, string> = {
  'todos los días': 'everyday', 'todos': 'everyday',
  'lunes': 'monday', 'martes': 'tuesday', 'miércoles': 'wednesday',
  'jueves': 'thursday', 'viernes': 'friday', 'sábado': 'saturday',
  'sábados': 'saturday', 'domingo': 'sunday', 'domingos': 'sunday',
};

function normalizeDays(days: string[]): string {
  if (!days || days.length === 0) return 'everyday';
  const mapped = days.map(d => ES_DAY[d.toLowerCase()] ?? d.toLowerCase());
  if (mapped.includes('everyday') || mapped.length === 7) return 'everyday';
  const deduped = [...new Set(mapped)];
  return deduped.join('; ');
}

/** Map place[] → channel. */
function resolveChannel(place: string[]): string {
  const lc = place.map(p => p.toLowerCase());
  const hasPhysical = lc.some(p => p.includes('físico') || p.includes('fisico'));
  const hasOnline   = lc.some(p => p.includes('online'));
  if (hasPhysical && hasOnline) return 'mixed';
  if (hasOnline)   return 'online';
  if (hasPhysical) return 'in-store';
  return 'unknown';
}

/** Map paymentMethods[] → canonical instrument string. */
function resolveInstrument(pms: string[]): string {
  const lc = pms.map(p => p.toLowerCase());
  const hasQr      = lc.some(p => p.includes('qr'));
  const hasPrepaid = lc.some(p => p.includes('prepaga') || p.includes('prepaid'));
  const hasCredit  = lc.some(p => p.includes('crédito') || p.includes('credito'));
  const hasNfc     = lc.some(p => p.includes('nfc') || p.includes('sin contacto'));

  if (hasQr && !hasPrepaid && !hasCredit) return 'qr_wallet';
  if (hasNfc)   return 'uala_nfc';
  if (hasPrepaid && hasCredit) return 'uala_cards';
  if (hasPrepaid) return 'prepaid_card';
  if (hasCredit)  return 'credit_card';
  if (hasQr)      return 'qr_wallet';
  return 'unknown';
}

/**
 * Classify promo family based on channel, instrument, and spec content.
 */
function resolvePromoFamily(spec: UalaSpec, channel: string, instrument: string): string {
  const titleLc  = spec.title.toLowerCase();
  const descLc   = spec.description.toLowerCase();
  const cashdate = (spec.cashdate ?? '').toLowerCase();
  const isDelayedReimbursement = cashdate !== '-' && !cashdate.includes('momento') && !cashdate.includes('inmediato');

  if (instrument === 'qr_wallet' && channel === 'in-store') return 'qr_payment';
  if (titleLc.includes('reintegro') && isDelayedReimbursement)  return 'cashback';
  if (descLc.includes('cupón') || descLc.includes('cupon') || descLc.includes('código')) return 'partner_promo';
  if (channel === 'in-store') return 'merchant_discount';
  return 'partner_promo';
}

/**
 * Determine discount_type:
 *   - cashback: reimbursed after payment (cashdate is a delay, not "En el momento")
 *   - coupon_discount: coupon/code applied at checkout
 *   - direct_discount: applied directly at POS/checkout without coupon or delay
 */
function resolveDiscountType(spec: UalaSpec): string {
  const desc     = spec.description.toLowerCase() + ' ' + spec.title.toLowerCase();
  const cashdate = (spec.cashdate ?? '').toLowerCase();

  // "En el momento" / "Inmediato" = applied instantly at POS → direct_discount
  const isDelayed = cashdate !== '-' && !cashdate.includes('momento') && !cashdate.includes('inmediato');
  if (isDelayed) return 'cashback';

  if (desc.includes('cupón') || desc.includes('cupon') || desc.includes('código')) return 'coupon_discount';
  return 'direct_discount';
}

/** Extract coupon code from description text. */
function extractCouponCode(text: string): string {
  // "usando el cupón de descuento GRACIASUALA" or "colocar el cupón "Sport-Uala""
  const m = text.match(/cup[oó]n\s+(?:de\s+\w+\s+)?[""]?([A-Z][A-Z0-9\-]{2,})/i);
  return m ? m[1]! : '';
}

/**
 * Parse valid_from from legalDisclaimer.
 * Handles: "desde el DD/MM/YYYY", "vigente en … desde el DD/MM/YYYY"
 *          "01/03/2026 hasta", DD-numeric with month-word patterns
 */
function parseLegalFrom(legal: string): string {
  // "desde el DD/MM/YYYY" or "desde el DD/MM/YY"
  const re1 = /desde\s+(?:el\s+)?(?:d[ií]a\s+)?(\d{1,2}\/\d{2}\/\d{2,4})/i;
  const m1 = re1.exec(legal);
  if (m1) return ddmmToIso(m1[1]!);

  // "del DD/MM/YYYY" — generic range start
  const re2 = /\bdel?\s+(\d{1,2}\/\d{2}\/\d{2,4})\b/i;
  const m2 = re2.exec(legal);
  if (m2) return ddmmToIso(m2[1]!);

  return '';
}

/**
 * Parse valid_to from legalDisclaimer or spec.date.
 * Handles: "hasta el 31/03/2026", "hasta el 31 de marzo 2026", "Hasta el 31 de marzo 2026"
 */
const MONTH_MAP: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

function parseLegalTo(legal: string, specDate: string): string {
  // "hasta el DD/MM/YYYY"
  const re1 = /hasta\s+el\s+(\d{1,2}\/\d{2}\/\d{2,4})/i;
  const m1 = re1.exec(legal);
  if (m1) return ddmmToIso(m1[1]!);

  // "hasta el 31 de marzo 2026" (word-month)
  const re2 = /hasta\s+el\s+(\d{1,2})\s+de\s+(\w+)\s+(\d{4})/i;
  const m2 = re2.exec(legal) ?? re2.exec(specDate);
  if (m2) {
    const dd = m2[1]!.padStart(2, '0');
    const mm = MONTH_MAP[m2[2]!.toLowerCase()] ?? '01';
    return `${m2[3]}-${mm}-${dd}`;
  }

  // Fallback: try specDate directly "Hasta el 31 de marzo 2026"
  const re3 = /(\d{1,2})\s+de\s+(\w+)\s+(\d{4})/i;
  const m3 = re3.exec(specDate);
  if (m3) {
    const dd = m3[1]!.padStart(2, '0');
    const mm = MONTH_MAP[m3[2]!.toLowerCase()] ?? '01';
    return `${m3[3]}-${mm}-${dd}`;
  }

  return '';
}

/** Convert D/M/YY or DD/MM/YYYY → YYYY-MM-DD. */
function ddmmToIso(dmy: string): string {
  const parts = dmy.split('/');
  if (parts.length !== 3) return '';
  let [dd, mm, yy] = parts as [string, string, string];
  if (yy.length === 2) yy = '20' + yy;
  return `${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
}

/**
 * Determine freshness status relative to today.
 * "today" is the date portion of scrapedAt.
 */
function resolveFreshness(validFrom: string, validTo: string, today: string): string {
  if (!validTo) return 'unknown';
  if (validTo < today) return 'expired';
  if (validFrom && validFrom > today) return 'future';
  return 'active';
}

/**
 * Compute confidence score.
 * Base: 0.90 for Level 1 (structured _next/data JSON).
 * Deductions for missing fields.
 */
function computeConfidence(promo: Partial<UalaPromo>): number {
  let score = 0.90; // L1 base

  // Small deductions per missing key field
  if (!promo.valid_from) score -= 0.04;
  if (!promo.valid_to)   score -= 0.04;
  if (!promo.discount_percent) score -= 0.02;
  if (promo.instrument_required === 'unknown') score -= 0.05;

  return Math.max(0.3, Math.round(score * 100) / 100);
}

/**
 * Map merchant/category from slug and spec.
 * Ualá has no explicit category field — infer from slug.
 */
const SLUG_META: Record<string, { merchant: string; category: string; subcategory: string }> = {
  carrefour:   { merchant: 'Carrefour',   category: 'Supermercados',   subcategory: 'Hipermercado' },
  coderhouse:  { merchant: 'Coderhouse',  category: 'Educación',       subcategory: 'Tecnología / Cursos' },
  sportclub:   { merchant: 'SportClub',   category: 'Deporte',         subcategory: 'Gimnasio' },
  ualabis:     { merchant: 'Ualá Bis',    category: 'QR / Pagos',      subcategory: 'POS Pro' },
};

/** Extract exclusions from legalDisclaimer. */
function extractExclusions(legal: string): string {
  // Find "No válida para..." or "No aplicable para..." sentences
  const exclusionRe = /(?:no\s+(?:es\s+)?v[áa]lida?\s+para|no\s+aplicable\s+para|no\s+incluye|no\s+acumula)[^.]{10,200}\./gi;
  const matches: string[] = [];
  let m;
  while ((m = exclusionRe.exec(legal)) !== null) matches.push(m[0].trim());
  return matches.slice(0, 5).join(' | ');
}

// ─── Main normalize function ──────────────────────────────────────────────────

export function normalize(raw: UalaRawPromo, scrapedAt: string): UalaPromo {
  const { slug, detail, spec, specIndex } = raw;
  const today = scrapedAt.slice(0, 10);

  const channel    = resolveChannel(spec.place ?? []);
  const instrument = resolveInstrument(spec.paymentMethods ?? []);
  const family     = resolvePromoFamily(spec, channel, instrument);
  const discType   = resolveDiscountType(spec);

  const { cap, period } = parseCashbackCap(spec.cashback ?? '');

  const validFrom = parseLegalFrom(spec.legalDisclaimer ?? '');
  const validTo   = parseLegalTo(spec.legalDisclaimer ?? '', spec.date ?? '');
  const freshness = resolveFreshness(validFrom, validTo, today);

  const slugMeta = SLUG_META[slug] ?? { merchant: '', category: 'Otro', subcategory: '' };

  // Merchant name: slug lookup (canonical) → SEO title fallback → slug titlecase
  const merchantName =
    slugMeta.merchant ||
    detail.seo?.title?.replace(/\s*-\s*Promociones\s+Ualá.*/i, '').trim() ||
    slug.charAt(0).toUpperCase() + slug.slice(1);

  const discPct = parseDiscountPercent(spec.title);

  const partialPromo: Partial<UalaPromo> = {
    valid_from: validFrom,
    valid_to: validTo,
    discount_percent: discPct,
    instrument_required: instrument,
  };

  const promoKey = `uala-${slug}-${spec.id}`;

  const promo: UalaPromo = {
    promo_key:                promoKey,
    source_id:                spec.id,
    issuer:                   'uala',
    slug,
    spec_index:               specIndex,

    source_url:               `${BASE_URL}/promociones/${slug}`,
    source_level:             1,
    source_type:              'nextjs_ssr',
    discovery_path:           'list→detail',
    confidence_score:         computeConfidence(partialPromo),

    promo_title:              `${spec.title} ${spec.description}`.trim(),
    merchant_name:            merchantName,
    merchant_logo_url:        detail.logo?.src ? `https:${detail.logo.src}` : '',
    category:                 slugMeta.category,
    subcategory:              slugMeta.subcategory,

    discount_percent:         discPct,
    discount_amount_ars:      null,
    discount_type:            discType,
    promo_family:             family,
    cap_amount_ars:           cap,
    cap_period:               period,

    valid_from:               validFrom,
    valid_to:                 validTo,
    validity_text_raw:        spec.date ?? '',

    day_pattern:              normalizeDays(spec.days ?? []),
    payment_method:           (spec.paymentMethods ?? []).join('; '),

    instrument_required:      instrument,
    card_brand_scope:         instrument !== 'unknown' && instrument !== 'qr_wallet' ? 'Mastercard' : '',
    channel,

    reimbursement_timing_raw: spec.cashdate !== '-' ? (spec.cashdate ?? '') : '',
    coupon_code:              extractCouponCode(spec.description ?? '') ||
                              extractCouponCode(spec.legalDisclaimer ?? ''),

    terms_text_raw:           spec.legalDisclaimer ?? '',
    exclusions_raw:           extractExclusions(spec.legalDisclaimer ?? ''),
    cta_url:                  spec.cta?.href ?? '',

    freshness_status:         freshness,

    is_active:                freshness === 'active',
    scraped_at:               scrapedAt,
    raw_snippet:              JSON.stringify({
      title: spec.title,
      description: spec.description,
      paymentMethods: spec.paymentMethods,
      days: spec.days,
      place: spec.place,
      date: spec.date,
      cashback: spec.cashback,
    }),
  };

  return promo;
}
