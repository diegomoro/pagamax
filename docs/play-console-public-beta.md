# Google Play Public Beta Readiness Package

Last updated: 2026-06-06

This checklist applies to the `public/play-beta` branch. `main` remains the full internal build.

## Release Variant

- App variant: public
- Recommendation mode: enabled
- Owner split flow: disabled
- Payment proof or simulated payment completion: disabled
- Alias-transfer prompts: disabled
- Public bundled owner aliases, balances, caps, and transfer limits: removed

The release build must pass `npm run public:check`.

## Play Console Declarations

- Financial Features: declare financial features because the app recommends payment routes, wallets, cards, discounts, and payment apps.
- Data Safety: disclose account identifiers, payment method preferences, QR-derived merchant and amount metadata, app interactions, diagnostics, crash logs, device/app version, consent state, retention, sharing, deletion, and fraud/security retention.
- Financial Services: describe the app as an independent recommendation and handoff tool, not a payment processor, lender, bank, wallet, or investment product.
- Payments: do not use Google Play Billing for physical goods or external wallet payment handoffs. Use Play Billing only if future digital app features or subscriptions are sold.
- Ads: v1 should declare no ads unless sponsored offers are implemented as ad inventory. Sponsored offers must be labeled in-app and described accurately.
- App Access: provide reviewer credentials for the account flow and a test path that can scan a sample QR without making a real payment.
- Permissions: camera only, requested at scan time, with QR scanning justification.
- Content rating: complete as a financial-feature utility.
- Target API level: verify current Play target API requirement before release.

## Store Listing Copy Guardrails

Store copy must say:

- Paga Menos compares available payment options before you pay.
- You approve payment in your own wallet, bank, or payment app.
- Paga Menos does not process, approve, or move money.
- Discounts are estimates and issuer terms apply.
- Paga Menos is independent and unaffiliated unless an affiliation is explicitly stated.

Store copy must not say:

- Paga Menos pays for the user.
- Paga Menos captures, splits, advances, or guarantees value.
- Paga Menos confirms payment success.
- Paga Menos is an official bank, wallet, card issuer, or merchant partner unless that is contractually true.

## Required Public URLs

- Privacy Policy
- Terms
- Account deletion
- Support contact

The repository markdown files are placeholders for beta implementation. Before Play submission, publish stable HTTPS URLs and set:

- `EXPO_PUBLIC_PRIVACY_URL`
- `EXPO_PUBLIC_TERMS_URL`
- `EXPO_PUBLIC_ACCOUNT_DELETION_URL`
- `EXPO_PUBLIC_SUPPORT_URL`

## Release Gates

- Production AAB builds successfully.
- `npm run public:check` passes.
- `npm run typecheck --workspace @pagamax/app` passes.
- `npm run core:test` passes.
- `npx expo-doctor` passes from `app/`.
- Manifest permission audit confirms no SMS, contacts, notification content, precise location, or background location permissions.
- Reviewer account can create, login, logout, export diagnostics, and delete.
- Backend deletion verification is documented for reviewer support.
