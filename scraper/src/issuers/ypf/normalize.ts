/**
 * normalize.ts — YpfRawPromo → YpfPromo
 */

import type { YpfRawPromo, YpfPromo } from './types.js';

let _seq = 0;

export function normalize(raw: YpfRawPromo, scrapedAt: string): YpfPromo {
  const seq = ++_seq;
  const source_id = `ypf-${raw.source}-${seq}`;

  return {
    source_id,
    issuer: 'ypf',

    promo_title:     raw.title,
    merchant_name:   raw.merchant_name,
    category:        raw.category,
    description_short: raw.description,

    discount_type:   raw.discount_type,
    discount_percent: raw.discount_percent,
    cap_amount_ars:  raw.cap_amount_ars,
    cap_period:      raw.cap_period,

    day_pattern:     raw.days_of_week,
    valid_from:      raw.valid_from,
    valid_to:        raw.valid_to,

    rail:              raw.rail,
    instrument_required: 'qr_wallet',
    wallet_scope:    'YPF App',

    terms_text_raw:  raw.terms_text_raw,
    is_static_fallback: raw.is_static_fallback,
    scraped_at:      scrapedAt,
  };
}
