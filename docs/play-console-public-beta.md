# Google Play Public Launch Readiness Package

Last updated: 2026-06-12

This package is the release source of truth for the Android public launch of Paga Menos (`com.pagamenos.app`). It applies to the public recommendation-only build. The public app must never claim to process, approve, complete, split, advance, or guarantee payments.

Current Play status: **not ready for production submission**. The app is locally healthy and the Vercel production backend alias now serves health, remote config, and static legal/support pages, but Play launch is blocked until production backend secrets, account deletion processing, reviewer access, production AAB, closed-test evidence, and real QR validation are complete.

## Current App Facts

- App name: `Paga Menos`
- Package name: `com.pagamenos.app`
- Scheme: `pagamenos`
- Current app version: `1.0.4`
- Current Android version code: `6`
- EAS project id: `3ecd4a17-ce58-4809-8a36-dfd5269b0853`
- Production build artifact: Android App Bundle (`.aab`)
- Explicit app permission: `android.permission.CAMERA`
- Blocked sensitive permissions in config: system alert window, external storage read/write, and record audio
- Local backup: disabled with `android:allowBackup="false"`
- Store category default: `Finance`

## Play Console Declarations

### Financial Features

Complete this declaration for closed testing, open testing, and production. Google requires every published app to complete the Financial features declaration, even if it has no financial features.

Select:

- `Payments and transfers > Mobile payments and digital wallets`
- `Purchase agreements > Rewards, points, frequent flier miles, and other incentives`
- `Support services > Other`

Use this explanation:

> Paga Menos is an independent payment-method recommendation and handoff tool. It compares wallet, bank, card, merchant, and discount conditions before the user pays. Users always approve payment in their own wallet, bank, or payment app. Paga Menos does not process payments, hold balances, transfer funds, lend money, sell credit, provide investment advice, or store bank/card credentials.

Do not select personal loan, loan facilitator, payday loan, banking, line of credit, earned wage advance, microfinance, cryptocurrency, stock trading, crowdfunding, insurance, credit monitoring, or buy-now-pay-later unless the product actually adds those features.

### Data Safety

Global answers:

- App collects user data: `Yes`
- App shares user data: `No`, if analytics/crash/backend vendors are contractual service providers and merchant/issuer reporting is aggregate or anonymized only
- Data encrypted in transit: `Yes`
- Users can request data deletion: `Yes`
- Users can delete account from inside the app: `Yes`
- Users can request deletion from a public web URL: `Yes`

Declare the following collected data types conservatively:

| Play category | Data type | Required or optional | Purposes |
| --- | --- | --- | --- |
| Personal info | Email address | Required for account sync when accounts are enabled; otherwise optional | App functionality, account management, fraud prevention, security, support |
| Personal info | Name | Optional | App functionality, personalization, support |
| Personal info | User IDs | Required for account sync when accounts are enabled | App functionality, analytics, fraud prevention, security, account management |
| Financial info | Purchase history | Optional/conditional, if saved merchant/payment decision history is synced | App functionality, analytics, fraud prevention |
| Financial info | Other financial info | Optional/conditional, for payment-method preferences and QR-derived amount bands | App functionality, analytics, fraud prevention |
| Location | Approximate location | Optional only when city/region is user-provided or derived from merchant metadata | App functionality, analytics, personalization |
| App activity | App interactions | Required for telemetry if analytics is enabled; optional if user can opt out | Analytics, app functionality, fraud prevention, security |
| App activity | Other user-generated content | Optional, only for feedback/support text | Support, app functionality |
| App info and performance | Crash logs | Required if crash reporting is enabled | Analytics, app functionality |
| App info and performance | Diagnostics | Required if diagnostics are uploaded; optional for manual diagnostic export | Analytics, app functionality, fraud prevention, security |
| Device or other IDs | Device or other IDs | Required for device binding, sessions, diagnostics, and abuse prevention | App functionality, fraud prevention, security, analytics |

Declare these as not collected unless implementation changes:

- Precise location
- Contacts
- SMS or MMS
- Photos and videos
- Audio files
- Files and docs
- Calendar
- Health and fitness
- Web browsing history
- Bank credentials
- Card numbers
- Biometric data
- Full raw QR payloads by default

If Sentry, PostHog, or another SDK sends user-level data to a third party outside service-provider processing, update `App shares user data` to `Yes` and disclose the affected types.

### Payments

The Android v1 app is free and must not sell digital app features, subscriptions, credits, or premium access. Do not implement Google Play Billing in v1.

External wallet/bank handoff is allowed only as payment for physical merchant checkout or a user-initiated payment action outside Paga Menos. The app must not use external payment links to sell digital Paga Menos features. If consumer premium features are added later, use Google Play Billing unless a specific policy exception applies.

### Ads

Declare `Contains ads: No` for v1 unless sponsored offers are implemented as ad inventory in the consumer app. If sponsored offers are enabled:

- Declare ads if Play's current form treats sponsored placements as ads for this app.
- Label every sponsored placement in-app.
- Do not let paid placement override a clearly better organic recommendation.
- Update Data Safety if ad measurement SDKs or ad identifiers are introduced.

### App Access

Provide Play reviewers a path that does not require a real payment and does not require access to a personal bank/wallet.

Required reviewer package:

