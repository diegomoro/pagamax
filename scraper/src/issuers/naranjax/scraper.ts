#!/usr/bin/env node
/**
 * scraper.ts — Naranja X promotions scraper
 *
 * Source: BFF promotions API (public, no auth required with correct Origin header)
 * Base: https://bkn-promotions.naranjax.com/bff-promotions-web/api
 *
 * Run:
 *   npx tsx src/issuers/naranjax/scraper.ts [--out ./output_naranjax] [--dry-run]
 *
 * Outputs:
 *   naranjax-YYYY-MM-DD.ndjson
 *   naranjax-YYYY-MM-DD.csv
 *   naranjax-YYYY-MM-DD-audit.json
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const getArg = (f: string, d: string) => { const i = args.indexOf(f); return i !== -1 && args[i+1] ? args[i+1]! : d; };
const outDir = resolve(getArg('--out', './output_naranjax'));
const dryRun = args.includes('--dry-run');
const limit  = parseInt(getArg('--limit', '0')) || 0;

mkdirSync(outDir, { recursive: true });

// ─── API config ───────────────────────────────────────────────────────────────

const BASE = 'https://bkn-promotions.naranjax.com/bff-promotions-web/api';
const SITE = 'https://www.naranjax.com';
const PAGE_SIZE = 50;
const DELAY_MS  = 200;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Referer': `${SITE}/`,
  'Origin': SITE,
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tag {
  description: string;
  type: 'refund' | 'accreditation' | 'days' | 'online' | 'ephemeris' | string;
}

interface Plan {
  paymentMethods: string[];
  ephemeris: { code: number; description: string; url: string } | null;
  days: {
    dateTo: string;
    dateFrom: string;
    weekdaysApplied: number[];
    datesDescription: string;
    daysApplied: string[];
    type: number;
  } | null;
  status: string;
  promotionDetails?: { appliesOnline?: boolean | null; appliesInStore?: boolean | null };
  /** Physical capture rails: QR, NFC, APP */
  captureMethods?: Array<{ key: string; description?: string }>;
}

interface Binder {
  commerceName: string;
  title: string;
  subtitle: string;
  logo: string;
  url: string;
  urlDetail: string | null;
  id: string;
  tags: Tag[];
  plans: Plan[];
  category: { key: string; name: string; subcategory: { key: string; name: string; id: string } };
}

interface FilterPage {
  data: Binder[];
  info: { page: number; itemsByPage: number; total: number; itemsInPage: number };
}

interface DataForFilter {
  discounts: { benefits: string[] };
  installments: Array<{ plans: string[]; benefits: string[] }>;
}

// ─── Normalized row ───────────────────────────────────────────────────────────

export interface NaranjaxPromo {
  source_id:         string;    // binder.id
  issuer:            string;
  source_url:        string;
  detail_url:        string;
  promo_title:       string;
  merchant_name:     string;
  merchant_logo_url: string;
  category:          string;
  subcategory:       string;
  description_short: string;
  benefit_type:      string;    // "discount_percentage" | "installments_interest_free" | "other"
  discount_percent:  number | null;
  installments_count: number | null;
  interest_free:     boolean | null;
  cap_amount_ars:    number | null;
  cap_period:        string;
  cap_per_person:    boolean;
  cap_text_raw:      string;
  reimbursement_timing_raw: string;
  payment_methods:   string;
  purchase_mode:     string;    // "online" | "in_store" | "online; in_store" (never "unknown")
  capture_methods:   string;    // "qr" | "nfc" | "app" | "qr; nfc" etc.
  day_pattern:       string;
  valid_from:        string;    // YYYY-MM-DD
  valid_to:          string;    // YYYY-MM-DD
  plan_names:        string;
  freshness_status:  string;
  scraped_at:        string;
}

