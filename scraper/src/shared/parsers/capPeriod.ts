import type { CapPeriod } from '../types/normalized.js';

/**
 * parseCapPeriod
 *
 * Maps Spanish-language cap period descriptions to the CapPeriod enum.
 * Reusable across all issuers.
 *
 * Handles:
 *   "por mes" / "mensual" / "por calendario mensual"
 *   "por transacción" / "por compra"
 *   "por día" / "diario" / "diaria"
 *   "por semana" / "semanal"
 *   "por período" / "durante la promoción"
 *
 * Matching is case-insensitive and accent-insensitive.
 * Returns null if no match found. Never throws.
 */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip diacritics
}

export function parseCapPeriod(text: string): CapPeriod | null {
  if (!text) return null;
  const t = normalize(text);

  if (/por\s+mes\b|mensual/.test(t)) return 'per_month';
  if (/por\s+transacc|por\s+compra/.test(t)) return 'per_transaction';
  if (/por\s+d[iíi]a\b|diaria?\b|diario\b/.test(t)) return 'per_day';
  if (/por\s+semana\b|semanal/.test(t)) return 'per_week';
  if (/por\s+per[iíi]odo|durante\s+la\s+promo/.test(t)) return 'per_period';

  return null;
}
