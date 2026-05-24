# QR payment testing report

Date: 2026-05-24

Device: connected Pixel 8a

Final installed preview build: `a79e1877-df88-47c7-895b-c6d1b61ca69f`

## QR sources

- Public official source reviewed: BCRA Transferencias 3.0 overview (`https://www.bcra.gob.ar/transferencias-3-0/`).
- No public, safe, real merchant QR payloads for Carrefour, Coto, YPF, Farmacity, Dia, Jumbo/Disco/Vea, or wallet-specific live payments were used.
- Structured fixtures are therefore marked as either `repo_fixture`, `manufactured_emvco_transferencias_3_format`, or `official_format_example`.
- Manufactured payloads are for parser/recommendation/UX validation only; they are not payable QRs.

## QR fixtures tested in automated core tests

| Fixture | Merchant | Provider hint | Amount | Result |
| --- | --- | --- | --- | --- |
| `repo-carrefour-mercadopago-amount` | Carrefour | Mercado Pago | 12345 | Passed |
| `repo-carrefour-no-amount` | Carrefour | None | None | Passed |
| `repo-unknown-merchant` | Kiosco Prueba | None | 10000 | Passed |
| `carrefour-mp-manufactured` | Carrefour | Mercado Pago | 12345 | Passed |
| `coto-modo-manufactured` | Coto | MODO | 28750 | Passed |
| `ypf-prisma-manufactured` | YPF | Prisma | 35000 | Passed |
| `farmacity-mp-no-amount-manufactured` | Farmacity | Mercado Pago | None | Passed |
| `dia-naranjax-manufactured` | DIA | Naranja X | 9800 | Passed |
| `jumbo-coelsa-no-amount-manufactured` | Jumbo | Coelsa | None | Passed |
| `disco-modo-manufactured` | Disco | MODO | 18400 | Passed |
| `vea-mp-manufactured` | Vea | Mercado Pago | 22100 | Passed |
| `generic-transferencias-3-adquirente` | FULL NAME | `com.adquirente` | None | Passed |

## Payment apps tested

| App | Installed | Launch/deep link result | QR payload handoff | Amount handoff | Confirmation-screen status | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| Mercado Pago | Yes | `mercadopago://qr` resolves to scanner entrypoint; Pagamax CTA opened Mercado Pago app-lock/biometric boundary | Not verified | Not verified | Stopped safely at biometric/app-lock before payment | Open scanner and instruct manual scan. |
| Naranja X | Yes | Package launch opens Naranja X biometric/startup state; QR deep link is protected by `DEEPLINK_PERMISSION` | Not verified | Not verified | Stopped safely at biometric/startup before payment | Open app and instruct manual scan. |
| Personal Pay | Yes | App scheme resolves; previous Pagamax CTA opened Personal Pay entry/permission flow | Not verified | Not verified | Needs real merchant QR/login validation | Open app and instruct manual scan. |
| Banco Carrefour | Yes | App scheme resolves | Not verified | Not verified | Needs real merchant QR/login validation | Open app and keep merchant/amount visible. |
| BNA+ | Yes | `bnamas://` resolves | Not verified | Not verified | Needs real merchant QR/login validation | Open app and instruct manual scan. |
| Bancon | Yes | `bancor://` resolves | Not verified | Not verified | Needs real merchant QR/login validation | Open app and keep merchant/amount visible. |
| BBVA Argentina | Yes | Package launch works; no `bbva://` resolver | Not verified | Not verified | Needs real merchant QR/login validation | Open app and keep merchant/amount visible. |
| MODO standalone | No | Not installed | No | No | Not applicable | Open Google Play/search if selected. |

## Phone UX scenarios tested

| Scenario | Result |
| --- | --- |
| Carrefour Mercado Pago QR with amount | Parsed `Carrefour`, `$12.345`, provider `mercadopago`, dynamic QR. Result screen showed dominant Mercado Pago CTA and manual scanner fallback. CTA opened Mercado Pago and stopped at biometric/app-lock. Returning to Pagamax showed `Cuando vuelvas` and `Simular pago confirmado`; simulated success recorded activity. |
| Carrefour QR without amount | Parsed `Carrefour`, static QR, no amount. Result screen showed `QR sin monto - ranking estimado`, adjustment prompt, and manual fallback with `monto no detectado`. |
| Unknown merchant with amount | Parsed `Kiosco Prueba`, `$10.000`, static QR, `match=none`. Result used configured default Mercado Pago fallback and kept merchant/amount visible. |
| Malformed pasted unknown QR | Bad Android paste without escaped space produced a malformed TLV. Pagamax did not freeze and still fell back safely, which is useful as a robustness check. |

## What worked

- Parser extracts merchant, amount, provider hint, and static/dynamic QR type across 12 structured fixtures.
- Unknown provider domains are preserved as provider hints instead of being dropped.
- Recommendation flow keeps the main action as QR scanning and shows the dominant best method.
- Handoff CTA opens installed wallet/bank apps or verified QR entry points where available.
- Manual fallback copy now explicitly tells the user to open the QR scanner in the selected app when direct handoff is not verified.
- Post-handoff simulated completion lets the full UX loop update activity, totals, recent merchants, and next-payment surfaces without approving a real payment.
- Installed payment apps were launch-smoke-tested through ADB foreground activity checks: Mercado Pago, Naranja X, Personal Pay, Banco Carrefour, BNA+, Bancon, and BBVA.

## What failed or remains manual

- No tested app exposed a verified public contract for arbitrary QR payload handoff from Pagamax.
- No tested app exposed a verified public amount-prefill contract from Pagamax.
- Naranja X QR/home deep links are protected by `DEEPLINK_PERMISSION`, so Pagamax uses package launch plus manual scanner guidance.
- Reaching the final payment review/confirmation screen still needs a real merchant QR while logged into each wallet. That must stop at Face ID/PIN/biometric/final confirmation.
- Standalone MODO is not installed on the phone. Bank apps may handle real MODO links, but Pagamax does not synthesize those links.

## Validation commands run

- `npm run core:test`
- `npm run core:build`
- `npm run typecheck --workspace @pagamax/app`
- `adb shell pm list packages` filtered for requested payment apps
- `adb shell cmd package resolve-activity` for Mercado Pago, Naranja X, Personal Pay, BNA+, Bancon, Banco Carrefour, and BBVA launch/deep-link paths
- EAS preview APK build/install for `8f495bcd-0008-4d7c-b5f8-eb61eb1d58ac` during UX testing
- Corrected EAS preview APK build/install for `a79e1877-df88-47c7-895b-c6d1b61ca69f` after Naranja X permission validation

## Next real-world validation

1. Use real merchant QRs at Carrefour, Coto, YPF, Farmacity, DIA, Jumbo/Disco/Vea, and Mercado Pago/MODO contexts.
2. For each selected app, stop at the payment review/confirmation/PIN/biometric step.
3. Record whether the app opened scanner, review, login, or fallback.
4. Only mark `reaches confirmation screen` as verified after this real-device, real-QR check.
