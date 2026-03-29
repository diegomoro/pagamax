/**
 * normalize.ts — Map RawCuenaDNICandidate → CuenaDNIPromo flat output object.
 *
 * Key Cuenta DNI-specific parsing logic:
 *  - ASCII output: all human-readable fields have diacritics stripped
 *  - days_of_week: parsed from `titulo_fecha` (e.g. "Jueves", "Lunes y martes") — NOT from legal text
 *    which contains "días hábiles" in reimbursement clauses causing false-positive weekday detection
 *  - Cap: parsed from `bajada` only; "sin tope" → null; Cuenta DNI pattern "Tope de reintegro: $X por Y"
 *  - Excluded rails: sentence-level extraction from "no aplica" clauses
 *  - min_purchase: uses shared parseMinPurchase on legal text
 */

import { createHash } from 'node:crypto';
import {
  parseCapLimit,
  parseWeekdaysSpanish,
  parsePercentage,
  parseMinPurchase,
} from '../../shared/parsers/index.js';
import { parseCurrencyARS } from '../../shared/parsers/currency.js';
import type { CapPeriod } from '../../shared/types/normalized.js';
import type { RawCuenaDNICandidate, CuenaDNIPromo } from './types.js';

// ─── ASCII normalization ──────────────────────────────────────────────────────

/** Strip diacritics: á→a, é→e, ó→o, ú→u, ñ→n, ü→u, etc. */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Apply to every human-readable output string field. */
function norm(s: string | null | undefined): string {
  if (!s) return '';
  return stripAccents(s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim());
}

// ─── Accent-insensitive regex helpers ────────────────────────────────────────

/** Lowercase + strip accents for regex matching on raw text. */
function nrm(s: string): string {
  return stripAccents(s.toLowerCase());
}

// ─── .NET Date → ISO date string ──────────────────────────────────────────────

