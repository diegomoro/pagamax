# Payment app capability matrix

Validated on the connected Pixel 8a on 2026-05-24 with Android package manager queries, resolver checks, and Pagamax handoff smoke tests. This records what the installed apps expose to Android; it does not claim private QR payload or amount handoff support unless explicitly verified.

| Method/app | Package | Installed | Can open app | Payment deep link | Receives QR payload | Receives amount | Reaches confirmation screen | Fallback behavior | Validation status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Naranja X | `com.tarjetanaranja.ncuenta` | Yes | Yes | Protected: `nx://qr-payments-v2/screen` resolves but external launch is denied by `DEEPLINK_PERMISSION` | No verified contract | No verified contract | Not validated with a real payable QR | Open Naranja X by package launch, keep merchant/amount visible in Pagamax, and instruct the user to scan manually. | Package launch verified; deep link rejected | Package launch stops at Naranja X biometric/startup state. Pagamax must not synthesize QR payloads. |
| Mercado Pago | `com.mercadopago.wallet` | Yes | Yes | `mercadopago://qr` resolves to scanner entrypoint | No verified contract | No verified contract | Not validated with a real payable QR | Open Mercado Pago scanner, keep merchant/amount visible in Pagamax, and instruct the user to scan manually. | Resolver verified; scanner entry verified by Android | Best public handoff found for scanner entry; no amount/QR parameter contract verified. |
| Banco Carrefour | `com.carrefour.bancadeserviciosfinancieroscarrefour` | Yes | Yes | App launch scheme resolves | No verified contract | No verified contract | Not validated | Open Banco Carrefour and show merchant/amount/reason for manual payment. | Launcher verified | No QR/payment deep link exposed in tested resolver paths. |
| BNA+ | `com.banconacion.bnamas` | Yes | Yes | `bnamas://` resolves to `VTSpecialStartActivity` | No verified contract | No verified contract | Not validated | Open BNA+ and show merchant/amount/reason for manual QR payment. | Launcher verified | QR-only account support remains manual unless BNA+ exposes a documented handoff contract. |
| Bancon | `ar.com.bancor.bancon` | Yes | Yes | `bancor://` resolves; real Bancon/MODO web links resolve but are not synthesized | No verified contract | No verified contract | Not validated | Open Bancon and show merchant/amount/reason for manual payment. | Launcher verified | Paga Menos cannot safely invent bank-generated MODO links. |
| Personal Pay | `ar.com.personalpay` | Yes | Yes | App scheme resolves to `MainActivity` | No verified contract | No verified contract | Not validated | Open Personal Pay and show merchant/amount/reason for manual QR payment. | Launcher verified; Pagamax CTA smoke tested previously | Previous phone smoke test opened a Personal Pay-related permission/entry flow from Pagamax. |
| BBVA Argentina | `com.bbva.nxt_argentina` | Yes | Yes | No `bbva://` resolver; package launch works | No verified contract | No verified contract | Not validated | Open BBVA and show QR details for manual payment. | Launcher verified | Real MODO web links may route into BBVA, but Pagamax should not synthesize them. |
| MODO standalone | `ar.com.modo` | No | No | Not installed | No | No | No | Open Google Play/search if selected. | Absence verified | Several bank apps can handle MODO links, but standalone MODO is not installed. |
| Uala | package not present | No | No | Not installed | No | No | No | Open Google Play/search if selected. | Absence verified | Not in the configured default method set. |
| Cuenta DNI | package not present | No | No | Not installed | No | No | No | Open Google Play/search if selected. | Absence verified | Not in the requested payment-phone method list. |

## Implementation note

The implemented flow is intentionally user-confirmed:

1. Pagamax scans or ingests the QR and parses merchant, amount, QR type, and provider hints when the EMV payload exposes them.
2. It matches the merchant against the promo index and ranks the user's configured payment methods by expected net savings.
3. If a useful discounted method exists, the top recommendation is shown as the dominant route.
4. If no discounted method is eligible, the fallback recommendation uses the configured default payment method first.
5. The CTA opens the target app or payment entry point when verified by Android package resolution.
6. Pagamax does not send QR payloads or amounts to third-party apps unless a verified public contract exists. None was verified on this phone, so the app shows the merchant, amount, and reason before opening the selected payment app.
7. After handoff, Pagamax provides a safe simulated completion path so the full UX loop can be reviewed without approving or completing a real payment.

Manual validation still needed:

- Test a real merchant QR while logged into each payment app and stop at the final confirmation/PIN/biometric screen.
- Confirm whether Naranja X or Mercado Pago offer a documented partner handoff for preloading a QR payload or amount.
- Validate real bank-generated MODO links for BBVA and Bancon; the app should not synthesize those links without official support.
