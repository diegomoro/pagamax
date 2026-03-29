/**
 * normalize.ts — CarrefourRawPromo → CarrefourPromo
 */

import type { CarrefourRawPromo, CarrefourPromo } from './types.js';

let _seq = 0;

export function normalize(raw: CarrefourRawPromo, scrapedAt: string): CarrefourPromo {
  const seq = ++_seq;
  // Stable ID: card type + day hash so re-scrapes produce consistent promo_keys
  const cardKey = raw.card === 'unknown' ? 'mc' : raw.card.slice(0, 3);
  const pctKey  = raw.discount_percent ?? raw.installments_count ?? 'x';
  const dayKey  = raw.days_of_week.replace(/[^a-z]/gi, '-').slice(0, 20);
  const ageKey  = raw.age_restriction ? `-${raw.age_restriction.replace(/[^0-9+\-]/g, '')}` : '';
  const source_id = `cf-${cardKey}-${pctKey}-${dayKey}${ageKey}-${seq}`;

  return {
    source_id,
    issuer: 'carrefour_bank',

    promo_title:       raw.title,
    merchant_name:     raw.merchant_name,
    category:          raw.category,
    description_short: raw.description,
    card_label:        raw.card_label,

    discount_type:     raw.discount_type,
    discount_percent:  raw.discount_percent,
    installments_count: raw.installments_count,
    cap_amount_ars:    raw.cap_amount_ars,
    cap_period:        raw.cap_period,
    age_restriction:   raw.age_restriction,

    day_pattern:       raw.days_of_week,
    channel:           raw.channel,
    valid_from:        raw.valid_from,
    valid_to:          raw.valid_to,

    rail:                raw.rail,
    instrument_required: raw.instrument_required,
    wallet_scope:        'Tarjeta Mi Carrefour',

    terms_text_raw:    raw.terms_text_raw,
    is_static_fallback: raw.is_static_fallback,
    scraped_at:        scrapedAt,
  };
}
