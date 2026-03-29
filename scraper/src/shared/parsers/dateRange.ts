/**
 * parseDateRangeSpanish
 *
 * Parses a date range from Spanish-language promotion text.
 * Reusable across all issuers.
 *
 * Handles:
 *   "del 1 al 31 de marzo"
 *   "del 15 al 30 de abril de 2025"
 *   "del 15/03 al 30/04"
 *   "del 15/03/2025 al 30/04/2025"
 *   "hasta el 31 de diciembre"
 *   "vigente hasta 31/12/2024"
 *   "del 1 de marzo al 30 de junio"
 *
 * referenceYear defaults to the current year when not present in the text.
 * Returns { start, end } or null if parsing fails.
 * Never throws.
 */

export interface DateRange {
  start: Date;
  end: Date;
}

const MONTH_MAP: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function monthIndex(name: string): number | null {
  const idx = MONTH_MAP[normalize(name)];
  return idx !== undefined ? idx : null;
}

/** Build a UTC midnight Date. Returns null for invalid inputs. */
function makeDate(day: number, month: number, year: number): Date | null {
  if (day < 1 || day > 31 || month < 0 || month > 11) return null;
  return new Date(Date.UTC(year, month, day));
}

/** Parse "DD/MM" or "DD/MM/YYYY" */
function parseNumeric(part: string, refYear: number): Date | null {
  const segments = part.split('/');
  const day = parseInt(segments[0] ?? '', 10);
  const month = parseInt(segments[1] ?? '', 10) - 1; // 0-indexed
  const year = segments[2] ? parseInt(segments[2], 10) : refYear;
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return makeDate(day, month, year);
}

export function parseDateRangeSpanish(
  text: string,
  referenceYear?: number,
): DateRange | null {
  if (!text) return null;

  const refYear = referenceYear ?? new Date().getFullYear();
  const t = normalize(text);

  // Pattern 1: "del 1 al 31 de marzo [de 2025]"
  // Both days share the same month
  const sameMonthRe =
    /del?\s+(\d{1,2})\s+al?\s+(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/;
  const m1 = sameMonthRe.exec(t);
  if (m1 && m1[1] && m1[2] && m1[3]) {
    const mo = monthIndex(m1[3]);
    const yr = m1[4] ? parseInt(m1[4], 10) : refYear;
    if (mo !== null) {
      const start = makeDate(parseInt(m1[1], 10), mo, yr);
      const end = makeDate(parseInt(m1[2], 10), mo, yr);
      if (start && end) return { start, end };
    }
  }

  // Pattern 2: "del 1 de marzo al 30 de junio [de 2025]"
  // Different months
  const crossMonthRe =
    /del?\s+(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\s+al?\s+(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/;
  const m2 = crossMonthRe.exec(t);
  if (m2 && m2[1] && m2[2] && m2[4] && m2[5]) {
    const mo1 = monthIndex(m2[2]);
    const mo2 = monthIndex(m2[5]);
    const yr1 = m2[3] ? parseInt(m2[3], 10) : refYear;
    const yr2 = m2[6] ? parseInt(m2[6], 10) : refYear;
    if (mo1 !== null && mo2 !== null) {
      const start = makeDate(parseInt(m2[1], 10), mo1, yr1);
      const end = makeDate(parseInt(m2[4], 10), mo2, yr2);
      if (start && end) return { start, end };
    }
  }

  // Pattern 3: numeric "del 15/03 al 30/04" or "del 15/03/2025 al 30/04/2025"
  const numericRangeRe = /del?\s+(\d{1,2}\/\d{1,2}(?:\/\d{4})?)\s+al?\s+(\d{1,2}\/\d{1,2}(?:\/\d{4})?)/;
  const m3 = numericRangeRe.exec(t);
  if (m3 && m3[1] && m3[2]) {
    const start = parseNumeric(m3[1], refYear);
    const end = parseNumeric(m3[2], refYear);
    if (start && end) return { start, end };
  }

  // Pattern 4: "hasta el 31 de diciembre [de 2024]" — end date only
  const untilRe = /hasta\s+(?:el\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/;
  const m4 = untilRe.exec(t);
  if (m4 && m4[1] && m4[2]) {
    const mo = monthIndex(m4[2]);
    const yr = m4[3] ? parseInt(m4[3], 10) : refYear;
    if (mo !== null) {
      const end = makeDate(parseInt(m4[1], 10), mo, yr);
      if (end) return { start: new Date(Date.UTC(refYear, 0, 1)), end };
    }
  }

  // Pattern 5: "vigente hasta DD/MM/YYYY" or "hasta DD/MM/YYYY"
  const numericUntilRe = /hasta\s+(?:el\s+)?(\d{1,2}\/\d{1,2}(?:\/\d{4})?)/;
  const m5 = numericUntilRe.exec(t);
  if (m5 && m5[1]) {
    const end = parseNumeric(m5[1], refYear);
    if (end) return { start: new Date(Date.UTC(refYear, 0, 1)), end };
  }

  return null;
}
