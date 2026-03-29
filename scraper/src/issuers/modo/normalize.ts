/**
 * normalize.ts — Map RawModoCandidate → ModoPromo flat output object.
 *
 * Key MODO-specific logic:
 *  - Primary data source is RSC payload (banks, payment methods, status, trigger_type)
 *  - JSON-LD used as fallback for title, dates, merchant when RSC is missing
 *  - days_of_week: parsed from RSC "LMXJVSD" string (L=Mon, M=Tue, X=Wed, J=Thu, V=Fri, S=Sat, D=Sun)
 *  - Freshness: from RSC `calculated_status` (running→active, finished→stale, future→future)
 *  - Deduplication key: slug-based SHA-1 (slug is stable and unique per MODO promo)
 */

import { createHash } from 'node:crypto';
import type { RawModoCandidate, ModoPromo, RscPromoData, RscInstallment } from './types.js';

// ─── ASCII normalization ──────────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function norm(s: string | null | undefined): string {
  if (!s) return '';
  return stripAccents(s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim());
}

// ─── ISO timestamp → ISO date (YYYY-MM-DD) ────────────────────────────────────

function toIsoDate(ts: string | null | undefined): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// ─── Days of week ─────────────────────────────────────────────────────────────

/**
 * Parses MODO's 7-char days_of_week string "LMXJVSD".
 *
 * Each position maps to: L=Mon, M=Tue, X=Wed, J=Thu, V=Fri, S=Sat, D=Sun.
 * Uppercase = day active, lowercase/dash/other = day inactive.
 * "LMXJVSD" (all 7 uppercase) = every day.
 */
function parseDaysOfWeek(daysStr: string | undefined): string {
  if (!daysStr) return '';

  // MODO uses a variable-length string of *active* day codes e.g. "LMXSD" (Mon/Tue/Wed/Sat/Sun).
  // Check presence of each code — do NOT treat it as a fixed positional 7-char mask.
  const chars  = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
  const labels = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

  const active: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (daysStr.includes(chars[i]!)) active.push(labels[i]!);
  }

  if (active.length === 7) return 'everyday';
  return active.join('; ');
}

// ─── Banks ───────────────────────────────────────────────────────────────────

function buildBankFields(rscData: RscPromoData | undefined): {
  banks: string; bank_names: string; bcra_codes: string;
} {
  const bArr = rscData?.banks ?? [];
  return {
    banks:      bArr.map(b => b.hub_bank_id).filter(Boolean).join('; '),
    bank_names: bArr.map(b => norm(b.name)).filter(Boolean).join('; '),
    bcra_codes: bArr.map(b => b.bcra_code ?? '').filter(Boolean).join('; '),
  };
}

// ─── Payment methods ──────────────────────────────────────────────────────────

function buildPaymentMethodFields(rscData: RscPromoData | undefined): {
  payment_methods: string; card_networks: string; card_types: string;
} {
  const pmArr = rscData?.paymentMethodList ?? [];
  const methods: string[] = [];
  const networks = new Set<string>();
  const types    = new Set<string>();

  for (const pm of pmArr) {
    const typeLower = pm.name.toLowerCase();
    const card      = pm.card.toLowerCase();

    // type: credito / debito / prepaga
    if (/cr[eé]dito/.test(typeLower)) types.add('credito');
    else if (/d[eé]bito/.test(typeLower)) types.add('debito');
    else if (/prepaga/.test(typeLower)) types.add('prepaga');

    // card network
    networks.add(card);

    // compound: "credito_visa"
    const typeKey = /cr[eé]dito/.test(typeLower) ? 'credito' :
                    /d[eé]bito/.test(typeLower)   ? 'debito'  : 'prepaga';
    const key = `${typeKey}_${card}`;
    if (!methods.includes(key)) methods.push(key);
  }

  return {
    payment_methods: methods.join('; '),
    card_networks:   [...networks].join('; '),
    card_types:      [...types].join('; '),
  };
}

// ─── Installments ─────────────────────────────────────────────────────────────

