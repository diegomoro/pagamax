import { randomUUID } from 'node:crypto';
import type { RawPromotionCandidate } from '../../shared/types/raw.js';
import {
  NormalizedPromotionBundleSchema,
  type NormalizedPromotionBundle,
  type Benefit,
  type Limit,
  type Schedule,
  type Condition,
  type Exclusion,
  type Scope,
  type PaymentRailEntry,
} from '../../shared/types/normalized.js';
import {
  parsePercentage,
  parseCurrencyARS,
  parseInstallments,
  parseWeekdaysSpanish,
  parseDateRangeSpanish,
  parsePaymentRails,
  parseMerchantName,
  normalizeLegalText,
  parseCapLimit,
  parseMinPurchase,
  parseStackability,
  parsePlanName,
  parseExpirationDate,
} from '../../shared/parsers/index.js';
import { createLogger } from '../../core/logging/logger.js';

const log = createLogger({ issuerCode: 'naranjax', phase: 'normalize' });

/**
 * normalizeNaranjaxCandidate
 *
 * Interprets a RawPromotionCandidate into a NormalizedPromotionBundle.
 *
 * Rules:
 * - Every field assignment is guarded. If a parser returns null, that field
 *   is omitted. We NEVER invent data.
 * - Zod .parse() at return — throws if the bundle is structurally invalid
 *   (indicates a code bug in this file, not a data problem).
 */
export function normalizeNaranjaxCandidate(
  candidate: RawPromotionCandidate,
): NormalizedPromotionBundle {
  const promotionId = randomUUID();

  // ── Benefits ────────────────────────────────────────────────────────────────
  const benefits = parseBenefits(candidate.benefitText, candidate.planTypeText);

  // ── Payment Rails ────────────────────────────────────────────────────────────
  const allPaymentTexts = [
    ...candidate.paymentMethodText,
    ...candidate.railText,
    ...candidate.benefitText,
  ];
  const rails: PaymentRailEntry[] = parsePaymentRails(allPaymentTexts).map((rail) => ({
    rail,
  }));
  if (rails.length === 0) {
    rails.push({ rail: 'wallet' });
  }

  // ── Schedule ─────────────────────────────────────────────────────────────────
  const schedules: Schedule[] = [];
  const validitySource = candidate.validityText ?? candidate.benefitText.join(' ');
  if (validitySource) {
    const weekdays = parseWeekdaysSpanish(validitySource);
    const dateRange = parseDateRangeSpanish(validitySource);

    // Also try expiration from detail page
    const expirationDate = candidate.expirationText
      ? parseExpirationDate(candidate.expirationText)
      : null;

    const endDate = expirationDate ?? dateRange?.end ?? undefined;
    const startDate = dateRange?.start ?? undefined;

    if (weekdays.length > 0 || startDate || endDate) {
      schedules.push({
        weekdays: weekdays as Schedule['weekdays'],
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });
    }
  }

  // If no schedule but we have expiration text, create one
  if (schedules.length === 0 && candidate.expirationText) {
    const endDate = parseExpirationDate(candidate.expirationText);
    if (endDate) {
      schedules.push({ weekdays: [], endDate });
    }
  }

  // ── Limits (caps, min purchase) ────────────────────────────────────────────
  const limits: Limit[] = [];

  if (candidate.capText) {
    const cap = parseCapLimit(candidate.capText);
    if (cap) {
      limits.push({
        maxBenefit: cap.amount,
        ...(cap.period && { capPeriod: cap.period }),
        perPerson: cap.perPerson || undefined,
        capText: candidate.capText,
      });
    }
  }

  if (candidate.minPurchaseText) {
    const minAmount = parseMinPurchase(candidate.minPurchaseText);
    if (minAmount !== null && minAmount > 0) {
      // Add to existing limit or create new one
      if (limits.length > 0) {
        limits[0]!.minPurchase = minAmount;
      } else {
        limits.push({ minPurchase: minAmount });
      }
    }
  }

  // ── Conditions (legal text + detail page info) ────────────────────────────
  const conditions: Condition[] = [];
  if (candidate.legalText) {
    conditions.push({ text: normalizeLegalText(candidate.legalText) });
  }

  // ── Exclusions ─────────────────────────────────────────────────────────────
  const exclusions: Exclusion[] = [];
  if (candidate.exclusionTexts) {
    for (const excl of candidate.exclusionTexts) {
      if (excl.trim()) exclusions.push({ text: excl.trim() });
    }
  }

  // ── Stackability ──────────────────────────────────────────────────────────
  const stackable = candidate.stackableText
    ? parseStackability(candidate.stackableText)
    : undefined;

  // ── Scope ──────────────────────────────────────────────────────────────────
  const scopes: Scope[] = [];
  if (candidate.scopeText) {
    const t = candidate.scopeText.toLowerCase();
    if (/presencial/i.test(t) && /online/i.test(t)) {
      scopes.push({ type: 'both' });
    } else if (/presencial|sucursal/i.test(t)) {
      scopes.push({ type: 'in_store' });
    } else if (/online|digital|web/i.test(t)) {
      scopes.push({ type: 'online' });
    }
  }

  // ── Refund info (applied to cashback/discount benefits) ───────────────────
  if (candidate.refundText) {
    const refund = parseRefundInfo(candidate.refundText);
    // Apply refund info to all percentage/fixed benefits
    for (const b of benefits) {
      if (b.type.startsWith('cashback_') || b.type.startsWith('discount_')) {
        if (refund.method) b.refundMethod = refund.method;
        if (refund.delayDays !== undefined) b.refundDelayDays = refund.delayDays;
        b.refundText = candidate.refundText;
      }
    }
  }

  // ── Merchant ──────────────────────────────────────────────────────────────
  const merchantName = candidate.merchantText
    ? parseMerchantName(candidate.merchantText)
    : undefined;

  // ── Build and validate the bundle ────────────────────────────────────────
  const raw = {
    promotion: {
      id: promotionId,
      issuerCode: candidate.issuerCode,
      ...(candidate.issuerPromoId && { issuerPromoId: candidate.issuerPromoId }),
      ...(merchantName && { merchantName }),
      ...(candidate.categoryText && { category: candidate.categoryText }),
      title: candidate.title,
      sourceUrl: candidate.sourceUrl,
      ...(candidate.imageUrl && { imageUrl: candidate.imageUrl }),
      currency: 'ARS',
      ...(stackable !== null && stackable !== undefined && { stackable }),
      ...(candidate.stackableText && { stackingText: candidate.stackableText }),
      createdAt: new Date(),
    },
    promotionVersion: {
      id: randomUUID(),
      promotionId,
      rawHtmlHash: candidate.rawHtmlHash,
      scrapedAt: candidate.extractedAt,
      isActive: true,
    },
    paymentRails: rails,
    benefits,
    limits,
    schedules,
    conditions,
    exclusions,
    scopes,
  };

  const bundle = NormalizedPromotionBundleSchema.parse(raw);

  log.debug(
    { promotionId, title: candidate.title, benefits: benefits.length },
    'Normalized candidate',
  );

  return bundle;
}

