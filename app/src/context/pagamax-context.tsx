import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMatchedCandidates,
  matchMerchantName,
  matchQr,
  recommendPagamaxRoutes,
  type MatchResult,
  type PaymentMethodProfile,
  type PromoIndex,
  type PromoSummary,
} from '@pagamax/core';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { InteractionManager, Platform } from 'react-native';
import { inferMerchantFromCheckoutUrl } from '@/lib/demo-data';
import { buildActivityFromSession } from '@/lib/experience';
import { buildMerchantOptions, loadDefaultMethods, loadInitialPromoIndex, syncRemotePromoIndex, type MerchantOption } from '@/lib/data';
import { STORAGE_KEYS } from '@/lib/storage';
import type { HandoffOutcome } from '@/lib/handoff';
import type {
  AppSettings,
  BetaAccount,
  DiagnosticsEvent,
  PendingScan,
  PromoDataStatus,
  RecommendationSession,
  SavingsActivity,
  StoredPaymentMethod,
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
  resetMethods: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => void;
  createAccount: (input: { email: string; displayName: string; phoneLabel?: string; inviteCode?: string }) => Promise<BetaAccount>;
  signOutAccount: () => Promise<void>;
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
  lastCheckedAt: null,
  lastError: null,
  lastSyncStatus: 'idle',
};

const SCAN_REFERENCE_AMOUNT_ARS = 45000;

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
  description_short: 'Paga con una opcion disponible y revisa si tu billetera o banco muestra puntos, cuotas o reintegros antes de confirmar.',
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

function normalizeStoredMethod(method: PaymentMethodProfile): StoredPaymentMethod {
  return {
    ...method,
    enabled: true,
  };
}

function hydrateStoredMethods(storedMethodsRaw: string | null, seedMethods: StoredPaymentMethod[]): StoredPaymentMethod[] {
  if (!storedMethodsRaw) return seedMethods;

  const storedMethods = JSON.parse(storedMethodsRaw) as StoredPaymentMethod[];
  const hasLegacyDemoMethods = storedMethods.some((method) => LEGACY_DEMO_METHOD_IDS.has(method.id));
  const hasCurrentUserSeed = seedMethods.every((method) => storedMethods.some((stored) => stored.id === method.id));

  if (hasLegacyDemoMethods || !hasCurrentUserSeed) {
    return seedMethods;
  }

  const knownIds = new Set(storedMethods.map((method) => method.id));
  return [
    ...storedMethods,
    ...seedMethods.filter((method) => !knownIds.has(method.id) && USER_METHOD_SEED_IDS.has(method.id)),
  ];
}

async function persistMethods(methods: StoredPaymentMethod[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.methods, JSON.stringify(methods));
}

async function persistSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

async function persistAccount(account: BetaAccount): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.account, JSON.stringify(account));
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

