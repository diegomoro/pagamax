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
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildMerchantOptions, loadBundledPromoIndex, loadDefaultMethods, type MerchantOption } from '@/lib/data';
import { STORAGE_KEYS } from '@/lib/storage';
import type { AppSettings, PendingScan, RecommendationSession, StoredPaymentMethod } from '@/types/app';

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
  refreshData: () => Promise<void>;
  toggleMethodEnabled: (id: string) => void;
  updateMethod: (id: string, patch: Partial<StoredPaymentMethod>) => void;
  resetMethods: () => Promise<void>;
  setDebugEnabled: (value: boolean) => void;
  prepareScan: (payload: string) => MatchResult;
  clearPendingScan: () => void;
  runManualRecommendation: (merchantName: string, amountArs: number) => RecommendationSession;
  runPendingScanRecommendation: (amountArs: number, merchantOverride?: string) => RecommendationSession;
}

const PagamaxContext = createContext<PagamaxContextValue | null>(null);

const DEFAULT_SETTINGS: AppSettings = {
  debugEnabled: false,
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

export function PagamaxProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoIndex, setPromoIndex] = useState<PromoIndex | null>(null);
  const [merchantOptions, setMerchantOptions] = useState<MerchantOption[]>([]);
  const [methods, setMethods] = useState<StoredPaymentMethod[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [currentSession, setCurrentSession] = useState<RecommendationSession | null>(null);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPromoIndex, storedMethodsRaw, storedSettingsRaw] = await Promise.all([
        loadBundledPromoIndex(),
        AsyncStorage.getItem(STORAGE_KEYS.methods),
        AsyncStorage.getItem(STORAGE_KEYS.settings),
      ]);

      setPromoIndex(nextPromoIndex);
      setMerchantOptions(buildMerchantOptions(nextPromoIndex));

      const seedMethods = loadDefaultMethods().map(normalizeStoredMethod);
      const hydratedMethods = storedMethodsRaw
        ? JSON.parse(storedMethodsRaw) as StoredPaymentMethod[]
        : seedMethods;
      setMethods(hydratedMethods);

      const hydratedSettings = storedSettingsRaw
        ? { ...DEFAULT_SETTINGS, ...(JSON.parse(storedSettingsRaw) as AppSettings) }
        : DEFAULT_SETTINGS;
      setSettings(hydratedSettings);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudieron cargar los datos locales.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const activeMethods = useMemo(
    () => methods.filter(method => method.enabled),
    [methods],
  );

  const buildSession = useCallback((match: MatchResult, amountArs: number, source: 'manual' | 'scan', merchantInput: string, qrPayload?: string) => {
    const nextPromoIndex = promoIndex;
    if (!nextPromoIndex) throw new Error('Promo index is not loaded');

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
      qrPayload,
      match,
      recommendations,
      createdAt: new Date().toISOString(),
    };
    setCurrentSession(session);
    return session;
  }, [activeMethods, promoIndex]);

  const toggleMethodEnabled = useCallback((id: string) => {
    setMethods(prev => {
      const next = prev.map(method => method.id === id ? { ...method, enabled: !method.enabled } : method);
      void persistMethods(next);
      return next;
    });
  }, []);

  const updateMethod = useCallback((id: string, patch: Partial<StoredPaymentMethod>) => {
    setMethods(prev => {
      const next = prev.map(method => method.id === id ? { ...method, ...patch } : method);
      void persistMethods(next);
      return next;
    });
  }, []);

  const resetMethods = useCallback(async () => {
    const next = loadDefaultMethods().map(normalizeStoredMethod);
    setMethods(next);
    await persistMethods(next);
  }, []);

  const setDebugEnabled = useCallback((value: boolean) => {
    const next = { ...settings, debugEnabled: value };
    setSettings(next);
    void persistSettings(next);
  }, [settings]);

  const prepareScan = useCallback((payload: string) => {
    if (!promoIndex) throw new Error('Promo index is not loaded');
    const match = matchQr(payload, promoIndex, { allIssuers: true });
    setPendingScan({ payload, match });
    return match;
  }, [promoIndex]);

  const clearPendingScan = useCallback(() => {
    setPendingScan(null);
  }, []);

  const runManualRecommendation = useCallback((merchantName: string, amountArs: number) => {
    if (!promoIndex) throw new Error('Promo index is not loaded');
    const match = matchMerchantName(merchantName, promoIndex, { allIssuers: true });
    clearPendingScan();
    return buildSession(match, amountArs, 'manual', merchantName);
  }, [buildSession, clearPendingScan, promoIndex]);

  const runPendingScanRecommendation = useCallback((amountArs: number, merchantOverride?: string) => {
    if (!promoIndex) throw new Error('Promo index is not loaded');
    if (!pendingScan) throw new Error('No hay un QR pendiente para continuar.');

    const merchantName = merchantOverride?.trim();
    const match = merchantName && merchantName !== pendingScan.match.merchant_name
      ? matchMerchantName(merchantName, promoIndex, { allIssuers: true })
      : pendingScan.match;

    clearPendingScan();
    return buildSession(match, amountArs, 'scan', merchantName ?? pendingScan.match.merchant_name, pendingScan.payload);
  }, [buildSession, clearPendingScan, pendingScan, promoIndex]);

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
    refreshData,
    toggleMethodEnabled,
    updateMethod,
    resetMethods,
    setDebugEnabled,
    prepareScan,
    clearPendingScan,
    runManualRecommendation,
    runPendingScanRecommendation,
  }), [
    activeMethods.length,
    clearPendingScan,
    currentSession,
    error,
    loading,
    merchantOptions,
    methods,
    pendingScan,
    prepareScan,
    promoIndex,
    refreshData,
    resetMethods,
    runManualRecommendation,
    runPendingScanRecommendation,
    setDebugEnabled,
    settings,
    toggleMethodEnabled,
    updateMethod,
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
