import type { MatchMethod, PaymentRecommendation } from '@pagamax/core';
import type {
  ConfidenceInfo,
  OptimizationMode,
  RecommendationSession,
  SavingsActivity,
} from '@/types/app';

const PAGAMAX_FEE_RATE = 0.16;
const PAGAMAX_FEE_CAP_ARS = 2200;

export function estimatePagamaxFeeArs(grossSavingsArs: number): number {
  if (grossSavingsArs <= 0) return 0;
  return Math.round(Math.min(grossSavingsArs * PAGAMAX_FEE_RATE, PAGAMAX_FEE_CAP_ARS));
}

export function estimateNetSavingsArs(grossSavingsArs: number): number {
  return Math.max(0, grossSavingsArs - estimatePagamaxFeeArs(grossSavingsArs));
}

export function buildConfidence(matchMethod: MatchMethod, warningCount: number): ConfidenceInfo {
  const baseScoreMap: Record<MatchMethod, number> = {
    cuit: 0.94,
    name_exact: 0.88,
    name_prefix: 0.78,
    name_fuzzy: 0.72,
    mcc: 0.63,
    none: 0.42,
  };

  const score = Math.max(0.28, baseScoreMap[matchMethod] - warningCount * 0.05);

  if (score >= 0.84) {
    return {
      label: 'Alta',
      score,
      tone: 'success',
      note: 'El comercio y la promo encajan con senales concretas del QR o del nombre.',
    };
  }

  if (score >= 0.62) {
    return {
      label: 'Media',
      score,
      tone: 'warning',
      note: 'La recomendacion es util, pero conviene revisar topes, fechas o el comercio detectado.',
    };
  }

  return {
    label: 'Baja',
    score,
    tone: 'default',
    note: 'La recomendacion se apoya en inferencias generales y merece validacion manual.',
  };
}

export function buildRecommendationPresentation(
  session: RecommendationSession,
  recommendation: PaymentRecommendation,
) {
  const grossSavingsArs = Math.max(0, Math.round(recommendation.estimatedSavingsArs));
  const pagamaxFeeArs = estimatePagamaxFeeArs(grossSavingsArs);
  const netSavingsArs = Math.max(0, grossSavingsArs - pagamaxFeeArs);
  const confidence = buildConfidence(session.match.match_method, recommendation.warnings.length);

  const qualifiers = recommendation.reasons.slice(0, 3);
  const caveats = recommendation.warnings;

  return {
    grossSavingsArs,
    pagamaxFeeArs,
    netSavingsArs,
    confidence,
    qualifiers,
    caveats,
  };
}

export function sortRecommendationsForMode(
  session: RecommendationSession,
  mode: OptimizationMode,
): PaymentRecommendation[] {
  if (mode === 'max_savings') return session.recommendations;

  return [...session.recommendations].sort((left, right) => {
    const leftPresentation = buildRecommendationPresentation(session, left);
    const rightPresentation = buildRecommendationPresentation(session, right);
    const leftDirect = left.valueType === 'discount' ? 1 : 0;
    const rightDirect = right.valueType === 'discount' ? 1 : 0;
    const leftPenalty = left.warnings.length * 1000;
    const rightPenalty = right.warnings.length * 1000;

    return (
      rightDirect * 10000 + rightPresentation.netSavingsArs - rightPenalty
      - (leftDirect * 10000 + leftPresentation.netSavingsArs - leftPenalty)
    );
  });
}

export function buildActivityFromSession(
  session: RecommendationSession,
  recommendation: PaymentRecommendation,
): SavingsActivity {
  const presentation = buildRecommendationPresentation(session, recommendation);

  return {
    id: `${session.createdAt}-${recommendation.method.id}-${recommendation.promo.promo_key}`,
    merchantName: session.match.merchant_name,
    category: recommendation.promo.category || 'General',
    amountArs: session.amountArs,
    grossSavingsArs: presentation.grossSavingsArs,
    pagamaxFeeArs: presentation.pagamaxFeeArs,
    netSavingsArs: presentation.netSavingsArs,
    provider: recommendation.method.provider,
    methodLabel: recommendation.method.label,
    confidence: presentation.confidence,
    createdAt: new Date().toISOString(),
    source: session.source,
  };
}

export function summarizeActivity(history: SavingsActivity[]) {
  const totals = history.reduce((acc, item) => {
    acc.gross += item.grossSavingsArs;
    acc.net += item.netSavingsArs;
    acc.fees += item.pagamaxFeeArs;
    return acc;
  }, { gross: 0, net: 0, fees: 0 });

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthly = history
    .filter((item) => {
      const date = new Date(item.createdAt);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    })
    .reduce((sum, item) => sum + item.netSavingsArs, 0);

  return {
    monthlyNetSavingsArs: monthly,
    lifetimeNetSavingsArs: totals.net,
    lifetimeGrossSavingsArs: totals.gross,
    lifetimeFeesArs: totals.fees,
  };
}
