import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMatchedCandidates,
  matchMerchantName,
  matchQr,
  normalizeIdentityDocument,
  recommendLiquidityRoutes,
  type FundingPairCapability,
  type LiquidityAccount,
  type LiquidityRouteRecommendation,
  type MatchResult,
  type PaymentMethodProfile,
  type PromoIndex,
  type PromoSummary,
} from '@pagamax/core';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, InteractionManager, Platform } from 'react-native';
import Constants from 'expo-constants';
import { inferMerchantFromCheckoutUrl } from '@/lib/demo-data';
import { buildActivityFromSession } from '@/lib/experience';
import { buildMerchantOptions, loadDefaultMethods, loadInitialPromoIndex, syncRemotePromoIndex, type MerchantOption } from '@/lib/data';
import { APP_VARIANT, IS_PUBLIC_BUILD, KILL_SWITCH_ENABLED, PUBLIC_RECOMMENDATION_ONLY } from '@/config/public-build';
import {
  exchangeBackendAuthToken,
  fetchBackendRemoteConfig,
  logoutBackendSession,
  refreshBackendSession,
  requestBackendAccountDeletion,
  confirmFundingDestination as confirmFundingDestinationWithBackend,
  resolveFundingDestination as resolveFundingDestinationWithBackend,
  syncAccountWithBackend,
  syncConsentState,
  syncPaymentMethods,
  type PublicRemoteConfig,
} from '@/lib/backend';
import { STORAGE_KEYS } from '@/lib/storage';
import type { HandoffOutcome } from '@/lib/handoff';
import { amountBand, buildSessionTelemetryPayload, recordTelemetryEvent } from '@/lib/telemetry';
import type {
  AppSettings,
  BackendSession,
  BetaAccount,
  DiagnosticsEvent,
  PendingScan,
  PromoDataStatus,
  RecommendationSession,
  SavingsActivity,
  StoredPaymentMethod,
  FundingLookupKind,
  ResolvedFundingDestination,
  StoredFundingDestination,
} from '@/types/app';

interface PagamaxContextValue {
  loading: boolean;
  error: string | null;
  promoIndex: PromoIndex | null;
  merchantOptions: MerchantOption[];
  dataTimestamp: string | null;
  promoDataStatus: PromoDataStatus;
  diagnostics: DiagnosticsEvent[];
  methods: StoredPaymentMethod[];
  fundingDestinations: StoredFundingDestination[];
  activeMethodsCount: number;
  settings: AppSettings;
  account: BetaAccount | null;
  pendingScan: PendingScan | null;
  currentSession: RecommendationSession | null;
  activity: SavingsActivity[];
  refreshData: () => Promise<void>;
  checkForPromoUpdates: () => Promise<void>;
  clearDiagnostics: () => Promise<void>;
  recordHandoff: (provider: string, outcome: HandoffOutcome | 'error', detail?: string) => void;
  toggleMethodEnabled: (id: string) => void;
  updateMethod: (id: string, patch: Partial<StoredPaymentMethod>) => void;
  setMainFundingMethod: (id: string) => void;
  resolveFundingDestination: (input: { lookupKind: FundingLookupKind; lookupValue: string }) => Promise<ResolvedFundingDestination>;
  confirmFundingDestination: (resolved: ResolvedFundingDestination) => Promise<StoredFundingDestination>;
  resetMethods: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => void;
  createAccount: (input: { email: string; displayName: string; phoneLabel?: string; inviteCode?: string; identityDocument?: string }) => Promise<BetaAccount>;
  completeMagicLinkSignIn: (exchangeToken: string) => Promise<BetaAccount>;
  signOutAccount: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  completeOnboarding: (patch?: Partial<AppSettings>) => void;
  toggleSavedMerchant: (merchantName: string) => void;
  prepareScan: (payload: string) => MatchResult;
  clearPendingScan: () => void;
  runManualRecommendation: (merchantName: string, amountArs: number) => RecommendationSession;
  runScanRecommendation: (payload: string, amountArs?: number, merchantOverride?: string) => RecommendationSession;
  runPendingScanRecommendation: (amountArs?: number, merchantOverride?: string) => RecommendationSession;
  runCheckoutRecommendation: (checkoutUrl: string, amountArs: number, merchantOverride?: string) => RecommendationSession;
  recordSuccessfulRecommendation: (recommendationIndex?: number) => SavingsActivity;
}

const PagamaxContext = createContext<PagamaxContextValue | null>(null);

const DEFAULT_SETTINGS: AppSettings = {
  debugEnabled: false,
  onboardingCompleted: false,
  notificationsEnabled: false,
  locationInsightsEnabled: false,
  analyticsEnabled: true,
  merchantInsightsEnabled: true,
  sponsoredOffersEnabled: true,
  alertThresholdArs: 2500,
  optimizationMode: 'max_savings',
  advancedMode: false,
  savedMerchants: [],
  surfacePreferences: {
    inStore: true,
    online: true,
    travel: false,
  },
};

const DEFAULT_PROMO_DATA_STATUS: PromoDataStatus = {
  source: 'bundled',
  localVersion: null,
  remoteVersion: null,
  generatedAt: null,
  manifestUrl: null,
  remoteSha256: null,
  hashVerified: false,
  staleAt: null,
  lastCheckedAt: null,
  lastError: null,
  lastSyncStatus: 'idle',
};

const SCAN_REFERENCE_AMOUNT_ARS = 45000;
const PROMO_UPDATE_FOREGROUND_INTERVAL_MS = 6 * 60 * 60 * 1000;
const NON_PAYABLE_CONTROL_PREFIX = 'PAGAMAX_';

const FALLBACK_PROMO_BASE: PromoSummary = {
  promo_key: 'fallback-payment-route',
  issuer: 'pagamenos',
  merchant_name: 'Opcion simple disponible',
  category: 'General',
  discount_type: 'none',
  discount_percent: null,
  discount_amount_ars: null,
  installments_count: null,
  cap_amount_ars: null,
  cap_period: '',
  min_purchase_ars: null,
  day_pattern: 'everyday',
  channel: 'in_store',
  rail: 'qr',
  instrument_required: 'qr_wallet',
  card_brand_scope: 'any',
  card_type_scope: 'any',
  wallet_scope: 'any',
  valid_from: '',
  valid_to: '',
  freshness_status: 'fallback',
  promo_title: 'Sin promo segura',
  description_short: 'Pagá con una opción disponible y revisá si tu billetera o banco muestra puntos, cuotas o reintegros antes de confirmar.',
};

const USER_METHOD_SEED_IDS = new Set([
  'carrefour-bank-qr',
  'bancon-wallet-qr',
  'personalpay-prepaid-qr',
  'bna-plus-wallet-qr',
  'shellbox-wallet-qr',
  'ypf-app-wallet-qr',
  'bbva-mastercard-black-qr',
  'bbva-visa-signature-qr',
  'bbva-debit-qr',
  'mercadopago-balance-qr',
  'naranjax-balance-qr',
]);

