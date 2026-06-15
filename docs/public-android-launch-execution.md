# Public Android Launch Execution

Last updated: 2026-06-12

## Objective

Ship Paga Menos live on Google Play as a public-safe Android recommendation/router, then monetize trusted checkout intent through B2B merchant and issuer pilots. The business objective is maximum time-discounted net profit; launch work is prioritized by how much it reduces time-to-revenue without increasing trust, legal, fraud, support, or Play rejection risk.

## Overseer Model

This thread is the overseer. It owns sequencing, integration, release readiness, and final safety decisions.

Specialist workstreams:

| Workstream | Owner scope | Must not touch |
| --- | --- | --- |
| Backend/security | Vercel API, Neon schema/migrations, auth, sessions, telemetry intake, remote config, merchant API, backend tests | Mobile UI, merchant portal UI except API contracts |
| Mobile integration | App auth/session flow, backend wiring, public account UX, telemetry client, legal URLs, remote config fallback | Backend API implementation, merchant portal |
| Play release/compliance | Play docs, declarations, reviewer flow, EAS/AAB checklist, legal URL checklist | App logic, backend logic |
| Data/observability | Promo pipeline, manifest integrity, stale-data diagnostics, crash/observability plan | Auth/session API, merchant portal |
| Monetization/portal | Merchant dashboard/offer MVP, paid pilot docs, trust-safe sponsored policy | Mobile recommendation logic unless explicitly coordinated |

No workstream may re-enable owner split, bundled receiving aliases, payment proof, simulated payment completion as public proof, payment-processing claims, or private QR/amount handoff contracts.

## Critical Path

1. Production control plane
   - Deploy Vercel API backed by Neon.
   - Implement magic-link auth, exchange, refresh, logout, account sync, consent, payment methods, deletion, telemetry batch, remote config, merchant dashboard/offers.
   - Add server-side validation, rate limits, audit logs, and redacted telemetry.
   - Keep same-owner funding and route-plan issuance disabled until provider verification exists.

2. Mobile release wiring
   - Configure real backend URL and stable public legal/support URLs.
   - Add magic-link exchange route and secure session persistence.
   - Remove DNI/CUIL requirement from normal recommendation account creation.
   - Keep DNI/CUIL only for future same-owner funding setup.
   - Add remote config handling and backend-unavailable fallback.
   - Verify downloaded promo data hash before accepting remote JSON.

3. Google Play launch package
   - Build production AAB with public flags.
   - Complete Financial Features, Data Safety, App Access, Content Rating, Ads, and permissions declarations.
   - Provide reviewer credentials and sample QR path.
   - Publish privacy, terms, deletion, and support URLs over HTTPS.
   - If the account requires it, run 12 opted-in closed testers for 14 continuous days before production access.

4. Real-world validation
   - Test real merchant QRs in Cordoba supermarket, pharmacy, fuel, and generic wallet contexts.
   - Test logged-in wallet handoff and stop before final payment approval.
   - Record merchant detection, amount handling, top recommendation, handoff result, return flow, and diagnostics.
   - Block public release on unsafe handoff, misleading savings, raw sensitive data leakage, or public proof/payment language.

5. Money path
   - Launch manual B2B pilots before self-serve billing.
   - Use aggregate reports: checkout checks, exposures, selected provider, handoff rate, saved merchants, amount bands.
   - Sell pilot sponsorship/reporting manually to three Cordoba targets: supermarket, pharmacy, fuel/local chain.
   - Sponsored placements must be labeled and cannot override a clearly better organic recommendation.

## Acceptance Gates

- `npm run public:check` passes.
- `npm run core:test` passes.
- `npm run core:build` passes.
- `npm run typecheck --workspace @pagamax/app` passes.
- `npm audit --workspaces --omit=dev` reports 0 vulnerabilities.
- `npx expo-doctor` passes from `app/`.
- Backend integration tests cover auth, sessions, deletion, consent, telemetry redaction, merchant auth, and remote config.
- App can create/login/logout/delete account against production backend.
- Telemetry respects opt-out and does not send raw QR payload, credentials, card numbers, SMS, contacts, precise location, or biometric data.
- Production AAB uploads to Play internal testing.
- Play reviewer can complete the test path without making a real payment.
- Real QR field test matrix has no blocking failures.
- Merchant pilot can receive one aggregate report from beta data.

## Current Known Blockers

- `https://api.pagamenos.app` does not resolve in DNS. The current release defaults use `https://pagamax-public-beta-backend.vercel.app` as a temporary live backend URL until branded DNS is configured.
- `https://pagamenos.app` does not resolve in DNS. Temporary privacy, terms, support, and account-deletion pages are live on `https://pagamax-public-beta-backend.vercel.app`, but the branded domain and support mailbox still need configuration.
- The Vercel production alias `https://pagamax-public-beta-backend.vercel.app` is live for public health, remote config, CORS preflight, static legal/support pages, and disabled funding responses. Auth/deletion/telemetry routes now reach the backend, but production Vercel env vars are empty, so they correctly fail with `backend_misconfigured` until production secrets and Neon are configured.
- No production AAB uploaded to Play. The latest EAS Android build attempt was blocked by free-plan Android build quota until 2026-07-01.
- A local release APK is installed and smoke-tested on the connected Pixel 8a, but it is debug/local signed and is not suitable for Play upload.
- Merchant portal is still a static prototype.
- Remote promo hash verification is implemented. The local `site/promo-data/manifest.json` health check passes with fresh 2026-06-08 data, but the public hosting endpoint is not live.
- Real QR confirmation-screen validation is incomplete.
- Backend, release, and security docs must stay aligned with public recommendation-only launch as implementation evolves.

