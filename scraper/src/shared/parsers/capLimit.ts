/**
 * parseCapLimit
 *
 * Extracts cap/limit information from Spanish-language promotion text.
 * Reusable across all issuers.
 *
 * Handles:
 *   "hasta $12.000 por persona por semana"
 *   "tope de $5.000 mensuales"
 *   "hasta $3.000 por día"
 *   "$ 12.000, por persona, por semana"
 *   "Podés ahorrar hasta $ 12.000, por persona, por semana"
 *
 * Returns CapLimitResult or null if no cap pattern found.
 * Never throws.
 */

import type { CapPeriod } from '../types/normalized.js';
import { parseCurrencyARS } from './currency.js';
import { parseCapPeriod } from './capPeriod.js';

export interface CapLimitResult {
  amount: number;
  period: CapPeriod | null;
  perPerson: boolean;
}

const CAP_AMOUNT_RE = /(?:hasta|tope\s+(?:de)?|ahorrar?\s+hasta)\s*\$?\s*([\d.,]+)/i;

export function parseCapLimit(text: string): CapLimitResult | null {
  if (!text) return null;

  const m = CAP_AMOUNT_RE.exec(text);
  if (!m || !m[1]) {
    // Try a looser pattern: just "$X, por persona"
    const loose = /\$\s*([\d.,]+)\s*,?\s*por\s+persona/i.exec(text);
    if (!loose || !loose[1]) return null;
    const amount = parseCurrencyARS('$' + loose[1]);
    if (amount === null) return null;
    return {
      amount,
      period: parseCapPeriod(text),
      perPerson: true,
    };
  }

  const amount = parseCurrencyARS('$' + m[1]);
  if (amount === null) return null;

  const perPerson = /por\s+persona/i.test(text);
  const period = parseCapPeriod(text);

  return { amount, period, perPerson };
}
