# Codex Project Memory - Read First

This is the compact working memory for future Codex sessions. Read this file first before planning or editing Pagamax. Update it whenever product direction, compliance posture, architecture, aliases, release status, or important implementation details change.

## Product

Ultimate business objective: maximize Pagamax's time-discounted net profit. Treat user savings, trust, checkout speed, data freshness, distribution, merchant value, and compliance as inputs to that profit function, not as ends by themselves. The working decision rule is expected discounted profit: future gross revenue minus operating, acquisition, fraud, legal, support, and trust-damage costs, discounted by how long it takes to realize them.

Pagamax / Paga Menos is an Argentina-focused QR payment recommendation app. The user scans a merchant QR, the app identifies merchant/amount when possible, ranks eligible bank/wallet/card promos, and routes the user to the best safe payment method. The desired UX is retail-fast: after scanning, show one clear answer like `Paga con Personal Pay`, expected savings, and one action.

Current public direction is **Google Play-safe and recommendation/payment-router only**. Pagamax must not claim to process, approve, or complete payments. User confirms only inside their own bank/wallet.

Product objective: make `antes de pagar, escanea` a high-retention checkout habit because repeated trusted checkout intent is the asset that can be monetized. Do not sacrifice long-term trust or public-beta safety for near-term revenue; trust loss, spam, legal exposure, fraud exposure, and slow checkout loops are real costs in the discounted-profit model.

## Distribution Doctrine

Distribution is currently more important than feature polish. The first public growth wedge is **Cordoba shoppers, WhatsApp-first**, then Android beta installs only after a user has already received value. The campaign should feel like a local utility/movement, not like fintech marketing. Working frame: `Cordoba no paga de mas`.

Best cultural enemy: **la letra chica**. Treat confusing promo rules, caps, days, exclusions, wallet/card conditions, and hidden eligibility as the opponent. The useful conspiracy-like frame is that payment promos are designed so insiders, banks, wallets, and large merchants benefit while normal shoppers fail to use them correctly. Keep it pointed at systems and incentives, not protected groups or ordinary people.

Primary conversion sequence:
1. User sees a useful native post/status/comment.
2. User joins WhatsApp or sends `comercio + monto + billeteras/tarjetas`.
3. Pagamax replies with the best estimated way to pay, confidence, and a shareable "ticket de ahorro".
4. Engaged users are invited into Android beta for faster scan/manual checks.

Hard-learned viral patterns to reuse:
- Tim Payne / Valen Scarsini: underdog mission, public counter, memeable identity, fan tools, WhatsApp channel, and share cards can make people recruit others for the cause rather than for the product.
- Absolut Unique Access Argentina: WhatsApp works when it is a human-feeling gate or game, not a broadcast ad. For Pagamax, the "gate" is `mandame donde estas por pagar y te digo con que conviene`.
- Noblex eliminatorias: a public, high-stakes cultural bet creates conversation. For Pagamax, use a visible estimated counter like `plata que Cordoba no regalo esta semana`; never make refund/payment guarantees.
- Quilmes `Pibe de los Cajones`: speed plus empathy turned an existing viral moment into a national hunt. For Pagamax, jump on wallet, bank, merchant, grocery, fuel, and promo confusion in real time with useful answers.
- Panini figuritas: scarcity plus trading behavior creates WhatsApp groups, plaza meetups, and repeated checking. For Pagamax, make promo caps, days, and merchant finds feel like tradable local intel.
- `Muchachos`: people repeat chants and templates that let them signal belonging. Pagamax needs short repeatable lines, not polished slogans: `Antes de pagar, chequea`; `no regales plata`; `con que pago aca?`.
- Milei/TikTok ecosystem: decentralized clippers and meme accounts beat official channels. Use creator/captain cells with raw material and catchphrases; do not use disinformation, harassment, bots, or fake accounts.
- Lali `Fanatico`: an antagonist can power distribution if the response feels culturally sharp. Pagamax antagonist is only `pagar de mas`, confusing promos, and opaque wallet rules; do not attack individuals or protected groups.

High-energy enemy/copy frames:
- `La letra chica no esta para informarte; esta para que pagues mal.`
- `No leas 18 condiciones en la caja. Mandame comercio + monto.`
- `Si la promo fuera para la gente comun, no necesitaria traductor.`
- `Pagamax traduce la letra chica antes de que pagues.`
- `No es descuento si nadie entiende como usarlo.`
- `Cordoba no paga el impuesto a la letra chica.`
- `Los vivos ganan cuando vos elegis mal. Chequea antes de pagar.`

