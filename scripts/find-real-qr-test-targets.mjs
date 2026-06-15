#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const promoIndexPath = resolve(root, 'app/assets/data/promo-index.json');
const reportPath = resolve(root, 'reports/real-qr-test-targets.md');
const jsonPath = resolve(root, 'reports/real-qr-test-targets.json');
const simulationReportPath = resolve(root, 'reports/real-qr-purchase-simulations.md');
const today = new Date();
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const todayName = dayNames[today.getDay()];
const currentIsoDate = today.toISOString().slice(0, 10);
const lowValueCapArs = 500;

const COMMON_LOW_VALUE_MERCHANTS = [
  'Changomas',
  'Hiperchangomas',
  'Superchangomas',
  'Libertad',
  'Hiperlibertad',
  'Carrefour',
  'Farmacity',
  'Dia',
  'Super MAMI',
  'Supermami',
  'Tadicor',
  'YPF',
  'Shell',
  'Mostaza',
  'Mc Donald',
  'McDonald',
  'Kiosco',
  'Farmaonline',
  'Farmaplus',
  'Burger King',
];

const GENERIC_MERCHANT_MARKERS = [
  'comercios adheridos',
  'supermercados adheridos',
  'farmacias que acepten',
  'estaciones de servicio acepten',
  'estaciones de servicio adheridas',
  'todos los locales adheridos',
  'alimentos',
];

const SOURCE_FACTS = [
  {
    id: 'naranjax-pay-qr',
    source: 'https://www.naranjax.com/pagar-con-qr',
    summary: 'Naranja X says users can scan interoperable QR codes and choose money in account, card, or installments in the app.',
  },
  {
    id: 'naranjax-commerce-qr',
    source: 'https://www.naranjax.com/codigo-qr-comercios',
    summary: 'Naranja X merchant QR can be dynamic, static, or embedded; embedded QR is dynamic amount-closed and interoperable.',
  },
  {
    id: 'naranjax-promos-amba-june-2026',
    source: 'https://www.naranjax.com/promociones-amba',
    summary: 'June 2026 Naranja X legal terms include QR-specific promos and explicit exclusions for QR/NFC-only cases.',
  },
];

