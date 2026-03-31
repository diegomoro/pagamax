# Recommendation Demo

This module is the first demo-oriented recommendation layer on top of the existing QR matcher.

It takes:

- a scanned QR payload
- a purchase amount
- a small JSON list of payment methods the user actually has

It returns:

- the top payment options ranked by estimated user value
- a short explanation for each option
- warnings when the estimate is optimistic

Example:

```bash
npx tsx src/recommendation/cli.ts \
  --qr "000201010211501130692240142520457325802AR5907Samsung6004CABA6304FFFF" \
  --amount 30000 \
  --methods ./src/recommendation/demo-methods.example.json
```

Windows/npm fallback:

```bash
npm run recommend:demo -- \
  "000201010211501130692240142520457325802AR5907Samsung6004CABA6304FFFF" \
  30000 \
  ./src/recommendation/demo-methods.example.json
```

Current assumptions:

- cap usage is optimistic when the cap period is not `per_transaction`
- cashback timing is not discounted yet
- installment value is estimated, not guaranteed cash savings
- deep links and store-install handoff are not modeled here yet

This is meant to be the reusable ranking core for a future mobile client, not the final product surface.
