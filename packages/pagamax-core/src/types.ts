export interface PromoSummary {
  promo_key: string;
  issuer: string;
  merchant_name: string;
  category: string;
  discount_type: string;
  discount_percent: number | null;
  discount_amount_ars: number | null;
  installments_count: number | null;
  cap_amount_ars: number | null;
  cap_period: string;
  min_purchase_ars: number | null;
  day_pattern: string;
  channel: string;
  rail: string;
  instrument_required: string;
  card_brand_scope: string;
  card_type_scope: string;
  wallet_scope: string;
  valid_from: string;
  valid_to: string;
  freshness_status: string;
  promo_title: string;
  description_short: string;
}

export interface PromoIndexStats {
  total_rows: number;
  active_rows: number;
  indexed: number;
  no_merchant: number;
  general_promos: number;
  cuits_with_promos: number;
  names_with_promos: number;
  categories_with_promos: number;
  total_unique_promos: number;
}

export interface PromoIndex {
  generated_at?: string;
  source?: string;
  stats?: PromoIndexStats;
  promos: PromoSummary[];
  by_cuit: Record<string, number[]>;
  by_name: Record<string, number[]>;
  by_category: Record<string, number[]>;
  general: number[];
  cuit_to_name: Record<string, string>;
  mcc_to_category: Record<string, string>;
}

export type MatchMethod = 'cuit' | 'name_exact' | 'name_fuzzy' | 'name_prefix' | 'mcc' | 'none';

export interface MatchOptions {
  today?: string;
  issuer?: string;
  cardBrand?: string;
  cardType?: string;
  rail?: string;
  allIssuers?: boolean;
}

export interface PromoMatch extends PromoSummary {
  match_reason: string;
  relevance_score: number;
}

export interface IssuerGroup {
  issuer: string;
  promos: PromoMatch[];
  best_discount_percent: number | null;
}

export interface MatchResult {
  match_method: MatchMethod;
  cuit: string | null;
  merchant_name: string;
  qr: {
    cuit: string | null;
    name: string | null;
    mcc: string | null;
    city: string | null;
    cbu: string | null;
    amount_ars: number | null;
    payment_provider: string | null;
    qr_type: 'static' | 'dynamic' | 'unknown';
  };
  promos: PromoMatch[];
  general_promos: PromoMatch[];
  by_issuer: IssuerGroup[];
  total_unfiltered: number;
  filters_applied: string[];
  aggregator_qr: boolean;
}

export type PaymentRail = 'qr' | 'nfc' | 'card' | 'online';
export type FundingType = 'credit' | 'debit' | 'prepaid' | 'account_money';
export type FundingRail =
  | 'ready_balance'
  | 'linked_card'
  | 'debin_pull'
  | 'verified_prefilled_transfer'
  | 'wallet_scanner'
  | 'unsupported';
export type LiquidityRouteTier = 'direct_pay' | 'instant_top_up_then_pay' | 'prepared_route' | 'blocked';
export type FundingPairStatus = 'instant' | 'prefill_possible' | 'prepare_before_checkout' | 'blocked';
export type AliasVerificationStatus = 'unverified' | 'verified' | 'same_owner_verified' | 'rejected';
export type IdentityVerificationStatus = 'unverified' | 'pending' | 'same_owner_verified' | 'mismatch' | 'rejected';
export type IdentityDocumentKind = 'dni' | 'cuil';

export interface IdentityDocumentValidationResult {
  ok: boolean;
  kind: IdentityDocumentKind;
  normalizedDni: string | null;
  normalizedCuil: string | null;
  displayLast4: string | null;
  reason?: 'invalid_dni' | 'invalid_cuil';
}

