import { Linking } from 'react-native';
import type { LiquidityRouteRecommendation, PaymentRecommendation } from '@pagamax/core';
import { getPaymentAppConfig, isAllowedAndroidPackage, isAllowedPaymentAppUrl } from '@/config/payment-apps';
import type { RecommendationSession } from '@/types/app';

export type HandoffOutcome = 'payment_flow' | 'app' | 'store';

export interface PaymentHandoffContext {
  merchantName?: string;
  amountArs?: number;
  qrPayload?: string;
}

export interface PaymentHandoffPlan {
  provider: string;
  label: string;
  primaryLabel: string;
  confidenceLabel: 'high confidence' | 'estimated' | 'manual verification needed';
  supportsQrPayload: boolean;
  supportsAmount: boolean;
  needsManualQrScan: boolean;
  instruction: string;
  detail: string;
  returnInstruction: string;
}

function formatArs(value: number | undefined): string {
  if (!Number.isFinite(value)) return 'monto no detectado';
  return value!.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

function isLiquidityRoute(recommendation: PaymentRecommendation): recommendation is LiquidityRouteRecommendation {
  return 'routeTier' in recommendation;
}

export function buildPaymentHandoffPlan(
  session: RecommendationSession,
  recommendation: PaymentRecommendation,
): PaymentHandoffPlan {
  const liquidityRoute = isLiquidityRoute(recommendation) ? recommendation : null;
  const targetConfig = getPaymentAppConfig(recommendation.method.provider);
  const fundingConfig = liquidityRoute?.routeTier === 'instant_top_up_then_pay' || liquidityRoute?.routeTier === 'prepared_route'
    ? getPaymentAppConfig(liquidityRoute.sourceAccount.provider)
    : targetConfig;
  const amount = session.amountEstimated ? undefined : session.amountArs;
  const merchant = session.match.merchant_name || session.merchantInput || 'comercio detectado';
  const hasUsefulDiscount = recommendation.valueType !== 'fallback' && recommendation.estimatedSavingsArs > 0;
  const routeCopy = hasUsefulDiscount
    ? `Elegida por ahorro estimado de ${formatArs(recommendation.estimatedSavingsArs)}.`
    : 'Sin descuento confirmado; usá tu billetera principal con saldo.';

  if (liquidityRoute?.routeTier === 'instant_top_up_then_pay') {
    return {
      provider: fundingConfig.provider,
      label: fundingConfig.label,
      primaryLabel: fundingConfig.canOpenApp ? `Mover desde ${fundingConfig.label}` : `Buscar ${fundingConfig.label}`,
      confidenceLabel: 'manual verification needed',
      supportsQrPayload: false,
      supportsAmount: false,
      needsManualQrScan: true,
      instruction: `Se abrirá ${fundingConfig.label}. Mové ${formatArs(liquidityRoute.amountToMoveArs)} a ${targetConfig.label} y confirmá que llegó. Después abrí ${targetConfig.label}, escaneá el QR de ${merchant} y revisá ${formatArs(amount)} antes de pagar.`,
      detail: `${routeCopy} Ruta: ${liquidityRoute.sourceAccount.label} a ${liquidityRoute.targetAccount.label} y pago con ${targetConfig.label}. Paga Menos no confirma transferencias ni pagos.`,
      returnInstruction: `Cuando el saldo llegue a ${targetConfig.label}, abrí esa app para pagar el QR. Después podés guardar la decisión.`,
    };
  }

  if (liquidityRoute?.routeTier === 'prepared_route') {
    return {
      provider: fundingConfig.provider,
      label: fundingConfig.label,
      primaryLabel: fundingConfig.canOpenApp ? `Preparar ${targetConfig.label}` : `Buscar ${fundingConfig.label}`,
      confidenceLabel: 'manual verification needed',
      supportsQrPayload: false,
      supportsAmount: false,
      needsManualQrScan: true,
      instruction: `Esta ruta no es rápida para la fila. Preparala antes: mové ${formatArs(liquidityRoute.amountToMoveArs)} de ${fundingConfig.label} a ${targetConfig.label}; en caja pagá el QR con ${targetConfig.label}.`,
      detail: `${routeCopy} La transferencia no está certificada como instantánea para checkout.`,
      returnInstruction: 'Guardá la decisión solo como ruta preparada. Paga Menos no registra pagos reales.',
    };
  }

  const needsManualQrScan = !targetConfig.canReceiveQrPayload;
  const confidenceLabel = targetConfig.canReceiveQrPayload
    ? 'high confidence'
    : targetConfig.canDeepLinkToPaymentFlow
      ? 'estimated'
      : 'manual verification needed';

  return {
    provider: targetConfig.provider,
    label: targetConfig.label,
    primaryLabel: targetConfig.canOpenApp ? `Abrir ${targetConfig.label}` : `Buscar ${targetConfig.label}`,
    confidenceLabel,
    supportsQrPayload: targetConfig.canReceiveQrPayload,
    supportsAmount: targetConfig.canReceiveAmount,
    needsManualQrScan,
    instruction: !needsManualQrScan
      ? `Se abrirá ${targetConfig.label} con el QR detectado. Revisá antes de confirmar.`
      : `Se abrirá ${targetConfig.label}. Abrí el lector QR en esa app y pagá a ${merchant} por ${formatArs(amount)}. Confirmá solo dentro de ${targetConfig.label}.`,
    detail: `${routeCopy} ${targetConfig.fallbackBehavior}`,
    returnInstruction: 'Al volver, podés guardar la decisión. Paga Menos no confirma ni registra pagos reales.',
  };
}

export async function openPaymentApp(
  provider: string,
  _context: PaymentHandoffContext = {},
): Promise<HandoffOutcome> {
  const config = getPaymentAppConfig(provider);

  if (config.paymentFlowUrl && isAllowedPaymentAppUrl(config.provider, config.paymentFlowUrl)) {
    try {
      await Linking.openURL(config.paymentFlowUrl);
      return 'payment_flow';
    } catch {
      // Fall through to app launch.
    }
  }

  if (config.launchUrl && isAllowedPaymentAppUrl(config.provider, config.launchUrl)) {
    try {
      await Linking.openURL(config.launchUrl);
      return 'app';
    } catch {
      // Fall through to package launch.
    }
  }

  if (config.androidPackage && isAllowedAndroidPackage(config.provider, config.androidPackage)) {
    try {
      await Linking.openURL(`intent://#Intent;package=${config.androidPackage};end`);
      return 'app';
    } catch {
      // Fall through to Play Store.
    }
  }

  if (!isAllowedPaymentAppUrl(config.provider, config.playStoreUrl)) {
    throw new Error('Destino de pago no permitido.');
  }

  await Linking.openURL(config.playStoreUrl);
  return 'store';
}
