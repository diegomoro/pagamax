/**
 * extract.ts — Shell Box benefit extractor
 *
 * Primary: Playwright on https://www.shell.com.ar/conductores/descuentos-vigentes.html
 *   - Parses promo cards from the JS-rendered page
 *   - Filters out bank partnership promos (already in MODO/BBVA)
 *
 * Fallback: Hardcoded promos validated from public Shell Box communications (2026-03-24).
 *   Used when the page fails to load or yields 0 Shell Box-funded cards.
 *
 * Bank filter: skip any card whose text mentions these external funders:
 *   Comafi, Galicia, Nación, Ciudad, Brubank, Supervielle, Naranja, BBVA,
 *   Santander, Macro, ICBC, Patagonia, Bancor, Credicoop
 */

import type { ShellboxRawPromo } from './types.js';

const DISCOUNTS_URL = 'https://www.shell.com.ar/conductores/descuentos-vigentes.html';

// Banks whose promos are already captured elsewhere — skip these cards
const EXTERNAL_BANK_RE =
  /\b(comafi|galicia|nación|nacion|ciudad|brubank|supervielle|naranja|bbva|santander|macro|icbc|patagonia|bancor|credicoop|hsbc|frances|francés|rio\b)\b/i;

/**
 * Hardcoded Shell Box-funded promos, validated from official Shell Box
 * communications and shell.com.ar as of 2026-03-24.
 */
const STATIC_FALLBACK_PROMOS: ShellboxRawPromo[] = [
  {
    source: 'static_fallback',
    source_url: DISCOUNTS_URL,
    title: '10% de descuento en combustibles V-Power los miércoles',
    description:
      '10% de descuento en combustibles Shell V-Power y V-Power Nitro+ al pagar con Shell Box los miércoles. Tope de $4.000 por semana.',
    merchant_name: 'Estaciones Shell',
    category: 'Combustible',
    discount_type: 'direct_discount',
    discount_percent: 10,
    cap_amount_ars: 4000,
    cap_period: 'weekly',
    days_of_week: 'wednesday',
    valid_from: '',
    valid_to: '',
    terms_text_raw:
      'Descuento del 10% en combustibles Shell V-Power y V-Power Nitro+ al abonar con Shell Box los días miércoles. Tope de $4.000 por semana. Válido en estaciones Shell adheridas en todo el país. Descuento aplicado en el momento de la compra.',
    is_static_fallback: true,
  },
  {
    source: 'static_fallback',
    source_url: DISCOUNTS_URL,
    title: '5% de descuento en combustibles Shell todos los días',
    description:
      '5% de descuento en todos los combustibles Shell al pagar con Shell Box todos los días.',
    merchant_name: 'Estaciones Shell',
    category: 'Combustible',
    discount_type: 'direct_discount',
    discount_percent: 5,
    cap_amount_ars: null,
    cap_period: '',
    days_of_week: 'everyday',
    valid_from: '',
    valid_to: '',
    terms_text_raw:
      'Descuento del 5% en todos los combustibles Shell al abonar con Shell Box. Válido todos los días en estaciones Shell adheridas. Descuento aplicado en el momento de la compra.',
    is_static_fallback: true,
  },
];

/**
 * Parse Shell Box promo cards from the discounts page HTML.
 * Returns only Shell Box-funded promos (external bank cards are filtered out).
 */
function parseDiscountCards(html: string, pageUrl: string): ShellboxRawPromo[] {
  const promos: ShellboxRawPromo[] = [];

  // Heuristic: find card-like blocks. The page renders promo cards with
  // heading + body text. We look for repeated structural patterns.
  // This is a best-effort parse; if the page structure changes, fallback activates.

  // Match discount percentages mentioned with Shell Box context
  const cardPattern = /(\d+)\s*%[^<]{0,300}shell\s*box[^<]{0,500}/gi;
  const matches = [...html.matchAll(cardPattern)];

  for (const m of matches) {
    const block = m[0]!;

    // Skip if this block mentions external bank names
    if (EXTERNAL_BANK_RE.test(block)) continue;

    const pct = parseInt(m[1]!);
    if (isNaN(pct) || pct <= 0 || pct > 100) continue;

    // Extract day pattern
    let days = 'everyday';
    if (/mi[eé]rcoles/i.test(block)) days = 'wednesday';
    else if (/lunes/i.test(block)) days = 'monday';
    else if (/martes/i.test(block)) days = 'tuesday';
    else if (/jueves/i.test(block)) days = 'thursday';
    else if (/viernes/i.test(block)) days = 'friday';
    else if (/s[aá]bados?/i.test(block)) days = 'saturday';
    else if (/domingos?/i.test(block)) days = 'sunday';

    // Extract cap
    let cap: number | null = null;
    const capMatch = /tope[^$]*\$\s?([\d.,]+)/i.exec(block);
    if (capMatch) {
      cap = parseFloat(capMatch[1]!.replace(/\./g, '').replace(',', '.'));
      if (isNaN(cap)) cap = null;
    }

    // Determine merchant
    const merchant = /vea|jumbo/i.test(block) ? 'VEA / Jumbo' : 'Estaciones Shell';
    const category = merchant === 'Estaciones Shell' ? 'Combustible' : 'Supermercados';

    promos.push({
      source: 'web_page',
      source_url: pageUrl,
      title: `${pct}% de descuento con Shell Box${days !== 'everyday' ? ` los ${days}` : ''}`,
      description: block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200),
      merchant_name: merchant,
      category,
      discount_type: 'direct_discount',
      discount_percent: pct,
      cap_amount_ars: cap,
      cap_period: cap ? 'weekly' : '',
      days_of_week: days,
      valid_from: '',
      valid_to: '',
      terms_text_raw: block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      is_static_fallback: false,
    });
  }

  return promos;
}

/**
 * Main extract function.
 * Tries Playwright (if available) on the discounts page; falls back to hardcoded.
 */
export async function extractShellboxPromos(): Promise<{
  promos: ShellboxRawPromo[];
  livePageSuccess: boolean;
}> {
  // Try Playwright
  let playwright: typeof import('playwright') | null = null;
  try {
    playwright = await import('playwright');
  } catch {
    process.stderr.write('[shellbox/extract] playwright not available, using fallback\n');
  }

  if (playwright) {
    let browser;
    try {
      browser = await playwright.chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-AR,es;q=0.9' });

      process.stderr.write(`[shellbox/extract] Loading ${DISCOUNTS_URL}\n`);
      await page.goto(DISCOUNTS_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3000);

      const html = await page.content();
      await browser.close();

      const parsed = parseDiscountCards(html, DISCOUNTS_URL);
      if (parsed.length > 0) {
        process.stderr.write(`[shellbox/extract] Parsed ${parsed.length} Shell Box promos from live page\n`);
        return { promos: parsed, livePageSuccess: true };
      }
      process.stderr.write(`[shellbox/extract] Live page yielded 0 Shell Box promos — using fallback\n`);
    } catch (e) {
      try { await browser?.close(); } catch { /* ignore */ }
      process.stderr.write(`[shellbox/extract] Playwright error: ${e}\n`);
    }
  }

  // Fallback
  process.stderr.write(`[shellbox/extract] Using static fallback (${STATIC_FALLBACK_PROMOS.length} promos)\n`);
  return { promos: STATIC_FALLBACK_PROMOS, livePageSuccess: false };
}