- Test account email: `play-reviewer@pagamenos.app`
- Test auth method: stable magic link inbox, reviewer-access code, or no-login demo mode. This is a release blocker until implemented and verified.
- Test QR payload: `00020101021226270011mercadopago010812345678520454115802AR5909Carrefour6004CABA5405123456304FFFF`
- Test amount: ARS 12,345
- Expected result: Paga Menos parses `Carrefour`, shows a recommendation, and opens only a wallet handoff/manual scanner fallback. Reviewer must stop before any payment approval.

Paste this in App Access once reviewer access exists:

> Use account `play-reviewer@pagamenos.app`. This account is for Google Play review only. Open Paga Menos, complete onboarding, choose Scan or Manual QR, and use the provided non-payable test QR payload. The app will show a payment-method recommendation and may open an installed wallet or bank app. Do not approve any payment; Paga Menos does not process payments and the test QR is for parser/recommendation validation only. Account deletion is available in Profile > Data and privacy > Delete account and at https://pagamax-public-beta-backend.vercel.app/delete-account.

### Permissions

Camera is requested only at scan time for QR scanning. Before upload, audit the final AAB manifest and fail release if it contains SMS, contacts, record audio, external storage, precise location, background location, notification content, overlay, accessibility, or notification-listener permissions.

Important current finding: the local release APK manifest audit shows no `RECORD_AUDIO` permission and `android:allowBackup="false"`. The downloaded production AAB manifest still must be audited with Android tooling before upload because the final artifact is the authority.

### Target API

Google Play requires new Android phone apps and updates submitted after 2025-08-31 to target Android 15/API 35 or higher. Accept only a production AAB whose final manifest has `targetSdkVersion >= 35`. Expo SDK 56 is expected to satisfy this, but the built artifact is the authority.

### Account Deletion

Use these current public URLs for the temporary Vercel-hosted release candidate:

- Privacy: `https://pagamax-public-beta-backend.vercel.app/privacy`
- Terms: `https://pagamax-public-beta-backend.vercel.app/terms`
- Account deletion: `https://pagamax-public-beta-backend.vercel.app/delete-account`
- Support: `https://pagamax-public-beta-backend.vercel.app/support`

Preferred branded URLs after DNS is configured:

- Privacy: `https://pagamenos.app/privacy`
- Terms: `https://pagamenos.app/terms`
- Account deletion: `https://pagamenos.app/delete-account`
- Support: `https://pagamenos.app/support`

The deletion URL must be a live HTTPS page, not a GitHub markdown page and not only a `mailto:` link. It must explain:

- How to delete in the app
- How to request deletion from the web
- What account and associated data is deleted
- What limited fraud/security/legal records may be retained
- Expected completion timing
- Support contact

## Release Build Flow

Preflight from repo root:

```powershell
npm run public:check
npm run core:test
npm run core:build
npm run typecheck --workspace @pagamax/app
npm audit --workspaces --omit=dev
node scripts/check-play-release-readiness.mjs
node scripts/check-play-release-readiness.mjs --artifact app\android\app\build\outputs\apk\release\app-release.apk
```

Expo/EAS checks from `app/`:

```powershell
npx expo config --json
npx --yes eas-cli@20.1.0 --version
npx expo-doctor
npm run build:production
```

Upload sequence:

1. Build production AAB with profile `production`.
2. Download the AAB from EAS.
3. Verify package name, version code, signing, `targetSdkVersion >= 35`, `android:allowBackup="false"`, and final manifest permissions.
4. Upload to Play internal testing.
5. Complete App content declarations.
6. Complete main store listing assets.
7. Add reviewer access instructions.
8. Promote to closed testing.
9. If the developer account is a new personal Play account created after 2023-11-13, keep at least 12 opted-in closed testers continuously enrolled for 14 days, then apply for production access.
10. Promote to production only after real QR/wallet field testing passes.

## Store Listing Guardrails

Store copy must say:

- Paga Menos compares available payment options before the user pays.
- The user approves payment in their own wallet, bank, or payment app.
- Paga Menos does not process, approve, or move money.
- Discounts are estimates and issuer terms apply.
- Paga Menos is independent and unaffiliated unless an affiliation is explicitly stated.

Store copy must not say:

- Paga Menos pays for the user.
- Paga Menos captures, splits, advances, or guarantees value.
- Paga Menos confirms payment success.
- Paga Menos is an official bank, wallet, card issuer, or merchant partner unless that is contractually true.
- Paga Menos guarantees any discount, refund, or final price.

## Release Blockers

- Vercel production backend alias is live at `https://pagamax-public-beta-backend.vercel.app`, and current Android release defaults point there. Branded `api.pagamenos.app` DNS is still not live.
- Temporary Vercel legal/support pages are live, but branded `pagamenos.app` legal/support URLs are not live.
- Production Vercel env vars are empty; auth/deletion/telemetry return `backend_misconfigured` until Neon, token peppers/secrets, Resend, and support URLs are configured for production.
- Reviewer access account/path is not implemented and verified.
- Production AAB has not been built with Play upload signing and uploaded.
- Local APK manifest audit passes, but the downloaded production AAB manifest still must be audited before Play upload.
- Real merchant QR tests with logged-in wallets are still incomplete.
- Closed testing requirements are unknown until the actual Play developer account type/date is checked.
- Backend account deletion verification is not ready for reviewer support.
- Crash reporting and production telemetry provider are not confirmed live.
- Store screenshots and feature graphic have not been captured from the final build.
