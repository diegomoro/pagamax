/**
 * normalize.ts — Map raw MP benefit data → MpPromo schema
 */

import type { MpRawBenefit, MpPromo, MpVdpDay } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip #value# template placeholders from MP title strings.
 * e.g. "#100%# de reintegro" → "100% de reintegro"
 */
function stripTemplateTags(s: string): string {
  return s.replace(/#([^#]+)#\s*/g, '$1 ').trim();
}

/** Strip HTML tags and decode basic entities. */
function stripHtml(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * VDP day IDs: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
 */
const DAY_ID_MAP: Record<number, string> = {
  1: 'monday', 2: 'tuesday', 3: 'wednesday',
  4: 'thursday', 5: 'friday', 6: 'saturday', 7: 'sunday',
};

function buildDaysOfWeek(days: MpVdpDay[] | undefined): string {
  if (!days || days.length === 0) return '';
  const active = days.filter(d => d.enabled).map(d => DAY_ID_MAP[d.id]).filter(Boolean);
  if (active.length === 7) return 'everyday';
  return active.join('; ');
}

function buildAllowedRails(flowType: string, flowSubtype: string, ctaHint = ''): string {
  const ft = flowType.toUpperCase();
  const fs = flowSubtype.toUpperCase();
  const rails: string[] = [];
  if (ft === 'IN_STORE') {
    rails.push('qr');
    if (fs === 'NFC') rails.push('nfc');
  } else if (ft === 'OP' || ft === 'ONLINE') {
    rails.push('online');
  } else if (ft === 'BOTH' || ft === 'ALL') {
    rails.push('qr');
    rails.push('online');
  } else if (ft === 'GENERIC') {
    // GENERIC: infer from CTA content
    if (ctaHint.includes('instore') || ctaHint.includes('transport_qr') || ctaHint.includes('qr')) {
      rails.push('qr');
    } else if (ctaHint.includes('http')) {
      rails.push('online');
    }
  }
  return rails.join('; ');
}

/** Parse discount percent from discount.value when benefit_type = DISCOUNT. */
function parseDiscountPercent(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.replace('%', '').trim().match(/^[\d.]+$/);
  if (!m) return null;
  const n = parseFloat(value.replace('%', ''));
  return isNaN(n) || n <= 0 ? null : n;
}

/** Parse installment count from discount.value when benefit_type = INSTALLMENTS. */
function parseInstallments(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1]!);
  return isNaN(n) || n <= 0 ? null : n;
}

/** Determine installment_type from discount.suffix ("SIN INTERÉS" / "CON INTERÉS"). */
function parseInstallmentType(suffix: string | undefined): string {
  if (!suffix) return '';
  const upper = suffix.toUpperCase();
  if (upper.includes('SIN') && (upper.includes('INTER') || upper.includes('INTERES'))) return 'sin_interes';
  if (upper.includes('CON') && (upper.includes('INTER') || upper.includes('INTERES'))) return 'con_interes';
  return '';
}

/** Parse Argentine amount string like "$20.000" or "$20,000" → 20000. */
function parseArgAmount(s: string): number | null {
  // Strip thousands separators (. or , followed by exactly 3 digits)
  const normalized = s.replace(/[.,](\d{3})(?=$|[^0-9])/g, '$1').replace(',', '.');
  const n = parseFloat(normalized);
  return isNaN(n) || n <= 0 ? null : n;
}

/**
 * Parse T&C plain text for dates, cap, and min purchase.
 * Handles both DD/MM/YYYY and DD/MM/YY.
 */
function parseTycDetails(html: string | undefined): {
  valid_from: string;
  valid_to: string;
  cap_amount_ars: number | null;
  min_purchase_ars: number | null;
  terms_text_raw: string;
} {
  const empty = { valid_from: '', valid_to: '', cap_amount_ars: null, min_purchase_ars: null, terms_text_raw: '' };
  if (!html) return empty;

  // Extract clean text first
  const terms_text_raw = extractTycText(html);

  // Dates — "del DD/MM/YY[YY] al DD/MM/YY[YY]"
  const dateRe = /del?\s+(\d{2}\/\d{2}\/\d{2,4})\s+al?\s+(\d{2}\/\d{2}\/\d{2,4})/i;
  const dm = dateRe.exec(terms_text_raw);
  const valid_from = dm ? ddmmToIso(dm[1]!) : '';
  const valid_to   = dm ? ddmmToIso(dm[2]!) : '';

  // Cap: "sin tope" / "sin límite" → null (no cap).
  // If a specific cap exists: "tope de $X" or "hasta $X de descuento"
  let cap_amount_ars: number | null = null;
  const noCapRe = /sin (tope|l[ií]mite)[^.]{0,40}/i;
  if (!noCapRe.test(terms_text_raw)) {
    const capRe = /tope[^$]*\$([\s\d.,]+)|\hasta\s+\$([\s\d.,]+)\s*de descuento/i;
    const cm = capRe.exec(terms_text_raw);
    if (cm) {
      cap_amount_ars = parseArgAmount((cm[1] ?? cm[2] ?? '').trim());
    }
  }

  // Minimum purchase: "compra mínima de $X" or "monto mínimo de $X"
  let min_purchase_ars: number | null = null;
  const minRe = /(?:compra|monto|importe)\s+m[ií]nima?\s+de\s+\$([\s\d.,]+)/i;
  const mm = minRe.exec(terms_text_raw);
  if (mm) min_purchase_ars = parseArgAmount(mm[1]!.trim());

  return { valid_from, valid_to, cap_amount_ars, min_purchase_ars, terms_text_raw };
}