const CONTROLLED_CROSS_PROVIDER_CASES = [
  {
    targetId: 'controlled__nx_to_mercadopago_dynamic_100',
    targetKind: 'controlled_cross_provider',
    merchant: { name: 'Mercado Pago controlled receiver', category: 'Controlled receiver', matchMethod: null, cuit: null },
    qrTarget: {
      source: 'controlled_receiver_qr',
      acquisition: 'Generate an ARS 100 dynamic payable QR in Mercado Pago and display it on a second screen.',
      expectedQrProvider: 'Mercado Pago',
      channel: 'controlled',
      rail: 'qr',
      instrumentRequired: 'qr_wallet',
      lowValueAmountArs: 100,
      minPurchaseArs: null,
      qrType: 'dynamic_amount_closed',
    },
    promo: {
      promoKey: 'controlled-no-promo',
      issuer: 'none',
      title: 'No promo expected; interoperability and safe routing control',
      walletScope: 'Naranja X as payer',
      cardBrandScope: '',
      cardTypeScope: '',
      dayPattern: 'everyday',
      validFrom: currentIsoDate,
      validTo: '',
      freshnessStatus: 'manual_control',
      discountPercent: null,
      discountAmountArs: null,
      installments: null,
      capAmountArs: null,
    },
    recommendation: {
      expectedMethodId: 'naranjax-balance-qr',
      provider: 'naranjax',
      label: 'Naranja X app QR',
      rail: 'qr',
      walletLabel: 'Naranja X',
      rankingScore: null,
      estimatedSavingsArs: 0,
    },
    routeValidation: {
      intendedRoute: 'NX -> recommended payment method -> merchant',
      promoIssuerIsNaranjaX: false,
      promoIssuerIsModo: false,
      walletScopeIncludesNaranjaX: true,
      recommendedProviderIsNaranjaX: true,
      merchantMatchesQr: null,
      amountWithinLowValueBand: true,
      eligibleToday: true,
      pass: true,
      warnings: ['no_discount_expected_controlled_interoperability_test'],
    },
    execution: {
      realPaymentAllowed: true,
      expectedFundingSource: 'Naranja X owner account',
      intendedRoute: 'Naranja X -> Naranja X app QR -> Mercado Pago controlled receiver',
      assertions: [
        'Pagamax scans the real Mercado Pago QR without freezing or crashing.',
        'Pagamax safely labels the receiver and amount, or marks missing fields clearly.',
        'Pagamax shows Naranja X as payer route or safe manual scanner fallback.',
        'Naranja X review screen shows the Mercado Pago receiver and ARS 100 before approval.',
        'Pagamax must not claim a promo, completion, approval, or prefill.',
      ],
      stopConditions: [
        'Stop if receiver is not the controlled Mercado Pago account.',
        'Stop if amount is not ARS 100 or exceeds ARS 500.',
        'Stop if Naranja X cannot manually scan/pay the QR.',
      ],
    },
    blocker: null,
    confidence: 'high',
    legalRouteSummary: 'Controlled no-promo test for Naranja X paying a Mercado Pago receiver QR. This proves cross-provider interoperability and safe app copy before promo tests.',
    sourceFacts: SOURCE_FACTS.filter((fact) => fact.id === 'naranjax-pay-qr'),
  },
  {
    targetId: 'controlled__nx_to_mercadopago_static_100',
    targetKind: 'controlled_cross_provider',
    merchant: { name: 'Mercado Pago controlled receiver', category: 'Controlled receiver', matchMethod: null, cuit: null },
    qrTarget: {
      source: 'controlled_receiver_qr',
      acquisition: 'Display a static Mercado Pago receiver QR and enter ARS 100 manually in Naranja X.',
      expectedQrProvider: 'Mercado Pago',
      channel: 'controlled',
      rail: 'qr',
      instrumentRequired: 'qr_wallet',
      lowValueAmountArs: 100,
      minPurchaseArs: null,
      qrType: 'static_amount_entered',
    },
    promo: {
      promoKey: 'controlled-no-promo-static',
      issuer: 'none',
      title: 'No promo expected; static amount-missing control',
      walletScope: 'Naranja X as payer',
      cardBrandScope: '',
      cardTypeScope: '',
      dayPattern: 'everyday',
      validFrom: currentIsoDate,
      validTo: '',
      freshnessStatus: 'manual_control',
      discountPercent: null,
      discountAmountArs: null,
      installments: null,
      capAmountArs: null,
    },
    recommendation: {
      expectedMethodId: 'naranjax-balance-qr',
      provider: 'naranjax',
      label: 'Naranja X app QR',
      rail: 'qr',
      walletLabel: 'Naranja X',
      rankingScore: null,
      estimatedSavingsArs: 0,
    },
    routeValidation: {
      intendedRoute: 'NX -> recommended payment method -> merchant',
      promoIssuerIsNaranjaX: false,
      promoIssuerIsModo: false,
      walletScopeIncludesNaranjaX: true,
      recommendedProviderIsNaranjaX: true,
      merchantMatchesQr: null,
      amountWithinLowValueBand: true,
      eligibleToday: true,
      pass: true,
      warnings: ['amount_must_be_entered_in_wallet', 'no_discount_expected_controlled_interoperability_test'],
    },
    execution: {
      realPaymentAllowed: true,
      expectedFundingSource: 'Naranja X owner account',
      intendedRoute: 'Naranja X -> Naranja X app QR -> Mercado Pago controlled receiver',
      assertions: [
        'Pagamax scans the static Mercado Pago QR without carrying over a previous amount.',
        'Pagamax clearly marks amount as missing or user-entered.',
        'Naranja X lets the user enter ARS 100 and review the Mercado Pago receiver.',
        'Pagamax must not claim the amount was prefilled.',
      ],
      stopConditions: [
        'Stop if receiver is not the controlled Mercado Pago account.',
        'Stop if Naranja X asks to pay a different amount or receiver.',
      ],
    },
    blocker: null,
    confidence: 'high',
    legalRouteSummary: 'Controlled no-promo test for static QR amount handling with Naranja X paying a Mercado Pago receiver.',
    sourceFacts: SOURCE_FACTS.filter((fact) => fact.id === 'naranjax-pay-qr'),
  },
  {
    targetId: 'controlled__nx_to_other_wallet_receiver_100',
    targetKind: 'controlled_cross_provider',
    merchant: { name: 'Other controlled wallet receiver', category: 'Controlled receiver', matchMethod: null, cuit: null },
    qrTarget: {
      source: 'controlled_receiver_qr',
      acquisition: 'Generate an ARS 100 payable QR from another controlled wallet or merchant account, if available.',
      expectedQrProvider: 'Other interoperable QR provider',
      channel: 'controlled',
      rail: 'qr',
      instrumentRequired: 'qr_wallet',
      lowValueAmountArs: 100,
      minPurchaseArs: null,
      qrType: 'dynamic_amount_closed',
    },
    promo: {
      promoKey: 'controlled-other-provider-no-promo',
      issuer: 'none',
      title: 'No promo expected; other-provider interoperability control',
      walletScope: 'Naranja X as payer',
      cardBrandScope: '',
      cardTypeScope: '',
      dayPattern: 'everyday',
      validFrom: currentIsoDate,
      validTo: '',
      freshnessStatus: 'manual_control',
      discountPercent: null,
      discountAmountArs: null,
      installments: null,
      capAmountArs: null,
    },
    recommendation: {
      expectedMethodId: 'naranjax-balance-qr',
      provider: 'naranjax',
      label: 'Naranja X app QR',
      rail: 'qr',
      walletLabel: 'Naranja X',
      rankingScore: null,
      estimatedSavingsArs: 0,
    },
    routeValidation: {
      intendedRoute: 'NX -> recommended payment method -> merchant',
      promoIssuerIsNaranjaX: false,
      promoIssuerIsModo: false,
      walletScopeIncludesNaranjaX: true,
      recommendedProviderIsNaranjaX: true,
      merchantMatchesQr: null,
      amountWithinLowValueBand: true,
      eligibleToday: true,
      pass: true,
      warnings: ['requires_user_controlled_non_mp_receiver', 'no_discount_expected_controlled_interoperability_test'],
    },
    execution: {
      realPaymentAllowed: true,
      expectedFundingSource: 'Naranja X owner account',
      intendedRoute: 'Naranja X -> Naranja X app QR -> other controlled receiver',
      assertions: [
        'Pagamax scans the other-provider QR without freezing or crashing.',
        'Pagamax safely labels receiver/provider and amount.',
        'Naranja X review screen shows the same receiver and ARS 100.',
        'Pagamax must not claim a promo unless the wallet explicitly shows one.',
      ],
      stopConditions: [
        'Stop if receiver is not controlled by the tester.',
        'Stop if amount is above ARS 500.',
      ],
    },
    blocker: null,
    confidence: 'medium',
    legalRouteSummary: 'Controlled no-promo test for Naranja X paying a non-Mercado Pago interoperable QR receiver.',
    sourceFacts: SOURCE_FACTS.filter((fact) => fact.id === 'naranjax-pay-qr'),
  },
];

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function idPart(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function includesAny(value, needles) {
  const haystack = normalize(value);
  return needles.some((needle) => haystack.includes(normalize(needle)));
}

function isNaranjaIssuer(promo) {
  return normalize(promo.issuer) === 'naranjax';
}

function isSpecificMerchantName(value) {
  const merchant = normalize(value);
  if (!merchant || merchant.length < 3) return false;
  return !GENERIC_MERCHANT_MARKERS.some((marker) => merchant.includes(marker));
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isCurrentlyValid(promo) {
  if (promo.freshness_status && promo.freshness_status !== 'active') return false;
  const from = parseDate(promo.valid_from);
  const to = parseDate(promo.valid_to);
  const current = parseDate(currentIsoDate);
  if (from && current < from) return false;
  if (to && current > to) return false;
  return true;
}

function dayMatches(dayPattern) {
  const raw = normalize(dayPattern);
  if (!raw || raw === 'everyday' || raw === 'todos los dias') return true;
  return raw.split(/[;,|/]+/).map((part) => part.trim()).includes(todayName);
}

function dayList(dayPattern) {
  const raw = normalize(dayPattern);
  if (!raw || raw === 'everyday' || raw === 'todos los dias') return [];
  return raw.split(/[;,|/]+/).map((part) => part.trim()).filter(Boolean);
}

function valueScore(promo) {
  const percent = Number(promo.discount_percent ?? 0);
  const fixed = Number(promo.discount_amount_ars ?? 0);
  const installments = Number(promo.installments_count ?? 0);
  return percent * 10 + fixed / 100 + installments;
}

function hasQrExclusion(promo) {
  return includesAny(`${promo.promo_title} ${promo.description_short}`, [
    'qr no aplica',
    'no aplica qr',
    'excluidos aquellos pagos realizados a traves de la lectura de codigos qr',
    'excluidos aquellos pagos realizadas a traves de la lectura de codigos qr',
  ]);
}

const KNOWN_TERM_OVERRIDES = [
  {
    match: (promo) => isNaranjaIssuer(promo) && normalize(promo.rail) === 'qr' && includesAny(promo.merchant_name, ['Hiperchangomas', 'Changomas']),
    applies: {
      confidence: 'high',
      targetKind: 'naranjax_issuer_qr',
      legalRouteSummary: 'Source terms say the Changomas/Hiperchangomas benefit applies by scanning Mercado Pago QR with the Naranja X app on Fridays, Saturdays, and Sundays in June 2026.',
      sourceFactIds: ['naranjax-promos-amba-june-2026', 'naranjax-pay-qr'],
      lowValueEligible: true,
      recommendedAmountArs: lowValueCapArs,
      requiredDays: ['friday', 'saturday', 'sunday'],
      expectedMethodId: 'naranjax-balance-qr',
      expectedMethodLabel: 'Naranja X app QR',
      expectedProvider: 'naranjax',
      expectedRail: 'qr',
      expectedWalletLabel: 'Naranja X',
      expectedQrProvider: 'Mercado Pago',
      discountProof: 'Discount should appear at payment time in Naranja X for eligible goods; stop if the final review does not show it.',
    },
  },
  {
    match: (promo) => isNaranjaIssuer(promo) && includesAny(promo.merchant_name, ['Diarco']),
    applies: {
      confidence: 'high',
      targetKind: 'blocked_low_value',
      legalRouteSummary: 'Source terms say Diarco QR requires a minimum purchase above the ARS 100-500 cap, so it is not a low-value real payment target.',
      sourceFactIds: ['naranjax-promos-amba-june-2026'],
      lowValueEligible: false,
      recommendedAmountArs: null,
      minPurchaseOverrideArs: 35000,
      blocker: 'known_min_purchase_above_cap',
      expectedMethodId: 'naranjax-balance-qr',
      expectedMethodLabel: 'Naranja X app QR',
      expectedProvider: 'naranjax',
      expectedRail: 'qr',
      expectedWalletLabel: 'Naranja X',
      expectedQrProvider: 'merchant checkout QR provider',
      discountProof: 'Do not execute under the low-value plan.',
    },
  },
  {
    match: (promo) => includesAny(promo.merchant_name, ['Coto']) && (normalize(promo.rail) === 'nfc' || normalize(promo.description_short).includes('nfc')),
    applies: {
      confidence: 'high',
      targetKind: 'negative_control',
      legalRouteSummary: 'Source terms for the Coto Visa wallet promo say QR does not apply; use this as a negative control if Pagamax sees a Coto QR.',
      sourceFactIds: ['naranjax-promos-amba-june-2026'],
      lowValueEligible: true,
      recommendedAmountArs: lowValueCapArs,
      blocker: 'promo_excludes_qr',
      expectedMethodId: 'naranjax-nfc-or-card',
      expectedMethodLabel: 'Naranja X NFC/card, not QR',
      expectedProvider: 'naranjax',
      expectedRail: 'nfc',
      expectedWalletLabel: 'Naranja X',
      discountProof: 'Pagamax must not recommend this as a QR discount path.',
    },
  },
  {
    match: (promo) => includesAny(promo.merchant_name, ['McDonald']) && isNaranjaIssuer(promo),
    applies: {
      confidence: 'high',
      targetKind: 'negative_control',
      legalRouteSummary: 'Source terms for McDonalds AMBA say wallet/QR platform payments are excluded.',
      sourceFactIds: ['naranjax-promos-amba-june-2026'],
      lowValueEligible: true,
      recommendedAmountArs: lowValueCapArs,
      blocker: 'promo_excludes_qr',
      expectedMethodId: 'naranjax-card-present',
      expectedMethodLabel: 'Naranja X physical/card-present path, not QR',
      expectedProvider: 'naranjax',
      expectedRail: 'card',
      expectedWalletLabel: 'Naranja X',
      discountProof: 'Pagamax must not claim a QR discount for this promo.',
    },
  },
];

function classify(promo) {
  const issuer = normalize(promo.issuer);
  const rail = normalize(promo.rail);
  const channel = normalize(promo.channel);
  const instrument = normalize(promo.instrument_required);
  const wallet = normalize(promo.wallet_scope);
  const title = normalize(`${promo.promo_title} ${promo.description_short}`);
  const merchant = normalize(promo.merchant_name);

  const isNaranjaOwned = isNaranjaIssuer(promo);
  const walletScopeIncludesNaranjaX = wallet.includes('naranjax') || wallet.includes('naranja x');
  const explicitQr = rail === 'qr' || instrument.includes('qr') || title.includes('qr');
  const likelyCheckoutQr = channel.includes('in-store') || channel.includes('mixed') || explicitQr;
  const lowValueLikely = includesAny(merchant, COMMON_LOW_VALUE_MERCHANTS) || ['Supermercados', 'Farmacia', 'Combustible', 'Gastronomia', 'Salud'].some((category) => normalize(promo.category) === normalize(category));
  const noMin = promo.min_purchase_ars == null || Number(promo.min_purchase_ars) <= lowValueCapArs;
  const todayEligible = dayMatches(promo.day_pattern);
  const excludesQr = hasQrExclusion(promo) || rail === 'nfc';

  let targetKind = 'discover_real_qr';
  let confidence = 'medium';
  let qrSource = 'merchant checkout QR';
  let paymentInstruction = 'Scan the merchant QR in Pagamax, then manually scan/pay in the selected wallet.';

  if (isNaranjaOwned && explicitQr) {
    targetKind = 'naranjax_issuer_qr';
    confidence = 'high';
    paymentInstruction = 'Use Naranja X as payer; this promo explicitly exposes QR language.';
  } else if (isNaranjaOwned && likelyCheckoutQr) {
    targetKind = 'naranjax_possible_checkout';
    confidence = 'medium';
    paymentInstruction = 'Use Naranja X only if the final Naranja X review screen shows the expected instrument/promo.';
  } else if (!isNaranjaOwned && walletScopeIncludesNaranjaX && explicitQr) {
    targetKind = 'modo_wallet_scope_naranjax';
    confidence = 'medium';
    paymentInstruction = 'Validate Naranja X as an interoperable scanner, but do not count the promo as Naranja X-owned unless the payer app confirms it.';
  } else if (explicitQr) {
    targetKind = 'non_nx_control';
    confidence = 'medium';
    paymentInstruction = 'Use this to validate QR parsing and ranking breadth; the discount owner is not Naranja X.';
  }

  if (excludesQr) {
    targetKind = 'negative_control';
    confidence = 'high';
    paymentInstruction = 'Scan if useful, but Pagamax must not present this as a QR promo path.';
  }

  if (channel.includes('online')) qrSource = 'online checkout, choose QR/MODO/Mercado Pago if offered';
  if (channel.includes('in-store')) qrSource = 'physical checkout QR';
  if (channel.includes('mixed')) qrSource = 'physical checkout QR or online checkout QR if the merchant exposes it';

  return {
    targetKind,
    confidence,
    promoIssuerIsNaranjaX: isNaranjaOwned,
    promoIssuerIsModo: issuer === 'modo',
    walletScopeIncludesNaranjaX,
    explicitQr,
    likelyCheckoutQr,
    lowValueLikely,
    noMin,
    todayEligible,
    excludesQr,
    qrSource,
    paymentInstruction,
  };
}

function sourceFacts(ids) {
  return ids.map((id) => SOURCE_FACTS.find((fact) => fact.id === id)).filter(Boolean);
}

function inferExpectedMethod(promo, meta) {
  if (meta.promoIssuerIsNaranjaX) {
    const instrument = normalize(promo.instrument_required);
    const rail = normalize(promo.rail);
    if (rail === 'qr' || instrument.includes('qr')) {
      return {
        expectedMethodId: 'naranjax-balance-qr',
        expectedProvider: 'naranjax',
        expectedMethodLabel: 'Naranja X app QR',
        expectedRail: 'qr',
        expectedWalletLabel: 'Naranja X',
      };
    }
    if (instrument.includes('credit')) {
      return {
        expectedMethodId: 'naranjax-credit-card',
        expectedProvider: 'naranjax',
        expectedMethodLabel: 'Naranja X credit card path',
        expectedRail: 'card',
        expectedWalletLabel: 'Naranja X',
      };
    }
    return {
      expectedMethodId: 'naranjax-app-or-card',
      expectedProvider: 'naranjax',
      expectedMethodLabel: 'Naranja X app/card path',
      expectedRail: promo.rail || 'unknown',
      expectedWalletLabel: 'Naranja X',
    };
  }

  const provider = normalize(promo.issuer) || 'unknown';
  return {
    expectedMethodId: `${provider}-${normalize(promo.rail || 'rail')}`,
    expectedProvider: provider,
    expectedMethodLabel: `${promo.issuer} ${promo.rail || 'unknown rail'}`,
    expectedRail: promo.rail || 'unknown',
    expectedWalletLabel: promo.wallet_scope || promo.issuer,
  };
}

function inferQrProvider(promo, meta) {
  if (meta.targetKind === 'naranjax_issuer_qr') return 'merchant checkout QR provider';
  if (meta.targetKind === 'modo_wallet_scope_naranjax') return 'MODO/interoperable merchant QR';
  if (meta.targetKind === 'non_nx_control') return `${promo.issuer} or merchant checkout QR provider`;
  return 'unknown merchant checkout QR provider';
}

function inferDiscountProof(promo, meta) {
  if (meta.targetKind === 'negative_control') return 'Pagamax should warn or avoid recommending this route for QR.';
  if (promo.discount_type === 'cashback') return 'Cashback may be delayed; record the payer review result and later movement without storing sensitive data.';
  if (promo.discount_type === 'installments') return 'Verify installment option appears before approval; do not treat it as instant cash savings.';
  return 'Verify discount/net amount on the payer app review screen before approval.';
}

function compactPromo(promo) {
  const meta = classify(promo);
  const override = KNOWN_TERM_OVERRIDES.find((entry) => entry.match(promo))?.applies ?? null;
  const method = override ?? inferExpectedMethod(promo, meta);
  const minPurchaseArs = override?.minPurchaseOverrideArs ?? promo.min_purchase_ars;
  const specificMerchant = isSpecificMerchantName(promo.merchant_name);
  const inferredBlocker = meta.excludesQr ? 'promo_excludes_qr_or_non_qr_rail' : (!specificMerchant ? 'generic_merchant_not_payable_without_specific_store' : null);
  const blocker = override?.blocker ?? inferredBlocker;
  const lowValueEligible = override?.lowValueEligible ?? (specificMerchant && !meta.excludesQr && meta.lowValueLikely && (minPurchaseArs == null || Number(minPurchaseArs) <= lowValueCapArs));
  const recommendedAmountArs = override?.recommendedAmountArs ?? (lowValueEligible ? 300 : null);
  const expectedQrProvider = override?.expectedQrProvider ?? inferQrProvider(promo, meta);
  const confidence = override?.confidence ?? meta.confidence;
  const targetKind = override?.targetKind ?? meta.targetKind;
  const routeValidation = {
    intendedRoute: 'NX -> recommended payment method -> merchant',
    promoIssuerIsNaranjaX: meta.promoIssuerIsNaranjaX,
    promoIssuerIsModo: meta.promoIssuerIsModo,
    walletScopeIncludesNaranjaX: meta.walletScopeIncludesNaranjaX,
    recommendedProviderIsNaranjaX: normalize(method.expectedProvider) === 'naranjax',
    merchantMatchesQr: null,
    amountWithinLowValueBand: recommendedAmountArs !== null && recommendedAmountArs >= 100 && recommendedAmountArs <= lowValueCapArs,
    eligibleToday: meta.todayEligible,
    pass: Boolean(lowValueEligible && !blocker && targetKind !== 'negative_control' && targetKind !== 'blocked_low_value' && recommendedAmountArs !== null),
    warnings: [
      ...(!meta.todayEligible ? ['not_eligible_today_by_day_pattern'] : []),
      ...(meta.targetKind === 'modo_wallet_scope_naranjax' ? ['naranja_is_wallet_scope_not_promo_issuer'] : []),
      ...(blocker ? [blocker] : []),
      ...(!override ? ['confirm_current_legal_terms_before_real_payment'] : []),
    ],
  };

  return {
    targetId: [
      targetKind,
      promo.promo_key,
      promo.merchant_name,
      promo.day_pattern || 'everyday',
    ].map(idPart).filter(Boolean).join('__'),
    promoKey: promo.promo_key,
    targetKind,
    merchant: promo.merchant_name,
    category: promo.category,
    issuer: promo.issuer,
    title: promo.promo_title,
    discountPercent: promo.discount_percent,
    discountAmountArs: promo.discount_amount_ars,
    installments: promo.installments_count,
    capAmountArs: promo.cap_amount_ars,
    minPurchaseArs,
    bundledMinPurchaseArs: promo.min_purchase_ars,
    dayPattern: promo.day_pattern,
    days: dayList(promo.day_pattern),
    channel: promo.channel,
    rail: promo.rail,
    instrument: promo.instrument_required,
    cardBrandScope: promo.card_brand_scope,
    cardTypeScope: promo.card_type_scope,
    walletScope: promo.wallet_scope,
    validFrom: promo.valid_from,
    validTo: promo.valid_to,
    freshnessStatus: promo.freshness_status,
    description: promo.description_short,
    lowValueEligible,
    specificMerchant,
    recommendedAmountArs,
    expectedQrProvider,
    realPaymentAllowed: routeValidation.pass && routeValidation.amountWithinLowValueBand,
    confidence,
    sourceFactIds: override?.sourceFactIds ?? [],
    sourceFacts: sourceFacts(override?.sourceFactIds ?? []),
    legalRouteSummary: override?.legalRouteSummary ?? 'No source-backed override in this script. Confirm current legal terms before spending real money.',
    blocker,
    expectedMethodId: method.expectedMethodId,
    expectedProvider: method.expectedProvider,
    expectedMethodLabel: method.expectedMethodLabel,
    expectedRail: method.expectedRail,
    expectedWalletLabel: method.expectedWalletLabel,
    requiredDays: override?.requiredDays ?? null,
    discountProof: override?.discountProof ?? inferDiscountProof(promo, meta),
    ...meta,
    targetKind,
    confidence,
    routeValidation,
    score:
      (meta.promoIssuerIsNaranjaX ? 1000 : 0)
      + (targetKind === 'naranjax_issuer_qr' ? 900 : 0)
      + (meta.explicitQr ? 500 : 0)
      + (meta.lowValueLikely ? 250 : 0)
      + (lowValueEligible ? 180 : 0)
      + (meta.todayEligible ? 80 : 0)
      - (blocker ? 2000 : 0)
      + valueScore(promo),
  };
}

function dedupeByMerchant(items, limitPerMerchant = 2) {
  const counts = new Map();
  const result = [];
  for (const item of items) {
    const key = normalize(item.merchant);
    const count = counts.get(key) ?? 0;
    if (count >= limitPerMerchant) continue;
    counts.set(key, count + 1);
    result.push(item);
  }
  return result;
}

function tableRows(items) {
  return items.map((item) => [
    item.merchant,
    item.issuer,
    item.title,
    item.dayPattern || 'everyday',
    item.channel,
    item.rail,
    item.minPurchaseArs == null ? 'none' : String(item.minPurchaseArs),
    item.recommendedAmountArs == null ? 'do not pay' : String(item.recommendedAmountArs),
    item.qrSource,
    item.expectedQrProvider,
    item.expectedMethodLabel,
    item.confidence,
    item.blocker ?? '',
  ]);
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell ?? '').replace(/\|/g, '/')).join(' | ')} |`),
  ].join('\n');
}

function buildRouteSimulations(items) {
  const seen = new Set();
  const derived = items
    .map((item) => {
      const key = `${item.targetKind}:${normalize(item.merchant)}:${normalize(item.issuer)}:${normalize(item.title)}:${item.dayPattern}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        targetId: item.targetId,
        targetKind: item.targetKind,
        merchant: {
          name: item.merchant,
          category: item.category,
          matchMethod: null,
          cuit: null,
        },
        qrTarget: {
          source: item.channel === 'online' ? 'online_checkout_qr' : 'physical_checkout_qr',
          acquisition: item.qrSource,
          expectedQrProvider: item.expectedQrProvider,
          channel: item.channel,
          rail: item.rail,
          instrumentRequired: item.instrument,
          lowValueAmountArs: item.recommendedAmountArs,
          minPurchaseArs: item.minPurchaseArs,
        },
        promo: {
          promoKey: item.promoKey,
          issuer: item.issuer,
          title: item.title,
          walletScope: item.walletScope,
          cardBrandScope: item.cardBrandScope,
          cardTypeScope: item.cardTypeScope,
          dayPattern: item.dayPattern,
          validFrom: item.validFrom,
          validTo: item.validTo,
          freshnessStatus: item.freshnessStatus,
          discountPercent: item.discountPercent,
          discountAmountArs: item.discountAmountArs,
          installments: item.installments,
          capAmountArs: item.capAmountArs,
        },
        recommendation: {
          expectedMethodId: item.expectedMethodId,
          provider: item.expectedProvider,
          label: item.expectedMethodLabel,
          rail: item.expectedRail,
          walletLabel: item.expectedWalletLabel,
          rankingScore: null,
          estimatedSavingsArs: null,
        },
        routeValidation: item.routeValidation,
        execution: {
          realPaymentAllowed: item.realPaymentAllowed,
          expectedFundingSource: 'Naranja X owner account unless this is a non-NX control',
          intendedRoute: `Naranja X -> ${item.expectedMethodLabel} -> ${item.merchant}`,
          assertions: [
            'Pagamax scans the real QR without freezing or crashing.',
            `Pagamax identifies or safely labels merchant as ${item.merchant}.`,
            `Pagamax recommendation matches expected method: ${item.expectedMethodLabel}.`,
            item.discountProof,
            'Pagamax must not claim it completed, approved, or prefilled the payment.',
          ],
          stopConditions: [
            'Stop if receiver differs from the selected merchant.',
            `Stop if amount exceeds ARS ${lowValueCapArs}.`,
            'Stop if Naranja X or the recommended wallet does not show the expected method/instrument.',
            'Stop if this row is negative-control/blocked and Pagamax recommends it as a discount path.',
          ],
        },
        blocker: item.blocker,
        confidence: item.confidence,
        legalRouteSummary: item.legalRouteSummary,
        sourceFacts: item.sourceFacts,
      };
    })
    .filter(Boolean);
  return [...CONTROLLED_CROSS_PROVIDER_CASES, ...derived].slice(0, 90);
}