function buildInstallmentFields(installments: RscInstallment[]): {
  installments: number | null;
  installment_type: string;
  installment_coefficient: string;
} {
  if (installments.length === 0) {
    return { installments: null, installment_type: '', installment_coefficient: '' };
  }

  // Take the best offer (most installments, or sin_interes over fijas)
  const siFree = installments.filter(i => i.type === 'sin_interes');
  const best   = siFree.length > 0
    ? siFree.reduce((a, b) => b.number > a.number ? b : a)
    : installments.reduce((a, b) => b.number > a.number ? b : a);

  return {
    installments:            best.number,
    installment_type:        best.type,
    installment_coefficient: best.coefficient,
  };
}

// ─── Discount percent & type ──────────────────────────────────────────────────

/**
 * Extracts discount percentage from MODO's human-readable text fields.
 *
 * MODO payment_promotion promos don't have an explicit numeric field — the discount
 * is encoded in:
 *   description:       "Aprovechá 30% de reintegro en Los Inmortales..."
 *   short_description: "2512-icbc-los-inmortales-eb-presencialonline-30off"
 */
function parseDiscountFromText(description: string, shortDescription: string): {
  percent: number | null; type: string;
} {
  // Determine cashback vs discount from description text (more reliable than short_description
  // for this classification, since description is human-readable and uses "reintegro" etc.)
  const isReimbursement = /reintegro|cashback|devoluci[oó]n/i.test(description ?? '');
  const resolvedType    = isReimbursement ? 'cashback_percentage' : 'discount_percentage';

  // short_description is a structured internal code like "2601-bank-merchant-mode-20off"
  // Use it for the PERCENT — it's more reliable than description which can have misleading
  // numbers (e.g. "1 CSI + 50%OFF" when the actual discount is 20%).
  const shortMatch = /[^a-z](\d+)off\b/i.exec(shortDescription ?? '');
  if (shortMatch) {
    return { percent: parseInt(shortMatch[1]!, 10), type: resolvedType };
  }
  // Fall back to description for the percent
  const descMatch = /(\d+)\s*%/.exec(description ?? '');
  if (descMatch) {
    return { percent: parseInt(descMatch[1]!, 10), type: resolvedType };
  }
  return { percent: null, type: '' };
}

function buildDiscountFields(rscData: RscPromoData | undefined): {
  discount_percent: number | null; discount_type: string;
} {
  const p = rscData?.promotion?.promotion;
  if (!p) return { discount_percent: null, discount_type: 'other' };

  const triggerType = p.trigger_type ?? '';

  if (triggerType === 'cashback' && typeof p['cashback_percentage'] === 'number') {
    return {
      discount_percent: p['cashback_percentage'] as number,
      discount_type: 'cashback_percentage',
    };
  }

  if (triggerType === 'discount' && typeof p['discount_percentage'] === 'number') {
    return {
      discount_percent: p['discount_percentage'] as number,
      discount_type: 'discount_percentage',
    };
  }

  if (triggerType === 'installments') {
    return { discount_percent: null, discount_type: 'installments_interest_free' };
  }

  // Fallback: try explicit numeric percentage fields
  for (const key of ['cashback_percentage', 'discount_percentage', 'percentage']) {
    if (typeof p[key] === 'number' && (p[key] as number) > 0) {
      const discType = key.includes('cashback') ? 'cashback_percentage' :
                       key.includes('discount')  ? 'discount_percentage' : 'other';
      return { discount_percent: p[key] as number, discount_type: discType };
    }
  }

  // payment_promotion: extract from human-readable description / short_description
  const desc  = typeof p['description']        === 'string' ? p['description']        : '';
  const short = typeof p['short_description']  === 'string' ? p['short_description']  : '';
  const { percent, type } = parseDiscountFromText(desc, short);
  if (percent !== null) {
    return { discount_percent: percent, discount_type: type || 'discount_percentage' };
  }

  return { discount_percent: null, discount_type: triggerType || 'other' };
}

// ─── Cap & min purchase ───────────────────────────────────────────────────────

/**
 * Parses a peso amount string, handling both Argentine (period = thousands) and
 * ICBC/US-style (comma = thousands) formats.
 * "$20.000" → 20000, "$20,000" → 20000, "$2.500" → 2500, "$2,500" → 2500.
 */
