/**
 * extract.ts — YPF Serviclub benefit extractor
 *
 * Strategy:
 *  1. Probe serviclub.com.ar — if it returns an "en renovación" / maintenance page,
 *     fall back to hardcoded fuel discounts from app.ypf.com landing page.
 *  2. When serviclub returns, parse partner merchant promos from the catalog page.
 *
 * Current state (2026-03-29): serviclub.com.ar is under maintenance.
 * The fallback emits the two fuel discounts validated from app.ypf.com.
 */

import type { YpfRawPromo } from './types.js';

const SERVICLUB_URL = 'https://serviclub.com.ar/';
const APP_YPF_URL   = 'https://app.ypf.com/';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

/** Returns true if the response body looks like a maintenance page. */
function isMaintenancePage(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes('renovación') ||
    lower.includes('renovacion') ||
    lower.includes('mantenimiento') ||
    lower.includes('maintenance') ||
    lower.includes('en construcción') ||
    lower.includes('próximamente') ||
    lower.includes('coming soon') ||
    (lower.includes('sitio') && lower.includes('no está disponible'))
  );
}

/**
 * Hardcoded YPF App fuel discounts.
 * Validated from app.ypf.com and ypf.com product pages as of 2026-03-24.
 * Update these when scraper gains live catalog access.
 */
const STATIC_FALLBACK_PROMOS: YpfRawPromo[] = [
  {
    source: 'static_fallback',
    source_url: APP_YPF_URL,
    title: '3% de descuento en combustible YPF',
    description: '3% de descuento en todos los combustibles YPF en modalidad self-service pagando con la app YPF (código QR). Todos los días.',
    merchant_name: 'Estaciones YPF',
    category: 'Combustible',
    discount_type: 'direct_discount',
    discount_percent: 3,
    cap_amount_ars: null,
    cap_period: '',
    days_of_week: 'everyday',
    rail: 'qr',
    valid_from: '',
    valid_to: '',
    terms_text_raw:
      'Descuento del 3% aplicado en el momento de la compra al abonar con la app YPF mediante código QR en modalidad self-service en estaciones YPF adheridas en todo el país.',
    is_static_fallback: true,
  },
  {
    source: 'static_fallback',
    source_url: APP_YPF_URL,
    title: '6% de descuento nocturno en combustible YPF',
    description: '6% de descuento en combustibles YPF de 22:00 a 06:00 hs pagando con la app YPF (código QR). Todos los días.',
    merchant_name: 'Estaciones YPF',
    category: 'Combustible',
    discount_type: 'direct_discount',
    discount_percent: 6,
    cap_amount_ars: null,
    cap_period: '',
    days_of_week: 'everyday',
    rail: 'qr',
    valid_from: '',
    valid_to: '',
    terms_text_raw:
      'Descuento del 6% aplicado en el momento de la compra al abonar con la app YPF mediante código QR entre las 22:00 y las 06:00 hs en estaciones YPF adheridas en todo el país.',
    is_static_fallback: true,
  },
];

/**
 * Main extract function. Returns raw promos.
 * Tries serviclub.com.ar first; falls back to hardcoded promos if it is unreachable
 * or showing a maintenance page.
 */
export async function extractYpfPromos(): Promise<{
  promos: YpfRawPromo[];
  servoclubOnline: boolean;
  servoclubUrl: string;
}> {
  // 1. Probe serviclub
  let servoclubOnline = false;
  try {
    const res = await fetch(SERVICLUB_URL, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const html = await res.text();
      if (!isMaintenancePage(html)) {
        servoclubOnline = true;
        // TODO: parse catalog when serviclub is back
        // For now fall through to fallback even if online (catalog parse not yet implemented)
        process.stderr.write(`[ypf/extract] serviclub.com.ar responded OK — catalog parse not yet implemented, using fallback\n`);
      } else {
        process.stderr.write(`[ypf/extract] serviclub.com.ar is in maintenance mode\n`);
      }
    } else {
      process.stderr.write(`[ypf/extract] serviclub.com.ar returned HTTP ${res.status}\n`);
    }
  } catch (e) {
    process.stderr.write(`[ypf/extract] serviclub.com.ar unreachable: ${e}\n`);
  }

  // 2. Use static fallback
  process.stderr.write(`[ypf/extract] Using static fallback (${STATIC_FALLBACK_PROMOS.length} promos)\n`);
  return {
    promos: STATIC_FALLBACK_PROMOS,
    servoclubOnline,
    servoclubUrl: SERVICLUB_URL,
  };
}