function renderSimulationReport(payload) {
  const rows = payload.routeSimulations.map((route) => [
    route.targetKind,
    route.merchant.name,
    route.qrTarget.expectedQrProvider ?? '',
    route.qrTarget.lowValueAmountArs == null ? 'do not pay' : String(route.qrTarget.lowValueAmountArs),
    route.recommendation.label,
    route.execution.realPaymentAllowed ? 'yes' : 'no',
    route.promo.dayPattern || 'everyday',
    route.confidence,
    route.blocker ?? '',
  ]);

  const details = payload.routeSimulations.slice(0, 30).map((route) => `## ${route.targetId}

- Merchant: ${route.merchant.name}
- Amount: ${route.qrTarget.lowValueAmountArs == null ? 'do not pay under low-value cap' : `ARS ${route.qrTarget.lowValueAmountArs}`}
- Real payment allowed: ${route.execution.realPaymentAllowed ? 'yes' : 'no'}
- QR source: ${route.qrTarget.acquisition}
- Expected QR provider: ${route.qrTarget.expectedQrProvider ?? 'unknown'}
- Expected route: ${route.execution.intendedRoute}
- Promo: ${route.promo.issuer} / ${route.promo.title}
- Legal check: ${route.legalRouteSummary}
- Sources: ${route.sourceFacts.length ? route.sourceFacts.map((fact) => fact.source).join(', ') : 'confirm in current promo terms before payment'}
- Assertions:
${route.execution.assertions.map((assertion) => `  - ${assertion}`).join('\n')}
- Stop conditions:
${route.execution.stopConditions.map((condition) => `  - ${condition}`).join('\n')}
`).join('\n');

  return `# Real QR Purchase Simulations

Generated: ${payload.generatedAt}

Today: ${payload.today} (${payload.todayName})

This is the actionable queue for simulating low-value purchases and validating the route \`Naranja X -> recommended payment method -> merchant\`. It does not include raw QR payloads. A row marked \`Real payment allowed = no\` is a parser/routing safety test only.

## Controlled Cross-Provider Tests

Run these before promo purchases. They prove that the app handles \`Naranja X payer -> non-Naranja receiver QR\` without confusing it with a promo.

${CONTROLLED_CROSS_PROVIDER_CASES.map((route) => `- ${route.targetId}: ${route.execution.intendedRoute}, ${route.qrTarget.qrType}, ARS ${route.qrTarget.lowValueAmountArs}.`).join('\n')}

${markdownTable(['Kind', 'Merchant', 'QR provider', 'Amount ARS', 'Expected method', 'Real payment allowed', 'Days', 'Confidence', 'Blocker'], rows)}

${details}
`;
}

