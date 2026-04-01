import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import type { PaymentMethodProfile, PromoIndex } from '@pagamax/core';

export interface MerchantOption {
  name: string;
  category: string;
  promoCount: number;
}

const GENERIC_MERCHANT_PATTERNS = [
  /\badherid/i, /\bcomercio/i, /\blocale?s?\b/i, /\bconsulta\b/i,
  /\btodos los\b/i, /\bvarios\b/i, /^supermercados?$/i, /^alimentos$/i,
  /\bacepten modo\b/i, /^sin datos$/i,
];

function isGenericMerchant(name: string): boolean {
  return GENERIC_MERCHANT_PATTERNS.some(pattern => pattern.test(name));
}

export async function loadBundledPromoIndex(): Promise<PromoIndex> {
  const asset = Asset.fromModule(require('../../assets/data/promo-index.bundle.txt'));
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const raw = await FileSystem.readAsStringAsync(uri);
  return JSON.parse(raw) as PromoIndex;
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

  return [...entries.values()].sort((a, b) => {
    if (b.promoCount !== a.promoCount) return b.promoCount - a.promoCount;
    return a.name.localeCompare(b.name, 'es');
  });
}