export interface PaymentMethodProfile {
  id: string;
  provider: string;
  label: string;
  rail: PaymentRail;
  walletLabel?: string;
  cardBrand?: string;
  cardType?: FundingType;
  isDefault?: boolean;
  enabled?: boolean;
  ownerPhone?: boolean;
  canPayMerchantQr?: boolean;
  canReceiveCustomerTransfer?: boolean;
  receivingAlias?: string | null;
  receivingPriority?: number;
  availableBalanceArs?: number | null;
  creditAvailableArs?: number | null;
  qrTransferLimitRemainingArs?: number | null;
  promoCapRemainingArs?: number | null;
  restrictions?: string[];
  checkoutRails?: FundingRail[];
  checkoutFrictionScore?: number;
  handoffFailureRiskScore?: number;
  fundingDestinationId?: string | null;
  manualFundingRequired?: boolean;
  ownerIdentityHash?: string | null;
  ownerIdentityLast4?: string | null;
  identityVerificationStatus?: IdentityVerificationStatus;
}

export interface FundingDestination {
  id: string;
  provider: string;
  label: string;
  aliasHash: string;
  cvuHash?: string | null;
  verificationStatus: AliasVerificationStatus;
  sameOwnerProofStatus: AliasVerificationStatus;
  ownerIdentityHash?: string | null;
  ownerIdentityLast4?: string | null;
  identityVerificationStatus?: IdentityVerificationStatus;
  fundingPriority: number;
  maxTransactionArs: number | null;
  dailyLimitRemainingArs: number | null;
  checkoutAllowed: boolean;
  updatedAt: string;
}

export interface LiquidityAccount {
  id: string;
  provider: string;
  label: string;
  methodId?: string;
  enabled?: boolean;
  hasUsableFunds?: boolean;
  availableBalanceArs?: number | null;
  aliasHash?: string | null;
  cvuHash?: string | null;
  canPayMerchantQr?: boolean;
  canReceiveInstantTransfer?: boolean;
  canSendTransferByDeepLink?: boolean;
  canBeFundedByPull?: boolean;
  canPayMerchantQrViaWallet?: boolean;
  ownerIdentityHash?: string | null;
  ownerIdentityLast4?: string | null;
  identityVerificationStatus?: IdentityVerificationStatus;
  checkoutAllowed?: boolean;
}

export interface FundingPairCapability {
  id: string;
  sourceProvider: string;
  targetProvider: string;
  rail: FundingRail;
  status: FundingPairStatus;
  enabled: boolean;
  requiresUserConfirmation: boolean;
  expectedSeconds: number;
  maxAmountArs: number | null;
  frictionScoreArs?: number;
  failureRiskScoreArs?: number;
  sourceAndroidPackage?: string | null;
  targetAndroidPackage?: string | null;
  handoffUrl?: string | null;
  verifiedAt?: string | null;
  expiresAt?: string | null;
  notes?: string[];
}

export interface PromoCandidate {
  promo: PromoSummary;
  source: 'merchant' | 'general';
}

export interface RecommendationInput {
  amountArs: number;
  methods: PaymentMethodProfile[];
  candidates: PromoCandidate[];
  topN?: number;
}

export interface PaymentRecommendation {
  method: PaymentMethodProfile;
  promo: PromoSummary;
  source: 'merchant' | 'general' | 'fallback';
  valueType: 'discount' | 'cashback' | 'financing_estimate' | 'fallback';
  estimatedSavingsArs: number;
  estimatedNetPaymentArs: number;
  rankingScore: number;
  reasons: string[];
  warnings: string[];
}

export interface PagamaxOwnerRoute {
  recommendation: PaymentRecommendation;
  ownerMethod: PaymentMethodProfile;
  payoutMethod: PaymentMethodProfile;
  payoutAlias: string;
  originalAmountArs: number;
  customerChargeArs: number;
  ownerPaysMerchantArs: number;
  grossDiscountArs: number;
  customerDiscountShareArs: number;
  ownerCaptureArs: number;
  ownerNetValueArs: number;
  eligibilityWarnings: string[];
}

export interface PagamaxRoutingInput {
  amountArs: number;
  ownerMethods: PaymentMethodProfile[];
  candidates: PromoCandidate[];
  customerMethods?: PaymentMethodProfile[];
  topN?: number;
}

export interface PagamaxRoutingResult {
  ownerRoute: PagamaxOwnerRoute | null;
  ownerRouteCandidates: PagamaxOwnerRoute[];
  customerRecommendations: PaymentRecommendation[];
}

