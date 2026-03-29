/**
 * extract.ts — Carrefour Bank promo extractor
 *
 * Primary source: https://www.bancodeserviciosfinancieros.com.ar/beneficios-credito/
 *   - Returns 403 on plain HTTP fetch — needs Playwright (real browser UA)
 *   - Parses promo cards, filters to Tarjeta Mi Carrefour-funded rows ONLY
 *
 * Fallback: Hardcoded promos validated from official Carrefour / BSF communications
 *   as of 2026-03-24.
 *
 * DEDUP RULE (critical):
 *   External bank promos AT Carrefour (Santander, Galicia, BBVA, HSBC, etc.) are
 *   ALREADY captured via MODO / NaranjaX / MercadoPago. This scraper MUST skip them.
 *   A card is kept only when it explicitly mentions Tarjeta Mi Carrefour, Prepaga
 *   Mi Carrefour, or Cuenta Digital Mi Carrefour as the payment instrument.
 */

import type { CarrefourRawPromo, CarrefourCard } from './types.js';

const BENEFITS_URL  = 'https://www.bancodeserviciosfinancieros.com.ar/beneficios-credito/';
const PROMOS_URL    = 'https://www.bancodeserviciosfinancieros.com.ar/promociones-carrefour/';

// ── Card detection ─────────────────────────────────────────────────────────────

/** Returns true if the block is explicitly about a Carrefour-issued card. */
function detectCarrefourCard(text: string): { card: CarrefourCard; label: string } | null {
  const t = text.toLowerCase();
  if (/tarjeta\s+mi\s+carrefour\s+cr[eé]dito|mi\s+carrefour\s+cr[eé]dito/i.test(text))
    return { card: 'credito', label: 'Tarjeta Mi Carrefour Crédito' };
  if (/tarjeta\s+mi\s+carrefour\s+prepaga|mi\s+carrefour\s+prepaga|prepaga\s+mi\s+carrefour/i.test(text))
    return { card: 'prepaga', label: 'Tarjeta Mi Carrefour Prepaga' };
  if (/cuenta\s+digital\s+mi\s+carrefour|mi\s+carrefour\s+digital/i.test(text))
    return { card: 'digital', label: 'Cuenta Digital Mi Carrefour' };
  // Generic "tarjeta mi carrefour" without specifying type
  if (/tarjeta\s+mi\s+carrefour|mi\s+carrefour/i.test(t))
    return { card: 'unknown', label: 'Tarjeta Mi Carrefour' };
  return null;
}

/** Returns true if the block mentions an external bank — skip it. */
function hasExternalBank(text: string): boolean {
  return /\b(santander|galicia|bbva|hsbc|mac[rr]o|nación|nacion|ciudad|brubank|supervielle|naranja|icbc|patagonia|bancor|credicoop|frances|francés|comafi|hipotecario|industrial|supervielle|bind|chaco|bapro)\b/i
    .test(text);
}

// ── Day parser ─────────────────────────────────────────────────────────────────

function parseDays(text: string): string {
  const t = text.toLowerCase();
  const days: string[] = [];
  if (/lunes/i.test(t))      days.push('monday');
  if (/martes/i.test(t))     days.push('tuesday');
  if (/mi[eé]rcoles/i.test(t)) days.push('wednesday');
  if (/jueves/i.test(t))     days.push('thursday');
  if (/viernes/i.test(t))    days.push('friday');
  if (/s[aá]bados?/i.test(t)) days.push('saturday');
  if (/domingos?/i.test(t))  days.push('sunday');
  if (days.length === 0 || days.length === 7) return 'everyday';
  return days.join('; ');
}

// ── Cap parser ─────────────────────────────────────────────────────────────────

function parseCap(text: string): { cap: number | null; period: string } {
  const m = /tope[^$\n]*\$\s?([\d.,]+)(?:[^/\n]*)?(\/\s*(d[ií]a|semana|mes|transacci[oó]n))?/i.exec(text);
  if (!m) return { cap: null, period: '' };
  const cap = parseFloat(m[1]!.replace(/\./g, '').replace(',', '.'));
  if (isNaN(cap)) return { cap: null, period: '' };
  let period = '';
  if (m[3]) {
    const p = m[3].toLowerCase();
    if (/d[ií]a/.test(p)) period = 'daily';
    else if (/semana/.test(p)) period = 'weekly';
    else if (/mes/.test(p)) period = 'monthly';
    else if (/transacci[oó]n/.test(p)) period = 'per_transaction';
  }
  return { cap, period };
}

