# Owner-phone QR routing

Pagamax now has a two-sided QR route for cases where the owner phone has the best extractable discount.

## Editable method file

The editable seed is `app/assets/data/default-methods.json`.

Each method can declare:

- `enabled`: set by app storage after first load; missing means enabled.
- `ownerPhone`: whether this method belongs to the owner phone.
- `canPayMerchantQr`: whether it may be used to pay the merchant QR.
- `canReceiveCustomerTransfer`: whether it may receive the customer's transfer.
- `receivingAlias`: alias shown to the customer.
- `availableBalanceArs` or `creditAvailableArs`: available amount for paying the merchant QR.
- `qrTransferLimitRemainingArs`: remaining QR/payment limit for this method.
- `promoCapRemainingArs`: remaining promo value available on this method.
- `restrictions`: free-form labels such as `billetera_virtual_only` or `fuel_app_only`.

An owner route is only selected when balance/credit, QR limit, remaining promo cap, and a different-provider receiving alias are configured. If any of those are missing, Pagamax falls back to the normal top-5 recommendation list instead of defaulting to an unsafe route.

## Split calculation

For a QR amount `A` and eligible discount `D`:

- Customer pays `A - D / 2` to the chosen receiving alias.
- Customer keeps `D / 2` as their discount.
- Owner phone pays the original merchant QR with the selected wallet/bank.
- Pagamax captures `D / 2` as the owner-side value.

The app still stops at wallet/app handoff and does not approve real payments automatically.

## Tests

Run:

```bash
npm run core:test
npm run core:build
npm run typecheck --workspace @pagamax/app
```

Coverage includes owner-route eligibility, discount splitting, remaining cap behavior, same-provider alias exclusion, default method config validation, and all current QR corpus fixtures.
