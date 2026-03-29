/**
 * scoring.ts — Promo routing scores for Pagamax.
 *
 * All scores are computed at consolidation time from the canonical promo fields.
 * They are designed to be updated as real transaction data flows back in — the
 * constants here are calibrated on scraped data only (no live feedback yet).
 *
 * Score hierarchy:
 *   data_quality_score   → field completeness signal
 *   issuer_reliability   → per-issuer structural trust
 *   routing_confidence   → go/no-go for routing (combines above + freshness + payment risk)
 *   potential_value_ars  → max ARS discount per transaction
 *   routing_ltv          → expected monthly ARS value (primary ranking signal)
 */

import type { CanonicalPromo, Issuer } from './types/canonical.js';

// ─── Issuer reliability ───────────────────────────────────────────────────────
//
// Calibrated from observed field coverage across all scraped promos (Mar 2026):
//   BBVA:         100% dates, 83% cap, 100% channel, 56% day_pattern → very high
//   MODO:          99% dates, 46% cap, 99% channel, terms on 86%     → high
//   PersonalPay:  100% dates, 15% cap, 100% T&C/exclusions          → high (known gap: cap)
//   CuentaDNI:    good dates, cap coverage, excluded_rails extracted  → good
//   Ualá:          80% dates, small dataset (5 rows)                  → medium
//   NaranjaX:       0% dates, 8% cap, but live API + large dataset    → medium-low
//   MercadoPago:    1% dates, live API confirmed active               → low (data thin)

const ISSUER_RELIABILITY: Record<Issuer, number> = {
  bbva:         0.92,
  modo:         0.82,
  personalpay:  0.80,
  cuentadni:    0.76,
  uala:         0.70,
  naranjax:     0.58,
  mercadopago:  0.48,
};

// ─── Category average ticket (ARS, March 2026) ───────────────────────────────
//
// Estimated average transaction size per category.
// Source: Argentine consumer spending patterns + issuer promo cap values as proxy.
// Update quarterly as ARS inflation erodes real values (~6% monthly).

const CATEGORY_AVG_TICKET: Record<string, number> = {
  'Supermercados':   30_000,
  'Gastronomía':     12_000,
  'Farmacia':         8_000,
  'Salud':           10_000,
  'Indumentaria':    25_000,
  'Deporte':         20_000,
  'Tecnología':      90_000,
  'Entretenimiento':  7_000,
  'Combustible':     18_000,
  'Viajes':         200_000,
  'Educación':       25_000,
  'Hogar':           45_000,
  'Transporte':       2_500,
  'Automotor':       70_000,
  'Otro':            15_000,
};

// ─── Category usage frequency (times/month per active user) ──────────────────
//
// How often a typical user transacts in this category.
// Drives the "how many times per month will this promo be usable" component of LTV.

const CATEGORY_FREQ_MONTHLY: Record<string, number> = {
  'Supermercados':   4.0,
  'Gastronomía':     5.0,
  'Farmacia':        2.0,
  'Salud':           1.0,
  'Indumentaria':    0.8,
  'Deporte':         1.2,
  'Tecnología':      0.2,
  'Entretenimiento': 1.5,
  'Combustible':     4.0,
  'Viajes':          0.2,
  'Educación':       0.5,
  'Hogar':           0.4,
  'Transporte':     20.0,
  'Automotor':       0.3,
  'Otro':            1.0,
};

// ─── Collection risk by discount type ────────────────────────────────────────
//
// Probability that the promised discount is NOT successfully collected.
// direct_discount: instant (near-zero risk)
// cashback: reimbursed 24–72h later — issuer processing failures, disputes
// installments: issuer-backed, low risk
// coupon_discount: depends on coupon validity at POS

