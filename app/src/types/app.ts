import type { MatchResult, PaymentMethodProfile, PaymentRecommendation } from '@pagamax/core';

export type RecommendationSource = 'manual' | 'scan' | 'online';
export type OptimizationMode = 'max_savings' | 'fastest_checkout';
export type ConfidenceTone = 'success' | 'warning' | 'default';

export interface StoredPaymentMethod extends PaymentMethodProfile {
  enabled: boolean;
}

export interface ConfidenceInfo {
  label: 'Alta' | 'Media' | 'Baja';
  score: number;
  tone: ConfidenceTone;
  note: string;
}

export interface AppSettings {
  debugEnabled: boolean;
  onboardingCompleted: boolean;
  notificationsEnabled: boolean;
  locationInsightsEnabled: boolean;
  alertThresholdArs: number;
  optimizationMode: OptimizationMode;
  advancedMode: boolean;
  savedMerchants: string[];
  surfacePreferences: {
    inStore: boolean;
    online: boolean;
    travel: boolean;
  };
}

export interface PendingScan {
  payload: string;
  match: MatchResult;
}

export interface RecommendationSession {
  amountArs: number;
  source: RecommendationSource;
  merchantInput: string;
  qrPayload?: string;
  checkoutUrl?: string;
  match: MatchResult;
  recommendations: PaymentRecommendation[];
  createdAt: string;
}

export interface SavingsActivity {
  id: string;
  merchantName: string;
  category: string;
  amountArs: number;
  grossSavingsArs: number;
  pagamaxFeeArs: number;
  netSavingsArs: number;
  provider: string;
  methodLabel: string;
  confidence: ConfidenceInfo;
  createdAt: string;
  source: RecommendationSource;
}

export interface MerchantOpportunity {
  id: string;
  merchantName: string;
  category: string;
  likelyGrossSavingsArs: number;
  likelyNetSavingsArs: number;
  confidence: ConfidenceInfo;
  reason: string;
  providerHint?: string;
  distanceLabel?: string;
  tags: string[];
}