function parseArgAmount(raw: string): number {
  // A comma or period followed by exactly 3 digits is a thousands separator.
  const withoutThousands = raw.replace(/[.,](\d{3})(?=$|[^0-9])/g, '$1');
  // Any remaining comma is a decimal separator
  return parseFloat(withoutThousands.replace(',', '.'));
}

/**
 * Parses "tope de reintegro" from the plain-text terms.
 * Handles both $20.000 (Argentine) and $20,000 (ICBC) thousand-separator styles.
 */
function parseCapFromTerms(termsText: string): number | null {
  // "Tope de reintegro: $30.000", "TOPE DE REINTEGRO $20,000", "tope máximo de $40.000"
  const m = /tope[^$\n]{0,60}\$([\d.,]+)/i.exec(termsText);
  if (!m) return null;
  const n = parseArgAmount(m[1]!);
  return isNaN(n) || n <= 0 ? null : n;
}

function buildCapFields(rscData: RscPromoData | undefined, termsText: string | undefined): {
  cap_amount_ars: number | null; cap_period: string | null; min_purchase_amount_ars: number | null;
} {
  const p = rscData?.promotion?.promotion;
  let cap = typeof p?.['max_amount'] === 'number' ? p['max_amount'] as number : null;
  const min = typeof p?.['min_amount'] === 'number' ? p['min_amount'] as number : null;

  // Fallback: parse from terms text ("Tope de reintegro: $30.000")
  if (cap === null && termsText) cap = parseCapFromTerms(termsText);

  const period = cap !== null ? 'per_transaction' : null;
  return { cap_amount_ars: cap, cap_period: period, min_purchase_amount_ars: min };
}

// ─── Freshness ────────────────────────────────────────────────────────────────

function classifyFreshness(
  calculatedStatus: string,
  validTo: string | null,
  scrapedAt: string,
): { is_active: boolean; is_stale: boolean; freshness_reason: string } {
  const scrapeDate = scrapedAt.slice(0, 10);

  // Date-based check first: if stop_date is in the past, the promo is expired regardless
  // of what calculated_status says. MODO sometimes returns "visible_not_applicable" for
  // promos whose stop_date has long passed.
  if (validTo && validTo < scrapeDate) {
    return { is_active: false, is_stale: true, freshness_reason: `valid_to ${validTo} expired (status: ${calculatedStatus})` };
  }

  // Then use MODO's own calculated_status
  if (calculatedStatus === 'running' || calculatedStatus === 'visible_not_applicable') {
    return { is_active: true, is_stale: false, freshness_reason: `RSC calculated_status: ${calculatedStatus}` };
  }
  if (calculatedStatus === 'finished') {
    return { is_active: false, is_stale: true, freshness_reason: 'RSC calculated_status: finished' };
  }
  if (calculatedStatus === 'future') {
    return { is_active: false, is_stale: false, freshness_reason: 'RSC calculated_status: future (not yet started)' };
  }

  return { is_active: true, is_stale: false, freshness_reason: 'No expiry date or status — assumed active' };
}

// ─── Channel ──────────────────────────────────────────────────────────────────

/**
 * MODO's payment_flow can be a comma-separated list: "instore,online", "instore,online,instore_nfc".
 * Also uses values like "all" (= both), "trip", "telepase", "subscriptions".
 * Normalizes to the canonical three-way where possible: "online" | "in_store" | "both".
 */
function mapPaymentFlow(paymentFlow: string): string {
  if (!paymentFlow) return 'unknown';
  if (paymentFlow === 'all') return 'both';
  const parts = paymentFlow.split(',').map(p => p.trim().toLowerCase());
  const hasOnline  = parts.some(p => p === 'online');
  const hasInStore = parts.some(p => p === 'in_store' || p === 'instore' || p.startsWith('instore'));
  if (hasOnline && hasInStore) return 'both';
  if (hasOnline)  return 'online';
  if (hasInStore) return 'in_store';
  // Preserve specialized flows (trip, telepase, subscriptions, etc.)
  return paymentFlow;
}

