# Retail and merchant critique loop

Date: 2026-06-04

Objective: maximize time-discounted net profit by increasing repeat retail usage and merchant willingness to pay without breaking trust. Target score is 20/20: 10/10 retail experience plus 10/10 merchant value. Retail habit and merchant demand are means to the profit objective; trust, speed, and legal safety are constraints because damaging them reduces future profit.

## Ideal retail user

Profile: busy shopper in Argentina, often paying by QR, uses several wallets/cards, wants to feel clever, does not want to read rules, does not know financial/product terms, and will churn if the app feels slow, confusing, scammy, or like coupons.

Harsh retail critiques:

1. "Ruta inteligente" sounds like a bank consultant, not something my mom or friend says.
2. "Sin confirmar nada por vos" is legally clear but emotionally clumsy.
3. People want "with what do I pay?", not "recommendation engine".
4. The first screen must say the habit: before paying, scan.
5. The QR button must feel like the whole app, not one feature among many.
6. Users do not want to compare five options in line.
7. "Confidence" is useful, but only after the main answer is obvious.
8. "Ahorro neto" can be too financial; "plata para vos" is more human.
9. Users like feeling smart, but hate being told they are smart.
10. Avoid casino, jackpot, points-for-points, fake badge energy.
11. The app must never look like it can take money or pay alone.
12. If no discount exists, the app still needs to feel useful, not like it failed.
13. If sponsored content appears, users must instantly know it is marked.
14. "Pauta separada" protects trust, but keep it short.
15. Returning from a wallet needs a clear "I am back" path.
16. Success should reward the behavior of checking first, not buying more.
17. Sharing should feel like helping a friend, not referral spam.
18. History should say "money kept" more than "activity analytics".
19. Manual entry should be a rescue path, not a form.
20. Older users need verbs: scan, use this, confirm.
21. Busy parents need fewer words and no nested decisions.
22. Promo-savvy users still need details, but behind "ver el por que".
23. Payment safety language must be plain: "Vos confirmas siempre."
24. It should work even when the QR has no amount.
25. It should not shame users for previously paying wrong.

## Ideal merchant client

Profile: supermarket, pharmacy, fuel, large retailer, wallet/bank partner, or local chain that wants measurable high-intent demand near checkout without destroying consumer trust.

Harsh merchant critiques:

1. I will pay more if users check Pagamax before choosing where or how to pay.
2. I will not pay for generic impressions; I want shoppers with payment intent.
3. I need proof that sponsored placement is visible but trust-safe.
4. If paid spots secretly override best savings, users will churn and my media value falls.
5. I want to appear when my offer is relevant to category, amount, wallet, and location.
6. I need the user to see estimated benefit, not just my logo.
7. I need clear separation between "best for user" and "paid but useful".
8. I would pay more for repeat-merchant habit loops.
9. I would pay more for category expansion: grocery, fuel, pharmacy, online, travel.
10. I want attribution after scan/manual search, not vanity clicks.
11. I want to win shoppers before they pick a competitor.
12. I need the app to feel premium; cheap coupon vibes lower merchant brand value.
13. The app must not imply the merchant promo is guaranteed when caps/days are uncertain.
14. Paid discovery should be a helpful nudge, not an ad banner.
15. The value proposition is "incremental checkout decisions", not "ads".
16. Merchants need confidence that users understand the value in seconds.
17. Merchant copy must not leak too much B2B language into retail flow.
18. Paid placement should be marked as paid, with the actual shopper benefit visible.
19. The retail app should stay QR-first; merchant discovery is secondary.
20. A merchant should be willing to pay for a slot only if it preserves user trust.
21. The app should show local relevance for Cordoba first.
22. Merchants want families and frequent shoppers, not one-time deal hunters only.
23. Promos must not create support burden from confused users.
24. Merchant surfaces should lead to "check this payment", not vague browsing.
25. The best monetization is trusted influence at payment time.

## Changes from pass 1

- Replaced formal retail copy with direct shopper language: "Te digo con que app o tarjeta conviene. Vos confirmas el pago."
- Added home trust pills: no automatic payment, clear promos, paid items marked.
- Reframed savings as "plata para vos" and "quedarte con" instead of only net/route language.
- Reworked recommendation copy from "mejor ruta" to "usa esta para pagar".
- Reworked fallback from "ruta por defecto" to "paga simple".
- Reworked scan/loading states to "viendo con que pagar".
- Reworked manual and checkout-link flows as rescue paths: "Decime donde y cuanto."
- Reworked success copy to reward checking first and repeat habit.
- Reworked merchant opportunity copy so paid placement is explicit and trust-safe.
- Added discovery proof row: ahorro primero, pagado marcado, vos elegis.
- Removed several visible product-team words from detail/profile/history.

## Pass 2 score

Retail: 8.6/10

Strong: QR-first, clearer words, safer trust copy, better habit reinforcement.

Still weak: needs real checkout-line timing tests with non-technical users; needs stronger "this took two seconds" proof after repeated use; amount-missing flow still needs real QR validation.

Merchant: 8.2/10

Strong: paid placement is now clear, user trust is protected, merchant opportunity is tied to benefit and intent.

Still weak: no merchant dashboard, no conversion attribution, no live local Cordoba offer inventory, no pricing surface.

Combined: 16.8/20

Next highest-leverage work:

1. Real Cordoba supermarket/pharmacy/fuel QR tests with five non-technical users.
2. Merchant attribution model: viewed, checked, opened wallet, simulated/confirmed completion.
3. Local merchant offer ingestion and freshness guarantees.
4. A merchant-facing pitch/report surface separate from retail flow.
5. Faster real APK delivery pipeline so phone testing is not blocked by EAS queue.
