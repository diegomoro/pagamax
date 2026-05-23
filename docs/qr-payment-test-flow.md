# QR payment prompt test flow

Use the connected phone with Paga Menos installed. These sample EMV payloads are non-paying test strings for parser/recommendation validation; real wallet payment still requires a real merchant QR and user confirmation inside the payment app.

## Sample payloads

- Carrefour with amount and provider hint:
  `00020101021226270011mercadopago010812345678520454115802AR5909Carrefour6004CABA5405123456304FFFF`
- Carrefour with merchant but no amount:
  `000201010211520454115802AR5909Carrefour6004CABA6304FFFF`
- Unknown merchant:
  `000201010211520459995802AR5912Kiosco Prueba6004CABA5405100006304FFFF`

## Cases

1. QR with merchant and amount: paste the Carrefour amount payload in debug scan mode. Expected: merchant and amount are shown, recommendation is ranked, CTA opens the selected app, and Paga Menos says whether QR/amount handoff is manual.
2. QR with merchant but no amount: paste the Carrefour no-amount payload. Expected: Paga Menos labels the amount as estimated/reference and lets the user adjust it before paying.
3. Unknown merchant: paste the unknown payload. Expected: no merchant-specific promo is assumed; fallback/default route is shown.
4. Best method installed: use a result whose provider is Naranja X, Mercado Pago, BBVA, Banco Carrefour, BNA+, Bancon, or Personal Pay. Expected: CTA opens the installed app or verified payment entry point.
5. Best method not installed: disable installed methods or select a provider not installed, such as standalone MODO. Expected: CTA falls back to Google Play/search instead of pretending handoff worked.
6. No discount available: use the unknown merchant payload. Expected: the configured default method, Mercado Pago, is listed first as the fallback.
7. Connected phone scanning itself: scan or paste on the same phone. Expected: same flow: scan, rank, show instruction, open selected app; no automatic payment confirmation.
