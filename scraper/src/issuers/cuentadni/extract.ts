/**
 * extract.ts — Fetch Cuenta DNI beneficio data from the JSON APIs.
 *
 * Primary:  GET /cuentadni/Home/GetBeneficioByRubro?idRubro=N
 *           Returns all historical beneficios (active + stale) for a rubro category.
 *
 * Secondary: GET /cuentadni/Home/GetBeneficioData2?idBeneficio=N
 *           Returns full detail for a single beneficio.
 *           Used for hub card IDs not already covered by rubro data.
 *
 * Note: GetLocalesListadoByIdBuscador (merchant lists) returns HTTP 500 — logged
 * as gap in audit, not attempted here.
 */

import type { BeneficioAPI, BeneficioData2Response, RawCuenaDNICandidate } from './types.js';
import type { CuenaDNIPromo } from './types.js';
import type { DiscoverResult } from './discover.js';

const BASE = 'https://www.bancoprovincia.com.ar';

const API_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': `${BASE}/cuentadni/`,
};

const DELAY_MS = 200;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Known rubro names (discovered by probing) ────────────────────────────────

const RUBRO_NAMES: Record<number, string> = {
  1: 'Varios',
  2: 'Test',
  18: 'Telecomunicaciones y Transporte',
  21: 'Verano',
  26: 'Comercios Destacados',
  27: 'Supermercados',
  29: 'Servicios e Impuestos',
  31: 'Combustible',
  32: 'Alimentos',
};

// ─── .NET Date parser ─────────────────────────────────────────────────────────

/** Parses "/Date(UNIX_MS)/" → milliseconds, or undefined if absent/invalid. */
function parseNetDateMs(s: string | undefined | null): number | undefined {
  if (!s) return undefined;
  const m = /\/Date\((-?\d+)\)\//.exec(s);
  return m ? parseInt(m[1]!, 10) : undefined;
}

// ─── API fetch helpers ────────────────────────────────────────────────────────

async function fetchRubroData(rubroId: number): Promise<BeneficioAPI[]> {
  const url = `${BASE}/cuentadni/Home/GetBeneficioByRubro?idRubro=${rubroId}`;
  try {
    const res = await fetch(url, { headers: API_HEADERS });
    if (!res.ok) {
      process.stderr.write(`  GetBeneficioByRubro(${rubroId}) → HTTP ${res.status}\n`);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      process.stderr.write(`  GetBeneficioByRubro(${rubroId}) → unexpected response shape\n`);
      return [];
    }
    return data as BeneficioAPI[];
  } catch (err) {
    process.stderr.write(`  GetBeneficioByRubro(${rubroId}) → error: ${err}\n`);
    return [];
  }
}

async function fetchBeneficioDetail(beneficioId: number): Promise<BeneficioAPI | null> {
  const url = `${BASE}/cuentadni/Home/GetBeneficioData2?idBeneficio=${beneficioId}`;
  try {
    const res = await fetch(url, { headers: API_HEADERS });
    if (!res.ok) return null;
    const data = await res.json() as BeneficioData2Response;
    return data?.Entity?.Beneficio ?? null;
  } catch {
    return null;
  }
}

// ─── Conversion ───────────────────────────────────────────────────────────────

