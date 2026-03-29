/**
 * parsePlanName
 *
 * Extracts named installment/payment plan from promotion text.
 * Reusable across all issuers.
 *
 * Handles:
 *   "Plan Turbo" → { name: "Plan Turbo", exclusive: false }
 *   "exclusiva turbo" → { name: "Plan Turbo", exclusive: true }
 *   "Plan Zeta" / "Plan Z" → { name: "Plan Zeta", exclusive: false }
 *   "Ahora 12" → { name: "Ahora 12", exclusive: false }
 *   "Ahora 3" → { name: "Ahora 3", exclusive: false }
 *   "Pagá Después" → { name: "Pagá Después", exclusive: false }
 *
 * Returns PlanNameResult or null if no plan name found.
 * Never throws.
 */

export interface PlanNameResult {
  name: string;
  exclusive: boolean;
}

const PLAN_PATTERNS: Array<{ re: RegExp; name: string | null; exclusiveRe?: RegExp }> = [
  { re: /\bplan\s+turbo\b/i, name: 'Plan Turbo', exclusiveRe: /exclusiva?\s+turbo/i },
  { re: /\bexclusiva?\s+turbo\b/i, name: 'Plan Turbo' },
  { re: /\bplan\s+zeta\b/i, name: 'Plan Zeta' },
  { re: /\bplan\s+z\b/i, name: 'Plan Zeta' },
  { re: /\bahora\s+(\d+)\b/i, name: null }, // dynamic: "Ahora 12", "Ahora 3"
  { re: /\bpag[aá]\s+despu[eé]s\b/i, name: 'Pagá Después' },
];

export function parsePlanName(text: string): PlanNameResult | null {
  if (!text) return null;

  for (const pattern of PLAN_PATTERNS) {
    const m = pattern.re.exec(text);
    if (m) {
      const name = pattern.name ?? `Ahora ${m[1]}`;
      const exclusive = pattern.exclusiveRe
        ? pattern.exclusiveRe.test(text)
        : /exclusiva?\s/i.test(text);
      return { name, exclusive };
    }
  }

  return null;
}
