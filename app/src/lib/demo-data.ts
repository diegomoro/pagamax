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
    methodLabel: 'MODO Visa crédito',
    confidence: {
      label: 'Alta',
      score: 0.91,
      tone: 'success',
      note: 'Hubo match directo entre comercio, promo y medio.',
    },
    createdAt: '2026-06-02T18:40:00.000Z',
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
    methodLabel: 'Naranja X débito',
    confidence: {
      label: 'Media',
      score: 0.76,
      tone: 'warning',
      note: 'La promo aplica, pero dependía del día y del tope vigente.',
    },
    createdAt: '2026-06-01T13:05:00.000Z',
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
    createdAt: '2026-05-29T08:12:00.000Z',
    source: 'scan',
  },
];

export const DEMO_OPPORTUNITIES: MerchantOpportunity[] = [
  {
    id: 'opp-jumbo',
    merchantName: 'Jumbo',
    category: 'Supermercados',
    placement: 'best_match',
    placementLabel: 'Ahorro fuerte cerca',
    placementReason: 'Aparece por plata probable para vos, no por pauta.',
    likelyGrossSavingsArs: 8200,
    likelyNetSavingsArs: 6888,
    confidence: {
      label: 'Alta',
      score: 0.9,
      tone: 'success',
      note: 'Suele haber promos buenas y medios compatibles.',
    },
    reason: 'Para compras grandes suele valer la pena revisar antes de pagar.',
    providerHint: 'MODO',
    distanceLabel: '0.8 km',
    tags: ['repetido', 'alto valor'],
  },
  {
    id: 'opp-farmacity',
    merchantName: 'Farmacity',
    category: 'Farmacia',
    placement: 'sponsored',
    placementLabel: 'Pagado, pero util',
    placementReason: 'Ubicacion paga. Entra porque coincide con tus medios y categoria.',
    likelyGrossSavingsArs: 3900,
    likelyNetSavingsArs: 3276,
    confidence: {
      label: 'Media',
      score: 0.74,
      tone: 'warning',
      note: 'Conviene mirar dia y tope antes de pagar.',
    },
    reason: 'Farmacia es de las compras donde más fácil se te escapa una promo.',
    providerHint: 'Naranja X',
    distanceLabel: '1.2 km',
    tags: ['farmacia', 'pagado claro'],
  },
  {
    id: 'opp-ypf',
    merchantName: 'YPF',
    category: 'Combustible',
    placement: 'best_match',
    placementLabel: 'Compra repetida',
    placementReason: 'Aparece por historial y claridad de reglas.',
    likelyGrossSavingsArs: 5400,
    likelyNetSavingsArs: 4536,
    confidence: {
      label: 'Alta',
      score: 0.87,
      tone: 'success',
      note: 'Las reglas y el merchant match suelen ser claros.',
    },
    reason: 'Si cargas seguido, mirar el QR antes de pagar puede sumar bastante.',
    providerHint: 'Personal Pay',
    distanceLabel: '2.1 km',
    tags: ['combustible', 'rápido'],
  },
  {
    id: 'opp-carrefour',
    merchantName: 'Carrefour',
    category: 'Supermercados',
    placement: 'sponsored',
    placementLabel: 'Pagado, marcado',
    placementReason: 'Promocionado y separado de la mejor opción. El ahorro estimado queda visible.',
    likelyGrossSavingsArs: 6100,
    likelyNetSavingsArs: 5124,
    confidence: {
      label: 'Media',
      score: 0.7,
      tone: 'warning',
      note: 'La propuesta es buena, pero los topes cambian seguido.',
    },
    reason: 'Compra familiar y ticket grande: buen momento para revisar con qué pagar.',
    providerHint: 'BBVA',
    tags: ['super', 'familia'],
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
    title: 'Antes de pagar, escaneá',
    body: 'Mostrá el QR. Te digo si conviene Mercado Pago, Naranja X, banco o tarjeta. Vos confirmás siempre.',
  },
  {
    id: 'how',
    title: 'Te marco una opción clara',
    body: 'Primero ves con qué pagar. Si querés, después mirás topes y otras opciones.',
  },
  {
    id: 'permissions',
    title: 'Sin tocar tu plata',
    body: 'Paga Menos no paga ni confirma nada. Solo te ayuda a elegir mejor antes de abrir tu billetera.',
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