// ─── Allowed rails ────────────────────────────────────────────────────────────

/**
 * Maps raw payment_flow → allowed_rails string.
 * "instore" → qr, "instore_nfc" → nfc, "online" → online, "all" → qr; nfc; online
 */
function buildAllowedRails(rawPaymentFlow: string): string {
  if (!rawPaymentFlow) return '';
  const parts = rawPaymentFlow.toLowerCase().split(',').map(p => p.trim());
  let hasQr = false, hasNfc = false, hasOnline = false;
  for (const part of parts) {
    if (part === 'instore' || part === 'in_store') hasQr = true;
    if (part === 'instore_nfc') hasNfc = true; // NFC/contactless only — does NOT imply QR
    if (part === 'online') hasOnline = true;
    if (part === 'all') { hasQr = true; hasNfc = true; hasOnline = true; }
  }
  // Canonical order: qr, nfc, online
  const rails: string[] = [];
  if (hasQr) rails.push('qr');
  if (hasNfc) rails.push('nfc');
  if (hasOnline) rails.push('online');
  return rails.join('; ');
}

// ─── Primary artifact ─────────────────────────────────────────────────────────

function getPrimaryArtifact(
  rawArtifacts: Array<{ url: string; label: string }>,
): { artifact_url: string; artifact_type: string } {
  if (rawArtifacts.length === 0) return { artifact_url: '', artifact_type: '' };
  // Prefer PDF > merchant_list > external_url
  const pdf = rawArtifacts.find(a => a.url.toLowerCase().includes('.pdf'));
  if (pdf) return { artifact_url: pdf.url, artifact_type: 'pdf' };
  const merchants = rawArtifacts.find(a =>
    /comercios|adheridos|establecimientos/.test(a.url.toLowerCase() + a.label.toLowerCase()),
  );
  if (merchants) return { artifact_url: merchants.url, artifact_type: 'merchant_list_url' };
  return { artifact_url: rawArtifacts[0]!.url, artifact_type: 'external_url' };
}

// ─── Promo key ────────────────────────────────────────────────────────────────

function buildPromoKey(slug: string): string {
  return createHash('sha1').update(`modo|${slug}`).digest('hex').slice(0, 16);
}

// ─── Main normalize function ──────────────────────────────────────────────────