function netMsToIso(ms: number | undefined): string | null {
  if (ms === undefined || ms === null || isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

// ─── Cap parsing (Cuenta DNI-specific) ───────────────────────────────────────

interface CapResult {
  amount: number | null;
  period: CapPeriod | null;
  perPerson: boolean | null;
  scope: string | null;
}

const NO_CAP_RE = /sin\s+tope/i;

/**
 * Cuenta DNI-specific cap parser.
 *
 * Parses from `bajada` ONLY (not from legal text) to avoid false positives from
 * jubilado sub-benefit caps bleeding into the main promo cap field.
 *
 * Handles:
 *   "Sin tope de descuento"           → null
 *   "Sin tope de reintegro"           → null
 *   "Tope de reintegro: $5.000 por semana y por persona"  → { amount:5000, period:'per_week', perPerson:true }
 *   "Tope de reintegro: hasta $7.000 por vigencia y por persona" → { amount:7000, period:'per_period' }
 *   "Tope de reintegro: $20.000 por día y por persona"   → { amount:20000, period:'per_day' }
 */
function parseCuentaDniCap(bajada: string, legal: string): CapResult {
  const NULL: CapResult = { amount: null, period: null, perPerson: null, scope: null };

  if (!bajada) return NULL;

  // "sin tope" → explicit no-cap
  if (NO_CAP_RE.test(bajada)) return NULL;

  // Cuenta DNI pattern: "Tope de reintegro [unificado]: [hasta] $X por Y"
  // [^$]* allows optional words between "reintegro/descuento" and "$" (e.g. "unificado:")
  const topeRe =
    /tope\s+de\s+(?:reintegro|descuento|ahorro)[^$]*\$\s*([\d.,]+)(?:[^.]*?\bpor\s+(semana|mes|d[ií]a|vigencia|per[ií]odo|transacci[oó]n|compra))?/i;
  const m = topeRe.exec(bajada);

  if (m && m[1]) {
    const amount = parseCurrencyARS('$' + m[1]);
    if (amount === null) return NULL;

    const periodWord = nrm(m[2] ?? '');
    const period: CapPeriod | null =
      /semana/.test(periodWord)        ? 'per_week'        :
      /mes/.test(periodWord)           ? 'per_month'       :
      /dia|diario/.test(periodWord)    ? 'per_day'         :
      /vigencia|periodo/.test(periodWord) ? 'per_period'   :
      /transacc|compra/.test(periodWord) ? 'per_transaction' :
      null;

    const perPerson = /por\s+persona/i.test(bajada);

    // cap_scope: "unificado" means cap applies across all locations for the account
    const legalLower = nrm(legal);
    const scope = /unificado/.test(nrm(bajada)) || /unificado/.test(legalLower)
      ? 'unificado'
      : null;

    return { amount, period, perPerson, scope };
  }

  // Fallback: try shared parser on bajada, but only if bajada contains '$'
  // (avoids "Hasta 3 cuotas sin interés" being misread as cap=3)
  if (bajada.includes('$')) {
    const shared = parseCapLimit(bajada);
    if (shared) {
      const legalLower = nrm(legal);
      return {
        amount: shared.amount,
        period: shared.period,
        perPerson: shared.perPerson,
        scope: /unificado/.test(legalLower) ? 'unificado' : null,
      };
    }
  }

  return NULL;
}

// ─── Excluded rails (sentence-level extraction) ───────────────────────────────

/**
 * Extracts excluded payment rails from "no aplica" sentences in legal text.
 *
 * Uses sentence-level extraction (up to the next period) to avoid false positives
 * from legal paragraphs that mention payment methods in a permissive context.
 */
function extractExcludedRails(legal: string): string {
  if (!legal) return '';
  const t = nrm(legal);
  const excluded = new Set<string>();

  // Extract all "no aplica / no incluye / no valido" sentences
  const sentenceRe =
    /[^.]*\bno\s+(?:aplica|corresponde|incluye|valido|acumulable)[^.]*\./gi;
  const noAplicaSentences: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = sentenceRe.exec(t)) !== null) {
    noAplicaSentences.push(m[0]);
  }
  const noAplicaText = noAplicaSentences.join(' ');

  if (noAplicaText) {
    if (/mercado\s*pago/.test(noAplicaText)) excluded.add('mercadopago_qr');
    if (/otras?\s+billeteras?\s+digitales?/.test(noAplicaText)) excluded.add('other_wallets');
    if (/tarjeta\s+de\s+credito|credito\s+visa|mastercard/.test(noAplicaText)) excluded.add('credit_card');
    if (/tarjeta\s+de\s+debito|visa\s+debito/.test(noAplicaText)) excluded.add('debit_card');
    if (/transferencia/.test(noAplicaText)) excluded.add('transfer');
    if (/prepaga/.test(noAplicaText)) excluded.add('prepaid_card');
    if (/naranja/.test(noAplicaText)) excluded.add('naranjax');
  }

  // Also scan full text for Mercado Pago / otras billeteras (sometimes outside "no aplica" sentences)
  if (/mercado\s*pago/.test(t) && !excluded.has('mercadopago_qr')) {
    if (/no\s+aplica.{0,300}?mercado\s*pago|mercado\s*pago.{0,300}?no\s+aplica/.test(t)) {
      excluded.add('mercadopago_qr');
    }
  }

  return [...excluded].join('; ');
}

// ─── Exclusions text (product exclusions, not rail exclusions) ────────────────

function extractExclusions(legal: string): string {
  if (!legal) return '';
  const results: string[] = [];
  const re = /no\s+incluye[^.]{0,400}\./gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(legal)) !== null) {
    results.push(m[0].trim());
    if (results.length >= 3) break;
  }
  return norm(results.join(' | '));
}

function extractExamples(legal: string): string {
  if (!legal) return '';
  const results: string[] = [];
  const re = /(?:ejemplo[:.]?|por\s+ejemplo[,:]?)\s*(.{10,300}?)(?:\n|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(legal)) !== null) {
    results.push((m[1] ?? '').trim());
    if (results.length >= 3) break;
  }
  return norm(results.join(' | '));
}

// ─── Discount type inference ──────────────────────────────────────────────────

function inferDiscountType(title: string, bajada: string, legal: string): string {
  // Check bajada (short summary) first — most reliable, doesn't mix primary + sub-benefits
  const b = nrm(bajada);
  if (/descuento/.test(b)) return 'discount_percentage';
  if (/reintegro|reembolso|cashback/.test(b)) return 'cashback_percentage';
  // Fall back to title + legal
  const t = nrm(title + ' ' + legal);
  if (/reintegro|reembolso|cashback/.test(t)) return 'cashback_percentage';
  if (/descuento/.test(t)) return 'discount_percentage';
  if (/cuotas\s+sin\s+interes|cuotas\s+fijas/.test(t)) return 'installments_interest_free';
  return 'cashback_percentage';
}