const LEGACY_DEMO_METHOD_IDS = new Set([
  'modo-santander-visa-credit-qr',
  'modo-comafi-master-debit-qr',
  'bbva-visa-credit-qr',
]);

const METHOD_LABEL_FIXES: Record<string, string> = {
  'bbva-debit-qr': 'BBVA Débito',
};

function normalizeKnownMethodLabel<T extends PaymentMethodProfile>(method: T): T {
  const fixedLabel = METHOD_LABEL_FIXES[method.id];
  return fixedLabel && method.label !== fixedLabel ? { ...method, label: fixedLabel } : method;
}

function normalizeStoredMethod(method: PaymentMethodProfile): StoredPaymentMethod {
  return normalizeKnownMethodLabel({
    ...method,
    enabled: true,
  });
}

function isAccountMoneyWallet(method: StoredPaymentMethod): boolean {
  return method.rail === 'qr'
    && method.canPayMerchantQr !== false
    && (method.cardType === undefined || method.cardType === 'account_money')
    && !(method.checkoutRails ?? []).includes('linked_card');
}

function withoutLinkedCardRails(method: StoredPaymentMethod): StoredPaymentMethod {
  const checkoutRails = method.checkoutRails?.filter((rail) => rail !== 'linked_card');
  return checkoutRails ? { ...method, checkoutRails } : method;
}

function fundedCheckoutRails(method: StoredPaymentMethod): StoredPaymentMethod['checkoutRails'] {
  if (isAccountMoneyWallet(withoutLinkedCardRails(method))) {
    return ['ready_balance', 'wallet_scanner'];
  }
  return ['unsupported'];
}

function markMainFundingMethod(method: StoredPaymentMethod): StoredPaymentMethod {
  const accountMoneyWallet = isAccountMoneyWallet(withoutLinkedCardRails(method));
  return {
    ...method,
    enabled: true,
    isDefault: true,
    canPayMerchantQr: accountMoneyWallet,
    manualFundingRequired: !accountMoneyWallet,
    checkoutRails: fundedCheckoutRails(method),
    checkoutFrictionScore: Math.min(method.checkoutFrictionScore ?? 100, 100),
    handoffFailureRiskScore: Math.min(method.handoffFailureRiskScore ?? 250, 250),
  };
}

function isFastFundedMethod(method: StoredPaymentMethod): boolean {
  const rails = method.checkoutRails ?? [];
  return method.enabled !== false
    && isAccountMoneyWallet(method)
    && method.manualFundingRequired !== true
    && method.canPayMerchantQr !== false
    && rails.length > 0
    && !rails.every((rail) => rail === 'unsupported');
}

function canReviveAsMainFundingMethod(method: StoredPaymentMethod): boolean {
  const rails = method.checkoutRails ?? [];
  return isAccountMoneyWallet(method)
    && method.manualFundingRequired !== true
    && method.canPayMerchantQr !== false
    && rails.length > 0
    && !rails.every((rail) => rail === 'unsupported');
}

function normalizeMainFundingMethod(
  methods: StoredPaymentMethod[],
  options: { revivePreferred?: boolean } = {},
): StoredPaymentMethod[] {
  const revivePreferred = options.revivePreferred ?? true;
  const selected = methods.find((method) => method.isDefault && isFastFundedMethod(method))
    ?? methods.find((method) => method.id === 'naranjax-balance-qr' && (
      revivePreferred ? canReviveAsMainFundingMethod(method) : isFastFundedMethod(method)
    ))
    ?? methods.find(isFastFundedMethod)
    ?? (revivePreferred ? methods[0] : undefined);

  if (!selected) {
    return methods.map((method) => ({ ...method, isDefault: false }));
  }

  return methods.map((method) => (
    method.id === selected.id
      ? markMainFundingMethod(method)
      : { ...method, isDefault: false }
  ));
}

function hydrateStoredMethods(storedMethodsRaw: string | null, seedMethods: StoredPaymentMethod[]): StoredPaymentMethod[] {
  if (!storedMethodsRaw) return normalizeMainFundingMethod(seedMethods);

  const storedMethods = JSON.parse(storedMethodsRaw) as StoredPaymentMethod[];
  const seedById = new Map(seedMethods.map((method) => [method.id, method]));
  const hasOwnerState = storedMethods.some((method) => (
    method.ownerPhone === true
    || method.canReceiveCustomerTransfer === true
    || method.receivingAlias != null
    || method.availableBalanceArs != null
    || method.creditAvailableArs != null
    || method.qrTransferLimitRemainingArs != null
    || method.promoCapRemainingArs != null
  ));
  const hasLegacyDemoMethods = storedMethods.some((method) => LEGACY_DEMO_METHOD_IDS.has(method.id));
  const hasCurrentUserSeed = seedMethods.every((method) => storedMethods.some((stored) => stored.id === method.id));

  if ((IS_PUBLIC_BUILD && hasOwnerState) || hasLegacyDemoMethods || !hasCurrentUserSeed) {
    return normalizeMainFundingMethod(seedMethods);
  }

  const knownIds = new Set(storedMethods.map((method) => method.id));
  return normalizeMainFundingMethod([
    ...storedMethods.map((method) => {
      const seed = seedById.get(method.id);
      if (!seed) return normalizeKnownMethodLabel(method);
      const merged: StoredPaymentMethod = {
        ...seed,
        ...method,
        checkoutRails: IS_PUBLIC_BUILD ? seed.checkoutRails : method.checkoutRails ?? seed.checkoutRails,
        checkoutFrictionScore: method.checkoutFrictionScore ?? seed.checkoutFrictionScore,
        handoffFailureRiskScore: method.handoffFailureRiskScore ?? seed.handoffFailureRiskScore,
      };
      if (IS_PUBLIC_BUILD && seed.cardType === 'account_money') {
        merged.cardType = 'account_money';
        if (!seed.cardBrand) delete merged.cardBrand;
      }
      return normalizeKnownMethodLabel(merged);
    }),
    ...seedMethods.filter((method) => !knownIds.has(method.id) && USER_METHOD_SEED_IDS.has(method.id)),
  ]);
}

async function persistMethods(methods: StoredPaymentMethod[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.methods, JSON.stringify(methods));
}

async function persistFundingDestinations(destinations: StoredFundingDestination[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.fundingDestinations, JSON.stringify(destinations));
}

async function persistSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

async function persistAccount(account: BetaAccount): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.account, JSON.stringify(account));
}

async function persistBackendSession(session: BackendSession): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.backendSession, JSON.stringify(session));
}

async function persistActivity(activity: SavingsActivity[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.activity, JSON.stringify(activity));
}

async function persistDiagnostics(diagnostics: DiagnosticsEvent[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.diagnostics, JSON.stringify(diagnostics));
}

function mergeSettings(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    ...base,
    ...patch,
    surfacePreferences: patch.surfacePreferences
      ? { ...base.surfacePreferences, ...patch.surfacePreferences }
      : base.surfacePreferences,
  };
}

