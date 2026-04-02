import type { MerchantOpportunity, SavingsActivity } from '@/types/app';

export const DEMO_ACTIVITY: SavingsActivity[] = [
  {
    id: 'demo-jumbo',
    merchantName: 'Jumbo Palermo',
    category: 'Supermercados',
    amountArs: 46200,
    grossSavingsArs: 8200,
    pagamaxFeeArs: 1312,
    netSavingsArs: 6888,
    provider: 'modo',
    methodLabel: 'MODO Visa credito',
    confidence: {
      label: 'Alta',
      score: 0.91,
      tone: 'success',
      note: 'Hubo match directo entre comercio, promo y medio.',
    },
    createdAt: '2026-04-01T18:40:00.000Z',
    source: 'scan',
  },
  {
    id: 'demo-farmacity',
    merchantName: 'Farmacity Belgrano',
    category: 'Farmacia',
    amountArs: 21900,
    grossSavingsArs: 4300,
    pagamaxFeeArs: 688,
    netSavingsArs: 3612,
    provider: 'naranjax',
    methodLabel: 'Naranja X debito',
    confidence: {
      label: 'Media',
      score: 0.76,
      tone: 'warning',
      note: 'La promo aplica, pero dependia del dia y del tope vigente.',
    },
    createdAt: '2026-03-30T13:05:00.000Z',
    source: 'manual',
  },
  {
    id: 'demo-ypf',
    merchantName: 'YPF Libertador',
    category: 'Combustible',
    amountArs: 38500,
    grossSavingsArs: 5200,
    pagamaxFeeArs: 832,
    netSavingsArs: 4368,
    provider: 'personalpay',
    methodLabel: 'Personal Pay saldo',
    confidence: {
      label: 'Alta',
      score: 0.88,
      tone: 'success',
      note: 'Coincidieron el comercio y el canal de pago.',
    },
    createdAt: '2026-03-26T08:12:00.000Z',
    source: 'scan',
  },
];

export const DEMO_OPPORTUNITIES: MerchantOpportunity[] = [
  {
    id: 'opp-jumbo',
    merchantName: 'Jumbo',
    category: 'Supermercados',
    likelyGrossSavingsArs: 8200,
    likelyNetSavingsArs: 6888,
    confidence: {
      label: 'Alta',
      score: 0.9,
      tone: 'success',
      note: 'Suele haber promos fuertes y metodos compatibles.',
    },
    reason: 'Tus ultimos tickets en supermercado muestran buen fit con MODO y bancos.',
    providerHint: 'MODO',
    distanceLabel: '0.8 km',
    tags: ['repetido', 'alto valor'],
  },
  {
    id: 'opp-farmacity',
    merchantName: 'Farmacity',
    category: 'Farmacia',
    likelyGrossSavingsArs: 3900,
    likelyNetSavingsArs: 3276,
    confidence: {
      label: 'Media',
      score: 0.74,
      tone: 'warning',
      note: 'Conviene revisar el dia y el tope antes de pagar.',
    },
    reason: 'Las promos de farmacia se activan seguido en tus medios guardados.',
    providerHint: 'Naranja X',
    distanceLabel: '1.2 km',
    tags: ['farmacia', 'hoy'],
  },
  {
    id: 'opp-ypf',
    merchantName: 'YPF',
    category: 'Combustible',
    likelyGrossSavingsArs: 5400,
    likelyNetSavingsArs: 4536,
    confidence: {
      label: 'Alta',
      score: 0.87,
      tone: 'success',
      note: 'Las reglas y el merchant match suelen ser claros.',
    },
    reason: 'Tu historial reciente sugiere buena recurrencia en combustible.',
    providerHint: 'Personal Pay',
    distanceLabel: '2.1 km',
    tags: ['combustible', 'ruta rapida'],
  },
  {
    id: 'opp-carrefour',
    merchantName: 'Carrefour',
    category: 'Supermercados',
    likelyGrossSavingsArs: 6100,
    likelyNetSavingsArs: 5124,
    confidence: {
      label: 'Media',
      score: 0.7,
      tone: 'warning',
      note: 'La propuesta es buena, pero los topes cambian seguido.',
    },
    reason: 'Tus medios guardados tienen opciones con buen valor en retail masivo.',
    providerHint: 'BBVA',
    tags: ['retail', 'familia'],
  },
];

export const DEMO_REPEAT_MERCHANTS = ['Jumbo', 'Farmacity', 'YPF'];

export const DEMO_MISSED_OPPORTUNITIES = [
  {
    id: 'missed-shell',
    merchantName: 'Shell BOX',
    note: 'La semana pasada pagaste combustible sin evaluar una promo compatible.',
    estimatedNetSavingsArs: 3100,
  },
];

export const ONBOARDING_PAGES = [
  {
    id: 'welcome',
    title: 'Pagamax te ayuda antes de pagar',
    body: 'Escanea un QR o pega un checkout link y compara rutas con ahorro estimado, fee visible y confianza clara.',
  },
  {
    id: 'how',
    title: 'Menos friccion, mas claridad',
    body: 'Te mostramos rapido la mejor opcion, las alternativas y por que califican, sin esconder caveats ni topes.',
  },
  {
    id: 'permissions',
    title: 'Permisos solo si agregan valor',
    body: 'Podemos sugerir oportunidades cercanas o avisarte cuando valga la pena, pero tu decides si activarlo.',
  },
];

const CHECKOUT_PATTERNS: Array<{ token: string; merchantName: string }> = [
  { token: 'jumbo', merchantName: 'Jumbo' },
  { token: 'vea', merchantName: 'Vea' },
  { token: 'farmacity', merchantName: 'Farmacity' },
  { token: 'carrefour', merchantName: 'Carrefour' },
  { token: 'fravega', merchantName: 'Fravega' },
  { token: 'samsung', merchantName: 'Samsung' },
  { token: 'dexter', merchantName: 'Dexter' },
];

export function inferMerchantFromCheckoutUrl(url: string): string | null {
  const normalized = url.toLowerCase();
  const match = CHECKOUT_PATTERNS.find((entry) => normalized.includes(entry.token));
  return match?.merchantName ?? null;
}