// ─── Channel inference ────────────────────────────────────────────────────────

function inferChannel(legal: string): string {
  const t = nrm(legal);
  const online = /online|internet|sitio\s+web|compras?\s+digitales|e[- ]?commerce/.test(t);
  const inStore = /comercios?|local(es)?|sucursal|negocio|tienda|en\s+tienda/.test(t);
  if (online && inStore) return 'both';
  if (online) return 'online';
  return 'in_store';
}

// ─── Allowed rails extraction ─────────────────────────────────────────────────

function extractAllowedRails(legal: string): string {
  if (!legal) return 'qr; clave_dni; posnet';
  const t = nrm(legal);

  // Strip "no aplica" sentences to avoid picking up excluded rails as allowed ones
  // e.g. "no aplica para pagos mediante código QR de Mercado Pago" → don't add 'qr' from this
  const stripped = t.replace(/[^.]*\bno\s+(?:aplica|corresponde|incluye|valido\s+para)[^.]*/g, '');

  const rails: string[] = [];
  if (/\bqr\b/.test(stripped)) rails.push('qr');
  if (/clave[\s_-]*dni/.test(stripped)) rails.push('clave_dni');
  if (/\bposnet\b/.test(stripped)) rails.push('posnet');
  if (/link[\s_-]*de[\s_-]*pago/.test(stripped)) rails.push('link_de_pago');
  if (/cuenta[\s_-]*dni[\s_-]*comercios|comercios[\s_-]*cuenta[\s_-]*dni/.test(stripped)) {
    rails.push('cuenta_dni_comercios');
  }
  if (/transferencia/.test(stripped)) rails.push('transfer');
  if (rails.length === 0) rails.push('qr', 'clave_dni', 'posnet');
  return rails.join('; ');
}

// ─── Reimbursement delay ──────────────────────────────────────────────────────

function parseReimbursementDays(legal: string): number | null {
  const m = /dentro\s+de\s+los?\s+(\d+)\s+d[ií]as?\s+h[aá]biles?/i.exec(legal ?? '');
  return m ? parseInt(m[1]!, 10) : null;
}

// ─── Merchant group inference ─────────────────────────────────────────────────

function inferMerchantGroup(rubroName: string | undefined, title: string): string {
  if (rubroName && rubroName !== 'Test') return rubroName;
  const t = nrm(title);
  if (/supermercado/.test(t)) return 'Supermercados';
  if (/farmacia|perfumer/.test(t)) return 'Farmacias y Perfumerias';
  if (/libreria|librer/.test(t)) return 'Librerias';
  if (/restaurante|gastronomia|comida/.test(t)) return 'Gastronomia';
  if (/ropa|indumentaria|moda/.test(t)) return 'Indumentaria';
  if (/tecnolog|electro/.test(t)) return 'Tecnologia';
  if (/comercio/.test(t)) return 'Comercios de Barrio';
  if (/universidad|educaci/.test(t)) return 'Educacion';
  return 'Varios';
}

// ─── Freshness classification ─────────────────────────────────────────────────

function classifyFreshness(
  validTo: string | null,
  validityText: string,
  scrapedAt: string,
): { is_active: boolean; is_stale: boolean; freshness_reason: string } {
  const scrapeDate = scrapedAt.slice(0, 10);

  if (validTo) {
    const stale = validTo < scrapeDate;
    return {
      is_active: !stale,
      is_stale: stale,
      freshness_reason: stale
        ? `Expired: valid_to ${validTo} < scrape_date ${scrapeDate}`
        : `Active: valid_to ${validTo}`,
    };
  }

  if (/\b202[0-4]\b/.test(validityText) && !/\b202[5-9]\b/.test(validityText)) {
    return {
      is_active: false,
      is_stale: true,
      freshness_reason: 'Inferred stale from past-year date keywords in validity text',
    };
  }

  return {
    is_active: true,
    is_stale: false,
    freshness_reason: 'No expiry date found — assumed active',
  };
}

// ─── Promo key ────────────────────────────────────────────────────────────────