function hydrateStoredAccount(storedAccountRaw: string | null): BetaAccount | null {
  if (!storedAccountRaw) return null;
  const parsed = JSON.parse(storedAccountRaw) as Partial<BetaAccount>;
  if (!parsed.id || !parsed.email || !parsed.displayName || !parsed.createdAt || !parsed.updatedAt) return null;

  return {
    id: parsed.id,
    email: parsed.email,
    displayName: parsed.displayName,
    phoneLabel: parsed.phoneLabel,
    inviteCode: parsed.inviteCode,
    identityDocumentKind: parsed.identityDocumentKind,
    identityDocumentLast4: parsed.identityDocumentLast4,
    identityHash: parsed.identityHash,
    identityVerificationStatus: parsed.identityVerificationStatus ?? 'unverified',
    emailVerified: parsed.emailVerified ?? false,
    authProvider: parsed.authProvider ?? 'email_magic_link',
    deviceBoundAt: parsed.deviceBoundAt,
    sessionExpiresAt: parsed.sessionExpiresAt,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    syncStatus: parsed.syncStatus ?? 'local_only',
  };
}

function hydrateBackendSession(storedSessionRaw: string | null): BackendSession | null {
  if (!storedSessionRaw) return null;
  const parsed = JSON.parse(storedSessionRaw) as Partial<BackendSession>;
  if (
    !parsed.accessToken
    || !parsed.accessTokenExpiresAt
    || !parsed.refreshToken
    || !parsed.refreshTokenExpiresAt
    || !parsed.sessionExpiresAt
  ) {
    return null;
  }
  return {
    accessToken: parsed.accessToken,
    accessTokenExpiresAt: parsed.accessTokenExpiresAt,
    refreshToken: parsed.refreshToken,
    refreshTokenExpiresAt: parsed.refreshTokenExpiresAt,
    sessionExpiresAt: parsed.sessionExpiresAt,
  };
}

function isExpiredIso(value: string | null | undefined): boolean {
  if (!value) return true;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getTime() <= Date.now();
}

function buildDeviceAuthMetadata(phoneLabel?: string) {
  return {
    appVersion: Constants.expoConfig?.version,
    platform: Platform.OS,
    deviceClass: phoneLabel?.trim() || Platform.OS,
  };
}

function mergeBackendAccount(account: BetaAccount | null, response: Partial<BetaAccount>, nowIso: string): BetaAccount {
  const email = response.email ?? account?.email;
  const displayName = response.displayName ?? account?.displayName ?? email?.split('@')[0] ?? 'Paga Menos';
  if (!response.id || !email) throw new Error('El backend no devolvió una cuenta válida.');

  const next: BetaAccount = {
    id: response.id,
    email,
    displayName,
    phoneLabel: account?.phoneLabel,
    inviteCode: account?.inviteCode,
    identityDocumentKind: response.identityDocumentKind ?? account?.identityDocumentKind,
    identityDocumentLast4: response.identityDocumentLast4 ?? account?.identityDocumentLast4,
    identityHash: response.identityHash ?? account?.identityHash,
    identityVerificationStatus: response.identityVerificationStatus ?? account?.identityVerificationStatus ?? 'unverified',
    emailVerified: response.emailVerified ?? account?.emailVerified ?? false,
    authProvider: 'email_magic_link',
    deviceBoundAt: response.deviceBoundAt ?? account?.deviceBoundAt,
    sessionExpiresAt: response.sessionExpiresAt ?? account?.sessionExpiresAt,
    createdAt: account?.createdAt ?? nowIso,
    updatedAt: nowIso,
    syncStatus: response.syncStatus ?? 'synced',
  };

  return next;
}

function buildFallbackRecommendations(
  methods: StoredPaymentMethod[],
  amountArs: number,
  merchantName: string,
  topN = 5,
) {
  return methods
    .filter(isAccountMoneyWallet)
    .filter((method) => {
      if (method.canPayMerchantQr === false) return false;
      const rails = method.checkoutRails ?? [];
      if (rails.length === 0 || rails.every((rail) => rail === 'unsupported')) return false;
      if (rails.includes('linked_card')) return false;
      return method.manualFundingRequired !== true;
    })
    .sort((left, right) => {
      const leftDefault = left.isDefault ? 1 : 0;
      const rightDefault = right.isDefault ? 1 : 0;
      const leftQr = left.rail === 'qr' ? 1 : 0;
      const rightQr = right.rail === 'qr' ? 1 : 0;
      return rightDefault - leftDefault || rightQr - leftQr || left.label.localeCompare(right.label);
    })
    .slice(0, topN)
    .map((method, index) => ({
      method,
      promo: {
        ...FALLBACK_PROMO_BASE,
        promo_key: `fallback-${method.id}`,
        issuer: method.provider,
        merchant_name: merchantName,
        rail: method.rail,
      },
      source: 'fallback' as const,
      valueType: 'fallback' as const,
      estimatedSavingsArs: 0,
      estimatedNetPaymentArs: amountArs,
      rankingScore: -index,
      reasons: [
        `Usa ${method.label}`,
        'No hay descuento confirmado para este comercio en la base actual',
        'Revisá la pantalla final de la billetera antes de confirmar el pago',
      ],
      warnings: [
        'No hay una promo confirmada; esta es una opción disponible, no una promesa de ahorro',
      ],
    }));
}

function destinationIdentityStatus(destination: StoredFundingDestination): LiquidityAccount['identityVerificationStatus'] {
  if (destination.sameOwnerProofStatus === 'same_owner_verified') return 'same_owner_verified';
  if (destination.sameOwnerProofStatus === 'rejected') return 'rejected';
  if (destination.sameOwnerProofStatus === 'unverified') return 'unverified';
  return undefined;
}

function buildLiquidityAccounts(
  methods: StoredPaymentMethod[],
  destinations: StoredFundingDestination[],
): LiquidityAccount[] {
  const destinationByProvider = new Map(destinations.map((destination) => [
    destination.provider.trim().toLowerCase(),
    destination,
  ]));

  return methods.filter(isAccountMoneyWallet).map((method) => {
    const destination = destinationByProvider.get(method.provider.trim().toLowerCase());
    const hasBalance = method.availableBalanceArs != null
      ? method.availableBalanceArs > 0
      : method.isDefault === true && method.manualFundingRequired !== true;
    const account: LiquidityAccount = {
      id: `method:${method.id}`,
      methodId: method.id,
      provider: method.provider,
      label: method.walletLabel ?? method.label,
      enabled: method.enabled,
      hasUsableFunds: hasBalance,
      availableBalanceArs: method.availableBalanceArs ?? null,
      canPayMerchantQr: method.canPayMerchantQr,
      checkoutAllowed: true,
      ownerIdentityHash: method.ownerIdentityHash ?? destination?.ownerIdentityHash ?? null,
      ownerIdentityLast4: method.ownerIdentityLast4 ?? destination?.ownerIdentityLast4 ?? null,
      aliasHash: destination?.aliasHash ?? null,
      cvuHash: destination?.cvuHash ?? null,
    };
    const identityVerificationStatus = method.identityVerificationStatus ?? (destination ? destinationIdentityStatus(destination) : undefined);
    if (identityVerificationStatus !== undefined) account.identityVerificationStatus = identityVerificationStatus;
    if (destination) account.checkoutAllowed = destination.checkoutAllowed;
    return account;
  });
}

