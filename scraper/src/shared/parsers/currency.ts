/**
 * parseCurrencyARS
 *
 * Parses an Argentine Peso amount from a string.
 * Argentine numeric convention: period = thousands separator, comma = decimal.
 *
 * Handles:
 *   "$5.000"
 *   "$ 5.000,50"
 *   "5000 pesos"
 *   "ARS 1.500"
 *   "hasta $2.500 por mes"
 *   "1.000.000"
 *
 * Returns the numeric value in ARS (e.g., 5000.5), or null if no amount found.
 * Never throws.
 */

// Step-by-step:
// 1. Strip currency prefix: $, ARS, the word "pesos" (with optional surrounding space)
// 2. Capture the numeric portion (digits, periods, commas)
// 3. Remove thousands-separator periods (a period followed by exactly 3 digits)
// 4. Replace comma decimal separator with period
// 5. Parse as float
const CURRENCY_RE = /(?:\$|ARS)?\s*(\d[\d.,]*)/;

export function parseCurrencyARS(text: string): number | null {
  if (!text) return null;

  // Remove currency prefixes and the word "pesos"
  const cleaned = text
    .replace(/\bpesos?\b/gi, '')
    .replace(/\bARS\b/g, '')
    .trim();

  const m = CURRENCY_RE.exec(cleaned);
  if (!m || m[1] === undefined) return null;

  let raw = m[1];

  // Determine if there is a decimal comma: e.g. "5.000,50"
  // If the string ends with ,XX (exactly 1-2 digits after comma), treat comma as decimal
  const hasDecimalComma = /,\d{1,2}$/.test(raw);

  if (hasDecimalComma) {
    // Remove thousands-separator periods, then replace decimal comma
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else {
    // All periods are thousands separators; no decimal part
    raw = raw.replace(/\./g, '').replace(',', '');
  }

  const value = parseFloat(raw);
  return isNaN(value) ? null : value;
}
