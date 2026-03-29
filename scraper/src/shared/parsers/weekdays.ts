/**
 * parseWeekdaysSpanish
 *
 * Extracts a list of ISO weekday names from Spanish-language text.
 * Reusable across all issuers.
 *
 * Handles:
 *   "los lunes"                        → ["monday"]
 *   "lunes y martes"                   → ["monday", "tuesday"]
 *   "martes, miércoles y jueves"       → ["tuesday", "wednesday", "thursday"]
 *   "de lunes a viernes"               → ["monday","tuesday","wednesday","thursday","friday"]
 *   "días hábiles"                     → ["monday","tuesday","wednesday","thursday","friday"]
 *   "fines de semana"                  → ["saturday","sunday"]
 *   "todos los días"                   → all 7 days
 *   "sábados y domingos"               → ["saturday","sunday"]
 *
 * Returns an array of ISO weekday names (lowercase English).
 * Returns an empty array if no weekdays found.
 * Never throws.
 */

// Canonical ISO names indexed by their Spanish equivalents (accent-stripped).
const WEEKDAY_MAP: Record<string, string> = {
  lunes: 'monday',
  martes: 'tuesday',
  miercoles: 'wednesday',
  jueves: 'thursday',
  viernes: 'friday',
  sabado: 'saturday',
  domingo: 'sunday',
};

const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const WEEKEND = ['saturday', 'sunday'];

const WEEKDAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Parse "de lunes a viernes" style ranges into expanded day list. */
function parseRange(text: string): string[] | null {
  const m = /de\s+(\w+)\s+a\s+(\w+)/.exec(text);
  if (!m || !m[1] || !m[2]) return null;
  const start = WEEKDAY_MAP[m[1]];
  const end = WEEKDAY_MAP[m[2]];
  if (!start || !end) return null;
  const si = WEEKDAY_ORDER.indexOf(start);
  const ei = WEEKDAY_ORDER.indexOf(end);
  if (si === -1 || ei === -1 || si > ei) return null;
  return WEEKDAY_ORDER.slice(si, ei + 1);
}

export function parseWeekdaysSpanish(text: string): string[] {
  if (!text) return [];

  const t = normalize(text);

  // Shorthand groups
  if (/todos\s+los\s+d[iíi]as|cualquier\s+d[iíi]a/.test(t)) return [...ALL_DAYS];
  if (/d[iíi]as?\s+h[aá]bil|lunes\s+a\s+viernes/.test(t)) return [...WEEKDAYS];
  if (/fines?\s+de\s+semana/.test(t)) return [...WEEKEND];

  // Range: "de lunes a viernes"
  const range = parseRange(t);
  if (range) return range;

  // Individual names (including plurals: "los lunes")
  const found = new Set<string>();
  for (const [es, iso] of Object.entries(WEEKDAY_MAP)) {
    // Match the word with optional 's' suffix and word boundary
    const re = new RegExp(`\\b${es}s?\\b`);
    if (re.test(t)) found.add(iso);
  }

  return [...found].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
}
