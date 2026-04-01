export interface PromoSummary {
  promo_key: string;
  issuer: string;
  merchant_name: string;
  category: string;
  discount_type: string;
  discount_percent: number | null;
  discount_amount_ars: number | null;
  installments_count: number | null;
  cap_amount_ars: number | null;
  cap_period: string;
  min_purchase_ars: number | null;
  day_pattern: string;
  channel: string;
  rail: string;
  instrument_required: string;
  card_brand_scope: string;
  card_type_scope: string;
  wallet_scope: string;
  valid_from: string;
  valid_to: string;
  freshness_status: string;
  promo_title: string;
  description_short: string;
}

export interface PromoIndexStats {
  total_rows: number;
  active_rows: number;
  indexed: number;
  no_merchant: number;
  general_promos: number;
  cuits_with_promos: number;
  names_with_promos: number;
  categories_with_promos: number;
  total_unique_promos: number;
}

export interface PromoIndex {
  generated_at?: string;
  source?: string;
  stats?: PromoIndexStats;
  promos: PromoSummary[];
  by_cuit: Record<string, number[]>;
  by_name: Record<string, number[]>;
  by_category: Record<string, number[]>;
  general: number[];
  cuit_to_name: Record<string, string>;
  mcc_to_category: Record<string, string>;
}

export type MatchMethod = 'cuit' | 'name_exact' | 'name_fuzzy' | 'name_prefix' | 'mcc' | 'none';

export interface MatchOptions {
  today?: string;
  issuer?: string;
  cardBrand?: string;
  cardType?: string;
  rail?: string;
  allIssuers?: boolean;
}

export interface PromoMatch extends PromoSummary {
  match_reason: string;
  relevance_score: number;
}

export interface IssuerGroup {
  issuer: string;
  promos: PromoMatch[];
  best_discount_percent: number | null;
}

export interface MatchResult {
  match_method: MatchMethod;
  cuit: string | null;
  merchant_name: string;
  qr: {
    cuit: string | null;
    name: string | null;
    mcc: string | null;
    city: string | null;
    cbu: string | null;
    amount_ars: number | null;
  };
  promos: PromoMatch[];
  general_promos: PromoMatch[];
  by_issuer: IssuerGroup[];
  total_unfiltered: number;
  filters_applied: string[];
  aggregator_qr: boolean;
}

export type PaymentRail = 'qr' | 'nfc' | 'card' | 'online';
export type FundingType = 'credit' | 'debit' | 'prepaid' | 'account_money';

export interface PaymentMethodProfile {
  id: string;
  provider: string;
  label: string;
  rail: PaymentRail;
  walletLabel?: string;
  cardBrand?: string;
  cardType?: FundingType;
}

export interface PromoCandidate {
  promo: PromoSummary;
  source: 'merchant' | 'general';
}

export interface RecommendationInput {
  amountArs: number;
  methods: PaymentMethodProfile[];
  candidates: PromoCandidate[];
  topN?: number;
}

export interface PaymentRecommendation {
  method: PaymentMethodProfile;
  promo: PromoSummary;
  source: 'merchant' | 'general';
  valueType: 'discount' | 'cashback' | 'financing_estimate';
  estimatedSavingsArs: number;
  estimatedNetPaymentArs: number;
  rankingScore: number;
  reasons: string[];
  warnings: string[];
}
