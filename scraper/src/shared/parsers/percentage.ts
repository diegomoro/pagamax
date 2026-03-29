/**
 * parsePercentage
 *
 * Extracts the first percentage value from a Spanish-language promotion text.
 * Reusable across all issuers.
 *
 * Handles:
 *   "30% de descuento"
 *   "Hasta 50%"
 *   "20 % OFF"
 *   "12,5% de reintegro"
 *   "Obtené un 10% de cashback"
 *
 * Returns the numeric percentage (e.g., 30), or null if none found.
 * Never throws.
 */

// Matches an integer or decimal number immediately followed by optional
// whitespace and a percent sign. Decimal separator may be comma (Argentine).
const PCT_RE = /(\d+(?:[.,]\d+)?)\s*%/;

export function parsePercentage(text: string): number | null {
  if (!text) return null;
  const m = PCT_RE.exec(text);
  if (!m || m[1] === undefined) return null;
  // Normalize decimal separator: Argentine texts use comma
  return parseFloat(m[1].replace(',', '.'));
}
