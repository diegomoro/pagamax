import type { MatchMethod, PaymentRecommendation } from '@pagamax/core';
import type {
  ConfidenceInfo,
  OptimizationMode,
  RecommendationSession,
  SavingsActivity,
} from '@/types/app';
import { PUBLIC_RECOMMENDATION_ONLY } from '@/config/public-build';

const PAGAMAX_FEE_RATE = 0.16;
const PAGAMAX_FEE_CAP_ARS = 2200;

function translateCapPeriod(period: string): string {
  if (period === 'daily') return 'diario';
  if (period === 'weekly') return 'semanal';
  if (period === 'monthly') return 'mensual';
  if (period === 'per_transaction') return 'por transaccion';
  return period;
}

function translateReason(reason: string): string {
  let match = reason.match(/^(\d+)% cashback capped at (.+)$/);
  if (match) return `${match[1]}% de reintegro con tope de ${match[2]}`;

  match = reason.match(/^(\d+)% cashback$/);
  if (match) return `${match[1]}% de reintegro`;

  match = reason.match(/^(\d+)% coupon discount capped at (.+)$/);
  if (match) return `${match[1]}% de descuento con cupon y tope de ${match[2]}`;

  match = reason.match(/^(\d+)% coupon discount$/);
  if (match) return `${match[1]}% de descuento con cupon`;

  match = reason.match(/^(\d+)% discount capped at (.+)$/);
  if (match) return `${match[1]}% de descuento con tope de ${match[2]}`;

  match = reason.match(/^(\d+)% discount$/);
  if (match) return `${match[1]}% de descuento`;

  match = reason.match(/^Fixed (.+) benefit$/);
  if (match) return `Beneficio fijo de ${match[1]}`;

  match = reason.match(/^(\d+) installments estimated as financing value$/);
  if (match) return `${match[1]} cuotas con valor estimado de financiacion`;

  match = reason.match(/^Estimated savings (.+) on (.+)$/);
  if (match) return `Ahorro estimado de ${match[1]} sobre ${match[2]}`;

  match = reason.match(/^Use (.+)$/);
  if (match) return `Usa ${match[1]}`;

  return reason;
}

function translateWarning(warning: string): string {
  const capMatch = warning.match(/^Assumes full (.+) cap is still available$/);
  if (capMatch) {
    return `Puede depender de que todavia tengas tope ${translateCapPeriod(capMatch[1])}`;
  }

  if (warning === 'Cashback timing is not modeled; gross value only') {
    return 'El reintegro puede acreditarse despues; mira la app antes de confirmar';
  }

  if (warning === 'Coupon application may still be required at checkout') {
    return 'Puede pedir cupon o activacion antes de pagar';
  }

  if (warning === 'Installment value is an estimate, not a guaranteed cash discount') {
    return 'Las cuotas son estimadas; no es plata descontada en el momento';
  }

  return warning;
}

export function estimatePagamaxFeeArs(grossSavingsArs: number): number {
  if (PUBLIC_RECOMMENDATION_ONLY) return 0;
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
      note: 'Parece buena, pero conviene mirar topes, fechas o comercio detectado.',
    };
  }

  return {
    label: 'Baja',
    score,
    tone: 'default',
    note: 'Es una ayuda general. Revisala antes de pagar.',
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

  const qualifiers = recommendation.reasons.slice(0, 3).map(translateReason);
  const caveats = recommendation.warnings.map(translateWarning);

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