export function normalize(candidate: RawModoCandidate): ModoPromo {
  const rsc   = candidate.rscData;
  const promo = rsc?.promotion?.promotion;

  // Title: RSC > JSON-LD > slug
  const title = norm(promo?.title ?? candidate.jsonLdTitle ?? candidate.slug);

  // Where (merchant): RSC > JSON-LD
  const where = norm(promo?.where ?? candidate.jsonLdWhere ?? '');

  // Dates: RSC (start_date/stop_date) > JSON-LD (validFrom/validThrough)
  const validFrom = toIsoDate(promo?.start_date ?? candidate.jsonLdValidFrom);
  const validTo   = toIsoDate(promo?.stop_date  ?? candidate.jsonLdValidThrough);

  // Description: JSON-LD > RSC
  const descriptionShort = norm(
    (candidate.jsonLdDescription ?? promo?.['description'] as string ?? '').slice(0, 250),
  );

  // Banks + payment methods
  const { banks, bank_names, bcra_codes }                          = buildBankFields(rsc);
  const { payment_methods, card_networks, card_types }             = buildPaymentMethodFields(rsc);
  const installmentFields                                          = buildInstallmentFields(rsc?.promotion?.installments ?? []);
  const { discount_percent, discount_type: rawDiscountType }       = buildDiscountFields(rsc);
  const { cap_amount_ars, cap_period, min_purchase_amount_ars }   = buildCapFields(rsc, candidate.termsText);

  // Terms-based cashback override: MODO often labels all payment_promotion promos as
  // discount_percentage, but the actual mechanism may be a post-purchase credit (reintegro).
  // Override to cashback_percentage when terms explicitly describe that mechanism.
  // Precise pattern — avoids "sin tope de reintegro" (= no cap, still direct discount).
  const discount_type = (rawDiscountType === 'discount_percentage' && candidate.termsText &&
    /descuento\s+v[ií]a\s+reintegro|reintegro\s+a\s+realizarse|se\s+acreditar[áa]\s+en\s+(la\s+)?(caja\s+de\s+ahorro|cuenta)|tope\s+de\s+reintegro\s+(semanal|mensual|por\s+(transacci[oó]n|cliente))/i
      .test(candidate.termsText))
    ? 'cashback_percentage'
    : rawDiscountType;

  // Days of week
  const daysOfWeek = parseDaysOfWeek(promo?.days_of_week);

  // Freshness
  const calculatedStatus = promo?.calculated_status ?? '';
  const freshness        = classifyFreshness(calculatedStatus, validTo, candidate.scrapedAt);

  // Channel + rails
  const rawPaymentFlow = promo?.payment_flow ?? '';
  const paymentFlow    = mapPaymentFlow(rawPaymentFlow);
  let   allowedRails   = buildAllowedRails(rawPaymentFlow);

  // Terms-based QR exclusion: some banks explicitly forbid QR/Transferencias 3.0 even when
  // the API payment_flow includes 'instore'. Strip QR from rails when terms say so.
  const termsLower = (candidate.termsText ?? '').toLowerCase();
  if (allowedRails.includes('qr') &&
      (termsLower.includes('transferencias 3.0') || termsLower.includes('qr/pei'))) {
    allowedRails = allowedRails.split('; ').filter(r => r !== 'qr').join('; ');
  }

  // Trigger type
  const triggerType = promo?.trigger_type ?? (installmentFields.installments ? 'installments' : 'unknown');

  // Primary artifact
  const primaryArtifact = getPrimaryArtifact(candidate.rawArtifactUrls);

  // Promo key
  const promoKey = buildPromoKey(candidate.slug);

  return {
    source:         'modo',
    source_family:  'modo',
    source_url:     candidate.sourceUrl,
    discovery_path: `sitemap → modo.com.ar/promos/${candidate.slug}`,

    promo_key: promoKey,
    promo_id:  promo?.id ?? null,
    slug:      candidate.slug,

    promo_title:       title,
    description_short: descriptionShort,
    where,

    banks,
    bank_names,
    bcra_codes,

    payment_methods,
    card_networks,
    card_types,

    trigger_type:             triggerType,
    discount_percent,
    discount_type,

    installments:             installmentFields.installments,
    installment_type:         installmentFields.installment_type,
    installment_coefficient:  installmentFields.installment_coefficient,

    cap_amount_ars,
    cap_period,
    min_purchase_amount_ars,

    days_of_week: daysOfWeek,
    valid_from:   validFrom,
    valid_to:     validTo,

    payment_flow:  paymentFlow,
    channel:       paymentFlow,
    allowed_rails: allowedRails,

    calculated_status: calculatedStatus,
    ...freshness,

    artifact_url:  primaryArtifact.artifact_url,
    artifact_type: primaryArtifact.artifact_type,

    terms_text_raw: candidate.termsText ?? '',

    raw_snippet: norm(
      candidate.rscData
        ? JSON.stringify(candidate.rscData.promotion?.promotion ?? {}).slice(0, 1000)
        : (candidate.jsonLdTitle ?? ''),
    ),

    scraped_at: candidate.scrapedAt,
  };
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Deduplicates by promo_key (slug-based).
 * When two candidates map to the same slug (shouldn't happen with sitemap),
 * keeps the one with more populated fields.
 */
export function deduplicate(promos: ModoPromo[]): {
  deduped: ModoPromo[];
  removedCount: number;
} {
  const seen = new Map<string, ModoPromo>();
  for (const p of promos) {
    const existing = seen.get(p.promo_key);
    if (!existing) {
      seen.set(p.promo_key, p);
    } else {
      const score = (x: ModoPromo) =>
        Object.values(x).filter(v => v !== null && v !== '' && v !== undefined).length;
      if (score(p) > score(existing)) seen.set(p.promo_key, p);
    }
  }
  return { deduped: [...seen.values()], removedCount: promos.length - seen.size };
}
