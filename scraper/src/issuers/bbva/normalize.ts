/**
 * normalize.ts — Map raw BBVA API data → BbvaPromo schema
 */

import type { BbvaRawPromo, BbvaPromo, BbvaBeneficio, BbvaDetailItem, BbvaListItem } from './types.js';

const BASE_URL = 'https://www.bbva.com.ar';

// ─── Day pattern parsing ──────────────────────────────────────────────────────

// diasPromo is 7 comma-separated bits: Mon(0),Tue(1),Wed(2),Thu(3),Fri(4),Sat(5),Sun(6)
const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function parseDiasPromo(diasPromo: string | null): string {
  if (!diasPromo) return 'everyday';
  const bits = diasPromo.split(',').map(b => b.trim());
  if (bits.length !== 7 || bits.every(b => b === '1')) return 'everyday';
  if (bits.every(b => b === '0')) return 'unknown';
  const activeDays = bits
    .map((b, i) => (b === '1' ? DAY_NAMES[i]! : null))
    .filter(Boolean) as string[];
  if (activeDays.length === 7) return 'everyday';
  return activeDays.join('; ');
}

/** Spanish day names → canonical English names. */
const ES_DAYS: Array<[RegExp, string]> = [
  [/\blunes\b/i,                  'monday'],
  [/\bmartes\b/i,                 'tuesday'],
  [/\bmi[eé]rcoles\b/i,           'wednesday'],
  [/\bjueves\b/i,                 'thursday'],
  [/\bviernes\b/i,                'friday'],
  [/\bs[aá]bados?\b/i,            'saturday'],
  [/\bdomingos?\b/i,              'sunday'],
];

/**
 * Fallback: extract day pattern from Spanish description text when diasPromo is null.
 * Returns null if no day keywords found (caller should use 'everyday').
 */
export function parseDaysFromText(text: string): string | null {
  const found = ES_DAYS.filter(([re]) => re.test(text)).map(([, name]) => name);
  if (found.length === 0 || found.length === 7) return null;
  return found.join('; ');
}

// ─── Discount parsing ─────────────────────────────────────────────────────────

/** Parse discount % from cabecera or requisitos text. */
function parseDiscountPercent(cabecera: string, reqText: string): number | null {
  // Look for patterns like "30%", "20% ", "100%"
  for (const src of [cabecera, reqText]) {
    const m = src.match(/(\d+(?:\.\d+)?)\s*%/);
    if (m) {
      const n = parseFloat(m[1]!);
      if (!isNaN(n) && n > 0 && n <= 100) return n;
    }
  }
  return null;
}

/** Parse ARS amount from string: "$16.000" or "16000" → 16000. */
function parseArsAmount(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = String(s).replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) || n <= 0 ? null : n;
}

// ─── Discount type classification ────────────────────────────────────────────

function resolveDiscountType(b: BbvaBeneficio, cabecera: string, basesCondiciones: string): string {
  if (b.cuota > 0) return 'installments';
  const text = ((b.requisitos?.[0] ?? '') + ' ' + cabecera + ' ' + basesCondiciones).toLowerCase();
  if (text.includes('reintegro')) return 'cashback';
  if (text.includes('descuento') || text.includes('% de dto') || text.includes('% dto')) return 'direct_discount';
  if (text.includes('adhesión') || text.includes('débito automático')) return 'direct_discount';
  return 'unknown';
}

function resolvePromoFamily(b: BbvaBeneficio, discType: string, reqText: string): string {
  if (discType === 'installments') return 'cuotas';
  if (discType === 'cashback') return 'cashback';
  const lc = reqText.toLowerCase();
  if (lc.includes('débito automático') || lc.includes('adhesión')) return 'subscription';
  return 'merchant_discount';
}

// ─── Cap parsing ─────────────────────────────────────────────────────────────

function parseCap(b: BbvaBeneficio, reqText: string): { cap: number | null; period: string } {
  // b.tope is the primary source
  if (b.tope !== null && b.tope !== undefined) {
    const period = resolvePeriod(b.frecuenciaTope, reqText);
    return { cap: b.tope, period };
  }
  // Fallback: parse from requisitos text "tope $16.000 por mes"
  const m = reqText.match(/tope\s*(?:de\s*reintegro[:\s]*)?[\$]?\s*([\d.,]+)\s*/i);
  if (m) {
    const cap = parseArsAmount(m[1]);
    const period = resolvePeriod(b.frecuenciaTope, reqText);
    return { cap, period };
  }
  return { cap: null, period: '' };
}