// ── HTML card parser ───────────────────────────────────────────────────────────

function parseHtmlCards(html: string, pageUrl: string): CarrefourRawPromo[] {
  const promos: CarrefourRawPromo[] = [];

  // Strip scripts/styles
  const clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Split by likely card boundaries (h2/h3/article/section divs)
  const chunks = clean.split(/<(?:article|section|div\s+class="[^"]*(?:promo|benefit|card|oferta)[^"]*")[^>]*>/i);

  for (const chunk of chunks) {
    const text = chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length < 30) continue;

    // Must mention Carrefour card explicitly
    const cardInfo = detectCarrefourCard(text);
    if (!cardInfo) continue;

    // Must not be an external bank promo
    if (hasExternalBank(text)) continue;

    // Extract discount percent
    const pctMatch = /(\d+)\s*%/.exec(text);
    const pct = pctMatch ? parseInt(pctMatch[1]!) : null;

    // Installments
    const installMatch = /(\d+)\s+cuotas?\s+sin\s+inter[eé]s/i.exec(text);
    const installments = installMatch ? parseInt(installMatch[1]!) : null;

    const discType = installments ? 'installments' : pct ? 'direct_discount' : 'direct_discount';

    const { cap, period } = parseCap(text);
    const days = parseDays(text);

    // Channel
    const isOnline = /carrefour\.com\.ar|online/i.test(text);
    const channel: CarrefourRawPromo['channel'] = isOnline ? 'online' : 'in-store';
    const rail: CarrefourRawPromo['rail'] = isOnline ? 'online' : 'card';

    const instrument: CarrefourRawPromo['instrument_required'] =
      cardInfo.card === 'credito' ? 'credit_card' :
      cardInfo.card === 'prepaga' ? 'prepaid_card' :
      cardInfo.card === 'digital' ? 'prepaid_card' : 'any';

    // Age restriction
    const ageMatch = /(\d{2})\s*(?:a|-)\s*(\d{2})\s*a[ñn]os?|(\d{2})\s*\+\s*a[ñn]os?/i.exec(text);
    const ageRestriction = ageMatch
      ? ageMatch[1] && ageMatch[2] ? `${ageMatch[1]}-${ageMatch[2]}` : `${ageMatch[3]}+`
      : '';

    promos.push({
      source: 'web_page',
      source_url: pageUrl,
      title: `${pct ? pct + '% ' : ''}${installments ? installments + ' cuotas s/i ' : ''}${cardInfo.label}`,
      description: text.slice(0, 200),
      merchant_name: isOnline ? 'Carrefour Online' : 'Carrefour',
      category: 'Supermercados',
      card: cardInfo.card,
      card_label: cardInfo.label,
      discount_type: discType,
      discount_percent: pct,
      installments_count: installments,
      cap_amount_ars: cap,
      cap_period: period,
      age_restriction: ageRestriction,
      days_of_week: days,
      channel,
      rail,
      instrument_required: instrument,
      valid_from: '',
      valid_to: '',
      terms_text_raw: text.slice(0, 800),
      is_static_fallback: false,
    });
  }

  return promos;
}

// ── Static fallback ────────────────────────────────────────────────────────────

/**
 * Hardcoded Carrefour Bank promos validated from official BSF / Carrefour
 * communications as of 2026-03-24.
 */