const COLLECTION_RISK: Record<CanonicalPromo['discount_type'], number> = {
  direct_discount:  0.01,
  cashback:         0.05,
  installments:     0.02,
  coupon_discount:  0.04,
  unknown:          0.10,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Count how many days per week are covered by a day_pattern string. */
function daysPerWeek(dayPattern: string): number {
  if (!dayPattern || dayPattern === 'everyday') return 7;
  // Patterns like "monday; friday" or "thursday"
  return dayPattern.split(';').filter(s => s.trim().length > 0).length;
}

// ─── Score computation ────────────────────────────────────────────────────────

/**
 * data_quality_score (0–1)
 * Rewards presence of routing-critical fields. Missing any costs points.
 */
function computeDataQuality(p: CanonicalPromo): number {
  let score = 0;
  if (p.valid_to)                                         score += 0.20;
  if (p.discount_percent !== null)                        score += 0.20;
  if (p.cap_amount_ars !== null)                          score += 0.20;
  if (p.channel !== 'unknown')                            score += 0.15;
  if (p.exclusions_raw || p.excluded_rails)               score += 0.10;
  if (p.valid_from)                                       score += 0.05;
  // Day pattern: knowing it's restricted is valuable (prevents wrong-day routing)
  if (p.day_pattern && p.day_pattern !== 'everyday')      score += 0.05;
  // Description present (UX quality)
  if (p.description_short && p.description_short.length > 5) score += 0.05;
  return round2(clamp(score));
}

/**
 * routing_confidence (0–1)
 * Go/no-go signal for the routing engine.
 * < 0.40: do not route (too uncertain)
 * 0.40–0.65: route with hedge (hold larger float reserve)
 * > 0.65: route confidently
 */
function computeRoutingConfidence(
  p: CanonicalPromo,
  dataQuality: number,
  issuerReliability: number,
): number {
  // Base: weighted combination of data quality and issuer trust
  let score = dataQuality * 0.45 + issuerReliability * 0.40;

  // Freshness bonus
  if (p.freshness_status === 'active' && p.valid_to)  score += 0.15;
  else if (p.freshness_status === 'active')            score += 0.08;
  else if (p.freshness_status === 'future')            score += 0.05;
  // expired/unknown: +0

  // Payment type risk penalty
  score -= COLLECTION_RISK[p.discount_type] ?? 0.10;

  // QR exclusion mismatch penalty: if this promo excludes the rail it's on
  if (p.excluded_rails && p.rail === 'qr' && p.excluded_rails.includes('qr')) {
    score -= 0.30;
  }

  return round2(clamp(score));
}

/**
 * potential_value_ars (number | null)
 * Best-case ARS discount capturable in one transaction.
 * Respects the cap. Uses category avg ticket when no explicit transaction size available.
 */
function computePotentialValue(p: CanonicalPromo): number | null {
  const avgTicket = CATEGORY_AVG_TICKET[p.category] ?? CATEGORY_AVG_TICKET['Otro']!;

  if (p.discount_percent !== null && p.discount_percent > 0) {
    const rawValue = (p.discount_percent / 100) * avgTicket;
    // Cap applies per transaction unless cap_period says otherwise
    const cap = p.cap_amount_ars;
    return Math.round(cap !== null ? Math.min(rawValue, cap) : rawValue);
  }

  if (p.discount_amount_ars !== null && p.discount_amount_ars > 0) {
    return p.discount_amount_ars;
  }

  // Installments without a stated % — estimate the financing cost saving
  // Proxy: ~12% effective annual rate saved over avg installment count
  if (p.discount_type === 'installments' && p.installments_count) {
    const monthlyRate = 0.08; // ~8% monthly (Argentina effective rate)
    const saving = avgTicket * (1 - 1 / (1 + monthlyRate * p.installments_count / 12));
    return Math.round(saving);
  }

  return null;
}

/**
 * routing_ltv (number | null)
 * Expected monthly ARS value from routing this promo to a typical user.
 *
 * Formula:
 *   potential_value_ars
 *   × routing_confidence        (probability it fires)
 *   × usage_freq_monthly        (how often user visits this category per month)
 *   × day_coverage              (fraction of month the promo is active)
 *   × (1 − collection_risk)     (probability we actually collect)
 *
 * This is a relative ranking signal. Absolute values improve once
 * real transaction feedback is incorporated (planned: Phase 2).
 */
function computeRoutingLtv(
  p: CanonicalPromo,
  potentialValue: number | null,
  routingConfidence: number,
): number | null {
  if (potentialValue === null) return null;

  const freq      = CATEGORY_FREQ_MONTHLY[p.category] ?? CATEGORY_FREQ_MONTHLY['Otro']!;
  const dayCov    = daysPerWeek(p.day_pattern) / 7;
  const collRisk  = COLLECTION_RISK[p.discount_type] ?? 0.10;

  const ltv = potentialValue * routingConfidence * freq * dayCov * (1 - collRisk);
  return Math.round(ltv);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface PromoScores {
  data_quality_score:  number;
  issuer_reliability:  number;
  routing_confidence:  number;
  potential_value_ars: number | null;
  routing_ltv:         number | null;
}

export function computeScores(p: CanonicalPromo): PromoScores {
  const dataQuality       = computeDataQuality(p);
  const issuerReliability = ISSUER_RELIABILITY[p.issuer] ?? 0.50;
  const routingConfidence = computeRoutingConfidence(p, dataQuality, issuerReliability);
  const potentialValue    = computePotentialValue(p);
  const routingLtv        = computeRoutingLtv(p, potentialValue, routingConfidence);

  return {
    data_quality_score:  dataQuality,
    issuer_reliability:  issuerReliability,
    routing_confidence:  routingConfidence,
    potential_value_ars: potentialValue,
    routing_ltv:         routingLtv,
  };
}
