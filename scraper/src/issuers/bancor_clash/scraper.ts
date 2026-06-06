import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { load } from 'cheerio';

const TODAY = process.env.TODAY ?? '2026-06-05';
const SCRAPED_AT = new Date().toISOString();

const CANONICAL_COLS = [
  'promo_key',
  'source_id',
  'issuer',
  'source_url',
  'promo_title',
  'merchant_name',
  'merchant_logo_url',
  'category',
  'subcategory',
  'description_short',
  'discount_type',
  'discount_percent',
  'discount_amount_ars',
  'installments_count',
  'cap_amount_ars',
  'cap_period',
  'min_purchase_ars',
  'valid_from',
  'valid_to',
  'validity_text_raw',
  'day_pattern',
  'channel',
  'rail',
  'instrument_required',
  'card_brand_scope',
  'card_type_scope',
  'wallet_scope',
  'geo_scope',
  'coupon_code',
  'reimbursement_timing_raw',
  'freshness_status',
  'freshness_reason',
  'data_quality_score',
  'issuer_reliability',
  'routing_confidence',
  'potential_value_ars',
  'routing_ltv',
  'terms_text_raw',
  'exclusions_raw',
  'excluded_rails',
  'scraped_at',
  'raw_snippet',
] as const;

type CanonicalRow = Record<(typeof CANONICAL_COLS)[number], string | number | null>;

const BANCOR_QUERY = `query PromocionesQuery($dias: String, $rubro: String, $page: Int, $limit: Int, $word: String, $tarjCreditos: String, $tarjDebitos: String, $tarjPrepagas: String, $provincias: String, $localidades: String, $idEfemeride: String, $mostrarDestacada: Boolean) {
  tarjetasDePromociones(dias: $dias, rubro: $rubro, page: $page, limit: $limit, word: $word, tarjCreditos: $tarjCreditos, tarjDebitos: $tarjDebitos, tarjPrepagas: $tarjPrepagas, provincias: $provincias, localidades: $localidades, idEfemeride: $idEfemeride, mostrarDestacada: $mostrarDestacada) {
    nodes {
      DEBITO
      CREDITO
      PREPAGA
      localidades
      provincias
      campana
      descripcion_campana
      dias
      empresa
      empresaId
      efemerides { nombre icono idEfemeride }
      id
      promoId
      rubro
      rubroId
      eima
      eimaDesc
      eimaDescMobile
      color
      tipoPromocion
      eventoCtaTexto
      eventoNombre
      eventosList
      eventoURLbtn
      cropImagenEvento
      comerciosAdheridos { d i lat locId lon locNa n prN prC }
    }
    pageInfo { currentPage hasNextPage hasPreviousPage itemCount pageCount perPage totalCount }
  }
}`;

const CLASH_CATEGORIES: Array<[string, string]> = [
  ['supermercados', 'Supermercados'],
  ['combustibles', 'Combustible'],
  ['gastronomia', 'Gastronomía'],
  ['farmacias', 'Farmacia'],
  ['transportes', 'Transporte'],
];

