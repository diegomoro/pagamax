/**
 * types.ts — Mercado Pago Benefits Hub scraper types
 */

export interface MpListItem {
  id: string;
  title: string;
  description: string;
  tracking: {
    id: string;
    name: string;
    description: string;
    traffic_from: string;
    type: string[];
  };
  deeplink: string;
  data?: {
    data?: {
      brand_name?: string;
      logo?: { primary?: string[] };
      pill?: { icon?: string; primary?: string };
      footer?: unknown;
      banner?: unknown;
      category?: { id?: string; description?: string };
      vdp_type?: string;
      meli_plus?: boolean;
    };
  };
}

export interface MpListResponse {
  benefits: MpListItem[];
  total: number;
  hasNextPage: boolean;
}

export interface MpVdpDay {
  id: number;   // 1=Mon…6=Sat, 7=Sun
  label: string;
  enabled: boolean;
}

export interface MpVdpResponse {
  seller?: {
    logo?: string;
    minilogo?: string;
    brand_id?: string;
    category?: string;
    name?: string;
  };
  discount?: {
    value?: string;
    suffix?: string;
    description?: string;
    available_days?: {
      label?: string;
      days?: MpVdpDay[];
    };
    link?: {
      text?: string;
      cta?: string;
      type?: string;
      tracking?: {
        event_data?: {
          flow?: { flow_type?: string; flow_subtype?: string };
          benefit?: { benefit_type?: string; benefit_id?: string };
          payment_method?: Array<{ payment_id?: string }>;
          meli_plus?: boolean;
        };
      };
    };
    type?: string;
  };
  payment_methods?: {
    title?: string;
    methods?: Array<{ id?: string; icon?: string; title?: string }>;
  };
  additional_info?: {
    title?: string;
    disclaimer?: string;
    conditions?: string[];
    link?: {
      text?: string;
      type?: string;
      cta?: string;
    };
  };
  tracking?: {
    event_data?: {
      flow?: { flow_type?: string; flow_subtype?: string };
      benefit?: { benefit_type?: string };
      meli_plus?: boolean;
    };
  };
}

export interface MpRawBenefit {
  listItem: MpListItem;
  vdp?: MpVdpResponse;
  tycHtml?: string;
  vdpError?: string;
  tycError?: string;
}

export interface MpPromo {
  source_id: string;
  issuer: string;
  promo_title: string;
  merchant_name: string;
  merchant_logo_url: string;
  category: string;
  channel_label: string;
  vdp_type: string;
  is_meli_plus: boolean;
  benefit_type: string;
  discount_type: string;       // "direct_discount" | "installments"
  discount_percent: number | null;
  installments: number | null;
  installment_type: string;
  cap_amount_ars: number | null; // null = sin tope (no cap)
  min_purchase_ars: number | null;
  payment_description: string;
  days_of_week: string;
  flow_type: string;
  flow_subtype: string;
  allowed_rails: string;
  payment_methods_str: string;
  disclaimer: string;
  store_locator_url: string;
  tyc_url: string;
  valid_from: string;
  valid_to: string;
  terms_text_raw: string;
  is_active: boolean;
  is_stale: boolean;
  freshness_reason: string;
  scraped_at: string;
}
