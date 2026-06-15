# Public Beta Backend Scaffold

This package is the Vercel + Neon API scaffold for the public Android beta. It uses `schema.sql` as the database source of truth and keeps the app in recommendation/router mode only.

## Implemented API

- `GET /v1/health`
- `POST /v1/auth/magic-link`
- `POST /v1/auth/exchange`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `POST /v1/accounts/sync`
- `POST /v1/accounts/consent`
- `POST /v1/accounts/payment-methods`
- `POST /v1/accounts/delete`
- `POST /v1/telemetry/batch`
- `GET /v1/remote-config`
- `GET /v1/merchant/dashboard`
- `POST /v1/merchant/offers`

Public beta safety blocks:

- `POST /v1/accounts/funding-destinations`
- `POST /v1/accounts/funding-destinations/verify`
- `POST /v1/checkout/route-plans`
- `POST /v1/checkout/route-plans/opened`

Those endpoints intentionally return `403 funding_disabled_public_beta` until a real same-owner verification provider, alias vault, signed route-plan issuer, and policy review exist.

## Runtime Requirements

Required environment variables:

- `DATABASE_URL`: Neon Postgres connection string.
- `PAGAMAX_AUTH_TOKEN_SECRET`: at least 32 characters.
- `PAGAMAX_TOKEN_PEPPER`: at least 32 characters, used for magic/refresh/device token hashes.
- `PAGAMAX_IDENTITY_PEPPER`: at least 32 characters, used for DNI/CUIL-derived identity hashes.

Email/auth variables:

- `RESEND_API_KEY`: required for production magic-link delivery.
- `PAGAMAX_MAGIC_LINK_FROM`: optional sender, defaults to `Paga Menos <login@pagamenos.app>`.
- `PAGAMAX_APP_DEEP_LINK_BASE`: optional, defaults to `pagamenos://auth`.
- `PAGAMAX_ALLOW_DEV_AUTH_RESPONSE=true`: development only; returns `devExchangeToken` in magic-link responses.

Merchant/admin variables:

- `PAGAMAX_MERCHANT_API_KEY`: shared secret for the initial merchant dashboard/offers MVP.

Public URL variables:

- `PAGAMAX_PRIVACY_URL`
- `PAGAMAX_TERMS_URL`
- `PAGAMAX_ACCOUNT_DELETION_URL`
- `PAGAMAX_SUPPORT_URL`

## Security Rules

- Account endpoints require bearer access tokens after magic-link exchange.
- Refresh tokens are random, pepper-hashed at rest, and rotated on refresh.
- Magic links are one-time and pepper-hashed at rest.
- Client-provided DNI/CUIL is normalized and hashed, but never marks an account or method as `same_owner_verified`.
- Client-provided payment-method owner verification is downgraded to `unverified`, `pending`, `mismatch`, or `rejected`; `same_owner_verified` must come from future provider evidence.
- Telemetry stores amount bands and aggregate merchant/provider fields only. Raw QR payloads, exact amounts, aliases, DNI/CUIL, card data, email, phone, contacts, precise location, tokens, and secrets are scrubbed.
- Merchant offer placement is always `labeled_secondary`; paid placement cannot override the best organic recommendation.

## Local Commands

From the repo root:

- `npm run backend:build`
- `npm run backend:test`

Deploy from `backend/public-beta` on Vercel. `vercel.json` rewrites `/v1/*` to the Vercel function path `/api/v1/*`.
