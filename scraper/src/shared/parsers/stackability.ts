/**
 * parseStackability
 *
 * Determines whether a promotion is stackable (combinable) with others.
 * Reusable across all issuers.
 *
 * Handles:
 *   "Es acumulable con otras promociones disponibles de Naranja X." → true
 *   "No es acumulable con otras promociones" → false
 *   "No acumulable" → false
 *   "Acumulable" → true
 *
 * Returns true/false, or null if no stackability info found.
 * Never throws.
 */

export function parseStackability(text: string): boolean | null {
  if (!text) return null;

  const t = text.toLowerCase();

  // Negative patterns first (more specific)
  if (/no\s+(?:es\s+)?acumulable/i.test(t)) return false;
  if (/no\s+(?:se\s+)?(?:puede|pueden)\s+acumular/i.test(t)) return false;

  // Positive patterns
  if (/(?:es\s+)?acumulable/i.test(t)) return true;
  if (/(?:se\s+)?(?:puede|pueden)\s+acumular/i.test(t)) return true;
  if (/combinable\s+con/i.test(t)) return true;

  return null;
}