const STATIC_FALLBACK_PROMOS: CarrefourRawPromo[] = [
  {
    source: 'static_fallback', source_url: BENEFITS_URL,
    title: '20% de descuento — Tarjeta Mi Carrefour Crédito los martes',
    description: '20% de descuento en compras en supermercados Carrefour con Tarjeta Mi Carrefour Crédito los días martes.',
    merchant_name: 'Carrefour', category: 'Supermercados',
    card: 'credito', card_label: 'Tarjeta Mi Carrefour Crédito',
    discount_type: 'direct_discount', discount_percent: 20, installments_count: null,
    cap_amount_ars: null, cap_period: '', age_restriction: '',
    days_of_week: 'tuesday', channel: 'in-store', rail: 'card',
    instrument_required: 'credit_card',
    valid_from: '', valid_to: '',
    terms_text_raw: '20% de descuento en supermercados Carrefour con Tarjeta Mi Carrefour Crédito los días martes. Sin tope de descuento. Descuento aplicado en el momento de la compra.',
    is_static_fallback: true,
  },
  {
    source: 'static_fallback', source_url: BENEFITS_URL,
    title: '3 cuotas sin interés — Tarjeta Mi Carrefour Crédito sábados y domingos',
    description: '3 cuotas sin interés en Carrefour con Tarjeta Mi Carrefour Crédito los sábados y domingos.',
    merchant_name: 'Carrefour', category: 'Supermercados',
    card: 'credito', card_label: 'Tarjeta Mi Carrefour Crédito',
    discount_type: 'installments', discount_percent: null, installments_count: 3,
    cap_amount_ars: null, cap_period: '', age_restriction: '',
    days_of_week: 'saturday; sunday', channel: 'in-store', rail: 'card',
    instrument_required: 'credit_card',
    valid_from: '', valid_to: '',
    terms_text_raw: '3 cuotas sin interés en supermercados Carrefour con Tarjeta Mi Carrefour Crédito los días sábados y domingos.',
    is_static_fallback: true,
  },
  {
    source: 'static_fallback', source_url: BENEFITS_URL,
    title: '15% de descuento online — Tarjeta Mi Carrefour Crédito todos los días',
    description: '15% de descuento en carrefour.com.ar con Tarjeta Mi Carrefour Crédito todos los días.',
    merchant_name: 'Carrefour Online', category: 'Supermercados',
    card: 'credito', card_label: 'Tarjeta Mi Carrefour Crédito',
    discount_type: 'direct_discount', discount_percent: 15, installments_count: null,
    cap_amount_ars: null, cap_period: '', age_restriction: '',
    days_of_week: 'everyday', channel: 'online', rail: 'online',
    instrument_required: 'credit_card',
    valid_from: '', valid_to: '',
    terms_text_raw: '15% de descuento en carrefour.com.ar con Tarjeta Mi Carrefour Crédito todos los días.',
    is_static_fallback: true,
  },
  {
    source: 'static_fallback', source_url: BENEFITS_URL,
    title: '10% de descuento — Tarjeta Mi Carrefour Prepaga sábados y domingos',
    description: '10% de descuento en supermercados Carrefour con Tarjeta Mi Carrefour Prepaga los sábados y domingos.',
    merchant_name: 'Carrefour', category: 'Supermercados',
    card: 'prepaga', card_label: 'Tarjeta Mi Carrefour Prepaga',
    discount_type: 'direct_discount', discount_percent: 10, installments_count: null,
    cap_amount_ars: null, cap_period: '', age_restriction: '',
    days_of_week: 'saturday; sunday', channel: 'in-store', rail: 'card',
    instrument_required: 'prepaid_card',
    valid_from: '', valid_to: '',
    terms_text_raw: '10% de descuento en supermercados Carrefour con Tarjeta Mi Carrefour Prepaga los días sábados y domingos.',
    is_static_fallback: true,
  },
  {
    source: 'static_fallback', source_url: BENEFITS_URL,
    title: '10% de descuento — Tarjeta Mi Carrefour Prepaga (18-24 años) lunes a viernes',
    description: '10% de descuento en supermercados Carrefour con Tarjeta Mi Carrefour Prepaga para clientes de 18 a 24 años, de lunes a viernes. Tope $10.000/día.',
    merchant_name: 'Carrefour', category: 'Supermercados',
    card: 'prepaga', card_label: 'Tarjeta Mi Carrefour Prepaga',
    discount_type: 'direct_discount', discount_percent: 10, installments_count: null,
    cap_amount_ars: 10000, cap_period: 'daily', age_restriction: '18-24',
    days_of_week: 'monday; tuesday; wednesday; thursday; friday',
    channel: 'in-store', rail: 'card',
    instrument_required: 'prepaid_card',
    valid_from: '', valid_to: '',
    terms_text_raw: '10% de descuento en supermercados Carrefour con Tarjeta Mi Carrefour Prepaga para clientes de 18 a 24 años de lunes a viernes. Tope $10.000 por día.',
    is_static_fallback: true,
  },
  {
    source: 'static_fallback', source_url: BENEFITS_URL,
    title: '10% de descuento — Tarjeta Mi Carrefour Prepaga (+60 años) lunes a viernes',
    description: '10% de descuento en supermercados Carrefour con Tarjeta Mi Carrefour Prepaga para clientes de 60 años o más, de lunes a viernes. Tope $15.000/día.',
    merchant_name: 'Carrefour', category: 'Supermercados',
    card: 'prepaga', card_label: 'Tarjeta Mi Carrefour Prepaga',
    discount_type: 'direct_discount', discount_percent: 10, installments_count: null,
    cap_amount_ars: 15000, cap_period: 'daily', age_restriction: '60+',
    days_of_week: 'monday; tuesday; wednesday; thursday; friday',
    channel: 'in-store', rail: 'card',
    instrument_required: 'prepaid_card',
    valid_from: '', valid_to: '',
    terms_text_raw: '10% de descuento en supermercados Carrefour con Tarjeta Mi Carrefour Prepaga para clientes de 60 años o más de lunes a viernes. Tope $15.000 por día.',
    is_static_fallback: true,
  },
  {
    source: 'static_fallback', source_url: BENEFITS_URL,
    title: '15% de descuento — Cuenta Digital Mi Carrefour los viernes',
    description: '15% de descuento en supermercados Carrefour con Cuenta Digital Mi Carrefour los viernes.',
    merchant_name: 'Carrefour', category: 'Supermercados',
    card: 'digital', card_label: 'Cuenta Digital Mi Carrefour',
    discount_type: 'direct_discount', discount_percent: 15, installments_count: null,
    cap_amount_ars: null, cap_period: '', age_restriction: '',
    days_of_week: 'friday', channel: 'in-store', rail: 'card',
    instrument_required: 'prepaid_card',
    valid_from: '', valid_to: '',
    terms_text_raw: '15% de descuento en supermercados Carrefour con Cuenta Digital Mi Carrefour los días viernes.',
    is_static_fallback: true,
  },
  {
    source: 'static_fallback', source_url: BENEFITS_URL,
    title: '10% de descuento — Cuenta Digital Mi Carrefour sábados y domingos',
    description: '10% de descuento en supermercados Carrefour con Cuenta Digital Mi Carrefour los sábados y domingos.',
    merchant_name: 'Carrefour', category: 'Supermercados',
    card: 'digital', card_label: 'Cuenta Digital Mi Carrefour',
    discount_type: 'direct_discount', discount_percent: 10, installments_count: null,
    cap_amount_ars: null, cap_period: '', age_restriction: '',
    days_of_week: 'saturday; sunday', channel: 'in-store', rail: 'card',
    instrument_required: 'prepaid_card',
    valid_from: '', valid_to: '',
    terms_text_raw: '10% de descuento en supermercados Carrefour con Cuenta Digital Mi Carrefour los días sábados y domingos.',
    is_static_fallback: true,
  },
];