const PROMO_COLS: Array<keyof NaranjaxPromo> = [
  'source_id', 'issuer', 'source_url', 'detail_url', 'promo_title', 'merchant_name',
  'merchant_logo_url', 'category', 'subcategory', 'description_short', 'benefit_type',
  'discount_percent', 'installments_count', 'interest_free', 'cap_amount_ars', 'cap_period',
  'cap_per_person', 'cap_text_raw', 'reimbursement_timing_raw', 'payment_methods',
  'purchase_mode', 'capture_methods', 'day_pattern', 'valid_from', 'valid_to', 'plan_names',
  'freshness_status', 'scraped_at',
];

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchAllPages(filters: Record<string, unknown>, label: string): Promise<Binder[]> {
  const all: Binder[] = [];
  let page = 1;
  let totalPages = Infinity;

  while (page <= totalPages) {
    const result = await postJson('binder/filter', {
      filters,
      pageOptions: { page, size: PAGE_SIZE },
    }) as FilterPage;

    const items = result.data ?? [];
    all.push(...items);

    if (result.info) {
      totalPages = Math.ceil(result.info.total / PAGE_SIZE);
      if (page === 1) process.stderr.write(`  ${label}: ${result.info.total} total, ${totalPages} pages\n`);
    } else {
      if (items.length < PAGE_SIZE) break;
    }

    process.stderr.write(`  Page ${page}/${totalPages}: ${items.length} items (total: ${all.length})\r`);
    if (page >= totalPages || (limit > 0 && all.length >= limit)) break;
    page++;
    await sleep(DELAY_MS);
  }
  process.stderr.write('\n');
  return all;
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

const WEEKDAY_NAMES: Record<number, string> = {
  1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday',
  5: 'friday',  6: 'saturday', 7: 'sunday',
};

/** Convert NaranjaX API date format DD/MM/YYYY to ISO YYYY-MM-DD. */
function parseDDMMYYYY(s: string): string {
  if (!s) return '';
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** A group of plans that share the same day-pattern and date range. */
interface PlanGroup {
  plans:    Plan[];
  weekdays: number[];   // sorted weekday numbers (1=Mon … 7=Sun)
  dateFrom: string;     // YYYY-MM-DD or ''
  dateTo:   string;     // YYYY-MM-DD or ''
}

/**
 * Split plans by (weekdays + date range) so that binders with multiple
 * day-restricted plan variants produce separate canonical rows.
 * Plans with null days → group with key '' (no restriction).
 */
function groupPlans(plans: Plan[]): PlanGroup[] {
  const groups = new Map<string, PlanGroup>();

  for (const p of plans) {
    const wdays = [...(p.days?.weekdaysApplied ?? [])].sort() as number[];
    const df    = parseDDMMYYYY(p.days?.dateFrom ?? '');
    const dt    = parseDDMMYYYY(p.days?.dateTo   ?? '');
    const key   = `${wdays.join(',')}|${df}|${dt}`;

    if (!groups.has(key)) groups.set(key, { plans: [], weekdays: wdays, dateFrom: df, dateTo: dt });
    groups.get(key)!.plans.push(p);
  }

  // No plans at all → single empty group
  if (groups.size === 0) return [{ plans: [], weekdays: [], dateFrom: '', dateTo: '' }];
  return [...groups.values()];
}

function parsePaymentMethods(methods: string[]): string {
  return methods.map(m => {
    if (m === 'credito') return 'credit_card';
    if (m === 'debito')  return 'debit_card';
    if (m === 'dinero')  return 'wallet';
    return m;
  }).join('; ');
}

function parseCapTag(text: string): { amount: number | null; period: string; perPerson: boolean } {
  const m = /\$\s*([\d.,]+)/.exec(text);
  const amount = m ? parseFloat(m[1]!.replace(/\./g, '').replace(',', '.')) : null;
  const perPerson = /persona/i.test(text);
  let period = '';
  if      (/semana/i.test(text))            period = 'weekly';
  else if (/mes|mensual/i.test(text))       period = 'monthly';
  else if (/d[ií]a\b/i.test(text))          period = 'daily';
  else if (/transacci[oó]n/i.test(text))    period = 'per_transaction';
  return { amount, period, perPerson };
}

function parseBenefit(title: string, planName: string | null): {
  type: string; value: number | null; installments: number | null; interestFree: boolean | null;
} {
  const pct  = /(\d+)\s*%/.exec(title);
  const inst = /(\d+)\s*cuotas?\s+(?:cero\s+inter[eé]s|fijas?)/i.exec(title);
  const isPlanZeta  = /plan\s+z[eé]ta|plan\s+z\b/i.test(title + (planName ?? ''));
  const isPlanTurbo = /plan\s+turbo/i.test(title + (planName ?? ''));
  if (pct && inst)  return { type: 'discount_percentage', value: parseFloat(pct[1]!), installments: parseInt(inst[1]!), interestFree: true };
  if (pct)          return { type: 'discount_percentage', value: parseFloat(pct[1]!), installments: null, interestFree: null };
  if (inst || isPlanZeta || isPlanTurbo)
    return { type: 'installments_interest_free', value: null, installments: inst ? parseInt(inst[1]!) : null, interestFree: true };
  return { type: 'other', value: null, installments: null, interestFree: null };
}

function buildMerchantUrl(b: Binder): string {
  const cat = b.category?.key ?? 'UNKNOWN';
  const sub = b.category?.subcategory?.key ?? 'UNKNOWN';
  return `${SITE}/promociones/${cat}/${sub}/${b.url}_comercio`;
}

function buildDetailUrl(b: Binder): string {
  const cat = b.category?.key ?? 'UNKNOWN';
  const sub = b.category?.subcategory?.key ?? 'UNKNOWN';
  if (b.urlDetail) return `${SITE}/promociones/${cat}/${sub}/${b.url}/${b.urlDetail}`;
  return buildMerchantUrl(b);
}

function freshnessStatus(validFrom: string, validTo: string, today: string): string {
  if (validTo && validTo < today) return 'expired';
  if (validFrom && validFrom > today) return 'future';
  if (validTo) return 'active';
  return 'unknown';
}

// ─── Normalize binder → NaranjaxPromo[] (one row per day-pattern group) ──────

function normalize(binder: Binder, scrapedAt: string, today: string): NaranjaxPromo[] {
  const capTag    = binder.tags?.find(t => t.type === 'refund');
  const refundTag = binder.tags?.find(t => t.type === 'accreditation');
  const onlineTag = binder.tags?.find(t => t.type === 'online');
  const cap       = capTag ? parseCapTag(capTag.description) : null;

  // 'CURRENT' is the status NaranjaX API returns for active plans.
  const activePlans = binder.plans?.filter(p => !p.status || p.status === 'active' || p.status === 'CURRENT') ?? [];
  const allMethods  = [...new Set(activePlans.flatMap(p => p.paymentMethods ?? []))];

  // purchase_mode: appliesOnline===true → online; null/false → in_store (API contract).
  const modes = new Set<string>();
  for (const p of activePlans) {
    if (p.promotionDetails?.appliesOnline === true) modes.add('online');
    else modes.add('in_store');
  }
  if (onlineTag) modes.add('online');
  const purchaseMode = [...modes].sort().join('; ') || 'in_store';

  // capture_methods: physical rail signals (QR, NFC, APP)
  const captures = new Set<string>();
  for (const p of activePlans) {
    for (const cm of p.captureMethods ?? []) {
      const k = cm.key?.toLowerCase();
      if (k === 'qr') captures.add('qr');
      else if (k === 'nfc') captures.add('nfc');
      else if (k === 'app') captures.add('app');
    }
  }
  const captureMethods = [...captures].sort().join('; ');

  const benefit = parseBenefit(binder.title, null);
  const groups  = groupPlans(activePlans);

  return groups.map((group, idx) => {
    const weekdayNames = group.weekdays.length === 0 || group.weekdays.length === 7
      ? 'everyday'
      : group.weekdays.map(n => WEEKDAY_NAMES[n] ?? String(n)).join('; ');

    const planNames = [...new Set(group.plans.map(p => p.ephemeris?.description).filter(Boolean))];

    // Give each group a stable source_id; single-group binders keep the binder ID unchanged.
    const sourceId = groups.length === 1 ? binder.id : `${binder.id}_g${idx}`;

    return {
      source_id:         sourceId,
      issuer:            'naranjax',
      source_url:        buildMerchantUrl(binder),
      detail_url:        buildDetailUrl(binder),
      promo_title:       binder.title,
      merchant_name:     binder.commerceName,
      merchant_logo_url: binder.logo ?? '',
      category:          binder.category?.name ?? '',
      subcategory:       binder.category?.subcategory?.name ?? '',
      description_short: binder.subtitle ?? '',
      benefit_type:      benefit.type,
      discount_percent:  benefit.value,
      installments_count: benefit.installments,
      interest_free:     benefit.interestFree,
      cap_amount_ars:    cap?.amount ?? null,
      cap_period:        cap?.period ?? '',
      cap_per_person:    cap?.perPerson ?? false,
      cap_text_raw:      capTag?.description ?? '',
      reimbursement_timing_raw: refundTag?.description ?? '',
      payment_methods:   parsePaymentMethods(allMethods),
      purchase_mode:     purchaseMode,
      capture_methods:   captureMethods,
      day_pattern:       weekdayNames,
      valid_from:        group.dateFrom,
      valid_to:          group.dateTo,
      plan_names:        planNames.join(' | '),
      freshness_status:  freshnessStatus(group.dateFrom, group.dateTo, today),
      scraped_at:        scrapedAt,
    };
  });
}

// ─── CSV writer ───────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const scrapedAt = new Date().toISOString();
  const today     = scrapedAt.slice(0, 10);
  const dateStr   = today;

  process.stderr.write(`[naranjax/scraper] out:     ${outDir}\n`);
  process.stderr.write(`[naranjax/scraper] dry-run: ${dryRun}\n\n`);

  process.stderr.write('[naranjax] Fetching filter configuration…\n');
  const df = await getJson('data-for-filter') as DataForFilter;
  const discountIds = df.discounts?.benefits ?? [];
  const planIds     = [...new Set(df.installments?.flatMap(g => g.plans ?? []) ?? [])];
  process.stderr.write(`  Discount IDs: ${discountIds.length}, Plan IDs: ${planIds.length}\n`);

  process.stderr.write('[naranjax] Fetching discount promotions…\n');
  const discountBinders = await fetchAllPages({ discounts: discountIds }, 'discounts');

  process.stderr.write('[naranjax] Fetching installment promotions…\n');
  const installBinders = await fetchAllPages({ plans: planIds }, 'installments');

  // Deduplicate by binder ID
  const allBinders = new Map<string, Binder>();
  for (const b of [...discountBinders, ...installBinders]) {
    if (!allBinders.has(b.id)) allBinders.set(b.id, b);
  }
  process.stderr.write(`[naranjax] Total unique binders: ${allBinders.size}\n`);

  const promos: NaranjaxPromo[] = [];
  for (const binder of allBinders.values()) {
    promos.push(...normalize(binder, scrapedAt, today));
  }

  if (dryRun) {
    process.stderr.write('\n[naranjax] DRY RUN — first 5 rows:\n');
    for (const p of promos.slice(0, 5)) {
      process.stderr.write(
        `  ${p.source_id} | ${p.merchant_name} | ${p.promo_title}\n` +
        `    type=${p.benefit_type} pct=${p.discount_percent}% inst=${p.installments_count} cap=${p.cap_amount_ars}\n` +
        `    days=${p.day_pattern} channel=${p.purchase_mode} from=${p.valid_from} to=${p.valid_to} freshness=${p.freshness_status}\n\n`
      );
    }
    return;
  }

  // ── NDJSON ──────────────────────────────────────────────────────────────────
  const ndjsonPath = join(outDir, `naranjax-${dateStr}.ndjson`);
  writeFileSync(ndjsonPath, promos.map(p => JSON.stringify(p)).join('\n') + '\n', 'utf8');
  process.stderr.write(`[naranjax] NDJSON → ${ndjsonPath}\n`);

  // ── CSV ─────────────────────────────────────────────────────────────────────
  const csvPath = join(outDir, `naranjax-${dateStr}.csv`);
  const header  = PROMO_COLS.join(',') + '\n';
  const rows    = promos.map(p => PROMO_COLS.map(c => csvCell(p[c])).join(','));
  writeFileSync(csvPath, header + rows.join('\n') + '\n', 'utf8');
  process.stderr.write(`[naranjax] CSV   → ${csvPath}\n`);

  // ── Audit ────────────────────────────────────────────────────────────────────
  const byType: Record<string, number>      = {};
  const byFresh: Record<string, number>     = {};
  const byMode: Record<string, number>      = {};
  let withPct = 0, withInst = 0, withCap = 0, withDates = 0;

  for (const p of promos) {
    byType[p.benefit_type]          = (byType[p.benefit_type] ?? 0) + 1;
    byFresh[p.freshness_status]     = (byFresh[p.freshness_status] ?? 0) + 1;
    byMode[p.purchase_mode]         = (byMode[p.purchase_mode] ?? 0) + 1;
    if (p.discount_percent !== null)  withPct++;
    if (p.installments_count !== null) withInst++;
    if (p.cap_amount_ars !== null)     withCap++;
    if (p.valid_to)                    withDates++;
  }

  const audit = {
    run_at: scrapedAt, total: promos.length,
    by_benefit_type: byType, by_freshness: byFresh, by_purchase_mode: byMode,
    with_discount_pct: withPct, with_installments: withInst,
    with_cap: withCap, with_valid_to: withDates,
  };
  const auditPath = join(outDir, `naranjax-${dateStr}-audit.json`);
  writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');
  process.stderr.write(`[naranjax] Audit → ${auditPath}\n`);

  process.stderr.write('\n=== Summary ===\n');
  process.stderr.write(`Total: ${promos.length}\n`);
  process.stderr.write(`By type: ${JSON.stringify(byType)}\n`);
  process.stderr.write(`By freshness: ${JSON.stringify(byFresh)}\n`);
}

main().catch(err => { process.stderr.write(`Fatal: ${err}\n`); process.exit(1); });
