# Pagamax Phone Testing And Daily Updates

## 1. Install the app on your Android phone

Fastest real-world path:

```bash
cd app
npx eas login
npx eas build --platform android --profile preview
```

Then download the APK from the EAS build URL on your phone and install it.

## 2. Keep bundled fallback data fresh locally

When you want the APK fallback snapshot updated:

```bash
cd C:\Users\dm_21\Pagamax
npm install
npm run data:refresh
```

That command:

1. runs the issuer scrapers it can run automatically
2. rebuilds `scraper/output_consolidated`
3. rebuilds `scraper/src/qr/promo-index.json`
4. syncs the fresh promo index into `app/assets/data`

## 3. Enable remote daily updates for the installed phone app

The app now checks this manifest on startup and when it returns to the foreground:

`https://diegomoro.github.io/pagamax/promo-data/manifest.json`

To make that real:

1. Open the repo Settings on GitHub.
2. Go to `Pages`.
3. Set the source to `GitHub Actions`.
4. Commit and push the current branch so `.github/workflows/promo-data-pages.yml` exists on GitHub.
5. Run the workflow once manually from the `Actions` tab.

After that, the scheduled workflow will publish:

- `promo-data/manifest.json`
- `promo-data/promo-index-<version>.json`

## 4. Mercado Pago limitation

The daily workflow can run most issuer scrapers as-is.

Mercado Pago is different: it still needs saved cookies. If you want that issuer included in the scheduled refresh:

1. add a GitHub Actions secret named `MP_COOKIES_JSON`
2. store the contents of `scraper/recon_out_mp/recon-cookies.json` there

If you do not set that secret, the workflow skips Mercado Pago and still publishes the rest of the dataset.

## 5. What to verify on the phone in stores

Before leaving:

1. open `Profile`
2. check `Fuente actual`
3. check `Generado`
4. tap `Revisar descuentos ahora`
5. confirm there is no remote error

In store:

1. scan the merchant QR
2. confirm the merchant name is correct
3. confirm the amount is detected or easy to enter
4. review the top recommendation and explanation
5. if something looks wrong, open `Profile` and review `Eventos recientes`

## 6. Cheapest operating model

For personal testing:

- app delivery: EAS preview APK
- daily data hosting: GitHub Pages
- daily refresh: GitHub Actions schedule

For longer-term scale:

- keep the same manifest format
- move the artifact hosting from GitHub Pages to Cloudflare R2 or similar object storage
- only change `app/src/config/remote-data.ts`