// ── Main extract ───────────────────────────────────────────────────────────────

/**
 * Main extract function.
 * Tries Playwright on bancodeserviciosfinancieros.com.ar (bypasses 403).
 * Falls back to hardcoded promos if page yields 0 Carrefour-card rows.
 */
export async function extractCarrefourPromos(): Promise<{
  promos: CarrefourRawPromo[];
  livePageSuccess: boolean;
}> {
  let playwright: typeof import('playwright') | null = null;
  try {
    playwright = await import('playwright');
  } catch {
    process.stderr.write('[carrefour_bank/extract] playwright not available, using fallback\n');
  }

  for (const url of [BENEFITS_URL, PROMOS_URL]) {
    if (!playwright) break;
    let browser;
    try {
      browser = await playwright.chromium.launch({ headless: true });
      const ctx  = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'es-AR',
      });
      const page = await ctx.newPage();

      process.stderr.write(`[carrefour_bank/extract] Loading ${url}\n`);
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      if (!res || !res.ok()) {
        process.stderr.write(`[carrefour_bank/extract] ${url} returned ${res?.status()}\n`);
        await browser.close();
        continue;
      }

      await page.waitForTimeout(3000);
      const html = await page.content();
      await browser.close();

      const parsed = parseHtmlCards(html, url);
      if (parsed.length > 0) {
        process.stderr.write(`[carrefour_bank/extract] Parsed ${parsed.length} Mi Carrefour promos from ${url}\n`);
        return { promos: parsed, livePageSuccess: true };
      }
      process.stderr.write(`[carrefour_bank/extract] ${url} yielded 0 Mi Carrefour promos\n`);
    } catch (e) {
      try { await browser?.close(); } catch { /* ignore */ }
      process.stderr.write(`[carrefour_bank/extract] Playwright error on ${url}: ${e}\n`);
    }
  }

  // Fallback
  process.stderr.write(`[carrefour_bank/extract] Using static fallback (${STATIC_FALLBACK_PROMOS.length} promos)\n`);
  return { promos: STATIC_FALLBACK_PROMOS, livePageSuccess: false };
}
