# Promo Data Observability

Last updated: 2026-06-15

## Public Launch Contract

The app may use remote promo data only when the downloaded JSON matches the SHA-256 hash in the remote manifest. If hash verification fails, the app keeps the bundled or cached dataset and records a diagnostic event.

The scheduled refresh must produce:

- `site/promo-data/manifest.json`
- `site/promo-data/promo-index-<version>.json`
- `site/promo-data/promo-index.json`
- `site/promo-data/promo-refresh-report.json`

The manifest includes `sha256`, `stale_after`, `bytes`, stats, and a compact scraper report. `stale_after` is the app-facing freshness deadline.

## Commands

```bash
npm run data:refresh
npm run data:publish
npm run data:health -- site/promo-data/manifest.json
```

Useful environment variables:

- `PROMO_REFRESH_MIN_SUCCESSFUL_SCRAPERS`: minimum successful issuer scrapers before consolidation/publish continues. GitHub Actions uses `5`.
- `PROMO_DATA_STALE_AFTER_DAYS`: freshness window written to `manifest.stale_after`. Default is `7`.
- `PROMO_DATA_MIN_PROMOS`: minimum promo count accepted by publish/health checks. Default is `100`.
- `PROMO_REFRESH_REPORT_PATH`: custom JSON report path. Default is `reports/promo-refresh-report.json`.
- `PROMO_DATA_ALLOW_STALE=1`: allows `data:health` to inspect stale remote data without failing.

## Alerts And Triage

GitHub Actions is the first alerting layer:

- The refresh step fails if fewer than the configured minimum scrapers succeed.
- The publish step fails if the promo index is too small.
- The health step fails if the manifest is stale, missing SHA-256, or points to bytes with a mismatched hash.
- The workflow uploads `promo-refresh-report.json` even on failure and writes a short summary to the Actions step summary.
- The workflow no longer tries to auto-enable GitHub Pages from the scheduled token. If Pages is not enabled, the run uploads the validated static site as an artifact and exits successfully instead of sending failure emails. Enable Settings > Pages > Build and deployment > Source: GitHub Actions when ready to deploy publicly.

Field testers should export diagnostics from `Datos`. The export now includes promo data source, version, hash verification state, stale deadline, and recent data events.

## Mobile Diagnostics

The Profile screen shows:

- current source: bundled, cached remote, or remote download
- remote sync status
- generated date
- last check
- local version
- remote SHA-256 prefix and verification state
- freshness deadline

Expected failure behavior:

- Missing or invalid manifest hash: keep local data, show remote error.
- SHA-256 mismatch: keep local data, show remote error.
- Stale manifest: keep usable data, record a warning diagnostic.
- Remote unavailable: keep local data, show remote error.

## Sentry Plan

Crash instrumentation is not implemented in this slice. The mobile integration owner should add Sentry before Play internal testing:

1. Install `@sentry/react-native` using Expo-compatible setup.
2. Initialize Sentry in the app root with release, environment, and DSN from EAS secrets.
3. Tag events with app variant, platform, promo data source, promo version, hash verification state, and last sync status.
4. Do not attach raw QR payloads, card data, credentials, full email addresses, DNI/CUIL, exact location, or exact payment amounts.
5. Capture explicit non-fatal exceptions for remote promo sync failures, hash mismatches, stale data warnings, scraper report `failed` status received from manifest, and handoff failures.
6. Verify opt-out behavior: analytics opt-out should stop product telemetry; crash reporting can remain operational only if disclosed in privacy copy and limited to diagnostics.