function main() {
  const index = JSON.parse(readFileSync(promoIndexPath, 'utf8'));
  const promos = index.promos.filter(isCurrentlyValid).map(compactPromo);

  const naranjaExplicit = dedupeByMerchant(promos
    .filter((item) => item.targetKind === 'naranjax_issuer_qr' && item.lowValueEligible && !item.blocker)
    .sort((a, b) => b.score - a.score), 3)
    .slice(0, 25);

  const naranjaLikely = dedupeByMerchant(promos
    .filter((item) => item.targetKind === 'naranjax_possible_checkout' && item.lowValueLikely && item.lowValueEligible && !item.blocker)
    .sort((a, b) => b.score - a.score), 2)
    .slice(0, 30);

  const naranjaSupportedWallet = dedupeByMerchant(promos
    .filter((item) => item.targetKind === 'modo_wallet_scope_naranjax' && item.lowValueEligible && !item.blocker)
    .sort((a, b) => b.score - a.score), 2)
    .slice(0, 30);

  const qrControls = dedupeByMerchant(promos
    .filter((item) => item.targetKind === 'non_nx_control' && item.lowValueLikely && item.lowValueEligible && !item.blocker)
    .sort((a, b) => b.score - a.score), 2)
    .slice(0, 30);

  const negativeControls = dedupeByMerchant(promos
    .filter((item) => item.targetKind === 'negative_control' || item.targetKind === 'blocked_low_value' || item.blocker)
    .sort((a, b) => b.score - a.score), 1)
    .slice(0, 20);

  const todays = dedupeByMerchant(promos
    .filter((item) => item.todayEligible && item.likelyCheckoutQr && item.lowValueLikely && item.lowValueEligible && !item.blocker)
    .sort((a, b) => b.score - a.score), 2)
    .slice(0, 35);

  const routeSimulations = buildRouteSimulations([
    ...naranjaExplicit,
    ...naranjaLikely,
    ...naranjaSupportedWallet,
    ...qrControls,
    ...negativeControls,
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: promoIndexPath,
    promoGeneratedAt: index.generated_at,
    today: currentIsoDate,
    todayName,
    lowValueCapArs,
    sourceFacts: SOURCE_FACTS,
    counts: {
      activePromos: promos.length,
      naranjaExplicitQr: naranjaExplicit.length,
      naranjaLikelyCheckoutQr: naranjaLikely.length,
      naranjaSupportedWallet: naranjaSupportedWallet.length,
      qrControls: qrControls.length,
      negativeControls: negativeControls.length,
      todays: todays.length,
      routeSimulations: routeSimulations.length,
    },
    naranjaExplicit,
    naranjaLikely,
    naranjaSupportedWallet,
    qrControls,
    negativeControls,
    todays,
    routeSimulations,
  };

  const headers = ['Merchant', 'Issuer', 'Promo', 'Days', 'Channel', 'Rail', 'Min ARS', 'Test ARS', 'Where QR comes from', 'QR provider', 'Expected method', 'Confidence', 'Blocker'];
  const markdown = `# Real QR Test Targets

Generated: ${payload.generatedAt}

Promo data generated: ${index.generated_at}

Today: ${currentIsoDate} (${todayName})

This report does not contain payable QR payloads. It identifies real merchants and checkout paths where a payable QR can be obtained legally: physical checkout, online checkout, or a controlled receiver wallet. Use the ARS 100-500 cap from \`docs/real-low-value-qr-testing.md\`.

## Source Facts

${SOURCE_FACTS.map((fact) => `- ${fact.summary} Source: ${fact.source}`).join('\n')}

## Best Naranja X Explicit QR Targets

These are the highest-confidence paths because the promo data explicitly says Naranja X and QR/QR-wallet.

${naranjaExplicit.length ? markdownTable(headers, tableRows(naranjaExplicit)) : 'No explicit Naranja X QR targets found in the current promo data.'}

## Naranja X Likely Checkout Targets

These are useful for testing Naranja X as payer at checkout, but only count the discount if Naranja X's final review screen confirms the expected instrument/promo.

${naranjaLikely.length ? markdownTable(headers, tableRows(naranjaLikely)) : 'No likely Naranja X checkout targets found.'}

## QR Targets Where Naranja X Is Only A Supported Wallet

These validate that Naranja X can scan a real interoperable QR. Do not count the promo as an Naranja X discount unless Naranja X itself confirms the benefit.

${naranjaSupportedWallet.length ? markdownTable(headers, tableRows(naranjaSupportedWallet)) : 'No cross-wallet Naranja X QR targets found.'}

## Non-Naranja QR Control Targets

Use these to test parser/ranking/handoff breadth. They are real QR paths, but the discount owner is not Naranja X.

${qrControls.length ? markdownTable(headers, tableRows(qrControls)) : 'No QR control targets found.'}

## Negative Controls And Blocked Low-Value Targets

These are intentionally included to make sure Pagamax does not recommend a promo path that is excluded, not QR, or above the ARS 100-500 cap.

${negativeControls.length ? markdownTable(headers, tableRows(negativeControls)) : 'No negative controls found.'}

## Best Targets For Today

These match today's day pattern and are likely low-value QR tests.

${todays.length ? markdownTable(headers, tableRows(todays)) : 'No today-specific targets found.'}

## How To Execute One Target

1. Pick one row from \`reports/real-qr-purchase-simulations.md\` where \`Real payment allowed = yes\`.
2. Create a run:

\`\`\`bash
npm run qr:real:new -- store 100 "<merchant from row>" dynamic_amount_closed
\`\`\`

3. Get the payable QR from the row's \`Where QR comes from\` path.
4. Scan it in Pagamax first.
5. If Naranja X is recommended or relevant, open Naranja X and manually scan the same QR.
6. Approve only if receiver and amount match and the amount is ARS 100-500.
7. Record structured checkpoints with \`npm run qr:real:checkpoint\`.
`;

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(reportPath, markdown);
  writeFileSync(simulationReportPath, renderSimulationReport(payload));
  console.log(`Wrote ${reportPath}`);
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${simulationReportPath}`);
  console.log(JSON.stringify(payload.counts, null, 2));
}

main();
