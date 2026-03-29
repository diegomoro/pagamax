/**
 * discover.ts — MODO promotions discovery via sitemap.
 *
 * Primary source: https://promoshub.modo.com.ar/sitemap.xml
 *   Contains ~4,900 URLs with pattern https://modo.com.ar/promos/<slug>
 *
 * Returns a flat list of slugs ready for the extract phase.
 */

const SITEMAP_URL = 'https://promoshub.modo.com.ar/sitemap.xml';
const PROMO_BASE  = 'https://modo.com.ar/promos/';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/xml,application/xml,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

// ─── Result type ──────────────────────────────────────────────────────────────

export interface DiscoverResult {
  slugs: string[];
  sitemapUrl: string;
  totalFound: number;
  /** Slugs after deduplication and validation. */
  totalUnique: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses promo slugs from a MODO sitemap XML string.
 * Extracts all <loc> values matching https://modo.com.ar/promos/<slug>.
 */
function parseSitemapSlugs(xml: string): string[] {
  const slugs = new Set<string>();

  // Match all <loc>...</loc> entries
  const locRe = /<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = locRe.exec(xml)) !== null) {
    const url = m[1]!.trim();
    if (url.startsWith(PROMO_BASE)) {
      const slug = url.slice(PROMO_BASE.length).replace(/\/$/, '').trim();
      if (slug.length > 0 && !slug.includes('/')) {
        slugs.add(slug);
      }
    }
  }

  return [...slugs];
}

// ─── Main discover function ───────────────────────────────────────────────────

export async function discover(): Promise<DiscoverResult> {
  process.stderr.write(`MODO discover: fetching sitemap ${SITEMAP_URL}\n`);

  let xml = '';
  try {
    const res = await fetch(SITEMAP_URL, { headers: HEADERS });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    xml = await res.text();
  } catch (err) {
    process.stderr.write(`  Sitemap fetch error: ${err}\n`);
    return { slugs: [], sitemapUrl: SITEMAP_URL, totalFound: 0, totalUnique: 0 };
  }

  const slugs = parseSitemapSlugs(xml);
  process.stderr.write(`  Slugs found: ${slugs.length}\n`);

  return {
    slugs,
    sitemapUrl: SITEMAP_URL,
    totalFound: slugs.length,
    totalUnique: slugs.length,
  };
}
