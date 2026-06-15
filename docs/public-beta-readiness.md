# Public Beta Readiness

Pagamax can run a local recommendation-only beta flow today, and the app/backend now include the first production auth/session integration path. A local APK is installed, manifest-audited, and smoke-tested on the connected Pixel 8a. A Neon project exists, and the Vercel backend production alias now serves public health, remote config, and static legal/support pages. It is not ready for a Google Play public launch until production backend env vars are added and verified, account deletion processing works, reviewer access is configured, a Play-signed production AAB is built/uploaded and audited, remote promo health passes from public hosting, telemetry is verified, and real QR validation is complete.

## Must Have Before Public Beta

- Backend auth and sessions: email/phone login, device binding, session revocation, and account deletion.
- Server-side account storage: payment method capability matrix, enabled/disabled state, consent state, and saved merchants synced per account.
- Secure handling of PII: encrypted storage where needed, least-privilege logs, privacy policy, and data retention rules.
- Public recommendation-only safety: no payment proof, no simulated payment proof, no owner-phone prompts, no operator-owned aliases, and no payment completion claims.
- Anti-abuse limits: velocity limits, blocked accounts, suspicious telemetry handling, support dispute workflow, and kill switches.
- Provider-safe handoffs: no dependency on private deep links as the only route; documented fallbacks for QR, wallet, and bank apps.
- Remote config: payment app package names, promo freshness thresholds, beta flags, disabled providers, sponsored-offer flags, legal URLs, and emergency shutdown.
- Promo freshness pipeline: scheduled scrape/import, validation, publish, mobile sync, and alerting when data is stale or broken.
- Observability: crash reporting, structured diagnostics, funnel analytics, failed handoff metrics, and user support identifiers.
- Legal/compliance review: financial-feature declaration, Data Safety, account deletion, recommendation language, discount estimates, sponsored-offer labeling, terms, privacy, and consumer support.
- Beta distribution: EAS preview/internal builds, Play internal/closed testing, tester invite process, and release rollback.
- Security review: threat model for payment routing, local storage, diagnostics, QR parsing, links, and backend authorization.

## Current Known Gaps

- The app has local account creation plus magic-link exchange/session persistence wiring. Neon is provisioned and the Vercel production alias `https://pagamax-public-beta-backend.vercel.app` is deployed. `api.pagamenos.app` currently does not resolve, so release defaults point to the live Vercel alias until branded DNS is configured.
- Consent sync, payment-method sync, deletion workflow, and telemetry intake have client/server paths. Live routing reaches the backend, but production Vercel env vars are empty, so auth/deletion/telemetry return `backend_misconfigured` until secrets, Neon, and Resend are configured for production.
- Reviewer credentials and a stable Play-review login path still need to be provisioned.
- Same-owner funding, route-plan signing, and provider-confirmed payment events are future/internal rails until a verified provider path exists.
- Remote promo artifacts publish a hash and the mobile client verifies it before accepting downloaded JSON. The local manifest is still inside its freshness window, but it records failed scrapers for Personal Pay, Shell Box, Uala, and YPF; `pagamenos.app` and its promo-data URL are also not live in DNS.
- Naranja X external QR deep links are blocked by app-side permissions on the connected phone, so that provider needs a fallback handoff path.
- Store/legal copy and Play declaration drafts exist. Temporary Vercel HTTPS legal/support pages are live, but branded `pagamenos.app` URLs, support mailbox verification, and backend-backed deletion processing are still not production-ready.
- The latest EAS Android build was blocked by free-plan quota until 2026-07-01. The installed local APK passes manifest checks for package/version/targetSdk/permissions/backup policy and is useful for QA, but it is not Play-signed.
- Merchant portal and sponsored-offer revenue are prototype-only; no production merchant auth, billing, or aggregate reporting exists yet.
- Production Play submission must follow `docs/play-console-public-beta.md` and `docs/play-store-listing-assets.md`.

## Practical Beta Gate

Ship only after a closed beta build can prove these end-to-end checks with test users:

1. Account create/login/logout across reinstall and second device.
2. Remote method config syncs provider toggles and consent correctly.
3. Real QR scan produces the expected top recommendation, transparent estimate, and safe wallet handoff.
4. The app never claims to complete, approve, verify, or prove a payment.
5. Failed handoff, cancelled payment, stale promo data, and disabled provider paths are recoverable.
6. Crash/error telemetry identifies the user, device, app version, QR route, and provider without leaking sensitive payloads.
7. Account deletion works from the app and from the public web path.