function buildPromoKey(
  title: string,
  merchantGroup: string,
  discountPct: number | null,
  capAmount: number | null,
  validTo: string | null,
): string {
  const parts = [
    'cuenta_dni',
    title.toLowerCase().replace(/\s+/g, '_').slice(0, 80),
    merchantGroup,
    String(discountPct ?? ''),
    String(capAmount ?? ''),
    validTo ?? '',
  ];
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

// ─── Main normalize function ──────────────────────────────────────────────────

export function normalize(candidate: RawCuenaDNICandidate): CuenaDNIPromo {
  const title  = candidate.title ?? '';
  const legal  = candidate.legalText ?? '';
  const bajada = candidate.bajada ?? '';

  // Discount percent: prefer API field, fallback to regex on title
  const discountPct = candidate.discountPercent ?? parsePercentage(title) ?? null;

  // Cap: parsed from bajada only (see parseCuentaDniCap comment)
  const capResult = parseCuentaDniCap(bajada, legal);

  // Min purchase: from legal text
  const minPurchase = parseMinPurchase(legal) ?? parseMinPurchase(bajada);

  // Dates
  const validFrom = netMsToIso(candidate.fechaDesdeMs);
  const validTo   = netMsToIso(candidate.fechaHastaMs);

  // Days of week: use titulo_fecha (short day label) NOT full legal text.
  // Legal text has "días hábiles posteriores" (reimbursement context) which triggers false weekday detection.
  const daysArr = parseWeekdaysSpanish(candidate.tituloFecha ?? '');
  const daysOfWeek = daysArr.join('; ');

  // Merchant group
  const merchantGroup = inferMerchantGroup(candidate.rubroName, title);

  // Freshness
  const freshness = classifyFreshness(validTo, bajada, candidate.scrapedAt);

  // Promo key
  const promoKey = buildPromoKey(title, merchantGroup, discountPct, capResult.amount, validTo);

  return {
    source: 'cuenta_dni',
    source_family: 'banco_provincia',
    source_page_type: candidate.pageType,
    source_url: candidate.sourceUrl,
    discovery_path: `rubro_${candidate.rubroId ?? 'hub'} → GetBeneficioByRubro → ${candidate.dataSource}`,

    promo_key: promoKey,

    promo_title:       norm(title),
    merchant_group:    norm(merchantGroup),
    category:          norm(candidate.rubroName ?? 'Varios'),
    subcategory:       norm(candidate.urlSlug ?? ''),
    description_short: norm((candidate.subtitle ?? bajada).slice(0, 200)),

    discount_percent: discountPct,
    discount_type:    inferDiscountType(title, bajada, legal),

    cap_amount_ars:  capResult.amount,
    cap_period:      capResult.period,
    cap_scope:       capResult.scope,
    cap_per_person:  capResult.perPerson,
    min_purchase_amount_ars: minPurchase,

    days_of_week:      daysOfWeek,
    valid_from:        validFrom,
    valid_to:          validTo,
    validity_text_raw: norm(bajada),

    ...freshness,

    payment_method:   'cuenta_dni',
    funding_source:   'banco_provincia',
    allowed_rails:    extractAllowedRails(legal),
    excluded_rails:   extractExcludedRails(legal),
    channel:          inferChannel(legal),

    installments:                        null,
    reimbursement_delay_business_days:   parseReimbursementDays(legal),

    geo_scope:             'bonaerense',
    merchant_locator_url:  norm(candidate.merchantLocatorUrl ?? ''),

    terms_text_raw:  norm(legal).slice(0, 2000),
    exclusions_raw:  extractExclusions(legal),
    examples_raw:    extractExamples(legal),
    raw_snippet:     candidate.rawSnippet ?? '',

    beneficio_id: candidate.beneficioId ?? null,
    rubro_id:     candidate.rubroId ?? null,
    scraped_at:   candidate.scrapedAt,
  };
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Deduplicates promos by promo_key.
 * When two promos share the same key, keeps the one with more populated fields.
 */
export function deduplicate(promos: CuenaDNIPromo[]): {
  deduped: CuenaDNIPromo[];
  removedCount: number;
} {
  const seen = new Map<string, CuenaDNIPromo>();
  for (const p of promos) {
    const existing = seen.get(p.promo_key);
    if (!existing) {
      seen.set(p.promo_key, p);
    } else {
      const score = (x: CuenaDNIPromo) =>
        Object.values(x).filter(v => v !== null && v !== '' && v !== undefined).length;
      if (score(p) > score(existing)) seen.set(p.promo_key, p);
    }
  }
  return {
    deduped: [...seen.values()],
    removedCount: promos.length - seen.size,
  };
}
