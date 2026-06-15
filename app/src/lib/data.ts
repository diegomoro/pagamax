import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { PaymentMethodProfile, PromoIndex } from '@pagamax/core';
import { REMOTE_PROMO_MANIFEST_URL, REMOTE_PROMO_TIMEOUT_MS } from '@/config/remote-data';
import { sha256Hex } from '@/lib/hash';
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
  sha256?: string;
  stale_after?: string;
  built_at?: string;
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
    remoteSha256: null,
    hashVerified: false,
    staleAt: null,
    lastCheckedAt: null,
    lastError: null,
    lastSyncStatus: REMOTE_PROMO_MANIFEST_URL ? 'idle' : 'unconfigured',
    ...overrides,
  };
}

function isGenericMerchant(name: string): boolean {
  return GENERIC_MERCHANT_PATTERNS.some((pattern) => pattern.test(name));
}

function normalizeSha256(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function validateRemotePromoUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      throw new Error('La URL del indice remoto debe usar HTTPS.');
    }
    return parsed.toString();
  } catch (caught) {
    if (caught instanceof Error) throw caught;
    throw new Error('La URL del indice remoto es invalida.');
  }
}

async function ensurePromoDataDir(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!promoDataDir) return;
  const info = await FileSystem.getInfoAsync(promoDataDir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(promoDataDir, { intermediates: true });
  }
}

async function readTextFile(path: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    const key = path === cachedManifestPath ? cachedManifestStorageKey : cachedPromoIndexStorageKey;
    return globalThis.localStorage?.getItem(key) ?? null;
  }

  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  try {
    return await FileSystem.readAsStringAsync(path);
  } catch {
    return null;
  }
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  const raw = await readTextFile(path);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseVerifiedRemotePromoIndex(raw: string, manifest: RemotePromoManifest): PromoIndex {
  const expectedSha256 = normalizeSha256(manifest.sha256);
  if (!expectedSha256) {
    throw new Error('Manifest remoto sin SHA-256 valido.');
  }

  const actualSha256 = sha256Hex(raw);
  if (actualSha256 !== expectedSha256) {
    throw new Error('Hash SHA-256 remoto no coincide; se conserva la base local.');
  }

  return JSON.parse(raw) as PromoIndex;
}

async function loadCachedPromoIndex(): Promise<PromoIndexLoadResult | null> {
  const [manifest, rawPromoIndex] = await Promise.all([
    readJsonFile<RemotePromoManifest>(cachedManifestPath),
    readTextFile(cachedPromoIndexPath),
  ]);

  if (!manifest || !rawPromoIndex) return null;

  try {
    const promoIndex = parseVerifiedRemotePromoIndex(rawPromoIndex, manifest);
    const remoteSha256 = normalizeSha256(manifest.sha256);
    return {
      promoIndex,
      status: buildStatus({
        source: 'cached_remote',
        localVersion: manifest.version,
        remoteVersion: manifest.version,
        generatedAt: manifest.generated_at,
        remoteSha256,
        hashVerified: remoteSha256 != null,
        staleAt: manifest.stale_after ?? null,
      }),
    };
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

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_PROMO_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const raw = await fetchText(url);
  return JSON.parse(raw) as T;
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
  const promoIndexUrl = validateRemotePromoUrl(manifest.promo_index_url);

  if (manifest.version === currentVersion) {
    const cached = await loadCachedPromoIndex();
    const fallback = cached ?? await loadBundledPromoIndexWithStatus();
    return {
      promoIndex: fallback.promoIndex,
      status: buildStatus({
        source: cached ? 'cached_remote' : 'bundled',
        localVersion: fallback.status.localVersion ?? currentVersion,
        remoteVersion: manifest.version,
        generatedAt: manifest.generated_at,
        remoteSha256: normalizeSha256(manifest.sha256),
        hashVerified: cached?.status.hashVerified ?? false,
        staleAt: manifest.stale_after ?? cached?.status.staleAt ?? null,
        lastCheckedAt: new Date().toISOString(),
        lastSyncStatus: 'up_to_date',
      }),
    };
  }

  const rawPromoIndex = await fetchText(promoIndexUrl);
  const promoIndex = parseVerifiedRemotePromoIndex(rawPromoIndex, manifest);
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(cachedPromoIndexStorageKey, rawPromoIndex);
    globalThis.localStorage?.setItem(cachedManifestStorageKey, JSON.stringify(manifest));
  } else {
    await ensurePromoDataDir();
    await Promise.all([
      FileSystem.writeAsStringAsync(cachedPromoIndexPath, rawPromoIndex),
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
      remoteSha256: normalizeSha256(manifest.sha256),
      hashVerified: true,
      staleAt: manifest.stale_after ?? null,
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
