import type { MatchResult, PaymentMethodProfile, PaymentRecommendation } from '@pagamax/core';

export interface StoredPaymentMethod extends PaymentMethodProfile {
  enabled: boolean;
}

export interface AppSettings {
  debugEnabled: boolean;
}

export interface PendingScan {
  payload: string;
  match: MatchResult;
}

export interface RecommendationSession {
  amountArs: number;
  source: 'manual' | 'scan';
  merchantInput: string;
  qrPayload?: string;
  match: MatchResult;
  recommendations: PaymentRecommendation[];
  createdAt: string;
}
