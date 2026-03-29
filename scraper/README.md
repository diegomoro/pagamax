# Pagamax Scraper

Reusable promotion scraping platform for Argentine payment issuers (banks, wallets, fintechs).

**First adapter:** Naranja X (`https://www.naranjax.com/promociones/`)

## Table of Contents

- [Prerequisites](#prerequisites)
- [Install](#install)
- [Run](#run)
- [Test](#test)
- [Architecture](#architecture)
- [Adding a New Issuer](#adding-a-new-issuer)
- [Project Structure](#project-structure)

---

## Prerequisites

- Node.js 18 or later
- npm 9 or later

## Install

```bash
cd scraper
npm install
npx playwright install chromium
```

## Run

```bash
# Scrape Naranja X (headless, output to stdout as NDJSON)
npm start -- naranjax

# Run with visible browser (useful for debugging selector changes)
npm start -- naranjax false

# Verbose logging
LOG_LEVEL=debug npm start -- naranjax
```

Output is newline-delimited JSON (`NormalizedPromotionBundle` per line).

Pipe to a file:

```bash
npm start -- naranjax > promos.ndjson
```

## Test

```bash
# Run all tests (no internet access required)
npm test

# Watch mode
npm run test:watch

# Type-check only
npm run typecheck
```

All tests are offline — they use HTML fixtures in `tests/fixtures/`.

---

## Architecture

```
CLI (main.ts)
  └─ DiscoveryPipeline           ← orchestrator (drives the adapter)
       ├─ IssuerAdapter           ← contract every issuer implements
       │    ├─ discoverUrls()     ← returns URLs to scrape
       │    ├─ fetchPage()        ← Playwright or HTTP fetch
       │    ├─ extractCandidates()← DOM → RawPromotionCandidate[]
       │    └─ normalizeCandidate()← raw → NormalizedPromotionBundle
       ├─ DedupeBackend           ← skip unchanged pages
       └─ OutputSink              ← write bundles (stdout, DB, file)
```

### Key design decisions

| Decision | Rationale |
|---|---|
| Playwright for all Naranja X fetches | Site returns 403 for plain HTTP; JS rendering is required |
| Cheerio for DOM extraction | Pure function, testable with HTML fixtures without a browser |
| Raw-first storage (`rawPayload`) | Normalization can be re-run offline without re-scraping |
| All parsers return `T \| null` | Never invent data; callers decide how to handle missing fields |
| Zod schemas at boundaries | Validates FetchResult on ingest, fails loudly on normalize bugs |
| Singleton BrowserManager | One Chromium process per run, shared across all adapters |
| Anti-detection init script | `navigator.webdriver = undefined` applied to every context |

---

## Adding a New Issuer

1. Create `src/issuers/<name>/` with these files:

```
src/issuers/<name>/
  config.ts         ← URLs, selectors, wait conditions
  discover.ts       ← discoverUrls() implementation
  extractLanding.ts ← extract cards from listing page
  extractDetail.ts  ← extract full detail from promo page
  normalize.ts      ← apply shared parsers, build NormalizedPromotionBundle
  adapter.ts        ← implements IssuerAdapter
```

2. Add one line to `ADAPTER_REGISTRY` in `src/main.ts`:

```typescript
const ADAPTER_REGISTRY = {
  naranjax: () => new NaranjaxAdapter(),
  mercadopago: () => new MercadoPagoAdapter(), // ← add here
};
```

3. Run: `npm start -- --issuer mercadopago`

No changes to core, shared types, or parsers are needed.

The shared parsers in `src/shared/parsers/` handle Spanish-language text for all issuers. Extend them with additional regex patterns as needed.

---

## Project Structure

```
scraper/
├── src/
│   ├── main.ts                      ← CLI entry point, adapter registry
│   ├── core/
│   │   ├── browser/
│   │   │   ├── BrowserManager.ts    ← Playwright singleton + context pool
│   │   │   └── types.ts
│   │   ├── http/
│   │   │   └── HttpFetcher.ts       ← HTTP fallback for static sites
│   │   ├── dedupe/
│   │   │   └── DedupeStore.ts       ← in-memory dedup (swappable)
│   │   ├── logging/
│   │   │   └── logger.ts            ← Pino structured logger factory
│   │   └── discovery/
│   │       └── DiscoveryPipeline.ts ← orchestrates adapter pipeline
│   ├── issuers/
│   │   └── naranjax/
│   │       ├── config.ts
│   │       ├── discover.ts
│   │       ├── extractLanding.ts
│   │       ├── extractDetail.ts
│   │       ├── normalize.ts
│   │       └── adapter.ts
│   └── shared/
│       ├── types/
│       │   ├── raw.ts               ← FetchResult, RawPromotionCandidate
│       │   ├── normalized.ts        ← NormalizedPromotionBundle + sub-types
│       │   └── adapter.ts           ← IssuerAdapter interface
│       ├── parsers/                 ← Spanish-language parsers (reusable)
│       │   ├── percentage.ts
│       │   ├── currency.ts
│       │   ├── capPeriod.ts
│       │   ├── installments.ts
│       │   ├── weekdays.ts
│       │   ├── dateRange.ts
│       │   ├── paymentRails.ts
│       │   ├── refundTiming.ts
│       │   ├── merchantName.ts
│       │   ├── legalText.ts
│       │   └── index.ts
│       └── utils/
│           ├── hash.ts              ← SHA-256 for deduplication
│           ├── retry.ts             ← exponential backoff with jitter
│           └── sleep.ts
├── tests/
│   ├── unit/
│   │   ├── parsers/                 ← offline parser tests
│   │   └── naranjax/                ← offline extraction tests
│   └── fixtures/
│       └── naranjax/
│           ├── landing.html         ← sample landing page HTML
│           └── detail-sample.html   ← sample detail page HTML
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | Pino log level: `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | — | Set to `production` for NDJSON output (no pino-pretty) |

## Output Format

Each line of stdout is a `NormalizedPromotionBundle` JSON object:

```json
{
  "promotion": { "id": "...", "issuerCode": "naranjax", "title": "30% de reintegro en DIA con QR", ... },
  "promotionVersion": { "id": "...", "rawHtmlHash": "...", "scrapedAt": "...", "isActive": true },
  "paymentRails": [{ "rail": "qr" }],
  "benefits": [{ "type": "cashback_percentage", "value": 30, "capAmount": 5000, "capPeriod": "per_month" }],
  "schedules": [{ "weekdays": ["monday", "wednesday", "friday"], "startDate": "...", "endDate": "..." }],
  "conditions": [{ "text": "Promoción válida del 01/03/2025..." }],
  "limits": [],
  "exclusions": [],
  "scopes": []
}
```
