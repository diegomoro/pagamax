/**
 * parseInstallments
 *
 * Extracts installment details from Spanish-language promotion text.
 * Reusable across all issuers.
 *
 * Handles:
 *   "12 cuotas sin interés"
 *   "hasta 18 CSI"
 *   "6 cuotas sin cargo"
 *   "3 cuotas al 0%"
 *   "en 24 cuotas"
 *   "pagá en 6 cuotas"
 *   "Plan Zeta cero interés"
 *   "Plan Turbo"
 *
 * Returns InstallmentResult or null if no installment pattern found.
 * Never throws.
 */

export interface InstallmentResult {
  count: number;
  interestFree: boolean;
  /** Set when the rate is stated explicitly but is not 0%. */
  fixedRatePct?: number;
  /** Named plan, e.g., "Plan Zeta", "Plan Turbo". */
  planName?: string;
}

// Matches a number followed by optional whitespace and the word "cuota(s)"
// or the abbreviation "CSI" (cuotas sin interés).
const INSTALLMENT_RE =
  /(?:hasta\s+)?(\d+)\s*(?:cuotas?|csi)\b/i;

// Named installment plans (variable count, treated as interest-free).
const PLAN_RE =
  /\bplan\s+(zeta|turbo|z)\b/i;

// Indicators that the installments carry no interest.
const INTEREST_FREE_RE =
  /sin\s+inter[eé]s|sin\s+cargo|csi\b|al\s+0\s*%|cero\s+inter[eé]s/i;

export function parseInstallments(text: string): InstallmentResult | null {
  if (!text) return null;

  // Standard N cuotas pattern
  const m = INSTALLMENT_RE.exec(text);
  if (m?.[1] !== undefined) {
    const count = parseInt(m[1], 10);
    if (!isNaN(count) && count >= 1) {
      const interestFree = INTEREST_FREE_RE.test(text);
      return { count, interestFree };
    }
  }

  // Named plan patterns (Plan Zeta, Plan Turbo, Plan Z)
  // These don't specify a fixed count — variable installments.
  const planMatch = PLAN_RE.exec(text);
  if (planMatch?.[1]) {
    const planKey = planMatch[1].toLowerCase();
    const planName = planKey === 'z' || planKey === 'zeta' ? 'Plan Zeta' : 'Plan Turbo';
    const interestFree = INTEREST_FREE_RE.test(text) || /cero\s+inter[eé]s/i.test(text);
    return {
      count: 0, // variable — plan determines installments
      interestFree: interestFree || true, // named plans are always interest-free
      planName,
    };
  }

  return null;
}
