import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMatchedCandidates,
  matchMerchantName,
  matchQr,
  recommendPaymentOptions,
  type MatchResult,
  type PaymentMethodProfile,
  type PromoIndex,
} from '@pagamax/core';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { inferMerchantFromCheckoutUrl } from '@/lib/demo-data';
import { buildActivityFromSession } from '@/lib/experience';
import { buildMerchantOptions, loadBundledPromoIndex, loadDefaultMethods, type MerchantOption } from '@/lib/data';
import { STORAGE_KEYS } from '@/lib/storage';
import type {
  AppSettings,
  PendingScan,
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
  methods: StoredPaymentMethod[];
  activeMethodsCount: number;
  settings: AppSettings;
  pendingScan: PendingScan | null;
  currentSession: RecommendationSession | null;
  activity: SavingsActivity[];
  refreshData: () => Promise<void>;
  toggleMethodEnabled: (id: string) => void;
  updateMethod: (id: string, patch: Partial<StoredPaymentMethod>) => void;
  resetMethods: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => void;
  completeOnboarding: (patch?: Partial<AppSettings>) => void;
  toggleSavedMerchant: (merchantName: string) => void;
  prepareScan: (payload: string) => MatchResult;
  clearPendingScan: () => void;
  runManualRecommendation: (merchantName: string, amountArs: number) => RecommendationSession;
  runPendingScanRecommendation: (amountArs: number, merchantOverride?: string) => RecommendationSession;
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

function normalizeStoredMethod(method: PaymentMethodProfile): StoredPaymentMethod {
  return {
    ...method,
    enabled: true,
  };
}

async function persistMethods(methods: StoredPaymentMethod[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.methods, JSON.stringify(methods));
}

async function persistSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

async function persistActivity(activity: SavingsActivity[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.activity, JSON.stringify(activity));
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

export function PagamaxProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoIndex, setPromoIndex] = useState<PromoIndex | null>(null);
  const [merchantOptions, setMerchantOptions] = useState<MerchantOption[]>([]);
  const [methods, setMethods] = useState<StoredPaymentMethod[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [currentSession, setCurrentSession] = useState<RecommendationSession | null>(null);
  const [activity, setActivity] = useState<SavingsActivity[]>([]);

  async function refreshData() {
    setLoading(true);
    setError(null);

    try {
      const [nextPromoIndex, storedMethodsRaw, storedSettingsRaw, storedActivityRaw] = await Promise.all([
        loadBundledPromoIndex(),
        AsyncStorage.getItem(STORAGE_KEYS.methods),
        AsyncStorage.getItem(STORAGE_KEYS.settings),
        AsyncStorage.getItem(STORAGE_KEYS.activity),
      ]);

      setPromoIndex(nextPromoIndex);
      setMerchantOptions(buildMerchantOptions(nextPromoIndex));

      const seedMethods = loadDefaultMethods().map(normalizeStoredMethod);
      const hydratedMethods = storedMethodsRaw
        ? JSON.parse(storedMethodsRaw) as StoredPaymentMethod[]
        : seedMethods;
      setMethods(hydratedMethods);

      const hydratedSettings = storedSettingsRaw
        ? mergeSettings(DEFAULT_SETTINGS, JSON.parse(storedSettingsRaw) as AppSettings)
        : DEFAULT_SETTINGS;
      setSettings(hydratedSettings);

      const hydratedActivity = storedActivityRaw
        ? JSON.parse(storedActivityRaw) as SavingsActivity[]
        : [];
      setActivity(hydratedActivity);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudieron cargar los datos locales.';
      setError(message);
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
    metadata?: { qrPayload?: string; checkoutUrl?: string },
  ) {
    if (!promoIndex) throw new Error('Promo index is not loaded');

    const recommendations = recommendPaymentOptions({
      amountArs,
      methods: activeMethods,
      candidates: getMatchedCandidates(match),
      topN: 5,
    });

    const session: RecommendationSession = {
      amountArs,
      source,
      merchantInput,
      qrPayload: metadata?.qrPayload,
      checkoutUrl: metadata?.checkoutUrl,
      match,
      recommendations,
      createdAt: new Date().toISOString(),
    };

    setCurrentSession(session);
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
    return match;
  }

  function clearPendingScan() {
    setPendingScan(null);
  }

  function runManualRecommendation(merchantName: string, amountArs: number) {
    if (!promoIndex) throw new Error('Promo index is not loaded');
    const match = matchMerchantName(merchantName, promoIndex, { allIssuers: true });
    clearPendingScan();
    return buildSession(match, amountArs, 'manual', merchantName);
  }

  function runPendingScanRecommendation(amountArs: number, merchantOverride?: string) {
    if (!promoIndex) throw new Error('Promo index is not loaded');
    if (!pendingScan) throw new Error('No hay un QR pendiente para continuar.');

    const merchantName = merchantOverride?.trim();
    const match = merchantName && merchantName !== pendingScan.match.merchant_name
      ? matchMerchantName(merchantName, promoIndex, { allIssuers: true })
      : pendingScan.match;

    clearPendingScan();
    return buildSession(match, amountArs, 'scan', merchantName ?? pendingScan.match.merchant_name, { qrPayload: pendingScan.payload });
  }

  function runCheckoutRecommendation(checkoutUrl: string, amountArs: number, merchantOverride?: string) {
    if (!promoIndex) throw new Error('Promo index is not loaded');
    const merchantName = merchantOverride?.trim() || inferMerchantFromCheckoutUrl(checkoutUrl) || 'Checkout online';
    const match = matchMerchantName(merchantName, promoIndex, { allIssuers: true });
    clearPendingScan();
    return buildSession(match, amountArs, 'online', merchantName, { checkoutUrl });
  }

  function recordSuccessfulRecommendation(recommendationIndex = 0) {
    if (!currentSession) throw new Error('No hay una sesion activa para registrar.');

    const recommendation = currentSession.recommendations[recommendationIndex];
    if (!recommendation) throw new Error('No existe la recomendacion seleccionada.');

    const item = buildActivityFromSession(currentSession, recommendation);
    setActivity((prev) => {
      const next = [item, ...prev];
      void persistActivity(next);
      return next;
    });
    return item;
  }

  const value = useMemo<PagamaxContextValue>(() => ({
    loading,
    error,
    promoIndex,
    merchantOptions,
    dataTimestamp: promoIndex?.generated_at ?? null,
    methods,
    activeMethodsCount: activeMethods.length,
    settings,
    pendingScan,
    currentSession,
    activity,
    refreshData,
    toggleMethodEnabled,
    updateMethod,
    resetMethods,
    updateSettings,
    completeOnboarding,
    toggleSavedMerchant,
    prepareScan,
    clearPendingScan,
    runManualRecommendation,
    runPendingScanRecommendation,
    runCheckoutRecommendation,
    recordSuccessfulRecommendation,
  }), [
    activeMethods.length,
    activity,
    currentSession,
    error,
    loading,
    merchantOptions,
    methods,
    pendingScan,
    promoIndex,
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
