# Real Low-Value QR Testing

Use this for payable QR validation with Naranja X as the main payer. Keep each real payment between ARS 100 and ARS 500.

## Safety Rules

- Approve a payment only when receiver and amount match the test header.
- Stop if the receiver is unclear, the amount is above ARS 500, or the app asks for a different payment method than expected.
- Do not save raw QR payloads, full receipts, credentials, card numbers, or account balances in repo files.
- Do not capture wallet screens unless the screen is intentionally safe to keep.
- Pagamax must never claim it completed, proved, or prefilled a Naranja X payment.

## Controlled Receiver First

1. Create a run:

```bash
npm run qr:real:new -- controlled_receiver 100 "Mercado Pago / controlled receiver" dynamic_amount_closed
```

2. Generate a real ARS 100 QR in the receiver wallet or merchant account.
3. Display that QR on a second screen, printed page, or another phone.
4. Open Pagamax scan on the connected Pixel:

```bash
npm run qr:real:open-scan -- <run-id>
```

5. Scan the QR in Pagamax and record the result:

```bash
npm run qr:real:checkpoint -- <run-id> pagamax_results pass "Merchant and amount matched; Naranja X shown as route or alternative." capture
```

6. Tap the Pagamax CTA to open Naranja X. In Naranja X, manually scan the same QR. Approve only if receiver and amount match.
7. Record each real step:

```bash
npm run qr:real:checkpoint -- <run-id> handoff_opened pass "Naranja X opened from Pagamax."
npm run qr:real:checkpoint -- <run-id> naranjax_review pass "Naranja X showed correct receiver and ARS 100 before approval."
npm run qr:real:checkpoint -- <run-id> payment_approved pass "Approved manually under ARS 500 cap."
npm run qr:real:checkpoint -- <run-id> receiver_confirmed pass "Controlled receiver credited."
```

## Cross-Provider Controls

Do these before claiming any promo path works. They are no-promo interoperability tests, not discount tests:

- `Naranja X -> Naranja X app QR -> Mercado Pago controlled receiver`, ARS 100 dynamic amount-closed QR.
- `Naranja X -> Naranja X app QR -> Mercado Pago controlled receiver`, ARS 100 static amount-entered QR.
- Optional: `Naranja X -> Naranja X app QR -> other controlled wallet receiver`, ARS 100 dynamic QR, if you control another receiver wallet.

Use the generated controlled rows in `reports/real-qr-purchase-simulations.md`:

```bash
npm run qr:targets
npm run qr:real:new -- controlled_receiver 100 "Mercado Pago controlled receiver" dynamic_amount_closed --target-id controlled__nx_to_mercadopago_dynamic_100 --expected-method "Naranja X app QR" --expected-route "Naranja X -> Naranja X app QR -> Mercado Pago controlled receiver"
```

After Pagamax results:

```bash
npm run qr:real:checkpoint -- <run-id> pagamax_results pass "NX to Mercado Pago receiver route checked." --target-id controlled__nx_to_mercadopago_dynamic_100 --merchant-match pass --amount-match pass --top-provider naranjax --top-method "Naranja X app QR" --naranjax-rank 1 --chosen-payer naranjax --chosen-method "Naranja X app QR"
```

After Naranja X review:

```bash
npm run qr:real:checkpoint -- <run-id> naranjax_review pass "Naranja X review matched Mercado Pago receiver and ARS 100." --wallet-provider naranjax --wallet-amount-ars 100 --wallet-instrument "QR" --receiver-match pass --method-match pass --promo-shown unknown
```

## Naranja X Receiver Check

If Naranja X has `hacer un cobro` / `cobrar con QR` enabled:

1. Generate an ARS 100 dynamic QR from Naranja X.
2. Do not use the same Naranja X account as payer if the app blocks or ambiguously allows self-payment.
3. Use a different wallet to pay this specific QR.
4. Record whether Pagamax parses the QR provider, receiver, and amount.

If Naranja X receiver QR is not enabled, mark the run as blocked:

```bash
npm run qr:real:checkpoint -- <run-id> blocked blocked "Naranja X cobrar con QR not enabled on this account."
```

## Store QR Pass

After the controlled receiver pass works, repeat the same process at a kiosk, pharmacy, or supermarket small purchase:

- Ask for ARS 100-500 when possible.
- Start from `reports/real-qr-purchase-simulations.md`, not broad promo rows.
- Pay only rows where `Real payment allowed` is `yes`; rows marked `negative_control`, `blocked_low_value`, or generic merchant are parser/routing safety tests only.
- Scan the merchant QR with Pagamax first.
- Confirm merchant, amount state, QR provider/type, top recommendation, and Naranja X handoff copy.
- Pay manually in Naranja X only if receiver and amount match.

Generate or refresh the current target queue before leaving for a store:

```bash
npm run qr:targets
```

When creating a store run, link it to the target row:

```bash
npm run qr:real:new -- store 300 "Hiperchangomas" dynamic_amount_closed --target-id "<target-id>" --expected-method "Naranja X app QR" --expected-route "Naranja X -> Naranja X app QR -> Hiperchangomas"
```

Record structured route checks after Pagamax results:

```bash
npm run qr:real:checkpoint -- <run-id> pagamax_results pass "Pagamax route checked before wallet approval." --target-id "<target-id>" --merchant-match pass --amount-match pass --top-provider naranjax --top-method "Naranja X app QR" --naranjax-rank 1 --chosen-payer naranjax --chosen-method "Naranja X app QR"
```

Record wallet review without sensitive screenshots or raw payloads:

```bash
npm run qr:real:checkpoint -- <run-id> naranjax_review pass "Wallet review matched test header." --wallet-provider naranjax --wallet-amount-ars 300 --wallet-instrument "Dinero en Cuenta / QR" --receiver-match pass --method-match pass --promo-shown pass
```

Aggregate all runs:

```bash
npm run qr:real:summary
```

## Required Matrix

- Dynamic controlled QR, ARS 100, pay with Naranja X.
- Static controlled QR, ARS 100 entered in Naranja X.
- Dynamic controlled QR, ARS 300-500, pay with Naranja X.
- Same QR source scanned twice; previous session must not leak into the second result.
- Bad or unclear QR; stop before payment and verify Pagamax fallback is safe.
- One store QR with embedded amount.
- One store QR where amount must be entered manually.

## Reporting

List runs:

```bash
npm run qr:real:list
```

Print one run:

```bash
npm run qr:real:report -- <run-id>
```

Each run lives under `reports/real-qr-tests/<run-id>/` with metadata, events, notes, and optional Pagamax-safe screenshots.
