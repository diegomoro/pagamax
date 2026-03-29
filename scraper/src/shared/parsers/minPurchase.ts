/**
 * parseMinPurchase
 *
 * Extracts minimum purchase amount from Spanish-language promotion text.
 * Reusable across all issuers.
 *
 * Handles:
 *   "Mínimo de compra: $5.000"
 *   "compra mínima $3.000"
 *   "Sin monto mínimo" → 0
 *   "Comprá por $ 48.000 y listo" (optimal purchase, not min — returns null)
 *
 * Returns the amount in ARS, 0 for "sin mínimo", or null if not found.
 * Never throws.
 */

import { parseCurrencyARS } from './currency.js';

export function parseMinPurchase(text: string): number | null {
  if (!text) return null;

  // "Sin monto mínimo" / "sin mínimo" → 0
  if (/sin\s+(?:monto\s+)?m[ií]nimo/i.test(text)) return 0;

  // "Mínimo de compra: $X" or "Mínimo de compra $X"
  const minRe = /m[ií]nimo\s+de\s+compra[:\s]*\$\s*([\d.,]+)/i;
  const m1 = minRe.exec(text);
  if (m1?.[1]) return parseCurrencyARS('$' + m1[1]);

  // "compra mínima $X"
  const minRe2 = /compra\s+m[ií]nima[:\s]*\$\s*([\d.,]+)/i;
  const m2 = minRe2.exec(text);
  if (m2?.[1]) return parseCurrencyARS('$' + m2[1]);

  return null;
}