// ─── Benefit parsing helpers ─────────────────────────────────────────────────

/**
 * Parse benefits from text lines. Now handles multiple benefits in a single
 * line (e.g., "25% off y 12 cuotas cero interés" → discount + installments).
 */
function parseBenefits(benefitTexts: string[], planTypeText?: string): Benefit[] {
  const benefits: Benefit[] = [];

  for (const text of benefitTexts) {
    // Try percentage-based benefit (cashback or discount)
    const pct = parsePercentage(text);
    if (pct !== null) {
      const isReintegro = /reintegro|cashback|devoluci[oó]n/i.test(text);
      const benefit: Benefit = {
        type: isReintegro ? 'cashback_percentage' : 'discount_percentage',
        value: pct,
      };
      benefits.push(benefit);
      // Do NOT continue — check for installments in the same text too
    }

    // Try installment benefit
    const inst = parseInstallments(text);
    if (inst !== null) {
      const benefit: Benefit = {
        type: inst.interestFree ? 'installments_interest_free' : 'installments_fixed_rate',
        ...(inst.count > 0 && { installments: inst.count }),
        interestFree: inst.interestFree,
        ...(inst.planName && { planName: inst.planName }),
      };
      benefits.push(benefit);
      continue;
    }

    // Try fixed ARS cashback/discount (only if no percentage was found)
    if (pct === null && /\$|pesos|ars/i.test(text)) {
      const amount = parseCurrencyARS(text);
      if (amount !== null) {
        const isReintegro = /reintegro|cashback|devoluci[oó]n/i.test(text);
        const benefit: Benefit = {
          type: isReintegro ? 'cashback_fixed' : 'discount_fixed',
          value: amount,
        };
        benefits.push(benefit);
      }
    }
  }

  // Apply plan info from detail page if we have it
  if (planTypeText) {
    const plan = parsePlanName(planTypeText);
    if (plan) {
      // If we already have installment benefits, apply the plan name
      const instBenefit = benefits.find(b =>
        b.type === 'installments_interest_free' || b.type === 'installments_fixed_rate'
      );
      if (instBenefit) {
        instBenefit.planName = instBenefit.planName ?? plan.name;
        instBenefit.planExclusive = plan.exclusive || undefined;
      }
      // If no installment benefit but plan mentioned, the plan IS the benefit
      if (!instBenefit) {
        benefits.push({
          type: 'installments_interest_free',
          interestFree: true,
          planName: plan.name,
          planExclusive: plan.exclusive || undefined,
        });
      }
      // Also mark discount/cashback benefits as plan exclusive if applicable
      if (plan.exclusive) {
        for (const b of benefits) {
          if (b.type.startsWith('discount_') || b.type.startsWith('cashback_')) {
            b.planExclusive = true;
          }
        }
      }
    }
  }

  return benefits;
}

// ─── Refund parsing helper ──────────────────────────────────────────────────

function parseRefundInfo(text: string): { method?: Benefit['refundMethod']; delayDays?: number } {
  const t = text.toLowerCase();
  let method: Benefit['refundMethod'] | undefined;
  let delayDays: number | undefined;

  if (/inmediato/i.test(t)) {
    method = 'immediate';
    delayDays = 0;
  } else if (/en\s+tu\s+cuenta|en\s+cuenta/i.test(t)) {
    method = 'account_credit';
  } else if (/resumen|estado\s+de\s+cuenta/i.test(t)) {
    method = 'statement_credit';
  } else if (/billetera|wallet/i.test(t)) {
    method = 'cashback_wallet';
  }

  // Parse delay: "en 10 días hábiles"
  const delayMatch = /en\s+(\d+)\s+d[ií]as?\s+h[aá]biles?/i.exec(t);
  if (delayMatch?.[1]) {
    delayDays = parseInt(delayMatch[1], 10);
  }

  return { method, delayDays };
}