const CERTIFIED_FUNDING_PAIR_CAPABILITIES: FundingPairCapability[] = [];

function isRecognizedPaymentQr(match: MatchResult): boolean {
  return Boolean(
    match.match_method !== 'none'
    || match.qr.cuit
    || match.qr.name
    || match.qr.mcc
    || match.qr.cbu
    || match.qr.payment_provider
    || match.qr.amount_ars != null
  );
}

function assertPayableQrPayload(payload: string, match: MatchResult) {
  if (payload.startsWith(NON_PAYABLE_CONTROL_PREFIX)) {
    throw new Error('Este QR es un control de prueba, no un QR de pago. No abras una billetera para pagarlo.');
  }

  if (!isRecognizedPaymentQr(match)) {
    throw new Error('No parece un QR de pago interoperable. Probá con el QR real del comercio o de una billetera receptora.');
  }
}

function deferMerchantOptionsBuild(
  promoIndex: PromoIndex,
  setMerchantOptions: (options: MerchantOption[]) => void,
): void {
  InteractionManager.runAfterInteractions(() => {
    setTimeout(() => {
      setMerchantOptions(buildMerchantOptions(promoIndex));
    }, 0);
  });
}

function isLocalWebPreview(): boolean {
  return Platform.OS === 'web'
    && typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function makeAccountId(email: string): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `local_${Date.now().toString(36)}_${suffix}_${email.replace(/[^a-z0-9]/g, '').slice(0, 12)}`;
}

