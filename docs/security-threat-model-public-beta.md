# Public Beta Threat Model

Last updated: 2026-06-06

## Assets

- User accounts, sessions, and device bindings
- Payment method preferences and provider toggles
- QR-derived merchant and amount metadata
- Recommendation ranking integrity
- Remote configuration and promotion index
- Telemetry and diagnostic events
- Sponsored-offer budgets and performance data
- Merchant and issuer analytics aggregates
- Support tooling and audit logs

## Trust Boundaries

- Mobile app to managed backend
- Mobile app to wallet, bank, and payment deep links
- Mobile app to remote config and promo data
- Backend to database and analytics warehouse
- Merchant portal to sponsored-offer administration
- Support console to user and deletion records

## Key Threats And Controls

| Threat | Risk | Required Controls |
| --- | --- | --- |
| Malicious QR payload | Phishing, unsafe deep link, parser crash | Strict QR parser, fuzz tests, schema validation, link allowlists, safe fallback UI |
| Deep-link spoofing | Opens wrong app or hostile URL | Provider handoff allowlist, package/bundle validation where available, user-visible destination |
| Stale promo data | Bad recommendations, user distrust | Signed/versioned remote config, stale warnings, local fallback index, source timestamps |
| Backend rule bypass | Unauthorized profile or telemetry access | Managed auth, server-side validation, RLS/least privilege, integration tests |
| Account takeover | Preference theft, deletion abuse | Verified email, refresh-session rotation, device binding, rate limits, suspicious login flags |
| Telemetry leakage | Sensitive checkout data exposure | No full raw QR by default, amount bands, redacted logs, short raw retention, aggregates |
| Ranking manipulation | Sponsored or partner offer beats better user value | Ranking fairness tests, sponsored label, policy that paid offers cannot override better outcomes |
| Remote-config tampering | Enables internal split flow in public build | Static public flags, server allowlists, signed config, CI scanner, kill switch |
| Support social engineering | Unauthorized account changes | Support audit logs, identity checks, least-privilege support roles |
| Merchant portal abuse | Bad offers, budget fraud, data exfiltration | Merchant auth, role-based access, approval queue, rate limits, aggregate-only exports |

## Tests Before Public Beta

- QR parser fuzz corpus for malformed EMVCo, Mercado Pago, MODO, provider URLs, huge payloads, and Unicode edge cases.
- Handoff tests for allowed and disallowed URL schemes.
- Remote config signature and version downgrade tests.
- Account lifecycle tests: create, login, logout, reinstall restore, session expiry, delete.
- Backend authorization tests for every account, telemetry, merchant, offer, and admin endpoint.
- Telemetry redaction tests proving raw QR, credentials, card numbers, SMS, contacts, precise location, and biometric data are absent.
- Public build reachability test proving owner split flow, alias transfer, simulated success, and payment proof UI are disabled.

## Release Rule

Any failure in parser safety, backend authorization, deletion, public build gating, or telemetry redaction blocks Play submission.
