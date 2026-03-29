/**
 * parseRefundTiming
 *
 * Extracts cashback/refund timing from Spanish-language text.
 * Reusable across all issuers.
 *
 * Handles:
 *   "en 72 horas"
 *   "en 48 horas hábiles"
 *   "en el próximo resumen"
 *   "en 2 resúmenes"
 *   "entre 3 y 5 días hábiles"
 *   "dentro de las 24 horas"
 *
 * Returns RefundTiming or null if no timing pattern found.
 * description always preserves the original text for traceability.
 * Never throws.
 */

export interface RefundTiming {
  /** Number of hours for hour-based refunds (e.g., 72 for "en 72 horas"). */
  hours?: number;
  /** Number of billing statement cycles (e.g., 1 for "próximo resumen"). */
  statementCycles?: number;
  /** Original raw text, always preserved. */
  description: string;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function parseRefundTiming(text: string): RefundTiming | null {
  if (!text) return null;

  const t = normalize(text);

  // "en 72 horas" / "dentro de las 24 horas" / "en 48 horas hábiles"
  const hoursRe = /(?:en|dentro\s+de(?:\s+las)?)\s+(\d+)\s+horas/;
  const mh = hoursRe.exec(t);
  if (mh && mh[1]) {
    return { hours: parseInt(mh[1], 10), description: text.trim() };
  }

  // "entre X y Y días hábiles" — use upper bound in hours
  const rangeRe = /entre\s+(\d+)\s+y\s+(\d+)\s+d[iíi]as?\s+h[aá]bil/;
  const mr = rangeRe.exec(t);
  if (mr && mr[2]) {
    return { hours: parseInt(mr[2], 10) * 24, description: text.trim() };
  }

  // "en el próximo resumen" / "próximo resumen"
  if (/pr[oó]ximo\s+res[uú]men/.test(t)) {
    return { statementCycles: 1, description: text.trim() };
  }

  // "en 2 resúmenes"
  const stmtRe = /en\s+(\d+)\s+res[uú]menes?/;
  const ms = stmtRe.exec(t);
  if (ms && ms[1]) {
    return { statementCycles: parseInt(ms[1], 10), description: text.trim() };
  }

  return null;
}
