# Payment app capability matrix

Validated on the connected Pixel 8a on 2026-05-23 with Android package manager queries. This does not prove that private payment screens accept arbitrary QR payloads or amounts; it only records what the installed apps expose to Android.

| Method/app | Package | Installed | Can open app | Payment deep link | Receives QR payload | Receives amount | Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Naranja X | `com.tarjetanaranja.ncuenta` | Yes | Yes | `nx://qr-payments-v2/screen` resolves | No verified contract | No verified contract | Open Naranja X QR/payment screen and show merchant, amount, and reason in Paga Menos. |
| Mercado Pago | `com.mercadopago.wallet` | Yes | Yes | `mercadopago://qr` resolves | No verified contract | No verified contract | Open Mercado Pago QR scanner and show merchant, amount, and reason in Paga Menos. |
| Banco Carrefour | `com.carrefour.bancadeserviciosfinancieroscarrefour` | Yes | Yes | None verified | No verified contract | No verified contract | Open Banco Carrefour and show merchant, amount, and reason in Paga Menos. |
| BNA+ | `com.banconacion.bnamas` | Yes | Yes | None verified | No verified contract | No verified contract | Open BNA+ and show merchant, amount, and reason in Paga Menos. |
| Bancon | `ar.com.bancor.bancon` | Yes | Yes | Real `bancon.bancor.com.ar/modo/*` links resolve, but Paga Menos cannot synthesize one | No verified contract | No verified contract | Open Bancon and show merchant, amount, and reason in Paga Menos. |
| Personal Pay | `ar.com.personalpay` | Yes | Yes | None verified | No verified contract | No verified contract | Open Personal Pay and show merchant, amount, and reason in Paga Menos. |
| BBVA Argentina | `com.bbva.nxt_argentina` | Yes | Yes | Real `www.modo.com.ar/pagar/*` links resolve, but Paga Menos cannot synthesize one | No verified contract | No verified contract | Open BBVA and show merchant, amount, and reason in Paga Menos. |
| MODO standalone | `ar.com.modo` | No | No | Not installed | No | No | Open Google Play if selected. |

## Implementation note

The implemented flow is intentionally user-confirmed:

1. Paga Menos scans the QR and parses merchant, amount, QR type, and provider hints when the EMV payload exposes them.
2. It matches the merchant against the promo index and ranks the user's configured payment methods by expected net savings.
3. If a useful discounted method exists, the top recommendation is shown as the dominant route.
4. If no discounted method is eligible, the fallback recommendation uses the configured default payment method first.
5. The CTA opens the target app or payment entry point when verified by Android package resolution.
6. Paga Menos does not send QR payloads or amounts to third-party apps unless a verified contract exists. None was found on this phone, so the app shows the merchant, amount, and reason before opening the selected payment app.
7. The final payment confirmation remains inside the wallet/bank app and must be completed manually by the user.

Manual validation still needed:

- Confirm each wallet's in-app destination after opening from the CTA while the user is logged in.
- Validate whether Naranja X or Mercado Pago expose a supported partner/API handoff for preloading a scanned QR payload.
- Validate real bank-generated MODO links for BBVA and Bancon; the app should not synthesize those links without official support.
