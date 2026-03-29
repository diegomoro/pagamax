/**
 * parseMerchantName
 *
 * Normalizes a raw merchant name string for storage.
 * Reusable across all issuers.
 *
 * Rules:
 *   - Trim leading/trailing whitespace
 *   - Collapse internal whitespace to single spaces
 *   - Strip common Argentine legal suffixes: S.A., S.R.L., S.A.S., S.C.
 *   - Preserve all-caps brands: "YPF", "BBVA", "HSBC"
 *   - Title-case mixed-case names: "mcdonalds" → "Mcdonalds"
 *     (intentionally simple; brand-specific casing can be a lookup table later)
 *
 * Returns the normalized string, or the trimmed raw input if no rule applies.
 * Never returns null. Never throws.
 */

// Legal entity suffixes to strip (trailing, case-insensitive)
const LEGAL_SUFFIX_RE = /\s+(?:s\.?a\.?s?\.?|s\.?r\.?l\.?|s\.?c\.?)\s*$/i;

// All-caps brand: 2+ uppercase letters (optionally with digits), no lowercase
const ALL_CAPS_RE = /^[A-Z0-9\s&.-]{2,}$/;

export function parseMerchantName(raw: string): string {
  if (!raw) return raw;

  let name = raw.trim().replace(/\s{2,}/g, ' ');

  // Strip legal suffixes
  name = name.replace(LEGAL_SUFFIX_RE, '').trim();

  // If already all-caps (brand), preserve as-is
  if (ALL_CAPS_RE.test(name)) return name;

  // Title-case: capitalize first letter of each word, lowercase the rest
  // Preserves short connectors (de, la, el, los, las, y) in lowercase
  const connectors = new Set(['de', 'la', 'el', 'los', 'las', 'y', 'e', 'o', 'del']);
  name = name
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (i > 0 && connectors.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');

  return name;
}
