export interface PaymentAppConfig {
  provider: string;
  label: string;
  verifiedDeepLink: string | null;
  playStoreUrl: string;
}

const PLAY_SEARCH_BASE = 'https://play.google.com/store/search?q=';

function searchUrl(query: string): string {
  return `${PLAY_SEARCH_BASE}${encodeURIComponent(query)}&c=apps`;
}

export const PAYMENT_APP_CONFIG: Record<string, PaymentAppConfig> = {
  mercadopago: {
    provider: 'mercadopago',
    label: 'Mercado Pago',
    verifiedDeepLink: null,
    playStoreUrl: searchUrl('Mercado Pago'),
  },
  modo: {
    provider: 'modo',
    label: 'MODO',
    verifiedDeepLink: null,
    playStoreUrl: searchUrl('MODO'),
  },
  naranjax: {
    provider: 'naranjax',
    label: 'Naranja X',
    verifiedDeepLink: null,
    playStoreUrl: searchUrl('Naranja X'),
  },
  bbva: {
    provider: 'bbva',
    label: 'BBVA Argentina',
    verifiedDeepLink: null,
    playStoreUrl: searchUrl('BBVA Argentina'),
  },
  uala: {
    provider: 'uala',
    label: 'Ualá',
    verifiedDeepLink: null,
    playStoreUrl: searchUrl('Uala'),
  },
  personalpay: {
    provider: 'personalpay',
    label: 'Personal Pay',
    verifiedDeepLink: null,
    playStoreUrl: searchUrl('Personal Pay'),
  },
  cuentadni: {
    provider: 'cuentadni',
    label: 'Cuenta DNI',
    verifiedDeepLink: null,
    playStoreUrl: searchUrl('Cuenta DNI'),
  },
  ypf: {
    provider: 'ypf',
    label: 'YPF',
    verifiedDeepLink: null,
    playStoreUrl: searchUrl('YPF'),
  },
  shellbox: {
    provider: 'shellbox',
    label: 'Shell BOX',
    verifiedDeepLink: null,
    playStoreUrl: searchUrl('Shell BOX'),
  },
  carrefour_bank: {
    provider: 'carrefour_bank',
    label: 'Carrefour',
    verifiedDeepLink: null,
    playStoreUrl: searchUrl('Carrefour'),
  },
};

export function getPaymentAppConfig(provider: string): PaymentAppConfig {
  return PAYMENT_APP_CONFIG[provider] ?? {
    provider,
    label: provider,
    verifiedDeepLink: null,
    playStoreUrl: searchUrl(provider),
  };
}
