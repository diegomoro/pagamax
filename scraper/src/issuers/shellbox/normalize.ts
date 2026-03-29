/**
 * normalize.ts — ShellboxRawPromo → ShellboxPromo
 */

import type { ShellboxRawPromo, ShellboxPromo } from './types.js';

let _seq = 0;

export function normalize(raw: ShellboxRawPromo, scrapedAt: string): ShellboxPromo {
  const seq = ++_seq;
  const source_id = `shellbox-${raw.source}-${seq}`;

  return {
    source_id,
    issuer: 'shellbox',

    promo_title:      raw.title,
    merchant_name:    raw.merchant_name,
    category:         raw.category,
    description_short: raw.description,

    discount_type:    raw.discount_type,
    discount_percent: raw.discount_percent,
    cap_amount_ars:   raw.cap_amount_ars,
    cap_period:       raw.cap_period,

    day_pattern:      raw.days_of_week,
    valid_from:       raw.valid_from,
    valid_to:         raw.valid_to,

    rail:               'qr',
    instrument_required: 'qr_wallet',
    wallet_scope:       'Shell Box',

    terms_text_raw:    raw.terms_text_raw,
    is_static_fallback: raw.is_static_fallback,
    scraped_at:        scrapedAt,
  };
}
