# User-Owned Funding Checkout

Pagamax public checkout uses user-owned funding destinations. It must not route customer funds to operator-owned aliases in public builds.

## Runtime Model

- Users configure their own wallet aliases/CVUs during setup.
- Backend stores raw aliases only in an encrypted alias vault; tracked files and public bundles store no raw aliases.
- The app/backend use `FundingDestination.aliasHash` and optional `cvuHash` for matching, audit, and route-plan binding.
- A destination can be used at checkout only when `checkoutAllowed=true`, `verificationStatus` is `verified` or `same_owner_verified`, and same-owner proof is acceptable for the selected rail.

## Checkout Rails

Checkout routes are ranked by executable value, not raw discount:

`routeNetValueArs = estimatedSavingsArs - frictionPenaltyArs - failureRiskPenaltyArs`

Allowed fast rails:

- `ready_balance`: wallet/card can pay immediately.
- `linked_card`: wallet can pay using a linked card without balance transfer.
- `debin_pull`: top-up/pull rail exists and user approves in source app.
- `verified_prefilled_transfer`: provider supports exact prefilled transfer and user approves in source app.
- `wallet_scanner`: target app opens scanner quickly; no copy/paste or manual transfer.

Routes requiring copy/paste or manual app-to-app funding are hidden at checkout.

## Signed Route Plans

Any route that prepares a transfer/top-up must use a backend-signed `CheckoutRoutePlan` bound to:

- QR hash
- merchant name
- exact amount
- provider
- Android package
- funding rail
- destination alias hash
- account identity hash and verification status when same-owner funding is used
- method owner identity hash and verification status when same-owner funding is used
- route id, nonce, issue time, and expiry

Plans expire within two minutes and are single-use server-side. The mobile app verifies the signature and package/url allowlists before opening any handoff. Same-owner funding plans must fail closed unless account and method identity hashes match and both statuses are `same_owner_verified`.

## Abuse Rules

- Screenshots are never proof of transfer or payment.
- Wrong amount, wrong destination, expired route, replayed nonce, or package mismatch must fail closed.
- Support cannot edit aliases or mark payments successful without audited dual-control review.
- Public builds must keep owner split flow, bundled receiving aliases, simulated payment proof, and operator balances disabled.