function normalizeText(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToText(value: unknown): string {
  if (!value) return '';
  const $ = load(String(value));
  return normalizeText($.text());
}

function parseMoney(value: unknown): number | null {
  const text = normalizeText(value);
  const match = text.match(/\$?\s*([0-9]{1,3}(?:[.\s][0-9]{3})+|[0-9]+)(?:,\d+)?/);
  if (!match) return null;
  return Number(match[1]!.replace(/[.\s]/g, ''));
}

function extractPercent(text: string): number | null {
  const match = normalizeText(text).match(/(\d{1,3})\s*%/);
  return match ? Number(match[1]) : null;
}

function extractInstallments(text: string): number | null {
  const matches = [...normalizeText(text).matchAll(/(\d{1,2})\s*(?:cuotas?|sin\s+inter[eé]s)/gi)];
  if (!matches.length) return null;
  return Math.max(...matches.map((m) => Number(m[1])));
}

function extractMinPurchase(text: string): number | null {
  const normalized = normalizeText(text);
  const match = normalized.match(/(?:compra|consumo|monto)\s+m[ií]nim[oa][^$]{0,40}\$?\s*([0-9][0-9.\s]*)/i);
  return match ? Number(match[1]!.replace(/[.\s]/g, '')) : null;
}

function capPeriod(text: string): string {
  const lower = normalizeText(text).toLowerCase();
  if (/por compra|por operaci[oó]n|por transacci[oó]n/.test(lower)) return 'per_transaction';
  if (/semana|semanal/.test(lower)) return 'weekly';
  if (/mes|mensual|cuenta x mes|cuenta por mes/.test(lower)) return 'monthly';
  if (/d[ií]a|diario/.test(lower)) return 'daily';
  return '';
}

function dateOnly(value: unknown): string {
  if (!value) return '';
  const text = String(value);
  const iso = text.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const dmy = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : '';
}

function freshness(validFrom: string, validTo: string): [string, string] {
  if (validFrom && validFrom > TODAY) return ['future', `starts ${validFrom}`];
  if (validTo && validTo < TODAY) return ['expired', `ended ${validTo}`];
  if (validFrom || validTo) return ['active', validTo ? `valid through ${validTo}` : `valid from ${validFrom}`];
  return ['unknown', 'no explicit validity date found'];
}

function category(raw: string): string {
  const lower = normalizeText(raw).toLowerCase();
  if (/gastro|restaurant|comida|bar|caf[eé]/.test(lower)) return 'Gastronomía';
  if (/super|mercado|mayorista/.test(lower)) return 'Supermercados';
  if (/farma|perfumer/.test(lower)) return 'Farmacia';
  if (/combust|estaci[oó]n|nafta/.test(lower)) return 'Combustible';
  if (/electro|tecnolog|celular|inform[aá]tica/.test(lower)) return 'Tecnología';
  if (/viaje|turismo|hotel|a[eé]reo/.test(lower)) return 'Viajes';
  if (/educaci[oó]n|curso|univers/.test(lower)) return 'Educación';
  if (/indumentaria|moda|ropa|calzado/.test(lower)) return 'Indumentaria';
  if (/transporte|colectivo|sube|taxi|remis/.test(lower)) return 'Transporte';
  return raw || 'Otro';
}

function dayPatternFromFlags(flags: Array<boolean | number | undefined>): string {
  const names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const active = flags.map(Boolean).map((ok, i) => (ok ? names[i] : '')).filter(Boolean);
  if (active.length === 7) return 'everyday';
  return active.join('; ');
}

function dayPatternFromMask(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return dayPatternFromFlags([1, 2, 4, 8, 16, 32, 64].map((bit) => (n & bit) > 0));
}

function inferDiscountType(text: string, pct: number | null, installments: number | null): string {
  const lower = normalizeText(text).toLowerCase();
  if (installments && (!pct || /cuotas|sin inter[eé]s/.test(lower))) return pct ? 'cashback' : 'installments';
  if (/reintegro|cashback|modo|cuenta dni/.test(lower)) return 'cashback';
  if (pct) return 'direct_discount';
  return 'unknown';
}

function inferChannel(text: string): string {
  const lower = normalizeText(text).toLowerCase();
  const online = /online|web|app|e-?commerce|tienda/.test(lower);
  const store = /presencial|sucursal|local|comercio adherido/.test(lower);
  if (online && store) return 'mixed';
  if (online) return 'online';
  if (store) return 'in-store';
  return 'unknown';
}

function bancorChannel(value: string): string {
  if (value === 'ONLINE_PRESENCIAL') return 'mixed';
  if (value === 'ONLINE') return 'online';
  if (value === 'PRESENCIAL') return 'in-store';
  return 'unknown';
}

function joinedGeo(stores: Array<Record<string, unknown>> | undefined): string {
  const values = new Set<string>();
  for (const store of stores ?? []) {
    const province = normalizeText(store.prN);
    if (province) values.add(province);
  }
  if (!values.size) return '';
  if (values.size > 6) return 'Varias provincias';
  return [...values].sort().join('; ');
}

function instrumentFromBancor(card: Record<string, unknown>, detail?: Record<string, unknown>): [string, string] {
  const types = new Set<string>();
  if (card.CREDITO || detail?.todas_credito) types.add('credit');
  if (card.DEBITO || detail?.todas_debito) types.add('debit');
  if (card.PREPAGA || detail?.todas_prepagas) types.add('prepaid');
  const detailCards = (detail?.relationships as any)?.tarjetas ?? [];
  for (const item of detailCards) {
    const type = normalizeText(item.tipo_tarjeta).toLowerCase();
    if (type.includes('credito')) types.add('credit');
    if (type.includes('debito')) types.add('debit');
    if (type.includes('prepaga')) types.add('prepaid');
  }
  if (types.size > 1) return ['any', [...types].join('; ')];
  if (types.has('credit')) return ['credit_card', 'credit'];
  if (types.has('debit')) return ['debit_card', 'debit'];
  if (types.has('prepaid')) return ['prepaid_card', 'prepaid'];
  return ['unknown', ''];
}

function inferClashInstrument(cards: string[] = [], note = '', ref = ''): [string, string, string, string] {
  const all = `${cards.join(' ')} ${note} ${ref}`.toLowerCase();
  const hasModo = all.includes('modo');
  const hasDebit = /debito|d[eé]bito/.test(all);
  const hasCredit = /credito|cr[eé]dito/.test(all) || /visa internacional|mastercard internacional/.test(all);
  const hasNfc = /nfc|apple pay|google pay/.test(all);
  const brands = [
    all.includes('visa') ? 'Visa' : '',
    all.includes('mastercard') ? 'Mastercard' : '',
    all.includes('amex') || all.includes('american') ? 'Amex' : '',
    hasModo ? 'MODO' : '',
  ].filter(Boolean);
  let instrument = 'unknown';
  let cardType = '';
  if (hasModo && !hasCredit && !hasDebit) instrument = 'qr_wallet';
  else if (hasCredit && hasDebit) {
    instrument = 'any';
    cardType = 'credit; debit';
  } else if (hasCredit) {
    instrument = 'credit_card';
    cardType = 'credit';
  } else if (hasDebit) {
    instrument = 'debit_card';
    cardType = 'debit';
  } else if (hasModo) {
    instrument = 'qr_wallet';
  }
  const rail = hasNfc ? 'nfc' : hasModo ? 'qr' : 'card';
  return [instrument, cardType, brands.join('; '), rail];
}

function quality(row: CanonicalRow, base: number): number {
  let score = base;
  if (row.discount_percent || row.installments_count) score += 0.08;
  if (row.cap_amount_ars) score += 0.05;
  if (row.valid_to) score += 0.08;
  if (row.day_pattern) score += 0.05;
  if (row.instrument_required !== 'unknown') score += 0.05;
  if (row.terms_text_raw) score += 0.04;
  return Math.min(0.95, Number(score.toFixed(2)));
}

function valueScore(percent: number | null, cap: number | null, installments: number | null): number | null {
  if (cap) return cap;
  if (percent) return Math.round((percent / 100) * 30000);
  if (installments) return Math.round(Math.min(installments, 12) * 250);
  return null;
}

function baseRow(values: Partial<CanonicalRow>): CanonicalRow {
  const row = Object.fromEntries(CANONICAL_COLS.map((c) => [c, ''])) as CanonicalRow;
  for (const col of CANONICAL_COLS) row[col] = values[col] ?? '';
  row.discount_percent = values.discount_percent ?? null;
  row.discount_amount_ars = values.discount_amount_ars ?? null;
  row.installments_count = values.installments_count ?? null;
  row.cap_amount_ars = values.cap_amount_ars ?? null;
  row.min_purchase_ars = values.min_purchase_ars ?? null;
  row.potential_value_ars = values.potential_value_ars ?? null;
  row.routing_ltv = values.routing_ltv ?? null;
  row.scraped_at = SCRAPED_AT;
  return row;
}

async function fetchBancorPage(page: number): Promise<any> {
  const variables = {
    dias: null,
    rubro: null,
    page,
    limit: 12,
    word: null,
    tarjCreditos: null,
    tarjDebitos: null,
    tarjPrepagas: null,
    provincias: null,
    localidades: null,
    idEfemeride: null,
    mostrarDestacada: false,
  };
  const res = await fetch('https://apollo.bancor.com.ar/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://www.bancor.com.ar',
      referer: 'https://www.bancor.com.ar/promociones/',
      'user-agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ operationName: 'PromocionesQuery', variables, query: BANCOR_QUERY }),
  });
  if (!res.ok) throw new Error(`Bancor GraphQL page ${page} returned ${res.status}: ${await res.text()}`);
  const body = await res.json() as any;
  if (body.errors?.length) throw new Error(`Bancor GraphQL page ${page} errors: ${JSON.stringify(body.errors)}`);
  return body.data.tarjetasDePromociones;
}

