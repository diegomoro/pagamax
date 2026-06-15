# Google Play Store Listing Assets

Last updated: 2026-06-12

Use this as the exact store listing draft for the first Android public launch. All screenshots must show the final public build, not prototype screens.

## Listing Copy

App name:

```text
Paga Menos
```

Short description, 80 characters max:

```text
Elegí con qué app o tarjeta pagar y aprovechá mejor cada descuento.
```

Full description:

```text
Paga Menos te ayuda a decidir con qué wallet, banco, tarjeta o app conviene pagar antes de confirmar una compra.

Escaneá un QR, revisá el comercio y el monto cuando estén disponibles, y compará tus métodos de pago con promociones y condiciones vigentes. La app muestra una recomendación clara, el ahorro estimado y el camino más simple para abrir tu wallet o banco.

Paga Menos no procesa pagos, no aprueba pagos, no mueve dinero y no guarda credenciales bancarias ni números completos de tarjeta. Siempre confirmás el pago dentro de tu propia wallet, banco o app de pago.

Los descuentos, topes, fechas, exclusiones y reintegros pueden cambiar. La recomendación es una estimación basada en los datos disponibles y las condiciones finales dependen del emisor, wallet, banco, comercio o proveedor de pago.

Paga Menos es independiente de bancos, wallets, emisores, comercios y proveedores de pago salvo que una relación comercial se indique expresamente.
```

## Graphics

App icon:

- Source: `app/assets/icon.png`
- Required Play upload: 512 x 512 PNG, 32-bit with alpha, max 1024 KB
- Must not include ranking, price, discount, Play badge, or misleading notification marks

Feature graphic:

- Required size: 1024 x 500
- Format: JPEG or 24-bit PNG without alpha
- Creative direction: a clean checkout moment with the Paga Menos brand and copy `Antes de pagar, escaneá`
- Do not include exact discount percentages, cash amounts, store rankings, or bank/wallet logos without rights clearance

Phone screenshots:

- Minimum to publish: 2 screenshots
- Required launch set: 6 portrait screenshots
- Recommended size: 1080 x 1920 PNG/JPEG, no alpha
- Show actual app UI only; avoid device frames and added marketing panels

Screenshot sequence:

1. Home/scan entry with the primary `Escanear QR` action.
2. Camera scan screen using a non-payable demo QR.
3. Result screen showing merchant, amount, top recommendation, and "confirmás en tu app" safety copy.
4. Recommendation detail showing why the method won and issuer-terms caveat.
5. Methods/preferences screen showing wallet/card toggles without real personal data.
6. Profile/data controls showing privacy, terms, support, diagnostics, and delete account.

Screenshot data rules:

- Use demo merchant names or public test fixtures only.
- Do not show real account emails, aliases, QR payloads, card numbers, balances, bank secrets, or receipts.
- Do not show simulated payment success as if Paga Menos completed a payment.
- If a screenshot includes savings, label it as estimated.

## Reviewer Test Asset

Use this non-payable QR/parser payload for review and screenshots:

```text
00020101021226270011mercadopago010812345678520454115802AR5909Carrefour6004CABA5405123456304FFFF
```

Expected parser result:

- Merchant: Carrefour
- Amount: ARS 12,345
- Provider hint: Mercado Pago
- Flow: recommendation plus wallet/manual scanner handoff

This payload is for parser and recommendation validation only. Do not represent it as a real payable merchant QR.

## Closed Testing Evidence

Keep a dated folder outside the shipped app with:

- Tester roster and opt-in dates
- Play closed testing track URL
- Build version code tested
- Device/Android version matrix
- Real QR test notes
- Crash-free sessions summary
- Top issues found and fixed
- Feedback screenshots with personal data redacted
- Production access answers prepared for Play Console
