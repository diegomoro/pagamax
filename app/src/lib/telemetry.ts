import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PaymentRecommendation } from '@pagamax/core';
import { sendTelemetryBatch } from '@/lib/backend';
import { STORAGE_KEYS } from '@/lib/storage';
import type { AppSettings, BetaAccount, RecommendationSession } from '@/types/app';

export type TelemetryEventName =
  | 'account_synced'
  | 'account_deleted'
  | 'session_created'
  | 'handoff_started'
  | 'decision_saved'
  | 'privacy_controls_updated';

export interface TelemetryEvent {
  id: string;
  name: TelemetryEventName;
  createdAt: string;
  accountId?: string;
  payload: Record<string, unknown>;
}

function makeEventId(name: string): string {
  return `${Date.now()}-${name}-${Math.random().toString(36).slice(2, 8)}`;
}

export function amountBand(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'unknown';
  if (value < 5000) return '0-4999';
  if (value < 15000) return '5000-14999';
  if (value < 50000) return '15000-49999';
  if (value < 150000) return '50000-149999';
  return '150000+';
}

export function buildSessionTelemetryPayload(
  session: RecommendationSession,
  recommendations: PaymentRecommendation[],
): Record<string, unknown> {
  return {
    source: session.source,
    merchantName: session.match.merchant_name,
    category: recommendations[0]?.promo.category ?? 'General',
    amountBand: amountBand(session.amountArs),
    amountEstimated: session.amountEstimated,
    matchMethod: session.match.match_method,
    qrType: session.match.qr.qr_type,
    providerHint: session.match.qr.payment_provider ?? null,
    recommendationCount: recommendations.length,
    topProvider: recommendations[0]?.method.provider ?? null,
    topValueType: recommendations[0]?.valueType ?? null,
  };
}

export async function recordTelemetryEvent(
  settings: AppSettings,
  account: BetaAccount | null,
  name: TelemetryEventName,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!settings.analyticsEnabled) return;

  const event: TelemetryEvent = {
    id: makeEventId(name),
    name,
    createdAt: new Date().toISOString(),
    payload,
  };
  if (account?.id) event.accountId = account.id;

  const raw = await AsyncStorage.getItem(STORAGE_KEYS.telemetryQueue);
  const previous = raw ? JSON.parse(raw) as TelemetryEvent[] : [];
  const next = [event, ...previous].slice(0, 200);
  await AsyncStorage.setItem(STORAGE_KEYS.telemetryQueue, JSON.stringify(next));

  try {
    await sendTelemetryBatch([event]);
  } catch {
    // Telemetry is opportunistic; checkout decisions must never wait on it.
  }
}
