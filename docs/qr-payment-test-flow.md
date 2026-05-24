# QR payment prompt test flow

Use the connected phone with Pagamax installed. The structured fixture source is `packages/pagamax-core/tests/fixtures/qr-payment-scenarios.json`.

The fixtures are non-paying test strings for parser, recommendation, and UX validation. Real wallet payment still requires a real merchant QR and user confirmation inside the payment app. Dummy CRC values such as `FFFF` are acceptable for parser fixtures because Pagamax does not execute payment from the payload.

## Fixture coverage

| Scenario | Merchant/context | QR/provider | Amount | Expected behavior |
| --- | --- | --- | --- | --- |
| `repo-carrefour-mercadopago-amount` | Carrefour | Mercado Pago dynamic | Yes | Parse merchant and amount, rank best available discount, open selected app. |
| `repo-carrefour-no-amount` | Carrefour | Static QR | No | Show estimated ranking and let the user adjust amount. |
| `repo-unknown-merchant` | Kiosco Prueba | Static QR | Yes | Use configured default fallback when no discount is available. |
| `carrefour-mp-manufactured` | Carrefour | Mercado Pago-like dynamic | Yes | Validate common supermarket flow with provider hint. |
| `coto-modo-manufactured` | Coto | MODO-compatible dynamic | Yes | Do not synthesize MODO links; open selected installed app or fallback. |
| `ypf-prisma-manufactured` | YPF | Prisma-like dynamic | Yes | Validate fuel-station parsing and ranking. |
| `farmacity-mp-no-amount-manufactured` | Farmacity | Mercado Pago-like static | No | Keep merchant visible and show estimated amount state. |
| `dia-naranjax-manufactured` | DIA | Naranja X-like dynamic | Yes | Validate Naranja X provider hint and manual scanner fallback. |
| `jumbo-coelsa-no-amount-manufactured` | Jumbo | Coelsa-like static | No | Validate interoperable rail hint and estimated amount state. |
| `disco-modo-manufactured` | Disco | MODO-compatible dynamic | Yes | Validate supermarket group merchant context. |
| `vea-mp-manufactured` | Vea | Mercado Pago-like dynamic | Yes | Validate Vea merchant context. |
| `generic-transferencias-3-adquirente` | Generic Transferencias 3.0 | Acquirer domain | No | Preserve unknown provider domain as a hint and fall back safely. |

## Phone flow

1. Open Pagamax on the connected phone.
2. Tap `Escanear QR`.
3. In debug mode, paste one fixture payload.
4. Confirm the result screen shows merchant, amount state, QR type/provider when available, and the dominant recommended method.
5. Tap the dominant CTA, for example `Abrir Naranja X`, `Abrir Mercado Pago`, or `Abrir Personal Pay`.
6. Stop before approving any real payment.
7. Return to Pagamax and tap `Simular pago confirmado`.
8. Confirm the simulated success screen updates activity, totals, recent merchants, and the next-payment CTA.

## Required cases

| Case | Fixture or setup | Expected result |
| --- | --- | --- |
| QR with merchant and amount | `repo-carrefour-mercadopago-amount` | Merchant and amount are shown, recommendation is ranked, CTA opens selected app. |
| QR with merchant but no amount | `repo-carrefour-no-amount` | Amount is labelled estimated/reference and user can adjust before paying. |
| Unknown merchant | `repo-unknown-merchant` | No merchant-specific promo is assumed; default fallback route appears. |
| Best method installed | Any fixture where the top method is installed | CTA opens the installed app or verified payment entry point. |
| Best method not installed | Disable installed methods or select standalone MODO | CTA opens Google Play/search instead of pretending handoff worked. |
| No discount available | `repo-unknown-merchant` | Configured default method, Mercado Pago, is listed first as fallback. |
| Connected phone scanning itself | Any fixture pasted/scanned on the same phone | Same scan, rank, instruction, handoff, and simulated-return loop. |

## Safety checks

- Do not approve or complete real payments.
- Do not bypass Face ID, PIN, biometric, bank confirmation, or OS permission prompts.
- Do not store credentials or private app data.
- If a wallet does not accept QR payload or amount by documented handoff, open the app and keep the merchant, amount, reason, and manual scanner instruction visible in Pagamax.