function resolvePeriod(frecuencia: string, text: string): string {
  const f = (frecuencia ?? '').toLowerCase().trim();
  if (f.includes('mensual') || f.includes('mes')) return 'monthly';
  if (f.includes('semana')) return 'weekly';
  if (f.includes('diario') || f.includes('día')) return 'daily';
  if (f.includes('transac') || f.includes('oper')) return 'per_transaction';
  // Fallback from text
  const t = text.toLowerCase();
  if (t.includes('por mes') || t.includes('mensual')) return 'monthly';
  if (t.includes('por semana')) return 'weekly';
  if (t.includes('por operaci') || t.includes('por transac')) return 'per_transaction';
  return 'monthly';  // BBVA caps are almost always monthly
}

// ─── Channel resolution ───────────────────────────────────────────────────────

function resolveChannel(
  detail: BbvaDetailItem,
  basesCondiciones: string
): string {
  const hasSucursales = (detail.canalesVenta?.sucursales?.length ?? 0) > 0;
  const hasWeb        = (detail.canalesVenta?.web?.length ?? 0) > 0;

  if (hasSucursales && hasWeb)  return 'mixed';
  if (hasSucursales)            return 'in-store';
  if (hasWeb)                   return 'online';

  // Infer from basesCondiciones
  const lc = basesCondiciones.toLowerCase();
  if (lc.includes('sitio web') || lc.includes('online') || lc.includes('https://')) return 'online';
  if (lc.includes('local') || lc.includes('sucursal') || lc.includes('comercio')) return 'in-store';
  if (lc.includes('app bbva') || lc.includes('qr') || lc.includes('celular')) return 'in-store'; // QR in physical stores
  return 'unknown';
}

// ─── Rail & wallet resolution ────────────────────────────────────────────────

function resolveRail(text: string): string {
  const lc = text.toLowerCase();
  if (lc.includes('débito automático')) return 'direct_debit';
  if (lc.includes('nfc') || lc.includes('sin contacto') || lc.includes('contactless') || lc.includes('celular sin contacto')) return 'nfc';
  if (lc.includes('qr modo') || lc.includes('qr bbva') || lc.match(/\bqr\b/)) return 'qr';
  return 'card';
}

function resolveWalletScope(text: string): string {
  const wallets: string[] = [];
  const lc = text.toLowerCase();
  if (lc.includes('apple pay')) wallets.push('apple_pay');
  if (lc.includes('google pay')) wallets.push('google_pay');
  if (lc.includes(' modo ') || lc.includes('modo sin contacto') || lc.includes('qr modo')) wallets.push('modo');
  return wallets.join('; ');
}

// ─── Instrument resolution ───────────────────────────────────────────────────

function resolveInstrument(text: string): string {
  const lc = text.toLowerCase();
  const hasDebit   = lc.includes('débito') || lc.includes('debito');
  const hasCredit  = lc.includes('crédito') || lc.includes('credito');
  const hasPrepaid = lc.includes('prepaga') || lc.includes('prepaid');
  if (hasPrepaid)              return 'prepaid_card';
  if (hasDebit && hasCredit)   return 'credit_card; debit_card';
  if (hasDebit)                return 'debit_card';
  if (hasCredit)               return 'credit_card';
  return 'unknown';
}

function resolveCardTypeScope(instrument: string): string {
  if (instrument === 'credit_card') return 'credit';
  if (instrument === 'debit_card')  return 'debit';
  if (instrument === 'prepaid_card') return 'prepaid';
  if (instrument.includes(';')) return 'credit; debit';
  return '';
}

// ─── Card brand resolution ───────────────────────────────────────────────────

function resolveCardBrandScope(text: string): string {
  const lc = text.toLowerCase();
  const hasVisa       = lc.includes('visa');
  const hasMastercard = lc.includes('mastercard');
  if (hasVisa && hasMastercard) return 'Visa; Mastercard';
  if (hasVisa)       return 'Visa';
  if (hasMastercard) return 'Mastercard';
  return 'all';  // "tarjetas de crédito BBVA" = all brands
}

// ─── Program scope ────────────────────────────────────────────────────────────

function resolveProgramScope(text: string): string {
  const lc = text.toLowerCase();
  const programs: string[] = [];
  if (lc.includes('plan v')) programs.push('plan_v');
  if (lc.includes(' black ') || lc.includes('black.')) programs.push('black');
  if (lc.includes('select')) programs.push('select');
  if (lc.includes('elite')) programs.push('elite');
  return programs.join('; ');
}

// ─── Geo scope ────────────────────────────────────────────────────────────────

function resolveGeoScope(basesCondiciones: string, detail: BbvaDetailItem): string {
  const lc = basesCondiciones.toLowerCase();
  if (lc.includes('todo el país') || lc.includes('toda argentina') || lc.includes('para argentina')) return 'national';

  const localidades = (detail.canalesVenta?.sucursales ?? [])
    .map(s => s.localidad)
    .filter(Boolean);
  if (localidades.length === 0) return 'national';

  const unique = [...new Set(localidades)].slice(0, 5);
  return unique.join('; ');
}