async function scrapeBancor(): Promise<CanonicalRow[]> {
  const pageDataRaw = await fs.readFile('../tmp/scrape_sources/bancor-page-data.json', 'utf8').catch(() => '');
  const pageData = pageDataRaw ? JSON.parse(pageDataRaw) : null;
  const details = pageData?.result?.pageContext?.promocionesData ?? [];
  const detailByPromoId = new Map<string, Record<string, unknown>>();
  for (const detail of details) detailByPromoId.set(String(detail.drupal_internal__id), detail);

  const first = await fetchBancorPage(1);
  const cards = [...first.nodes];
  for (let page = 2; page <= first.pageInfo.pageCount; page += 1) {
    const result = await fetchBancorPage(page);
    cards.push(...result.nodes);
  }

  const seen = new Set<string>();
  const rows: CanonicalRow[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    const detail = detailByPromoId.get(String(card.promoId));
    const terms = htmlToText((detail?.descripcion_legal as any)?.value);
    const description = htmlToText((detail?.d as any)?.value) || normalizeText(card.descripcion_campana);
    const text = [card.campana, description, terms].join(' ');
    const pct = extractPercent(text);
    const installments = extractInstallments(`${card.campana} ${description} ${normalizeText(detail?.s)}`) ?? ((detail?.cuotas as number[] | undefined)?.[0] ?? null);
    const cap = parseMoney(detail?.tope_reintegro) ?? parseMoney(text.match(/tope[^.]{0,80}/i)?.[0]);
    const validFrom = dateOnly(detail?.fecha_inicio ?? card.inicio);
    const validTo = dateOnly(detail?.fecha_fin);
    const [freshStatus, freshReason] = freshness(validFrom, validTo);
    const [instrument, cardType] = instrumentFromBancor(card, detail);
    const dayPattern = detail
      ? dayPatternFromFlags([
          detail.lunes as boolean,
          detail.martes as boolean,
          detail.miercoles as boolean,
          detail.jueves as boolean,
          detail.viernes as boolean,
          detail.sabado as boolean,
          detail.domingo as boolean,
        ])
      : dayPatternFromMask(card.dias);
    const sourceUrl = (detail as any)?.path?.alias ? `https://www.bancor.com.ar${(detail as any).path.alias}` : 'https://www.bancor.com.ar/promociones/';
    const row = baseRow({
      promo_key: `bancor-${card.id}`,
      source_id: card.id,
      issuer: 'bancor',
      source_url: sourceUrl,
      promo_title: normalizeText(detail?.s) || normalizeText(card.campana),
      merchant_name: normalizeText(card.empresa || detail?.t),
      merchant_logo_url: card.eima ? `https://www.bancor.com.ar${card.eima}` : '',
      category: category(normalizeText(card.rubro || (detail as any)?.relationships?.rubro?.[0]?.nombre)),
      subcategory: normalizeText(card.rubro),
      description_short: description,
      discount_type: inferDiscountType(text, pct, installments),
      discount_percent: pct,
      discount_amount_ars: null,
      installments_count: installments,
      cap_amount_ars: cap,
      cap_period: capPeriod(text),
      min_purchase_ars: extractMinPurchase(text),
      valid_from: validFrom,
      valid_to: validTo,
      validity_text_raw: validFrom || validTo ? `${validFrom} - ${validTo}` : '',
      day_pattern: dayPattern,
      channel: bancorChannel(normalizeText(detail?.alcance_promocion)) !== 'unknown' ? bancorChannel(normalizeText(detail?.alcance_promocion)) : inferChannel(text),
      rail: 'card',
      instrument_required: instrument,
      card_brand_scope: 'Cordobesa',
      card_type_scope: cardType,
      wallet_scope: '',
      geo_scope: joinedGeo(card.comerciosAdheridos),
      coupon_code: '',
      reimbursement_timing_raw: /reintegro/i.test(text) ? normalizeText(text.match(/reintegro[^.]{0,120}/i)?.[0]) : '',
      freshness_status: freshStatus,
      freshness_reason: freshReason,
      issuer_reliability: detail ? 0.64 : 0.54,
      terms_text_raw: terms,
      exclusions_raw: '',
      excluded_rails: '',
      raw_snippet: JSON.stringify({ card, detail: detail ?? null }).slice(0, 8000),
    });
    row.data_quality_score = quality(row, detail ? 0.55 : 0.4);
    row.routing_confidence = Number((Number(row.data_quality_score) * Number(row.issuer_reliability) * (freshStatus === 'active' ? 1 : freshStatus === 'unknown' ? 0.75 : 0.2)).toFixed(2));
    row.potential_value_ars = valueScore(pct, cap, installments);
    row.routing_ltv = row.potential_value_ars == null ? null : Math.round(Number(row.potential_value_ars) * Number(row.routing_confidence));
    rows.push(row);
  }
  return rows;
}