function toCandidate(
  b: BeneficioAPI,
  rubroId: number | undefined,
  rubroName: string | undefined,
  dataSource: 'api_rubro' | 'api_data2',
  scrapedAt: string,
): RawCuenaDNICandidate {
  const candidate: RawCuenaDNICandidate = {
    dataSource,
    sourceUrl: `${BASE}/cuentadni/Home/GetBeneficioData2?idBeneficio=${b.id}`,
    pageType: 'benefits_hub',
    scrapedAt,
    beneficioId: b.id,
    title: b.titulo ?? '',
    rawSnippet: JSON.stringify(b),
  };

  if (rubroId !== undefined) candidate.rubroId = rubroId;
  if (rubroName !== undefined) candidate.rubroName = rubroName;
  if (b.subtitulo) candidate.subtitle = b.subtitulo;
  if (b.porcentaje > 0) candidate.discountPercent = b.porcentaje;
  if (b.bajada) candidate.bajada = b.bajada;
  if (b.legal) candidate.legalText = b.legal;

  const desdeMs = parseNetDateMs(b.fecha_desde);
  const hastaMs = parseNetDateMs(b.fecha_hasta);
  if (desdeMs !== undefined) candidate.fechaDesdeMs = desdeMs;
  if (hastaMs !== undefined) candidate.fechaHastaMs = hastaMs;

  if (b.titulo_fecha) candidate.tituloFecha = b.titulo_fecha;
  if (b.url) candidate.urlSlug = b.url;
  if (b.urlPagina) candidate.merchantLocatorUrl = b.urlPagina;

  return candidate;
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface ExtractResult {
  candidates: RawCuenaDNICandidate[];
  stats: {
    rubrosFetched: number[];
    rubrosFailed: number[];
    data2Fetched: number;
    data2Failed: number;
    totalRaw: number;
    dedupeRemoved: number;
  };
}

// ─── Main extract function ────────────────────────────────────────────────────

export async function extract(
  discoverResult: DiscoverResult,
  scrapedAt: string,
): Promise<ExtractResult> {
  const candidates: RawCuenaDNICandidate[] = [];
  const seenIds = new Set<number>();

  const rubrosFetched: number[] = [];
  const rubrosFailed: number[] = [];

  // Phase 1: Fetch all beneficios from each active rubro
  for (const rubroId of discoverResult.activeRubroIds) {
    const rubroName = RUBRO_NAMES[rubroId] ?? `rubro_${rubroId}`;
    process.stderr.write(`Fetching rubro ${rubroId} (${rubroName})...\n`);

    const beneficios = await fetchRubroData(rubroId);

    if (beneficios.length === 0) {
      rubrosFailed.push(rubroId);
    } else {
      rubrosFetched.push(rubroId);
      let added = 0;
      for (const b of beneficios) {
        if (!seenIds.has(b.id)) {
          seenIds.add(b.id);
          candidates.push(toCandidate(b, rubroId, rubroName, 'api_rubro', scrapedAt));
          added++;
        }
      }
      process.stderr.write(`  ${beneficios.length} beneficios fetched, ${added} new (${seenIds.size} total unique)\n`);
    }

    await sleep(DELAY_MS);
  }

  // Phase 2: Hub card IDs not covered by rubro data
  const missingIds = discoverResult.hubBeneficioIds.filter(id => !seenIds.has(id));
  process.stderr.write(`\nHub IDs not in rubro data: ${missingIds.length}\n`);

  let data2Fetched = 0;
  let data2Failed = 0;

  for (const id of missingIds) {
    const b = await fetchBeneficioDetail(id);
    if (b) {
      seenIds.add(b.id);
      candidates.push(toCandidate(b, undefined, undefined, 'api_data2', scrapedAt));
      data2Fetched++;
    } else {
      data2Failed++;
      process.stderr.write(`  GetBeneficioData2(${id}) failed\n`);
    }
    await sleep(DELAY_MS);
  }

  return {
    candidates,
    stats: {
      rubrosFetched,
      rubrosFailed,
      data2Fetched,
      data2Failed,
      totalRaw: candidates.length,
      dedupeRemoved: 0,
    },
  };
}

// ─── Merchant locator enrichment ──────────────────────────────────────────────

/**
 * Fetch GetBeneficioData2 for active promos to extract the merchant locator URL
 * from the Acciones array (tipo="link").
 *
 * Only runs for active promos (~10–20 per day) to keep request count minimal.
 * The `Acciones` field is not available in GetBeneficioByRubro — only in Data2.
 *
 * Decision on merchant lists:
 *   We store the **buscador URL** (e.g. /cuentadni/buscadores/supermercados) rather
 *   than enumerating individual merchants, which can be 100s of locations.
 *   The buscador URL is the canonical searchable merchant directory for each promo.
 *
 * Returns a map of beneficioId → merchantLocatorUrl for matched promos.
 */
export async function enrichMerchantLocators(
  activePromos: CuenaDNIPromo[],
): Promise<Map<number, string>> {
  const result = new Map<number, string>();

  // Collect unique beneficio IDs from active promos that don't already have a locator
  const ids = [
    ...new Set(
      activePromos
        .filter(p => !p.merchant_locator_url && p.beneficio_id !== null)
        .map(p => p.beneficio_id as number),
    ),
  ];

  if (ids.length === 0) return result;

  process.stderr.write(`\nEnriching merchant locators for ${ids.length} active promo(s)...\n`);

  for (const id of ids) {
    try {
      const url = `${BASE}/cuentadni/Home/GetBeneficioData2?idBeneficio=${id}`;
      const res = await fetch(url, { headers: API_HEADERS });
      if (!res.ok) {
        process.stderr.write(`  [locator] beneficio ${id} → HTTP ${res.status}\n`);
        await sleep(DELAY_MS);
        continue;
      }
      const data = await res.json() as BeneficioData2Response;

      // Merchant locator links are in Entity.Botones (tipo="link")
      const botones = data.Entity?.Botones ?? [];
      const linkAction = botones.find(
        b => b.tipo === 'link' && typeof b.link === 'string' && b.link.length > 0,
      );

      if (linkAction?.link) {
        result.set(id, linkAction.link);
        process.stderr.write(`  [locator] beneficio ${id} → ${linkAction.link}\n`);
      } else {
        process.stderr.write(`  [locator] beneficio ${id} → no link action found\n`);
      }
    } catch (err) {
      process.stderr.write(`  [locator] beneficio ${id} → error: ${err}\n`);
    }
    await sleep(DELAY_MS);
  }

  return result;
}
