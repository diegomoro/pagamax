# Paga Menos Public Beta Privacy Policy

Last updated: 2026-06-06

Paga Menos is an independent payment recommendation tool. It helps users compare available wallet, bank, card, and merchant discount options before they complete a payment in their own payment app. Paga Menos does not process payments, approve payments, store bank credentials, store card numbers, or perform biometric verification.

This public beta privacy policy is written for the Google Play public beta build.

## Data We Collect

We collect only the data needed to provide recommendations, operate accounts, improve the product, prevent abuse, and support future aggregated commercial insights:

- Account identifiers: email address, display name, account id, device binding id, session status, and deletion request status.
- Payment method preferences: enabled providers, saved method toggles, optimization mode, remembered merchants, and consent settings.
- QR-derived checkout metadata: merchant name, merchant category, amount or amount band, payment provider hint, QR type, and whether the amount was estimated.
- App interactions: recommendation set shown, ranking position, selected payment method, handoff target, return-from-wallet event, saved merchant event, stale-data exposure, sponsored-offer exposure, and feedback.
- Diagnostics: app version, device class, operating system version, crash logs, error category, remote config version, and sync status.
- Optional approximate region: city or region only when the user consents or when it is derived from merchant metadata rather than precise device location.

By default, Paga Menos does not collect full raw QR payloads, bank credentials, card numbers, bank secrets, biometric data, SMS messages, contacts, notification contents, precise location, or payment approval data.

## How We Use Data

We use data to:

- Rank payment options and discounts for the user.
- Remember user preferences and recent merchants.
- Operate account login, logout, session refresh, and device binding.
- Detect stale promotions, broken wallet handoffs, abuse, and fraud patterns.
- Improve speed, reliability, and recommendation quality.
- Provide aggregated merchant, issuer, and wallet insights without exposing individual users.
- Measure sponsored-offer performance when sponsored offers are enabled and clearly labeled.

## Sharing

We may share data with:

- Managed backend, analytics, crash reporting, hosting, and support providers that help us operate Paga Menos.
- Merchants, issuers, wallets, or partners as aggregated or pseudonymized insights, such as category demand, recommendation share, and conversion bands.
- Authorities, payment networks, or security partners when required by law or necessary to investigate abuse.

We do not sell raw user QR payloads, credentials, card numbers, or individual payment history.

## Retention

Account data, preferences, saved merchants, diagnostics tied to a user id, and telemetry identifiers are deleted when the user deletes the account, except for limited security, fraud, audit, and legal records retained under a disclosed retention schedule.

Raw operational events are kept short-term for debugging and abuse prevention. Long-term business value should be retained as pseudonymized cohorts and aggregates.

## Account Deletion

Users can request deletion in the app from Profile > Data and privacy > Delete account, or by using the public deletion page:

https://pagamenos.app/delete-account

Deletion removes the profile, aliases, saved merchants, payment method configuration, diagnostics tied to the user id, and telemetry identifiers from active systems, except limited security, fraud, audit, and legal records.

## User Controls

The app includes controls for analytics, merchant insights, sponsored-offer measurement, diagnostic export, logout, and deletion. Camera permission is requested only when scanning a QR code.

## Contact

Support: support@pagamenos.app

This policy may be updated before production launch. Material changes will be reflected in the public policy URL and, when required, inside the app.