Dirty-but-legal tactics allowed:
- WhatsApp Status swarms by local captains before shopping peaks.
- Comment ambushes on bank, wallet, supermarket, pharmacy, fuel, and local promo posts with helpful answers and a WhatsApp entry link.
- Nano-creator challenges by barrio/category: `encontrame donde mas se paga de mas en Nueva Cordoba`, `farmacia`, `super`, `nafta`.
- Anonymous "paga de mas" receipts/screenshots with all sensitive data removed.
- QR/promo audit walks around public or permissioned retail areas, stopping before any payment approval.
- Share cards that look like useful receipts, not ads.
- Public counters and leaderboards for estimated money kept, useful checks, and validated merchants.
- Borrowed-audience replies to people already complaining about promos, caps, failed wallet discounts, or confusing bank conditions.
- "Letra chica tribunal" posts: translate one official promo into plain Spanish and show the exact trap without claiming fraud.
- "Promo imposible" callouts: spotlight conditions that make an offer hard to use, then offer the WhatsApp check as the shortcut.

Legal/trust line:
- No fake accounts, bots, bought engagement, fake reviews, undisclosed paid creator posts, impersonation, unsolicited DM/group spam, fabricated testimonials, false bank/wallet/merchant affiliation, or guaranteed savings/payment claims.
- If there is payment, barter, or material benefit for a creator, treat it as commercial communication and disclose it. CONARP influencer/commercial guidance is the local reference.
- WhatsApp must stay opt-in and useful. Monitor blocks, reports, opt-outs, read/reply rates, and pause any format that feels like spam.
- Meta/Instagram increasingly rewards original creator content and deprioritizes copycat reposts. Creator posts should add local filming, narration, testing, or analysis instead of reposting identical promo cards.

Distribution metrics that matter more than likes:
- WhatsApp joins, first check requests, repeat check requests, share cards generated, forwarded links clicked, captain/creator refs used, real Cordoba merchant validations, Android installs from engaged WhatsApp users, and low block/report rates.

## Branches And Builds

- `main`: full/internal experiments may live here.
- `public/play-beta`: Google Play-safe public beta branch. Current work is on this branch.
- Public build gates must keep owner split flow, bundled receiving aliases, balances, caps, simulated proof, and payment completion language disabled.
- Public checks: `npm run public:check`.

## Core Product Decisions

- The original owner-phone split/arbitrage flow was explored but is not public-safe. It remains internal only.
- The current scalable path is **user-owned funding**: users configure their own wallets/cards/aliases; Pagamax helps choose and prepare the best eligible method.
- Do not rely on users holding balances across many wallets. Preferred execution order:
  1. wallet/card ready to pay,
  2. linked card inside wallet,
  3. verified DEBIN/pull or PSP top-up,
  4. verified prefilled transfer,
  5. fast wallet scanner fallback.
- No copy/paste, manual alias transfer, Accessibility automation, overlays, screen scraping, SMS/notification reading, credential collection, or hidden taps.
- If a route cannot be executed fast and safely, hide it at checkout even if the theoretical discount is higher.
- Internal funding rails (`debin_pull`, `verified_prefilled_transfer`) are same-owner only. Account setup requires a valid DNI/CUIL; the backend must hash it with a server-side pepper and mark methods/destinations `same_owner_verified` only when provider evidence matches the account identity hash. If identity is missing, pending, mismatched, or unverified, checkout must hard-stop those routes.
- Funding destination setup is backend-backed only: users can enter alias, CBU, or CVU; backend must resolve bank/provider, holder, masked account details, and owner DNI/CUIL identity; client asks the user to confirm the displayed details, but server/client both refuse save unless owner identity hash matches the main account identity hash and statuses are `same_owner_verified`.

## Security Posture

Assume every route will be gamed: alias tampering, malicious QR, replay, wrong-amount transfers, wrong-destination claims, screenshot fraud, double dipping, deep-link spoofing, support social engineering, backend bypass, and promo/ranking manipulation.

Required controls:
- Backend-signed checkout route plans bound to QR hash, amount, merchant, provider, Android package, funding rail, destination alias hash, nonce, and short expiry.
- Raw aliases/CVUs live only in an encrypted backend alias vault; tracked repo/public bundles store no real aliases.
- Public code uses alias hashes, verification status, and non-sensitive display hints.
- Screenshots are never payment proof. Only provider-confirmed events or transaction IDs count.
- Support overrides require audit logs and dual control.

## Sensitive Operator Aliases

The user provided real operator/test aliases in chat. Do **not** commit them into tracked app, backend, package, or docs files. Use a gitignored encrypted operator profile or backend secret vault for any internal tests. Public bundles must keep receiving aliases null/redacted.