export function PagamaxProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoIndex, setPromoIndex] = useState<PromoIndex | null>(null);
  const [merchantOptions, setMerchantOptions] = useState<MerchantOption[]>([]);
  const [methods, setMethods] = useState<StoredPaymentMethod[]>([]);
  const [fundingDestinations, setFundingDestinations] = useState<StoredFundingDestination[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [account, setAccount] = useState<BetaAccount | null>(null);
  const [backendSession, setBackendSession] = useState<BackendSession | null>(null);
  const [remoteConfig, setRemoteConfig] = useState<PublicRemoteConfig | null>(null);
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [currentSession, setCurrentSession] = useState<RecommendationSession | null>(null);
  const [activity, setActivity] = useState<SavingsActivity[]>([]);
  const [promoDataStatus, setPromoDataStatus] = useState<PromoDataStatus>(DEFAULT_PROMO_DATA_STATUS);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsEvent[]>([]);
  const promoSyncInFlight = useRef(false);
  const promoDataStatusRef = useRef<PromoDataStatus>(DEFAULT_PROMO_DATA_STATUS);
  const lastForegroundPromoCheckAt = useRef(0);

  function updatePromoDataStatus(nextStatus: PromoDataStatus | ((previous: PromoDataStatus) => PromoDataStatus)) {
    setPromoDataStatus((previous) => {
      const resolved = typeof nextStatus === 'function'
        ? nextStatus(previous)
        : nextStatus;
      promoDataStatusRef.current = resolved;
      return resolved;
    });
  }

  function isPastIsoDate(raw: string | null): boolean {
    if (!raw) return false;
    const date = new Date(raw);
    return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
  }

  function appendDiagnostic(
    category: DiagnosticsEvent['category'],
    level: DiagnosticsEvent['level'],
    message: string,
    detail?: string,
  ) {
    setDiagnostics((prev) => {
      const next = [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          category,
          level,
          message,
          detail,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 50);

      void persistDiagnostics(next);
      return next;
    });
  }

  async function clearDiagnostics() {
    setDiagnostics([]);
    await AsyncStorage.removeItem(STORAGE_KEYS.diagnostics);
  }

  async function checkForPromoUpdates() {
    if (promoSyncInFlight.current) return;
    promoSyncInFlight.current = true;

    if (isLocalWebPreview()) {
      updatePromoDataStatus((prev) => ({
        ...prev,
        lastSyncStatus: 'unconfigured',
        lastCheckedAt: new Date().toISOString(),
        lastError: null,
      }));
      promoSyncInFlight.current = false;
      return;
    }

    updatePromoDataStatus((prev) => ({
      ...prev,
      lastSyncStatus: prev.manifestUrl ? 'checking' : 'unconfigured',
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
    }));

    try {
      const currentStatus = promoDataStatusRef.current;
      const result = await syncRemotePromoIndex(currentStatus.localVersion);
      if (!result) {
        updatePromoDataStatus((prev) => ({
          ...prev,
          lastSyncStatus: 'unconfigured',
          lastCheckedAt: new Date().toISOString(),
        }));
        appendDiagnostic('data', 'warning', 'Actualizacion remota no configurada');
        return;
      }

      updatePromoDataStatus(result.status);

      if (result.status.lastSyncStatus === 'updated') {
        setPromoIndex(result.promoIndex);
        deferMerchantOptionsBuild(result.promoIndex, setMerchantOptions);
        appendDiagnostic(
          'data',
          'info',
          'Se descargo una base nueva',
          `version=${result.status.localVersion ?? 'sin-version'} sha256=${result.status.remoteSha256?.slice(0, 12) ?? 'sin-hash'} verified=${result.status.hashVerified ? 'yes' : 'no'}`,
        );
      } else {
        appendDiagnostic(
          'data',
          'info',
          'Los descuentos remotos ya estaban al dia',
          `version=${result.status.localVersion ?? 'sin-version'} sha256=${result.status.remoteSha256?.slice(0, 12) ?? 'sin-hash'} verified=${result.status.hashVerified ? 'yes' : 'no'}`,
        );
      }

      if (isPastIsoDate(result.status.staleAt)) {
        appendDiagnostic('data', 'warning', 'La base remota paso su fecha de frescura', `stale_at=${result.status.staleAt ?? 'sin-fecha'}`);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo revisar la fuente remota.';
      updatePromoDataStatus((prev) => ({
        ...prev,
        lastSyncStatus: 'error',
        lastCheckedAt: new Date().toISOString(),
        lastError: message,
      }));
      appendDiagnostic('data', 'error', 'Fallo la revision remota de descuentos', message);
    } finally {
      promoSyncInFlight.current = false;
    }
  }

  async function refreshBackendRemoteConfig(currentSettings = settings) {
    try {
      const config = await fetchBackendRemoteConfig();
      if (!config) return;

      setRemoteConfig(config);
      appendDiagnostic(
        'data',
        config.killSwitch ? 'warning' : 'info',
        'Config remota actualizada',
        `version=${config.version} disabled=${config.disabledProviders.length} sponsored=${config.sponsoredOffersEnabled ? 'yes' : 'no'} kill=${config.killSwitch ? 'yes' : 'no'}`,
      );

      if (!config.sponsoredOffersEnabled && currentSettings.sponsoredOffersEnabled) {
        const nextSettings = {
          ...currentSettings,
          sponsoredOffersEnabled: false,
        };
        setSettings(nextSettings);
        void persistSettings(nextSettings);
        void syncConsentState(account, nextSettings, backendSession).catch(() => undefined);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo cargar la config remota.';
      appendDiagnostic('data', 'warning', 'Config remota no disponible', message);
    }
  }

  function recordHandoff(provider: string, outcome: HandoffOutcome | 'error', detail?: string) {
    const messages = {
      payment_flow: `Se abrio ${provider} en flujo de pago`,
      app: `Se abrio ${provider}`,
      store: `Se abrio Google Play para ${provider}`,
      error: `Fallo el handoff para ${provider}`,
    } as const;

    appendDiagnostic('handoff', outcome === 'error' ? 'error' : 'info', messages[outcome], detail);
    void recordTelemetryEvent(settings, account, 'handoff_started', {
      provider,
      outcome,
      detail: detail ? detail.slice(0, 180) : null,
    });
  }

  async function refreshData() {
    setLoading(true);
    setError(null);

    try {
      const [
        promoLoadResult,
        storedMethodsRaw,
        storedFundingDestinationsRaw,
        storedSettingsRaw,
        storedAccountRaw,
        storedBackendSessionRaw,
        storedActivityRaw,
        storedDiagnosticsRaw,
      ] = await Promise.all([
        loadInitialPromoIndex(),
        AsyncStorage.getItem(STORAGE_KEYS.methods),
        AsyncStorage.getItem(STORAGE_KEYS.fundingDestinations),
        AsyncStorage.getItem(STORAGE_KEYS.settings),
        AsyncStorage.getItem(STORAGE_KEYS.account),
        AsyncStorage.getItem(STORAGE_KEYS.backendSession),
        AsyncStorage.getItem(STORAGE_KEYS.activity),
        AsyncStorage.getItem(STORAGE_KEYS.diagnostics),
      ]);

      setPromoIndex(promoLoadResult.promoIndex);
      updatePromoDataStatus(promoLoadResult.status);
      setMerchantOptions([]);

      const seedMethods = loadDefaultMethods().map(normalizeStoredMethod);
      const hydratedMethods = hydrateStoredMethods(storedMethodsRaw, seedMethods);
      setMethods(hydratedMethods);
      if (JSON.stringify(hydratedMethods) !== storedMethodsRaw) {
        void persistMethods(hydratedMethods);
      }
      setFundingDestinations(storedFundingDestinationsRaw ? JSON.parse(storedFundingDestinationsRaw) as StoredFundingDestination[] : []);

      const hydratedSettings = storedSettingsRaw
        ? mergeSettings(DEFAULT_SETTINGS, JSON.parse(storedSettingsRaw) as AppSettings)
        : DEFAULT_SETTINGS;
      setSettings(hydratedSettings);
      void refreshBackendRemoteConfig(hydratedSettings);

      const hydratedAccount = hydrateStoredAccount(storedAccountRaw);
      const hydratedBackendSession = hydrateBackendSession(storedBackendSessionRaw);
      setAccount(hydratedAccount);
      setBackendSession(hydratedBackendSession);
      if (hydratedAccount && hydratedBackendSession && !isExpiredIso(hydratedBackendSession.refreshTokenExpiresAt)) {
        void refreshBackendSession(hydratedBackendSession)
          .then((refreshedSession) => {
            if (!refreshedSession) return;
            const refreshedAccount: BetaAccount = {
              ...hydratedAccount,
              sessionExpiresAt: refreshedSession.sessionExpiresAt,
              syncStatus: 'synced',
              updatedAt: new Date().toISOString(),
            };
            setAccount(refreshedAccount);
            setBackendSession(refreshedSession);
            void Promise.all([
              persistAccount(refreshedAccount),
              persistBackendSession(refreshedSession),
            ]);
          })
          .catch((caught: unknown) => {
            const message = caught instanceof Error ? caught.message : 'No se pudo refrescar la sesión.';
            appendDiagnostic('session', 'warning', 'Sesión pendiente de refresco', message);
          });
      } else if (hydratedBackendSession && isExpiredIso(hydratedBackendSession.refreshTokenExpiresAt)) {
        setBackendSession(null);
        void AsyncStorage.removeItem(STORAGE_KEYS.backendSession);
      }

      const hydratedActivity = storedActivityRaw
        ? JSON.parse(storedActivityRaw) as SavingsActivity[]
        : [];
      setActivity(hydratedActivity);

      const hydratedDiagnostics = storedDiagnosticsRaw
        ? JSON.parse(storedDiagnosticsRaw) as DiagnosticsEvent[]
        : [];
      setDiagnostics(hydratedDiagnostics);

      deferMerchantOptionsBuild(promoLoadResult.promoIndex, setMerchantOptions);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudieron cargar los datos locales.';
      setError(message);
      appendDiagnostic('data', 'error', 'No se pudieron cargar los datos locales', message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    void refreshData()
      .then(() => {
        if (!mounted) return;
        lastForegroundPromoCheckAt.current = Date.now();
        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => {
            if (mounted) void checkForPromoUpdates();
          }, 500);
        });
      })
      .catch(() => undefined);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void refreshBackendRemoteConfig();
      const now = Date.now();
      if (now - lastForegroundPromoCheckAt.current < PROMO_UPDATE_FOREGROUND_INTERVAL_MS) return;
      lastForegroundPromoCheckAt.current = now;
      void checkForPromoUpdates();
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const remoteDisabledProviders = useMemo(() => (
    new Set((remoteConfig?.disabledProviders ?? []).map((provider) => provider.trim().toLowerCase()))
  ), [remoteConfig]);
  const activeMethods = useMemo(() => methods.filter((method) => (
    method.enabled && !remoteDisabledProviders.has(method.provider.trim().toLowerCase())
  )), [methods, remoteDisabledProviders]);

  function buildSession(
    match: MatchResult,
    amountArs: number,
    source: RecommendationSession['source'],
    merchantInput: string,
    metadata?: { qrPayload?: string; checkoutUrl?: string; amountEstimated?: boolean },
  ) {
    if (!promoIndex) throw new Error('Promo index is not loaded');
    if (KILL_SWITCH_ENABLED || remoteConfig?.killSwitch) throw new Error('Paga Menos esta pausado temporalmente.');

    const candidates = getMatchedCandidates(match);
    const routePlan = null;
    const accountIdentityHash = account?.identityVerificationStatus === 'same_owner_verified' ? account.identityHash ?? null : null;
    const liquidityAccounts = buildLiquidityAccounts(activeMethods, fundingDestinations);
    const liquidityRoutes = !routePlan
      ? recommendLiquidityRoutes({
        amountArs,
        candidates,
        methods: activeMethods,
        accounts: liquidityAccounts,
        pairCapabilities: CERTIFIED_FUNDING_PAIR_CAPABILITIES,
        accountIdentityHash,
        topN: 5,
      })
      : [];

    let recommendations: LiquidityRouteRecommendation[] = liquidityRoutes;

    if (recommendations.length === 0) {
      const fallbackRecommendations = buildFallbackRecommendations(
        activeMethods,
        amountArs,
        merchantInput,
        5,
      );
      recommendations = fallbackRecommendations.map((recommendation, index) => {
        const targetAccount = liquidityAccounts.find((candidate) => candidate.methodId === recommendation.method.id)
          ?? {
            id: `method:${recommendation.method.id}`,
            methodId: recommendation.method.id,
            provider: recommendation.method.provider,
            label: recommendation.method.walletLabel ?? recommendation.method.label,
            enabled: recommendation.method.enabled,
            hasUsableFunds: recommendation.method.isDefault === true,
            availableBalanceArs: recommendation.method.availableBalanceArs ?? null,
            canPayMerchantQr: recommendation.method.canPayMerchantQr,
            checkoutAllowed: true,
          };
        return {
          ...recommendation,
          routeTier: 'direct_pay' as const,
          sourceAccount: targetAccount,
          targetAccount,
          fundingCapability: null,
          fundingRail: 'ready_balance' as const,
          fundingStatus: 'instant' as const,
          amountToMoveArs: 0,
          routeNetValueArs: Math.max(0, recommendation.rankingScore - index),
          transferFrictionPenaltyArs: 0,
          transferFailureRiskPenaltyArs: 0,
          expectedFundingSeconds: 0,
          requiresFundingConfirmation: false,
          destinationAliasHash: targetAccount.aliasHash ?? null,
          liquidityWarnings: recommendation.warnings,
          blockedReasons: [],
        };
      });
    }

    const session: RecommendationSession = {
      amountArs,
      amountEstimated: metadata?.amountEstimated ?? false,
      source,
      merchantInput,
      qrPayload: metadata?.qrPayload,
      checkoutUrl: metadata?.checkoutUrl,
      match,
      recommendations,
      liquidityRoutes,
      ownerRoute: null,
      createdAt: new Date().toISOString(),
    };

    setCurrentSession(session);
    void recordTelemetryEvent(settings, account, 'session_created', buildSessionTelemetryPayload(session, recommendations));
    appendDiagnostic(
      'session',
      recommendations.length > 0 ? 'info' : 'warning',
      `Sesión ${source} creada para ${merchantInput}`,
      `match=${match.match_method} opciones=${recommendations.length} liquidity_routes=${liquidityRoutes.length} public=${PUBLIC_RECOMMENDATION_ONLY ? 'yes' : 'no'} estimated=${metadata?.amountEstimated ? 'yes' : 'no'}`,
    );
    return session;
  }

  function toggleMethodEnabled(id: string) {
    setMethods((prev) => {
      const next = normalizeMainFundingMethod(
        prev.map((method) => method.id === id ? { ...method, enabled: !method.enabled } : method),
        { revivePreferred: false },
      );
      void persistMethods(next);
      void syncPaymentMethods(account, next, backendSession).catch(() => undefined);
      return next;
    });
  }

  function updateMethod(id: string, patch: Partial<StoredPaymentMethod>) {
    setMethods((prev) => {
      const next = prev.map((method) => method.id === id ? { ...method, ...patch } : method);
      void persistMethods(next);
      void syncPaymentMethods(account, next, backendSession).catch(() => undefined);
      return next;
    });
  }

  function setMainFundingMethod(id: string) {
    setMethods((prev) => {
      const next = prev.map((method) => (
        method.id === id
          ? markMainFundingMethod(method)
          : { ...method, isDefault: false }
      ));
      void persistMethods(next);
      void syncPaymentMethods(account, next, backendSession).catch(() => undefined);
      return next;
    });
    appendDiagnostic('session', 'info', 'Billetera principal actualizada', `method=${id}`);
  }

  async function resolveFundingDestination(input: { lookupKind: FundingLookupKind; lookupValue: string }): Promise<ResolvedFundingDestination> {
    if (!account) throw new Error('Primero creá tu cuenta.');
    if (account.identityVerificationStatus !== 'same_owner_verified' || !account.identityHash) {
      throw new Error('Primero validá tu DNI/CUIL principal.');
    }

    const lookupValue = input.lookupValue.trim();
    if (lookupValue.length < 6) throw new Error('Ingresá un alias, CBU o CVU válido.');

    const result = await resolveFundingDestinationWithBackend({
      accountId: account.id,
      accountIdentityHash: account.identityHash,
      lookupKind: input.lookupKind,
      lookupValue,
    });
    if (!result) throw new Error('Necesitamos backend activo para validar cuentas por alias, CBU o CVU.');

    return {
      ...result,
      sameOwner: result.sameOwner
        && result.ownerIdentityHash === account.identityHash
        && result.ownerIdentityVerificationStatus === 'same_owner_verified',
    };
  }

  async function confirmFundingDestination(resolved: ResolvedFundingDestination): Promise<StoredFundingDestination> {
    if (!account) throw new Error('Primero creá tu cuenta.');
    if (account.identityVerificationStatus !== 'same_owner_verified' || !account.identityHash) {
      throw new Error('Primero validá tu DNI/CUIL principal.');
    }
    if (!resolved.sameOwner || resolved.ownerIdentityHash !== account.identityHash || resolved.ownerIdentityVerificationStatus !== 'same_owner_verified') {
      throw new Error('No se puede agregar: el DNI/CUIL de esa cuenta no coincide con el de tu cuenta principal.');
    }

    const destination = await confirmFundingDestinationWithBackend({
      accountId: account.id,
      lookupId: resolved.lookupId,
      userConfirmedDetails: true,
    });
    if (!destination) throw new Error('Necesitamos backend activo para guardar la cuenta validada.');
    if (
      destination.ownerIdentityHash !== account.identityHash
      || destination.sameOwnerProofStatus !== 'same_owner_verified'
      || destination.verificationStatus !== 'same_owner_verified'
    ) {
      throw new Error('El backend no devolvió una cuenta verificada a tu nombre.');
    }

    setFundingDestinations((prev) => {
      const next = [destination, ...prev.filter((item) => item.id !== destination.id)];
      void persistFundingDestinations(next);
      return next;
    });
    appendDiagnostic('session', 'info', 'Cuenta propia agregada', `${destination.bankName} ${destination.displayAccount ?? destination.displayAlias ?? ''}`.trim());
    return destination;
  }

  async function resetMethods() {
    const next = normalizeMainFundingMethod(loadDefaultMethods().map(normalizeStoredMethod));
    setMethods(next);
    await persistMethods(next);
    await syncPaymentMethods(account, next, backendSession).catch(() => undefined);
  }

  function updateSettings(patch: Partial<AppSettings>) {
    setSettings((prev) => {
      const next = mergeSettings(prev, patch);
      void persistSettings(next);
      void syncConsentState(account, next, backendSession).catch(() => undefined);
      if (
        Object.prototype.hasOwnProperty.call(patch, 'analyticsEnabled')
        || Object.prototype.hasOwnProperty.call(patch, 'merchantInsightsEnabled')
        || Object.prototype.hasOwnProperty.call(patch, 'sponsoredOffersEnabled')
        || Object.prototype.hasOwnProperty.call(patch, 'locationInsightsEnabled')
      ) {
        void recordTelemetryEvent(next, account, 'privacy_controls_updated', {
          analyticsEnabled: next.analyticsEnabled,
          merchantInsightsEnabled: next.merchantInsightsEnabled,
          sponsoredOffersEnabled: next.sponsoredOffersEnabled,
          regionInsightsEnabled: next.locationInsightsEnabled,
        });
      }
      return next;
    });
  }

  async function createAccount(input: { email: string; displayName: string; phoneLabel?: string; inviteCode?: string; identityDocument?: string }) {
    const email = normalizeEmail(input.email);
    const displayName = input.displayName.trim();
    const identity = input.identityDocument ? normalizeIdentityDocument(input.identityDocument) : null;
    if (identity && (!identity.ok || !identity.normalizedDni)) {
      throw new Error(identity.reason === 'invalid_cuil' ? 'CUIL inválido.' : 'DNI inválido.');
    }
    const now = new Date().toISOString();
    const localId = account?.id ?? makeAccountId(email);
    const backendResult = await syncAccountWithBackend({
      email,
      displayName,
      phoneLabel: input.phoneLabel,
      inviteCode: input.inviteCode,
      identityDocument: identity && identity.ok && identity.normalizedDni ? {
        kind: identity.kind,
        normalizedDni: identity.normalizedDni,
        normalizedCuil: identity.normalizedCuil,
      } : undefined,
      localAccountId: localId,
      appVariant: APP_VARIANT,
    }, backendSession);

    const next: BetaAccount = {
      id: backendResult?.id ?? localId,
      email,
      displayName,
      emailVerified: backendResult?.emailVerified ?? false,
      identityDocumentKind: identity?.kind ?? account?.identityDocumentKind,
      identityDocumentLast4: backendResult?.identityDocumentLast4 ?? identity?.displayLast4 ?? account?.identityDocumentLast4,
      identityHash: backendResult?.identityHash ?? account?.identityHash,
      identityVerificationStatus: backendResult?.identityVerificationStatus ?? account?.identityVerificationStatus ?? 'pending',
      authProvider: 'email_magic_link',
      createdAt: account?.createdAt ?? now,
      updatedAt: now,
      syncStatus: backendResult?.syncStatus ?? (backendSession ? 'pending_backend' : 'local_only'),
    };

    const phoneLabel = input.phoneLabel?.trim();
    const inviteCode = input.inviteCode?.trim();
    if (phoneLabel) next.phoneLabel = phoneLabel;
    if (inviteCode) next.inviteCode = inviteCode;
    if (backendResult?.deviceBoundAt) next.deviceBoundAt = backendResult.deviceBoundAt;
    if (backendResult?.sessionExpiresAt) next.sessionExpiresAt = backendResult.sessionExpiresAt;

    setAccount(next);
    await persistAccount(next);
    await Promise.allSettled([
      syncConsentState(next, settings, backendSession),
      syncPaymentMethods(next, methods, backendSession),
    ]);
    void recordTelemetryEvent(settings, next, 'account_synced', {
      syncStatus: next.syncStatus,
      hasInviteCode: Boolean(next.inviteCode),
      identityVerificationStatus: next.identityVerificationStatus,
    });
    appendDiagnostic('session', 'info', account ? 'Cuenta actualizada' : 'Cuenta creada', `sync=${next.syncStatus}`);
    return next;
  }

  async function completeMagicLinkSignIn(exchangeToken: string): Promise<BetaAccount> {
    const result = await exchangeBackendAuthToken(exchangeToken, buildDeviceAuthMetadata(account?.phoneLabel));
    if (!result) throw new Error('El backend público no está configurado.');

    const nowIso = new Date().toISOString();
    const session: BackendSession = {
      accessToken: result.accessToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      refreshToken: result.refreshToken,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt,
      sessionExpiresAt: result.sessionExpiresAt,
    };

    let next = mergeBackendAccount(account, {
      ...result.account,
      sessionExpiresAt: result.sessionExpiresAt,
      syncStatus: 'synced',
    }, nowIso);

    const synced = await syncAccountWithBackend({
      email: next.email,
      displayName: account?.displayName ?? next.displayName,
      phoneLabel: account?.phoneLabel,
      inviteCode: account?.inviteCode,
      localAccountId: next.id,
      appVariant: APP_VARIANT,
    }, session).catch(() => null);

    if (synced) {
      next = mergeBackendAccount(next, {
        ...synced,
        sessionExpiresAt: result.sessionExpiresAt,
        syncStatus: synced.syncStatus ?? 'synced',
      }, new Date().toISOString());
    }

    setAccount(next);
    setBackendSession(session);
    await Promise.all([
      persistAccount(next),
      persistBackendSession(session),
    ]);
    await Promise.allSettled([
      syncConsentState(next, settings, session),
      syncPaymentMethods(next, methods, session),
    ]);
    appendDiagnostic('session', 'info', 'Email verificado', `sync=${next.syncStatus}`);
    void recordTelemetryEvent(settings, next, 'account_synced', {
      syncStatus: next.syncStatus,
      authProvider: next.authProvider,
      identityVerificationStatus: next.identityVerificationStatus,
    });
    return next;
  }

  async function signOutAccount() {
    try {
      await logoutBackendSession(backendSession);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo cerrar la sesión remota.';
      appendDiagnostic('session', 'warning', 'Cierre remoto pendiente', message);
    }
    setAccount(null);
    setBackendSession(null);
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.account),
      AsyncStorage.removeItem(STORAGE_KEYS.backendSession),
    ]);
    appendDiagnostic('session', 'info', 'Sesión cerrada en este teléfono');
  }

  async function deleteAccount() {
    await requestBackendAccountDeletion(account, backendSession);
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.account),
      AsyncStorage.removeItem(STORAGE_KEYS.backendSession),
      AsyncStorage.removeItem(STORAGE_KEYS.activity),
      AsyncStorage.removeItem(STORAGE_KEYS.diagnostics),
      AsyncStorage.removeItem(STORAGE_KEYS.methods),
      AsyncStorage.removeItem(STORAGE_KEYS.fundingDestinations),
      AsyncStorage.removeItem(STORAGE_KEYS.settings),
      AsyncStorage.removeItem(STORAGE_KEYS.telemetryQueue),
    ]);

    const resetMethodsState = normalizeMainFundingMethod(loadDefaultMethods().map(normalizeStoredMethod));
    setAccount(null);
    setBackendSession(null);
    setActivity([]);
    setDiagnostics([]);
    setMethods(resetMethodsState);
    setFundingDestinations([]);
    setSettings(DEFAULT_SETTINGS);
    setCurrentSession(null);
    setPendingScan(null);
  }

  function completeOnboarding(patch: Partial<AppSettings> = {}) {
    updateSettings({
      ...patch,
      onboardingCompleted: true,
    });
  }

  function toggleSavedMerchant(merchantName: string) {
    setSettings((prev) => {
      const alreadySaved = prev.savedMerchants.includes(merchantName);
      const next = {
        ...prev,
        savedMerchants: alreadySaved
          ? prev.savedMerchants.filter((name) => name !== merchantName)
          : [...prev.savedMerchants, merchantName],
      };
      void persistSettings(next);
      return next;
    });
  }

  function prepareScan(payload: string) {
    if (!promoIndex) throw new Error('Promo index is not loaded');
    const match = matchQr(payload, promoIndex, { allIssuers: true });
    assertPayableQrPayload(payload, match);
    setPendingScan({ payload, match });
    appendDiagnostic('scan', 'info', 'QR procesado', `match=${match.match_method} merchant=${match.merchant_name}`);
    return match;
  }

  function clearPendingScan() {
    setPendingScan(null);
  }

  function runManualRecommendation(merchantName: string, amountArs: number) {
    if (!promoIndex) throw new Error('Promo index is not loaded');
    const match = matchMerchantName(merchantName, promoIndex, { allIssuers: true });
    clearPendingScan();
    appendDiagnostic('match', 'info', 'Busqueda manual ejecutada', `merchant=${merchantName} match=${match.match_method}`);
    return buildSession(match, amountArs, 'manual', merchantName);
  }

  function runScanRecommendation(payload: string, amountArs?: number, merchantOverride?: string) {
    if (!promoIndex) throw new Error('Promo index is not loaded');

    const preparedMatch = matchQr(payload, promoIndex, { allIssuers: true });
    assertPayableQrPayload(payload, preparedMatch);
    const merchantName = merchantOverride?.trim();
    const match = merchantName && merchantName !== preparedMatch.merchant_name
      ? matchMerchantName(merchantName, promoIndex, { allIssuers: true })
      : preparedMatch;

    const resolvedAmount = amountArs ?? preparedMatch.qr.amount_ars ?? SCAN_REFERENCE_AMOUNT_ARS;
    const amountEstimated = amountArs == null && preparedMatch.qr.amount_ars == null;

    clearPendingScan();
    appendDiagnostic('scan', 'info', 'QR procesado', `match=${preparedMatch.match_method} merchant=${preparedMatch.merchant_name}`);
    appendDiagnostic('match', 'info', 'Recomendacion desde QR ejecutada', `merchant=${merchantName ?? preparedMatch.merchant_name} match=${match.match_method}`);
    return buildSession(match, resolvedAmount, 'scan', merchantName ?? preparedMatch.merchant_name, {
      qrPayload: payload,
      amountEstimated,
    });
  }

  function runPendingScanRecommendation(amountArs?: number, merchantOverride?: string) {
    if (!promoIndex) throw new Error('Promo index is not loaded');
    if (!pendingScan) throw new Error('No hay un QR pendiente para continuar.');

    const merchantName = merchantOverride?.trim();
    const match = merchantName && merchantName !== pendingScan.match.merchant_name
      ? matchMerchantName(merchantName, promoIndex, { allIssuers: true })
      : pendingScan.match;

    const resolvedAmount = amountArs ?? pendingScan.match.qr.amount_ars ?? SCAN_REFERENCE_AMOUNT_ARS;
    const amountEstimated = amountArs == null && pendingScan.match.qr.amount_ars == null;

    clearPendingScan();
    appendDiagnostic('match', 'info', 'Recomendacion desde QR ejecutada', `merchant=${merchantName ?? pendingScan.match.merchant_name} match=${match.match_method}`);
    return buildSession(match, resolvedAmount, 'scan', merchantName ?? pendingScan.match.merchant_name, {
      qrPayload: pendingScan.payload,
      amountEstimated,
    });
  }

  function runCheckoutRecommendation(checkoutUrl: string, amountArs: number, merchantOverride?: string) {
    if (!promoIndex) throw new Error('Promo index is not loaded');
    const merchantName = merchantOverride?.trim() || inferMerchantFromCheckoutUrl(checkoutUrl) || 'Checkout online';
    const match = matchMerchantName(merchantName, promoIndex, { allIssuers: true });
    clearPendingScan();
    appendDiagnostic('match', 'info', 'Checkout link procesado', `merchant=${merchantName} match=${match.match_method}`);
    return buildSession(match, amountArs, 'online', merchantName, { checkoutUrl });
  }

  function recordSuccessfulRecommendation(recommendationIndex = 0) {
    if (!currentSession) throw new Error('No hay una sesión activa para registrar.');

    const recommendation = currentSession.recommendations[recommendationIndex];
    if (!recommendation) throw new Error('No existe la opción seleccionada.');

    const item = buildActivityFromSession(currentSession, recommendation);
    setActivity((prev) => {
      const next = [item, ...prev];
      void persistActivity(next);
      return next;
    });
    appendDiagnostic('session', 'info', 'Recomendacion confirmada y guardada', `merchant=${item.merchantName} net=${item.netSavingsArs}`);
    void recordTelemetryEvent(settings, account, 'decision_saved', {
      merchantName: item.merchantName,
      category: item.category,
      amountBand: amountBand(item.amountArs),
      provider: item.provider,
      confidence: item.confidence.label,
    });
    return item;
  }

  const value = useMemo<PagamaxContextValue>(() => ({
    loading,
    error,
    promoIndex,
    merchantOptions,
    dataTimestamp: promoDataStatus.generatedAt ?? promoIndex?.generated_at ?? null,
    promoDataStatus,
    diagnostics,
    methods,
    fundingDestinations,
    activeMethodsCount: activeMethods.length,
    settings,
    account,
    pendingScan,
    currentSession,
    activity,
    refreshData,
    checkForPromoUpdates,
    clearDiagnostics,
    recordHandoff,
    toggleMethodEnabled,
    updateMethod,
    setMainFundingMethod,
    resolveFundingDestination,
    confirmFundingDestination,
    resetMethods,
    updateSettings,
    createAccount,
    completeMagicLinkSignIn,
    signOutAccount,
    deleteAccount,
    completeOnboarding,
    toggleSavedMerchant,
    prepareScan,
    clearPendingScan,
    runManualRecommendation,
    runScanRecommendation,
    runPendingScanRecommendation,
    runCheckoutRecommendation,
    recordSuccessfulRecommendation,
  }), [
    activeMethods.length,
    account,
    activity,
    currentSession,
    diagnostics,
    error,
    loading,
    merchantOptions,
    methods,
    fundingDestinations,
    pendingScan,
    promoDataStatus,
    promoIndex,
    recordHandoff,
    settings,
    setMainFundingMethod,
    backendSession,
  ]);

  return (
    <PagamaxContext.Provider value={value}>
      {children}
    </PagamaxContext.Provider>
  );
}

export function usePagamax(): PagamaxContextValue {
  const value = useContext(PagamaxContext);
  if (!value) throw new Error('usePagamax must be used inside PagamaxProvider');
  return value;
}