// ─── Merchant name extraction ─────────────────────────────────────────────────

/**
 * Extract merchant name from cabecera by stripping trailing discount/installment descriptors.
 * e.g. "Kirker Libros 30% y 6 cuotas" → "Kirker Libros"
 *      "Ipoint 12 cuotas" → "Ipoint"
 *      "Satori 20%" → "Satori"
 */
function extractMerchantName(cabecera: string): string {
  return cabecera
    .replace(/\s+\d+\s*%.*$/i, '')      // strip " N% ..." and everything after
    .replace(/\s+\d+\s*cuotas.*$/i, '') // strip " N cuotas ..."
    .replace(/\s{2,}/g, ' ')
    .trim() || cabecera;
}

// ─── Category inference ───────────────────────────────────────────────────────

const CATEGORY_PATTERNS: Array<{ re: RegExp; category: string; subcategory: string }> = [
  { re: /supermercado|carrefour|jumbo|disco|coto|mercado|\bdia\b/i, category: 'Supermercados',       subcategory: '' },
  { re: /farmacia|salud|farmashop/i,                                 category: 'Salud y belleza',      subcategory: 'Farmacia' },
  { re: /cine|cinema|hoyts|showcase|passline|teatro|evento|ticket/i, category: 'Entretenimiento',      subcategory: '' },
  { re: /restauran|gastronomía|comida|pizza|burger|sushi|bistro|cafe|café|barra|piazza|estancia|bodega/i, category: 'Gastronomía', subcategory: '' },
  { re: /hotel|hospedaje|viaje|turismo|vuelo|booking|despegar/i,     category: 'Viajes y turismo',     subcategory: '' },
  { re: /subte|colectivo|transporte|peaje|cabify|apioverde/i,         category: 'Transporte',           subcategory: '' },
  { re: /libr[oae]s|editorial|ebooks|kirker/i,                        category: 'Educación',            subcategory: 'Librería' },
  { re: /ropa|indument|moda|zapatería|calzado|grimoldi|vans|nike|dexter|montagne|merrell|north\s*face|hush|macowens|humanic|rapanui|moov|collezione|vincenzo/i, category: 'Moda', subcategory: '' },
  { re: /electro|tecno|celular|computa|tablet|notebook|fraveg|samsung|noblex|motorola|xiaomi|ipoint|apple|sony|\blg\b|hisense|\btcl\b/i, category: 'Electrónica', subcategory: '' },
  { re: /deport[ei]|gym|fitness|sport|running|airbag\s*gira|\bexit\b/i, category: 'Deporte',           subcategory: '' },
  { re: /ferreteri|herramient|construcc|bausing|centrogar|gamma/i,    category: 'Hogar y construcción', subcategory: '' },
  { re: /peluquer|estet|spa|belleza|cosmé|parfumerie|kiehl|lancome/i, category: 'Salud y belleza',      subcategory: '' },
  { re: /niño|juguete|bebé|maternidad|cheeky|mamyblue/i,              category: 'Infantil',             subcategory: '' },
  { re: /mascota|pet\b|casper|veterinar/i,                            category: 'Mascotas',             subcategory: '' },
  { re: /financiación|cotización|seguro|préstamo/i,                   category: 'Finanzas',             subcategory: '' },
];

function inferCategory(cabecera: string, _reqText: string): { category: string; subcategory: string } {
  // Use cabecera (merchant name) ONLY — reqText always has "tarjeta de crédito BBVA"
  // which would match the Finanzas pattern for every promo.
  for (const p of CATEGORY_PATTERNS) {
    if (p.re.test(cabecera)) return { category: p.category, subcategory: p.subcategory };
  }
  return { category: 'Otros', subcategory: '' };
}

// ─── Exclusions extraction ────────────────────────────────────────────────────

function extractExclusions(basesCondiciones: string): string {
  const re = /(?:no\s+(?:aplica|es\s+v[áa]lida?|participa|incluye|se\s+combina|se\s+acumula)|no\s+combina|no\s+acumula)[^.]{10,250}\./gi;
  const hits: string[] = [];
  let m;
  while ((m = re.exec(basesCondiciones)) !== null) hits.push(m[0].trim());
  return hits.slice(0, 5).join(' | ');
}

// ─── Reimbursement timing ─────────────────────────────────────────────────────

function resolveReimbursementTiming(
  tiempoAcreditacion: string | null,
  basesCondiciones: string
): string {
  if (tiempoAcreditacion && tiempoAcreditacion.trim()) return tiempoAcreditacion;
  const m = basesCondiciones.match(/(?:acredit|reintegr|abonará)[^\.\n]{0,100}(dentro de[^\.\n]{5,60}|en\s+\d+[^\.\n]{3,40}(?:días?|horas?|hábiles?)[^\.\n]{0,30})/i);
  if (m) return m[0].replace(/\s+/g, ' ').trim().slice(0, 120);
  return '';
}