Providers with private aliases provided in chat: Naranja X, BBVA, Mercado Pago, Personal Pay, Banco Carrefour, and BNA+. App YPF, Bancon, and Shell Box had no usable receiving alias.

## Current Implementation State

Implemented public beta foundations:
- QR parsing, promo matching, recommendation ranking in `packages/pagamax-core`.
- Public app with accounts, compliance screens, data controls, payment method toggles, scan/manual/checkout flows.
- Payment app allowlist/capability matrix in `app/src/config/payment-apps.ts` and `docs/payment-app-capability-matrix.md`.
- Public build guard in `scripts/check-public-build.mjs`.
- Backend in `backend/public-beta` with Vercel production routing for health, remote config, auth/session, account, telemetry, merchant, and disabled funding endpoints.

Latest uncommitted implementation added:
- DNI/CUIL normalization/validation, same-owner identity hashes, account identity capture, backend schema/docs for encrypted identity proof, and tests that reject mismatched same-owner funding routes.
- `app/app/funding-destination.tsx` adds the public flow for adding a user-owned funding account by alias/CBU/CVU with visible bank/holder/CUIL details and mismatch blocking.
- `recommendCheckoutRoutes` executable route ranking.
- `CheckoutRoutePlan` canonicalization/validation.
- `FundingDestination` and `FundingRail` types.
- Backend tables for encrypted funding destinations and audited checkout route plans.
- Tests for manual-route hiding, verified funding rails, alias/package/QR/amount tampering, expiry, and signature rejection.
- Android public manifest now blocks overlay, storage, and microphone permissions and disables local backup. Public APK should request only internet/network, camera, and vibrate.
- Owner routing was moved out of the public app import path into `packages/pagamax-core/src/owner-routing.ts`; public APK scans must not contain `payoutAlias`, `customerChargeArs`, `ownerCaptureArs`, real aliases, or `recommendPagamaxRoutes`.

## Useful Commands

- Core build: `npm run core:build`
- Core tests: `npm run core:test`
- App typecheck: `npm run typecheck --workspace @pagamax/app`
- Public safety gate: `npm run public:check`

Last verified after the user-owned funding implementation and public APK polish:
- `core:build` passed
- `core:test` passed, 72 tests
- app typecheck passed
- `public:check` passed
- `npx expo-doctor` passed, 21/21 checks
- `npm audit` and `npm audit --workspaces --omit=dev` passed with 0 vulnerabilities after Expo SDK 56 alignment, Vitest 4.1.8 upgrade, and patched local `vendor/xcode` dependency that replaces vulnerable transitive `uuid@7`.
- Scraper tests passed, 153 tests; scraper typecheck passed.
- Local release APK rebuilt after Vercel fallback URL changes (`versionName=1.0.4`, `versionCode=6`, `targetSdk=36`) with `assembleRelease -PreactNativeArchitectures=arm64-v8a`. Final reinstall was not repeated because ADB no longer showed an attached device.
- `node scripts/check-play-release-readiness.mjs --artifact app\android\app\build\outputs\apk\release\app-release.apk` passed for package/version/targetSdk/permissions/`allowBackup=false`.
- Previous device smoke passed for home/history/methods: no visible graph/progress overflow, `BBVA Débito` label renders correctly, and no app fatal exception appeared in logcat. Repeat on the latest rebuilt APK when a device is attached again.
- APK archive scan passed for forbidden aliases/internal owner-route strings.
- Requested Android permissions are limited to internet/network, camera, and vibrate.
- Backend production deploy passed on `https://pagamax-public-beta-backend.vercel.app`: health, remote config, and static privacy/terms/delete-account/support pages return `200`, malformed JSON returns `400 invalid_json`, disabled funding routes return `403 funding_disabled_public_beta`, and auth/deletion/telemetry return `503 backend_misconfigured` because production env vars are not configured.

## Open Gaps

- Real one-tap transfer/payment requires verified provider/PSP/DEBIN rails or official app links per bank/wallet.
- Most tested Android wallets can open, but do not expose verified public QR payload plus amount handoff.
- Need production deployment and verification for auth/session hardening, deletion, consent, telemetry, remote config, and fraud/audit workflows.
- Keep `Dejá todo listo`/same-owner funding gated out of the public build until provider verification exists.
- Need real-device testing with logged-in wallets, stopping before final payment approval.
- Need production AAB from EAS/upload signing, production Vercel env vars, backend-backed account deletion, support mailbox verification, Play reviewer access, and closed testing evidence. Branded `pagamenos.app` / `api.pagamenos.app` DNS is still missing; current release defaults use the live Vercel alias. Remote EAS Android builds are quota-blocked until July 1, 2026 on the free plan.