/** Convert DD/MM/YY or DD/MM/YYYY to YYYY-MM-DD. */
function ddmmToIso(dmy: string): string {
  const parts = dmy.split('/');
  if (parts.length !== 3) return '';
  let [dd, mm, yy] = parts as [string, string, string];
  // Expand 2-digit year: assume 2000s
  if (yy.length === 2) yy = '20' + yy;
  return `${yy}-${mm}-${dd}`;
}

/** Extract plain text content from T&C HTML body.
 *  Returns empty string when the page only has the generic shell/header
 *  (CSR-only page with no substantive server-rendered terms).
 */
function extractTycText(html: string): string {
  const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                        .replace(/<style[\s\S]*?<\/style>/gi, '');
  const text = stripHtml(noScripts).replace(/\s{3,}/g, '  ').slice(0, 8000);

  // If the result is only the page header (repeated "Términos y condiciones")
  // with no substantive content, return empty string to avoid noise.
  const stripped = text.replace(/Términos y condiciones/gi, '').trim();
  if (stripped.length < 80) return '';

  return text;
}

/** Build store_locator_url from discount.link.cta if type = internal. */
function buildStoreLocatorUrl(cta: string | undefined, type: string | undefined): string {
  if (!cta || type !== 'internal') return '';
  // Decode from mercadopago:// deeplink
  const urlMatch = cta.match(/url=([^&]+)/);
  if (!urlMatch) return cta;
  return decodeURIComponent(urlMatch[1]!);
}

/** Build T&C URL from additional_info.link.cta. */
function buildTycUrl(cta: string | undefined): string {
  if (!cta) return '';
  const urlMatch = cta.match(/url=([^&]+)/);
  if (!urlMatch) return cta;
  return decodeURIComponent(urlMatch[1]!);
}

// ─── Main normalize function ─────────────────────────────────────────────────