## Provisioned Infrastructure

- Neon project `pagamax-public-beta` is created in org `Diego`.
- Neon project ID: `raspy-credit-97165475`; main branch ID: `br-square-night-apz2tk80`; database: `neondb`.
- The checked-in `backend/public-beta/schema.sql` has been applied to Neon and 17 public backend tables are present.
- Vercel project `pagamax-public-beta-backend` is linked under `diego-moros-projects`.
- Backend production alias: `https://pagamax-public-beta-backend.vercel.app`.
- Backend preview deployment: `https://pagamax-public-beta-backend-bjae0dolp-diego-moros-projects.vercel.app`.
- Preview env vars are configured for Neon connection, token peppers, dev auth, merchant API key, and legal/support URL placeholders.
- Production Vercel env vars are not configured yet. `npx vercel env ls production` currently returns no variables.

This is not production launch infrastructure yet. Production still needs branded `api.pagamenos.app` / `pagamenos.app` DNS, Resend sender/domain configuration, production env vars, support mailbox verification, and end-to-end auth/deletion/telemetry verification.

## Latest Overseer Gate Results

Run on 2026-06-12:

- `npm run typecheck --workspace @pagamax/app`: passed.
- `npm run backend:build`: passed.
- `npm run backend:test`: passed, 3 files / 10 tests.
- `npm run public:check`: passed.
- `npm run core:test`: passed, 11 files / 72 tests.
- `npm run core:build`: passed.
- `npm exec --workspace pagamax-scraper -- vitest run`: passed, 14 files / 153 tests.
- `npm audit --workspaces --omit=dev`: passed, 0 vulnerabilities.
- `npx expo-doctor` from `app/`: passed, 21/21 checks.
- `node scripts/check-play-release-readiness.mjs` with production-shaped env: passed with release-artifact audit warning when no artifact path is supplied.
- `node scripts/check-play-release-readiness.mjs --artifact app\android\app\build\outputs\apk\release\app-release.apk` with production-shaped env: passed. Audited local APK has package `com.pagamenos.app`, versionName `1.0.4`, versionCode `6`, targetSdk `36`, `android:allowBackup="false"`, and only allowed permissions.
- Local promo refresh/publish: produced `site/promo-data/manifest.json` with `generated_at=2026-06-08T14:31:16.424Z`, `stale_after=2026-06-15T14:31:16.424Z`, `promo_count=16590`, `sha256=de0d1bb32cb4feabda446a858980b19ca21bfeccf015773fd27f08e6ff58bad1`.
- `npm run data:health -- site/promo-data/manifest.json`: exited successfully for the local manifest freshness/hash window, but the manifest records `scraper_status=failed` for Personal Pay, Shell Box, Uala, and YPF. Refresh and publish clean promo data before launch.
- EAS preview Android build: blocked by quota until 2026-07-01.
- Vercel production deploy for `backend/public-beta`: passed. Live checks on `https://pagamax-public-beta-backend.vercel.app` returned health `200`, remote config `200` with live Vercel legal/support URLs, privacy/terms/delete-account/support pages `200`, malformed JSON `400 invalid_json`, disabled funding `403 funding_disabled_public_beta`, and auth/deletion `503 backend_misconfigured` because production env vars are absent.
- Vercel preview deploy for `backend/public-beta`: passed after removing the stale explicit function runtime override and adding a minimal `public/index.html` output.
- Local Android APK build from `app/android`: passed with `.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --rerun-tasks`. The latest rebuilt APK embeds the Vercel fallback URLs and was manifest-audited, but final reinstall was not repeated because `adb devices` showed no attached device.
- APK manifest audit: package `com.pagamenos.app`, targetSdk `36`, `allowBackup=false`, permissions limited to `CAMERA`, `INTERNET`, `VIBRATE`, `ACCESS_NETWORK_STATE`, and the generated signature receiver permission.
- Connected-phone smoke test from the prior installed `1.0.4` APK: home, history/progress, and methods screens rendered on Pixel 8a with no graph/text overlap observed, `BBVA Débito` label corrected, and no fatal app crash in logcat. Repeat this smoke test on the latest rebuilt APK when the phone is visible to ADB again.
- Production URL reachability check: `api.pagamenos.app` and `pagamenos.app` still fail DNS. Temporary Vercel legal/support URLs are live, but `support@pagamenos.app` and branded promo hosting still need DNS/mailbox/hosting configuration.

## Overseer Integration Rules

- Merge specialist work only after running the relevant acceptance gates.
- Prefer small, independently testable merges in this order: backend API, mobile auth wiring, remote data integrity, Play docs/config, merchant portal.
- When conflicts occur, preserve public Play safety over revenue features.
- Treat worker outputs as proposals until reviewed in this thread.
