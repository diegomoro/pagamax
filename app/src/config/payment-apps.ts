export interface PaymentAppConfig {
  provider: string;
  label: string;
  verifiedDeepLink: string | null;
  androidPackage: string | null;
  playStoreUrl: string;
}

const PLAY_SEARCH_BASE = 'https://play.google.com/store/search?q=';
const PLAY_DETAILS_BASE = 'https://play.google.com/store/apps/details?id=';

function searchUrl(query: string): string {
  return `${PLAY_SEARCH_BASE}${encodeURIComponent(query)}&c=apps`;
}

export const PAYMENT_APP_CONFIG: Record<string, PaymentAppConfig> = {
  mercadopago: {
    provider: 'mercadopago',
    label: 'Mercado Pago',
    verifiedDeepLink: null,
    androidPackage: 'com.mercadopago.wallet',
    playStoreUrl: `${PLAY_DETAILS_BASE}com.mercadopago.wallet`,
  },
  modo: {
    provider: 'modo',
    label: 'MODO',
    verifiedDeepLink: null,
    androidPackage: 'ar.com.modo',
    playStoreUrl: searchUrl('MODO'),
  },
  naranjax: {
    provider: 'naranjax',
    label: 'Naranja X',
    verifiedDeepLink: null,
    androidPackage: null,
    playStoreUrl: searchUrl('Naranja X'),
  },
  bbva: {
    provider: 'bbva',
    label: 'BBVA Argentina',
    verifiedDeepLink: null,
    androidPackage: null,
    playStoreUrl: searchUrl('BBVA Argentina'),
  },
  uala: {
    provider: 'uala',
    label: 'Uala',
    verifiedDeepLink: null,
    androidPackage: null,
    playStoreUrl: searchUrl('Uala'),
  },
  personalpay: {
    provider: 'personalpay',
    label: 'Personal Pay',
    verifiedDeepLink: null,
    androidPackage: null,
    playStoreUrl: searchUrl('Personal Pay'),
  },
  cuentadni: {
    provider: 'cuentadni',
    label: 'Cuenta DNI',
    verifiedDeepLink: null,
    androidPackage: null,
    playStoreUrl: searchUrl('Cuenta DNI'),
  },
  ypf: {
    provider: 'ypf',
    label: 'YPF',
    verifiedDeepLink: null,
    androidPackage: null,
    playStoreUrl: searchUrl('YPF'),
  },
  shellbox: {
    provider: 'shellbox',
    label: 'Shell BOX',
    verifiedDeepLink: null,
    androidPackage: null,
    playStoreUrl: searchUrl('Shell BOX'),
  },
  carrefour_bank: {
    provider: 'carrefour_bank',
    label: 'Carrefour',
    verifiedDeepLink: null,
    androidPackage: null,
    playStoreUrl: searchUrl('Carrefour'),
  },
};

export function getPaymentAppConfig(provider: string): PaymentAppConfig {
  return PAYMENT_APP_CONFIG[provider] ?? {
    provider,
    label: provider,
    verifiedDeepLink: null,
    androidPackage: null,
    playStoreUrl: searchUrl(provider),
  };
}