export function normalize(raw: MpRawBenefit, scrapedAt: string): MpPromo {
  const { listItem, vdp, tycHtml } = raw;
  const d  = vdp?.discount;
  const s  = vdp?.seller;
  const pm = vdp?.payment_methods;
  const ai = vdp?.additional_info;
  const ev = vdp?.tracking?.event_data ?? d?.link?.tracking?.event_data;

  const flowType    = ev?.flow?.flow_type ?? '';
  const flowSubtype = ev?.flow?.flow_subtype ?? '';
  const benefitType = ev?.benefit?.benefit_type ?? '';

  // Days from VDP
  const daysFromVdp = buildDaysOfWeek(d?.available_days?.days);

  // ── Structured conditions from VDP additional_info.conditions[] ──────────
  // Conditions are the primary source for valid_to, cap, and min_purchase.
  // Fields: id ∈ {VALIDITY, DISCOUNT_CAP, MIN_AMOUNT, INSTALLMENTS, REDEEM_CAP}
  const conditions: Array<{id: string; key: string; value: unknown}> = ai?.conditions ?? [];

  /** Parse "$ 10.000" or "$ 50.000" → 10000 / 50000 */
  function parseCondArs(raw: unknown): number | null {
    if (!raw) return null;
    const s = String(raw).replace(/[$\s]/g, '');
    const normalized = s.replace(/[.,](\d{3})($|[^0-9])/g, '$1$2');
    const n = parseFloat(normalized);
    return isNaN(n) || n <= 0 ? null : n;
  }

  /**
   * Parse VALIDITY "hasta 23h59 del 31/mar" or "hasta 00h00 del 31/dic/2026"
   * into YYYY-MM-DD. Year is inferred from scrapedAt when not explicit.
   */
  function parseValidityDate(raw: unknown): string {
    if (!raw) return '';
    const s = String(raw);
    // Pattern: "hasta HH:MM del D[D]/mon[/YYYY]" or "... hasta HH del D/mon"
    const m = s.match(/del\s+(\d{1,2})\/(\w{3,4})(?:\/(\d{4}))?/i);
    if (!m) return '';
    const dd   = m[1]!.padStart(2, '0');
    const monS = m[2]!.toLowerCase().slice(0, 3);
    const MONTHS: Record<string, string> = {
      ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
      jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
    };
    const mm = MONTHS[monS];
    if (!mm) return '';
    const scrapeYear = parseInt(scrapedAt.slice(0, 4));
    const scrapeMonth = parseInt(scrapedAt.slice(5, 7));
    let yyyy: number;
    if (m[3]) {
      yyyy = parseInt(m[3]);
    } else {
      const parsedMonth = parseInt(mm);
      // If parsed month is before scrape month, it must be next year
      yyyy = parsedMonth < scrapeMonth ? scrapeYear + 1 : scrapeYear;
    }
    return `${yyyy}-${mm}-${dd}`;
  }

  const condValidity   = conditions.find(c => c.id === 'VALIDITY');
  const condCap        = conditions.find(c => c.id === 'DISCOUNT_CAP');
  const condMinAmount  = conditions.find(c => c.id === 'MIN_AMOUNT');

  // Dates, cap, min purchase: VDP conditions (primary) → T&C fallback
  const tycDetails = parseTycDetails(tycHtml);
  const valid_from      = tycDetails.valid_from;   // T&C only (VDP has no from)
  const valid_to        = parseValidityDate(condValidity?.value) || tycDetails.valid_to;
  const cap_amount_ars  = parseCondArs(condCap?.value)          ?? tycDetails.cap_amount_ars;
  const min_purchase_ars = parseCondArs(condMinAmount?.value)   ?? tycDetails.min_purchase_ars;
  const terms_text_raw  = tycDetails.terms_text_raw;

  // Discount fields
  const discountPercent  = benefitType === 'DISCOUNT'      ? parseDiscountPercent(d?.value)  : null;
  const installments     = benefitType === 'INSTALLMENTS'  ? parseInstallments(d?.value)     : null;
  const installmentType  = benefitType === 'INSTALLMENTS'  ? parseInstallmentType(d?.suffix) : '';

  // Discount type: MP always applies directly at point of sale
  const discountType = benefitType === 'INSTALLMENTS' ? 'installments' : 'direct_discount';

  // Store locator URL (only for in-store benefits with a CTA link)
  const storeLocatorUrl = buildStoreLocatorUrl(d?.link?.cta, d?.link?.type);

  // T&C URL
  const tycUrl = buildTycUrl(ai?.link?.cta);

  // Payment methods string
  const paymentMethodsStr = (pm?.methods ?? []).map(m => m.title).filter(Boolean).join('; ');

  // Logo from VDP seller (preferred) or list data
  const merchantLogo = s?.logo ?? listItem.data?.data?.logo?.primary?.[0] ?? '';

  // Merchant name: prefer VDP seller name
  const merchantName = s?.name ?? listItem.description ?? '';

  return {
    source_id:          listItem.id,
    issuer:             'mercadopago',
    promo_title:        stripTemplateTags(stripHtml(listItem.title)),
    merchant_name:      merchantName,
    merchant_logo_url:  merchantLogo,
    category:           listItem.data?.data?.category?.description ?? '',
    channel_label:      listItem.data?.data?.pill?.primary ?? '',
    vdp_type:           listItem.data?.data?.vdp_type ?? '',
    is_meli_plus:       listItem.data?.data?.meli_plus ?? false,
    benefit_type:       benefitType,
    discount_type:      discountType,
    discount_percent:   discountPercent,
    installments:       installments,
    installment_type:   installmentType,
    cap_amount_ars:     cap_amount_ars,
    min_purchase_ars:   min_purchase_ars,
    payment_description: stripHtml(d?.description),
    days_of_week:       daysFromVdp,
    flow_type:          flowType,
    flow_subtype:       flowSubtype,
    allowed_rails:      buildAllowedRails(flowType, flowSubtype, d?.link?.cta ?? ''),
    payment_methods_str: paymentMethodsStr,
    disclaimer:         stripHtml(ai?.disclaimer),
    store_locator_url:  storeLocatorUrl,
    tyc_url:            tycUrl,
    valid_from:         valid_from,
    valid_to:           valid_to,
    terms_text_raw:     terms_text_raw,
    is_active:          true,
    is_stale:           false,
    freshness_reason:   'MP benefits hub live API',
    scraped_at:         scrapedAt,
  };
}
