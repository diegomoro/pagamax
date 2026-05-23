import { Linking } from 'react-native';
import { getPaymentAppConfig } from '@/config/payment-apps';
import type { RecommendationSession } from '@/types/app';
import type { PaymentRecommendation } from '@pagamax/core';

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
  instruction: string;
  detail: string;
}

function formatArs(value: number | undefined): string {
  if (!Number.isFinite(value)) return 'monto no detectado';
  return value!.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

export function buildPaymentHandoffPlan(
  session: RecommendationSession,
  recommendation: PaymentRecommendation,
): PaymentHandoffPlan {
  const config = getPaymentAppConfig(recommendation.method.provider);
  const amount = session.amountEstimated ? undefined : session.amountArs;
  const merchant = session.match.merchant_name || session.merchantInput || 'comercio detectado';
  const hasUsefulDiscount = recommendation.valueType !== 'fallback' && recommendation.estimatedSavingsArs > 0;
  const confidenceLabel = config.canReceiveQrPayload
    ? 'high confidence'
    : config.canDeepLinkToPaymentFlow
      ? 'estimated'
      : 'manual verification needed';

  const routeCopy = hasUsefulDiscount
    ? `Elegida por ahorro estimado de ${formatArs(recommendation.estimatedSavingsArs)}.`
    : 'Sin descuento confirmado; usa tu metodo configurado por defecto.';

  return {
    provider: config.provider,
    label: config.label,
    primaryLabel: config.canOpenApp ? `Abrir ${config.label}` : `Buscar ${config.label}`,
    confidenceLabel,
    supportsQrPayload: config.canReceiveQrPayload,
    supportsAmount: config.canReceiveAmount,
    instruction: config.canReceiveQrPayload
      ? `Se abrira ${config.label} con el QR detectado. Revisa antes de confirmar.`
      : `Se abrira ${config.label}. Paga a ${merchant} por ${formatArs(amount)} y confirma solo dentro de la app.`,
    detail: `${routeCopy} ${config.fallbackBehavior}`,
  };
}

export async function openPaymentApp(
  provider: string,
  _context: PaymentHandoffContext = {},
): Promise<HandoffOutcome> {
  const config = getPaymentAppConfig(provider);

  if (config.paymentFlowUrl) {
    try {
      await Linking.openURL(config.paymentFlowUrl);
      return 'payment_flow';
    } catch {
      // Fall through to app launch.
    }
  }

  if (config.launchUrl) {
    try {
      await Linking.openURL(config.launchUrl);
      return 'app';
    } catch {
      // Fall through to package launch.
    }
  }

  if (config.androidPackage) {
    try {
      await Linking.openURL(`intent://#Intent;package=${config.androidPackage};end`);
      return 'app';
    } catch {
      // Fall through to Play Store.
    }
  }

  await Linking.openURL(config.playStoreUrl);
  return 'store';
}
