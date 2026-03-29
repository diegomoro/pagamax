/**
 * parseExpirationDate
 *
 * Extracts promotion expiration date from Spanish-language text.
 * Reusable across all issuers.
 *
 * Handles:
 *   "Hasta el 31/MAR" → Date for March 31
 *   "Hasta el 31/MAR/26" → Date for March 31, 2026
 *   "Válido hasta 15/04/2026" → Date for April 15, 2026
 *   "Hasta el 15 de abril" → Date for April 15
 *   "Va a estar disponible Hasta el 31/MAR" → Date for March 31
 *
 * Returns Date or null if no expiration found.
 * Assumes current year if not specified and the date hasn't passed.
 * Never throws.
 */

const MONTH_MAP: Record<string, number> = {
  ene: 0, enero: 0, jan: 0,
  feb: 1, febrero: 1,
  mar: 2, marzo: 2,
  abr: 3, abril: 3, apr: 3,
  may: 4, mayo: 4,
  jun: 5, junio: 5,
  jul: 6, julio: 6,
  ago: 7, agosto: 7, aug: 7,
  sep: 8, sept: 8, septiembre: 8,
  oct: 9, octubre: 9,
  nov: 10, noviembre: 10,
  dic: 11, diciembre: 11, dec: 11,
};

// "31/MAR", "31/MAR/26", "31/MAR/2026"
const SLASH_DATE_RE = /(\d{1,2})\/([A-Za-z]{3})(?:\/(\d{2,4}))?/i;

// "15/04/2026" or "15/04"
const NUMERIC_DATE_RE = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/;

// "15 de abril de 2026" or "15 de abril"
const LONG_DATE_RE = /(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?/i;

function resolveYear(year: string | undefined, month: number): number {
  if (year) {
    const y = parseInt(year, 10);
    return y < 100 ? 2000 + y : y;
  }
  const now = new Date();
  const currentYear = now.getFullYear();
  // If the month has already passed this year, assume next year
  const testDate = new Date(currentYear, month + 1, 0); // last day of month
  if (testDate < now) return currentYear + 1;
  return currentYear;
}

export function parseExpirationDate(text: string): Date | null {
  if (!text) return null;

  // Try "DD/MMM" or "DD/MMM/YY"
  const slashMatch = SLASH_DATE_RE.exec(text);
  if (slashMatch?.[1] && slashMatch[2]) {
    const day = parseInt(slashMatch[1], 10);
    const monthKey = slashMatch[2].toLowerCase();
    const month = MONTH_MAP[monthKey];
    if (month !== undefined && day >= 1 && day <= 31) {
      const year = resolveYear(slashMatch[3], month);
      return new Date(year, month, day);
    }
  }

  // Try "DD de mes de YYYY"
  const longMatch = LONG_DATE_RE.exec(text);
  if (longMatch?.[1] && longMatch[2]) {
    const day = parseInt(longMatch[1], 10);
    const monthKey = longMatch[2].toLowerCase();
    const month = MONTH_MAP[monthKey];
    if (month !== undefined && day >= 1 && day <= 31) {
      const year = resolveYear(longMatch[3], month);
      return new Date(year, month, day);
    }
  }

  // Try "DD/MM/YYYY" (only if month <= 12)
  const numMatch = NUMERIC_DATE_RE.exec(text);
  if (numMatch?.[1] && numMatch[2]) {
    const day = parseInt(numMatch[1], 10);
    const monthNum = parseInt(numMatch[2], 10);
    if (monthNum >= 1 && monthNum <= 12 && day >= 1 && day <= 31) {
      const year = resolveYear(numMatch[3], monthNum - 1);
      return new Date(year, monthNum - 1, day);
    }
  }

  return null;
}