async function loadClashData(categorySlug: string): Promise<any> {
  const url = `https://promos.clash.com.ar/${categorySlug}/data.js`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Clash ${categorySlug} returned ${res.status}`);
  const text = await res.text();
  await fs.mkdir('../tmp/scrape_sources/clash', { recursive: true });
  await fs.writeFile(`../tmp/scrape_sources/clash/${categorySlug}-data.js`, text);
  const context = { window: {} as any };
  vm.runInNewContext(text, context, { timeout: 5000 });
  return context.window.__clashData;
}

async function scrapeClash(): Promise<CanonicalRow[]> {
  const rows: CanonicalRow[] = [];
  const seen = new Set<string>();
  for (const [slug, cat] of CLASH_CATEGORIES) {
    const data = await loadClashData(slug);
    const banks = new Map((data.banks ?? []).map((b: any) => [b.id, b]));
    const merchants = new Map((data.merchants ?? []).map((m: any) => [m.id, m]));
    const validFrom = dateOnly(data.updatedAt);
    for (const promo of data.P ?? []) {
      const bank: any = banks.get(promo.bk);
      const merchant: any = merchants.get(promo.mc);
      const sourceId = `${slug}-${promo.id}`;
      if (seen.has(sourceId)) continue;
      seen.add(sourceId);
      const ref = normalizeText(promo._ref);
      const note = normalizeText(promo.note);
      const text = [promo.d ? `${promo.d}%` : '', promo.inst, promo.cap, promo.fr, note, ref].filter(Boolean).join(' ');
      const pct = typeof promo.d === 'number' ? promo.d : extractPercent(text);
      const installments = extractInstallments(`${promo.inst ?? ''} ${ref}`);
      const cap = parseMoney(promo.cap) ?? parseMoney(ref.match(/tope[^.]{0,80}/i)?.[0]);
      const period = capPeriod(`${promo.fr ?? ''} ${ref}`);
      const [instrument, cardType, cardBrand, rail] = inferClashInstrument(promo.cards ?? [], note, ref);
      const row = baseRow({
        promo_key: `clash-${sourceId}`,
        source_id: sourceId,
        issuer: 'clash',
        source_url: `https://promos.clash.com.ar/${slug}/`,
        promo_title: promo.inst ? normalizeText(promo.inst) : pct ? `${pct}% off` : normalizeText(note || ref).slice(0, 80),
        merchant_name: normalizeText(merchant?.name),
        merchant_logo_url: merchant?.logo ? `https://promos.clash.com.ar/img/logos_merchants/${merchant.logo}` : '',
        category: cat,
        subcategory: cat,
        description_short: [note, ref].filter(Boolean).join(' - '),
        discount_type: inferDiscountType(text, pct, installments),
        discount_percent: pct,
        discount_amount_ars: null,
        installments_count: installments,
        cap_amount_ars: cap,
        cap_period: period,
        min_purchase_ars: extractMinPurchase(ref),
        valid_from: validFrom,
        valid_to: '',
        validity_text_raw: `Última actualización Clash: ${data.updatedAt}`,
        day_pattern: dayPatternFromFlags(promo.days ?? []),
        channel: inferChannel(`${note} ${ref}`),
        rail,
        instrument_required: instrument,
        card_brand_scope: cardBrand,
        card_type_scope: cardType,
        wallet_scope: cardBrand.includes('MODO') ? 'MODO' : '',
        geo_scope: '',
        coupon_code: '',
        reimbursement_timing_raw: /reintegro/i.test(ref) ? normalizeText(ref.match(/reintegro[^.]{0,120}/i)?.[0]) : '',
        freshness_status: 'active',
        freshness_reason: `Clash guide updated ${validFrom}`,
        issuer_reliability: 0.46,
        terms_text_raw: ref,
        exclusions_raw: '',
        excluded_rails: '',
        raw_snippet: JSON.stringify({ category: slug, bank, merchant, promo }).slice(0, 8000),
      });
      row.data_quality_score = quality(row, 0.48);
      row.routing_confidence = Number((Number(row.data_quality_score) * Number(row.issuer_reliability)).toFixed(2));
      row.potential_value_ars = valueScore(pct, cap, installments);
      row.routing_ltv = row.potential_value_ars == null ? null : Math.round(Number(row.potential_value_ars) * Number(row.routing_confidence));
      rows.push(row);
    }
  }
  return rows;
}