function buildFallbackRecommendations(
  methods: StoredPaymentMethod[],
  amountArs: number,
  merchantName: string,
  topN = 5,
) {
  return methods
    .filter((method) => method.rail === 'qr' || method.rail === 'card')
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
        'Revisa la pantalla final de la billetera antes de confirmar el pago',
      ],
      warnings: [
        'No hay una promo confirmada; esta es una opcion disponible, no una promesa de ahorro',
      ],
    }));
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
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [account, setAccount] = useState<BetaAccount | null>(null);
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [currentSession, setCurrentSession] = useState<RecommendationSession | null>(null);
  const [activity, setActivity] = useState<SavingsActivity[]>([]);
  const [promoDataStatus, setPromoDataStatus] = useState<PromoDataStatus>(DEFAULT_PROMO_DATA_STATUS);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsEvent[]>([]);
  const promoSyncInFlight = useRef(false);

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
      setPromoDataStatus((prev) => ({
        ...prev,
        lastSyncStatus: 'unconfigured',
        lastCheckedAt: new Date().toISOString(),
        lastError: null,
      }));
      promoSyncInFlight.current = false;
      return;
    }

    setPromoDataStatus((prev) => ({
      ...prev,
      lastSyncStatus: prev.manifestUrl ? 'checking' : 'unconfigured',
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
    }));

    try {
      const result = await syncRemotePromoIndex(promoDataStatus.localVersion);
      if (!result) {
        setPromoDataStatus((prev) => ({
          ...prev,
          lastSyncStatus: 'unconfigured',
          lastCheckedAt: new Date().toISOString(),
        }));
        appendDiagnostic('data', 'warning', 'Actualizacion remota no configurada');
        return;
      }

      setPromoDataStatus(result.status);

      if (result.status.lastSyncStatus === 'updated') {
        setPromoIndex(result.promoIndex);
        deferMerchantOptionsBuild(result.promoIndex, setMerchantOptions);
        appendDiagnostic('data', 'info', 'Se descargo una base nueva', `version=${result.status.localVersion ?? 'sin-version'}`);
      } else {
        appendDiagnostic('data', 'info', 'Los descuentos remotos ya estaban al dia', `version=${result.status.localVersion ?? 'sin-version'}`);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo revisar la fuente remota.';
      setPromoDataStatus((prev) => ({
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

  function recordHandoff(provider: string, outcome: HandoffOutcome | 'error', detail?: string) {
    const messages = {
      payment_flow: `Se abrio ${provider} en flujo de pago`,
      app: `Se abrio ${provider}`,
      store: `Se abrio Google Play para ${provider}`,
      error: `Fallo el handoff para ${provider}`,
    } as const;

    appendDiagnostic('handoff', outcome === 'error' ? 'error' : 'info', messages[outcome], detail);
  }

  async function refreshData() {
    setLoading(true);
    setError(null);

    try {
      const [promoLoadResult, storedMethodsRaw, storedSettingsRaw, storedAccountRaw, storedActivityRaw, storedDiagnosticsRaw] = await Promise.all([
        loadInitialPromoIndex(),
        AsyncStorage.getItem(STORAGE_KEYS.methods),
        AsyncStorage.getItem(STORAGE_KEYS.settings),
        AsyncStorage.getItem(STORAGE_KEYS.account),
        AsyncStorage.getItem(STORAGE_KEYS.activity),
        AsyncStorage.getItem(STORAGE_KEYS.diagnostics),
      ]);

      setPromoIndex(promoLoadResult.promoIndex);
      setPromoDataStatus(promoLoadResult.status);
      setMerchantOptions([]);

      const seedMethods = loadDefaultMethods().map(normalizeStoredMethod);
      const hydratedMethods = hydrateStoredMethods(storedMethodsRaw, seedMethods);
      setMethods(hydratedMethods);
      if (JSON.stringify(hydratedMethods) !== storedMethodsRaw) {
        void persistMethods(hydratedMethods);
      }

      const hydratedSettings = storedSettingsRaw
        ? mergeSettings(DEFAULT_SETTINGS, JSON.parse(storedSettingsRaw) as AppSettings)
        : DEFAULT_SETTINGS;
      setSettings(hydratedSettings);

      const hydratedAccount = storedAccountRaw
        ? JSON.parse(storedAccountRaw) as BetaAccount
        : null;
      setAccount(hydratedAccount);

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
    void refreshData();
  }, []);

  const activeMethods = useMemo(() => methods.filter((method) => method.enabled), [methods]);

  function buildSession(
    match: MatchResult,
    amountArs: number,
    source: RecommendationSession['source'],
    merchantInput: string,
    metadata?: { qrPayload?: string; checkoutUrl?: string; amountEstimated?: boolean },
  ) {
    if (!promoIndex) throw new Error('Promo index is not loaded');

    const routePlan = recommendPagamaxRoutes({
      amountArs,
      ownerMethods: activeMethods,
      customerMethods: activeMethods,
      candidates: getMatchedCandidates(match),
      topN: 5,
    });

    let recommendations = routePlan.ownerRoute
      ? [
          routePlan.ownerRoute.recommendation,
          ...routePlan.customerRecommendations.filter((recommendation) => recommendation.method.id !== routePlan.ownerRoute?.ownerMethod.id),
        ].slice(0, 5)
      : routePlan.customerRecommendations;

    if (recommendations.length === 0) {
      recommendations = buildFallbackRecommendations(activeMethods, amountArs, merchantInput, 5);
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
      ownerRoute: routePlan.ownerRoute,
      createdAt: new Date().toISOString(),
    };

    setCurrentSession(session);
    appendDiagnostic(
      'session',
      recommendations.length > 0 ? 'info' : 'warning',
      `Sesion ${source} creada para ${merchantInput}`,
      `match=${match.match_method} opciones=${recommendations.length} owner_route=${routePlan.ownerRoute ? 'yes' : 'no'} estimated=${metadata?.amountEstimated ? 'yes' : 'no'}`,
    );
    return session;
  }

  function toggleMethodEnabled(id: string) {
    setMethods((prev) => {
      const next = prev.map((method) => method.id === id ? { ...method, enabled: !method.enabled } : method);
      void persistMethods(next);
      return next;
    });
  }

  function updateMethod(id: string, patch: Partial<StoredPaymentMethod>) {
    setMethods((prev) => {
      const next = prev.map((method) => method.id === id ? { ...method, ...patch } : method);
      void persistMethods(next);
      return next;
    });
  }

  async function resetMethods() {
    const next = loadDefaultMethods().map(normalizeStoredMethod);
    setMethods(next);
    await persistMethods(next);
  }

  function updateSettings(patch: Partial<AppSettings>) {
    setSettings((prev) => {
      const next = mergeSettings(prev, patch);
      void persistSettings(next);
      return next;
    });
  }

  async function createAccount(input: { email: string; displayName: string; phoneLabel?: string; inviteCode?: string }) {
    const email = normalizeEmail(input.email);
    const displayName = input.displayName.trim();
    const now = new Date().toISOString();
    const next: BetaAccount = {
      id: account?.id ?? makeAccountId(email),
      email,
      displayName,
      createdAt: account?.createdAt ?? now,
      updatedAt: now,
      syncStatus: 'local_only',
    };

    const phoneLabel = input.phoneLabel?.trim();
    const inviteCode = input.inviteCode?.trim();
    if (phoneLabel) next.phoneLabel = phoneLabel;
    if (inviteCode) next.inviteCode = inviteCode;

    setAccount(next);
    await persistAccount(next);
    appendDiagnostic('session', 'info', account ? 'Cuenta beta actualizada' : 'Cuenta beta creada', `email=${email}`);
    return next;
  }

  async function signOutAccount() {
    setAccount(null);
    await AsyncStorage.removeItem(STORAGE_KEYS.account);
    appendDiagnostic('session', 'info', 'Cuenta beta cerrada localmente');
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
    if (!currentSession) throw new Error('No hay una sesion activa para registrar.');

    const recommendation = currentSession.recommendations[recommendationIndex];
    if (!recommendation) throw new Error('No existe la opcion seleccionada.');

    const item = buildActivityFromSession(currentSession, recommendation);
    setActivity((prev) => {
      const next = [item, ...prev];
      void persistActivity(next);
      return next;
    });
    appendDiagnostic('session', 'info', 'Recomendacion confirmada y guardada', `merchant=${item.merchantName} net=${item.netSavingsArs}`);
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
    resetMethods,
    updateSettings,
    createAccount,
    signOutAccount,
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
    pendingScan,
    promoDataStatus,
    promoIndex,
    recordHandoff,
    settings,
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
