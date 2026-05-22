import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { PaymentMethodProfile, PromoIndex } from '@pagamax/core';
import { REMOTE_PROMO_MANIFEST_URL, REMOTE_PROMO_TIMEOUT_MS } from '@/config/remote-data';
import type { PromoDataStatus } from '@/types/app';

export interface MerchantOption {
  name: string;
  category: string;
  promoCount: number;
}

interface RemotePromoManifest {
  version: string;
  generated_at: string;
  promo_index_url: string;
}

export interface PromoIndexLoadResult {
  promoIndex: PromoIndex;
  status: PromoDataStatus;
}

const GENERIC_MERCHANT_PATTERNS = [
  /\badherid/i, /\bcomercio/i, /\blocale?s?\b/i, /\bconsulta\b/i,
  /\btodos los\b/i, /\bvarios\b/i, /^supermercados?$/i, /^alimentos$/i,
  /\bacepten modo\b/i, /^sin datos$/i,
];

const storageRoot = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
const promoDataDir = `${storageRoot}promo-data`;
const cachedManifestPath = `${promoDataDir}/manifest.json`;
const cachedPromoIndexPath = `${promoDataDir}/promo-index.json`;
const cachedManifestStorageKey = 'pagamax.promo.manifest.v1';
const cachedPromoIndexStorageKey = 'pagamax.promo.index.v1';

function isLocalWebPreview(): boolean {
  return Platform.OS === 'web'
    && typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function buildStatus(overrides: Partial<PromoDataStatus>): PromoDataStatus {
  return {
    source: 'bundled',
    localVersion: null,
    remoteVersion: null,
    generatedAt: null,
    manifestUrl: REMOTE_PROMO_MANIFEST_URL,
    lastCheckedAt: null,
    lastError: null,
    lastSyncStatus: REMOTE_PROMO_MANIFEST_URL ? 'idle' : 'unconfigured',
    ...overrides,
  };
}

function isGenericMerchant(name: string): boolean {
  return GENERIC_MERCHANT_PATTERNS.some((pattern) => pattern.test(name));
}

async function ensurePromoDataDir(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!promoDataDir) return;
  const info = await FileSystem.getInfoAsync(promoDataDir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(promoDataDir, { intermediates: true });
  }
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  if (Platform.OS === 'web') {
    const key = path === cachedManifestPath ? cachedManifestStorageKey : cachedPromoIndexStorageKey;
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  try {
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function loadBundledPromoIndexWithStatus(): Promise<PromoIndexLoadResult> {
  const asset = Asset.fromModule(require('../../assets/data/promo-index.bundle.txt'));
  if (Platform.OS !== 'web') {
    await asset.downloadAsync();
  }
  const uri = asset.localUri ?? asset.uri;
  const raw = Platform.OS === 'web'
    ? await fetch(uri).then(async (response) => {
        if (!response.ok) throw new Error(`No se pudo cargar el bundle local (${response.status})`);
        return response.text();
      })
    : await FileSystem.readAsStringAsync(uri);
  const promoIndex = JSON.parse(raw) as PromoIndex;

  return {
    promoIndex,
    status: buildStatus({
      source: 'bundled',
      localVersion: promoIndex.generated_at ?? null,
      generatedAt: promoIndex.generated_at ?? null,
    }),
  };
}

async function loadCachedPromoIndex(): Promise<PromoIndexLoadResult | null> {
  const [manifest, promoIndex] = await Promise.all([
    readJsonFile<RemotePromoManifest>(cachedManifestPath),
    readJsonFile<PromoIndex>(cachedPromoIndexPath),
  ]);

  if (!manifest || !promoIndex) return null;

  return {
    promoIndex,
    status: buildStatus({
      source: 'cached_remote',
      localVersion: manifest.version,
      remoteVersion: manifest.version,
      generatedAt: manifest.generated_at,
    }),
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_PROMO_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadInitialPromoIndex(): Promise<PromoIndexLoadResult> {
  // Startup must be predictable at checkout. Always render from the bundled
  // snapshot first; remote/cached snapshots are applied later by the background
  // sync path so a large cached JSON file cannot block first paint.
  return loadBundledPromoIndexWithStatus();
}

export async function syncRemotePromoIndex(currentVersion: string | null): Promise<PromoIndexLoadResult | null> {
  if (isLocalWebPreview()) return null;
  if (!REMOTE_PROMO_MANIFEST_URL) return null;

  const manifest = await fetchJson<RemotePromoManifest>(REMOTE_PROMO_MANIFEST_URL);
  if (!manifest.version || !manifest.promo_index_url) {
    throw new Error('Manifest remoto invalido.');
  }

  if (manifest.version === currentVersion) {
    return {
      promoIndex: (await loadCachedPromoIndex())?.promoIndex ?? (await loadBundledPromoIndexWithStatus()).promoIndex,
      status: buildStatus({
        source: currentVersion ? 'cached_remote' : 'bundled',
        localVersion: currentVersion,
        remoteVersion: manifest.version,
        generatedAt: manifest.generated_at,
        lastCheckedAt: new Date().toISOString(),
        lastSyncStatus: 'up_to_date',
      }),
    };
  }

  const promoIndex = await fetchJson<PromoIndex>(manifest.promo_index_url);
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(cachedPromoIndexStorageKey, JSON.stringify(promoIndex));
    globalThis.localStorage?.setItem(cachedManifestStorageKey, JSON.stringify(manifest));
  } else {
    await ensurePromoDataDir();
    await Promise.all([
      FileSystem.writeAsStringAsync(cachedPromoIndexPath, JSON.stringify(promoIndex)),
      FileSystem.writeAsStringAsync(cachedManifestPath, JSON.stringify(manifest)),
    ]);
  }

  return {
    promoIndex,
    status: buildStatus({
      source: 'remote_downloaded',
      localVersion: manifest.version,
      remoteVersion: manifest.version,
      generatedAt: manifest.generated_at,
      lastCheckedAt: new Date().toISOString(),
      lastSyncStatus: 'updated',
    }),
  };
}

export function loadDefaultMethods(): PaymentMethodProfile[] {
  return require('../../assets/data/default-methods.json') as PaymentMethodProfile[];
}

export function buildMerchantOptions(promoIndex: PromoIndex): MerchantOption[] {
  const entries = new Map<string, MerchantOption>();

  for (const [normalizedName, indices] of Object.entries(promoIndex.by_name)) {
    const firstPromo = promoIndex.promos[indices[0] ?? -1];
    if (!firstPromo?.merchant_name || isGenericMerchant(firstPromo.merchant_name)) continue;
    const existing = entries.get(normalizedName);
    if (!existing) {
      entries.set(normalizedName, {
        name: firstPromo.merchant_name,
        category: firstPromo.category || 'Otro',
        promoCount: indices.length,
      });
    }
  }

  return [...entries.values()].sort((left, right) => {
    if (right.promoCount !== left.promoCount) return right.promoCount - left.promoCount;
    return left.name.localeCompare(right.name, 'es');
  });
}