// ─── Freshness ────────────────────────────────────────────────────────────────

function resolveFreshness(validFrom: string, validTo: string, today: string): { status: string; reason: string } {
  if (!validTo) return { status: 'unknown', reason: 'no valid_to date' };
  if (validTo < today) return { status: 'expired', reason: `valid_to ${validTo} < today ${today}` };
  if (validFrom && validFrom > today) return { status: 'future', reason: `valid_from ${validFrom} > today ${today}` };
  return { status: 'active', reason: '' };
}

// ─── Main normalize function ──────────────────────────────────────────────────

export function normalize(raw: BbvaRawPromo, scrapedAt: string): BbvaPromo {
  const today   = scrapedAt.slice(0, 10);
  const { listItem, detail } = raw;

  const b        = detail.beneficios?.[0] ?? {} as BbvaBeneficio;
  const reqText  = b.requisitos?.[0] ?? '';
  const bases    = detail.basesCondiciones ?? '';
  const allText  = `${reqText} ${bases}`;

  const discType  = resolveDiscountType(b, listItem.cabecera, bases);
  const family    = resolvePromoFamily(b, discType, reqText);
  const { cap, period } = parseCap(b, reqText);
  const rail      = resolveRail(allText);
  const wallet    = resolveWalletScope(allText);
  const instrument = resolveInstrument(allText);
  const channel   = resolveChannel(detail, bases);
  const discPct   = parseDiscountPercent(listItem.cabecera, reqText);
  const { category, subcategory } = inferCategory(listItem.cabecera, reqText);
  const rawDias = listItem.diasPromo ?? detail.diasPromo ?? null;
  const dayPattern = rawDias
    ? parseDiasPromo(rawDias)
    : (parseDaysFromText(allText) ?? 'everyday');
  const { status: freshness, reason: freshnessReason } = resolveFreshness(
    listItem.fechaDesde, listItem.fechaHasta, today
  );

  const webUrls = (detail.canalesVenta?.web ?? [])
    .map(w => w.url)
    .filter(Boolean)
    .join('; ');

  return {
    promo_key:               `bbva-${listItem.id}`,
    source:                  'bbva',
    promo_id_raw:            listItem.id,
    promo_id_type:           'sequential_numeric',
    source_url:              `${BASE_URL}/beneficios/beneficio.html?id=${listItem.id}`,
    canonical_request_url:   `https://go.bbva.com.ar/willgo/fgo/API/v3/communication/${listItem.id}`,
    source_level:            1,
    source_type:             'rest_json',

    promo_title:             listItem.cabecera,
    merchant_name:           extractMerchantName(listItem.cabecera),
    merchant_logo_url:       listItem.imagen ?? '',
    category,
    subcategory,
    description_short:       reqText.replace(/&amp;/g, '&').replace(/&#43;/g, '+').replace(/<[^>]+>/g, '').replace(/\n/g, ' ').trim().slice(0, 300),

    discount_percent:        discPct,
    discount_amount_ars:     null,
    discount_type:           discType,
    installments_count:      b.cuota ?? 0,
    promo_family:            family,
    cap_amount_ars:          cap,
    cap_period:              period,
    min_purchase_amount_ars: null,

    valid_from:              listItem.fechaDesde ?? '',
    valid_to:                listItem.fechaHasta ?? '',
    validity_text_raw:       detail.vigencia ?? '',

    day_pattern:             dayPattern,

    channel,
    rail,
    payment_method:          listItem.grupoTarjeta ?? '',
    instrument_required:     instrument,
    wallet_scope:            wallet,
    card_brand_scope:        resolveCardBrandScope(allText),
    card_type_scope:         resolveCardTypeScope(instrument),
    program_scope:           resolveProgramScope(allText),
    geo_scope:               resolveGeoScope(bases, detail),

    reimbursement_timing_raw: resolveReimbursementTiming(detail.tiempoAcreditacion, bases),

    terms_text_raw:          bases,
    exclusions_raw:          extractExclusions(bases),
    web_urls:                webUrls,

    freshness_status:        freshness,
    freshness_reason:        freshnessReason,

    scraped_at:              scrapedAt,
    raw_snippet:             JSON.stringify({
      id: listItem.id,
      cabecera: listItem.cabecera,
      fechaDesde: listItem.fechaDesde,
      fechaHasta: listItem.fechaHasta,
      diasPromo: listItem.diasPromo,
      montoTope: listItem.montoTope,
      cuota: b.cuota,
      tope: b.tope,
      tipoTope: b.tipoTope,
      vigencia: detail.vigencia,
    }),
  };
}
