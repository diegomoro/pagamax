# Public Beta Readiness

Pagamax can run a local beta flow today, but it is not ready for a public beta until the production control plane exists. The current account screen stores a local beta profile on the device and reserves `syncStatus` for a backend handoff.

## Must Have Before Public Beta

- Backend auth and sessions: email/phone login, device binding, session revocation, and account deletion.
- Server-side account storage: payment method capability matrix, enabled/disabled state, receiving aliases, and owner-phone limits synced per account.
- Secure handling of PII and aliases: encrypted storage, least-privilege logs, privacy policy, and data retention rules.
- Payment proof flow: receipt/webhook/screenshot-proof strategy before triggering the owner-phone payment prompt.
- Anti-fraud and abuse limits: velocity limits, blocked accounts, payout mismatch detection, dispute handling, and kill switches.
- Provider-safe handoffs: no dependency on private deep links as the only route; documented fallbacks for QR, wallet, and bank apps.
- Remote config: payment app package names, alias capability matrix, promo caps, beta flags, disabled providers, and emergency shutdown.
- Promo freshness pipeline: scheduled scrape/import, validation, publish, mobile sync, and alerting when data is stale or broken.
- Observability: crash reporting, structured diagnostics, funnel analytics, failed handoff metrics, and user support identifiers.
- Legal/compliance review: discount sharing, wallet-to-wallet transfers, referral/incentive language, terms, privacy, and consumer support.
- Beta distribution: EAS preview/internal builds, Play internal testing, TestFlight if iOS is in scope, tester invite process, and release rollback.
- Security review: threat model for payment routing, local storage, diagnostics, QR parsing, links, and backend authorization.

## Current Known Gaps

- The app has local account creation only; there is no production identity provider or server sync.
- Payment confirmation is not authoritative yet; it needs a verified proof channel before automatic owner-phone prompting.
- The owner-phone route needs configurable live limits and promo cap remaining values from a trusted backend, not only device-local JSON.
- `npm audit --omit=dev` still reports Expo transitive vulnerabilities in nested tooling packages; this likely needs an upstream Expo SDK update or a carefully tested SDK upgrade.
- Naranja X external QR deep links are blocked by app-side permissions on the connected phone, so that provider needs a fallback handoff path.
- Store/legal copy and consent screens are not finalized for a public payment-routing beta.

## Practical Beta Gate

Ship only after a closed beta build can prove these end-to-end checks with test users:

1. Account create/login/logout across reinstall and second device.
2. Remote method config syncs aliases and provider toggles correctly.
3. Real QR scan produces the expected top route and transparent fee/discount split.
4. Customer payment proof is captured or verified before the owner phone is prompted.
5. Failed handoff, cancelled payment, stale promo data, and disabled provider paths are recoverable.
6. Crash/error telemetry identifies the user, device, app version, QR route, and provider without leaking sensitive payloads.
