# Public Beta Backend Scaffold

This directory defines the managed backend data model expected by the `public/play-beta` app variant.

The public beta backend must provide:

- Verified account creation and session refresh
- Device binding and logout
- Account deletion request intake and completion tracking
- User payment-method preferences and consent state
- Saved merchants and public recommendation settings
- Redacted telemetry intake
- Remote config exposure logging
- Audit logs for security, support, and admin actions
- Merchant portal data for sponsored offers and aggregate analytics

Expected public API endpoints:

- `POST /v1/auth/magic-link`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `POST /v1/accounts/sync`
- `POST /v1/accounts/consent`
- `POST /v1/accounts/payment-methods`
- `POST /v1/accounts/delete`
- `POST /v1/telemetry/batch`
- `GET /v1/remote-config`
- `POST /v1/support/audit`
- `GET /v1/merchant/dashboard`
- `POST /v1/merchant/offers`

Every endpoint must require server-side validation. User endpoints require authenticated sessions before production. Merchant and admin endpoints require role-based authorization and audit logging.