export interface CheckoutRouteRecommendation extends PaymentRecommendation {
  executionRail: FundingRail;
  routeNetValueArs: number;
  frictionPenaltyArs: number;
  failureRiskPenaltyArs: number;
  requiresExternalFundingApproval: boolean;
}

export interface CheckoutRouteInput extends RecommendationInput {
  hideSlowRoutes?: boolean;
  accountIdentityHash?: string | null;
  requireSameOwnerForFunding?: boolean;
}

export interface CheckoutRoutePlan {
  version: 1;
  routeId: string;
  nonce: string;
  qrHash: string;
  merchantName: string;
  amountArs: number;
  provider: string;
  androidPackage: string;
  fundingRail: FundingRail;
  destinationAliasHash?: string | null;
  accountIdentityHash?: string | null;
  accountIdentityVerificationStatus?: IdentityVerificationStatus | null;
  methodOwnerIdentityHash?: string | null;
  methodOwnerIdentityVerificationStatus?: IdentityVerificationStatus | null;
  handoffUrl?: string | null;
  issuedAt: string;
  expiresAt: string;
  signature: string;
}

export interface LiquidityRouteRecommendation extends PaymentRecommendation {
  routeTier: LiquidityRouteTier;
  sourceAccount: LiquidityAccount;
  targetAccount: LiquidityAccount;
  fundingCapability?: FundingPairCapability | null;
  fundingRail: FundingRail;
  fundingStatus: FundingPairStatus;
  amountToMoveArs: number;
  routeNetValueArs: number;
  transferFrictionPenaltyArs: number;
  transferFailureRiskPenaltyArs: number;
  expectedFundingSeconds: number;
  requiresFundingConfirmation: boolean;
  destinationAliasHash?: string | null;
  liquidityWarnings: string[];
  blockedReasons: string[];
}

export interface LiquidityRouteInput extends RecommendationInput {
  accounts: LiquidityAccount[];
  fundingDestinations?: FundingDestination[];
  pairCapabilities?: FundingPairCapability[];
  accountIdentityHash?: string | null;
  now?: string | Date;
  allowPreparedRoutes?: boolean;
}

export interface LiquidityRoutePlan {
  version: 1;
  routeId: string;
  nonce: string;
  qrHash: string;
  merchantName: string;
  amountArs: number;
  sourceProvider: string;
  sourceAccountId: string;
  targetProvider: string;
  targetAccountId: string;
  targetAliasHash?: string | null;
  fundingRail: FundingRail;
  fundingStatus: FundingPairStatus;
  paymentAndroidPackage: string;
  fundingAndroidPackage?: string | null;
  accountIdentityHash?: string | null;
  issuedAt: string;
  expiresAt: string;
  signature: string;
}

export interface LiquidityRoutePlanValidationContext {
  expectedQrHash: string;
  expectedAmountArs: number;
  expectedMerchantName?: string;
  expectedSourceProvider?: string;
  expectedSourceAccountId?: string;
  expectedTargetProvider?: string;
  expectedTargetAccountId?: string;
  expectedTargetAliasHash?: string | null;
  expectedPaymentAndroidPackage?: string;
  expectedFundingAndroidPackage?: string | null;
  expectedAccountIdentityHash?: string | null;
  allowedAndroidPackages: string[];
  now?: string | Date;
}

export interface CheckoutRoutePlanValidationContext {
  expectedQrHash: string;
  expectedAmountArs: number;
  expectedProvider?: string;
  expectedAndroidPackage?: string;
  expectedAccountIdentityHash?: string | null;
  requireSameOwnerForFunding?: boolean;
  allowedAndroidPackages: string[];
  allowedHandoffUrls?: string[];
  now?: string | Date;
}

export type CheckoutRoutePlanSignatureVerifier = (canonicalPayload: string, signature: string) => boolean | Promise<boolean>;

export interface CheckoutRoutePlanValidationResult {
  ok: boolean;
  canonicalPayload: string;
  errors: string[];
}
