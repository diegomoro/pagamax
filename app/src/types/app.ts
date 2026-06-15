import type {
  AliasVerificationStatus,
  IdentityDocumentKind,
  IdentityVerificationStatus,
  MatchResult,
  LiquidityRouteRecommendation,
  PagamaxOwnerRoute,
  PaymentMethodProfile,
  PaymentRecommendation,
} from '@pagamax/core';

export type RecommendationSource = 'manual' | 'scan' | 'online';
export type OptimizationMode = 'max_savings' | 'fastest_checkout';
export type ConfidenceTone = 'success' | 'warning' | 'default';

export interface StoredPaymentMethod extends PaymentMethodProfile {
  enabled: boolean;
}

export interface BetaAccount {
  id: string;
  email: string;
  displayName: string;
  phoneLabel?: string;
  inviteCode?: string;
  identityDocumentKind?: IdentityDocumentKind;
  identityDocumentLast4?: string;
  identityHash?: string;
  identityVerificationStatus?: IdentityVerificationStatus;
  emailVerified: boolean;
  authProvider: 'email_magic_link';
  deviceBoundAt?: string;
  sessionExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'local_only' | 'pending_backend' | 'synced';
}

export interface BackendSession {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  sessionExpiresAt: string;
}

export type FundingLookupKind = 'alias' | 'cbu' | 'cvu';

export interface ResolvedFundingDestination {
  lookupId: string;
  lookupKind: FundingLookupKind;
  lookupValueMasked: string;
  provider: string;
  bankName: string;
  accountLabel?: string;
  holderName: string;
  ownerIdentityKind?: IdentityDocumentKind;
  ownerIdentityLast4?: string;
  ownerIdentityHash?: string;
  ownerIdentityVerificationStatus: IdentityVerificationStatus;
  alias?: string | null;
  cbuMasked?: string | null;
  cvuMasked?: string | null;
  sameOwner: boolean;
  expiresAt: string;
}

export interface StoredFundingDestination {
  id: string;
  provider: string;
  bankName: string;
  accountLabel?: string;
  aliasHash: string;
  cvuHash?: string | null;
  displayAlias?: string | null;
  displayAccount?: string | null;
  ownerIdentityLast4?: string | null;
  ownerIdentityHash?: string | null;
  verificationStatus: AliasVerificationStatus;
  sameOwnerProofStatus: AliasVerificationStatus;
  checkoutAllowed: boolean;
  createdAt: string;
  updatedAt: string;
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
  analyticsEnabled: boolean;
  merchantInsightsEnabled: boolean;
  sponsoredOffersEnabled: boolean;
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
  amountEstimated: boolean;
  source: RecommendationSource;
  merchantInput: string;
  qrPayload?: string;
  checkoutUrl?: string;
  match: MatchResult;
  recommendations: PaymentRecommendation[];
  liquidityRoutes?: LiquidityRouteRecommendation[];
  ownerRoute?: PagamaxOwnerRoute | null;
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
  placement?: 'best_match' | 'sponsored';
  placementLabel?: string;
  placementReason?: string;
  likelyGrossSavingsArs: number;
  likelyNetSavingsArs: number;
  confidence: ConfidenceInfo;
  reason: string;
  providerHint?: string;
  distanceLabel?: string;
  tags: string[];
}

export interface PromoDataStatus {
  source: 'bundled' | 'cached_remote' | 'remote_downloaded';
  localVersion: string | null;
  remoteVersion: string | null;
  generatedAt: string | null;
  manifestUrl: string | null;
  remoteSha256: string | null;
  hashVerified: boolean;
  staleAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  lastSyncStatus: 'idle' | 'checking' | 'updated' | 'up_to_date' | 'error' | 'unconfigured';
}

export interface DiagnosticsEvent {
  id: string;
  category: 'data' | 'scan' | 'match' | 'handoff' | 'session';
  level: 'info' | 'warning' | 'error';
  message: string;
  detail?: string;
  createdAt: string;
}