function csvEscape(value: string | number | null): string {
  if (value == null) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function writeCsv(rows: CanonicalRow[], outFile: string): Promise<void> {
  const csv = [
    CANONICAL_COLS.join(','),
    ...rows.map((row) => CANONICAL_COLS.map((col) => csvEscape(row[col])).join(',')),
  ].join('\n');
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, `${csv}\n`, 'utf8');
}

async function writeNdjson(rows: CanonicalRow[], outFile: string): Promise<void> {
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}

async function main() {
  const outArg = process.argv.indexOf('--out');
  const outFile = outArg >= 0 && process.argv[outArg + 1]
    ? String(process.argv[outArg + 1])
    : `./output_bancor_clash/bancor-clash-${TODAY}.csv`;
  const [bancorRows, clashRows] = await Promise.all([scrapeBancor(), scrapeClash()]);
  const rows = [...bancorRows, ...clashRows];
  await writeCsv(rows, outFile);
  await writeNdjson(bancorRows, `./output_bancor/bancor-${TODAY}.ndjson`);
  await writeNdjson(clashRows, `./output_clash/clash-${TODAY}.ndjson`);
  console.log(JSON.stringify({
    outFile,
    bancorNdjson: `./output_bancor/bancor-${TODAY}.ndjson`,
    clashNdjson: `./output_clash/clash-${TODAY}.ndjson`,
    totalRows: rows.length,
    bancorRows: bancorRows.length,
    clashRows: clashRows.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
