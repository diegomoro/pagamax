# Pagamax Phone Testing And Daily Updates

## 1. Install the app on your Android phone

Fastest real-world path:

```bash
cd app
npx eas login
npx eas build --platform android --profile preview
```

Then download the APK from the EAS build URL on your phone and install it.

Current 2026-06-12 state:

- EAS Android preview build is blocked by account quota until 2026-07-01.
- A local Android release APK was rebuilt from `app/android` after switching release defaults to the Vercel backend/legal URLs. The rebuilt artifact passed the manifest audit.
- A prior `1.0.4` local APK was installed and smoke-tested on the connected Pixel 8a. The latest rebuilt APK was not reinstalled because `adb devices` showed no attached device at the final check.
- Package facts for the rebuilt APK: `com.pagamenos.app`, versionName `1.0.4`, versionCode `6`, targetSdk `36`, with `android:allowBackup="false"` in the built APK.
- This local APK is for device QA only. It is not Play-signed and cannot be uploaded to Google Play.

Local fallback path used for the connected phone:

```bash
cd C:\Users\dm_21\Pagamax\app
npx expo prebuild --platform android --clean --no-install
cd android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --rerun-tasks
adb uninstall com.pagamenos.app
adb install app\build\outputs\apk\release\app-release.apk
```

Artifact audit before installing:

```bash
cd C:\Users\dm_21\Pagamax
$env:EXPO_PUBLIC_BACKEND_API_URL='https://pagamax-public-beta-backend.vercel.app'
$env:EXPO_PUBLIC_PRIVACY_URL='https://pagamax-public-beta-backend.vercel.app/privacy'
$env:EXPO_PUBLIC_TERMS_URL='https://pagamax-public-beta-backend.vercel.app/terms'
$env:EXPO_PUBLIC_ACCOUNT_DELETION_URL='https://pagamax-public-beta-backend.vercel.app/delete-account'
$env:EXPO_PUBLIC_SUPPORT_URL='https://pagamax-public-beta-backend.vercel.app/support'
node scripts/check-play-release-readiness.mjs --artifact app\android\app\build\outputs\apk\release\app-release.apk
```

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

`https://pagamenos.app/promo-data/manifest.json`

To make that real:

1. Open the repo Settings on GitHub.
2. Go to `Pages`.
3. Set the source to `GitHub Actions`.
4. Commit and push the current branch so `.github/workflows/promo-data-pages.yml` exists on GitHub.
5. Run the workflow once manually from the `Actions` tab.

After that, the scheduled workflow will publish:

- `promo-data/manifest.json`
- `promo-data/promo-index-<version>.json`
- `promo-data/promo-refresh-report.json`

The app verifies the downloaded promo JSON against `manifest.sha256` before accepting it. If the hash is missing or mismatched, the app keeps local data and records a diagnostic event.

Useful local health check:

```bash
npm run data:publish
npm run data:health -- site/promo-data/manifest.json
```

Latest local promo artifact generated on 2026-06-08:

- `generated_at`: `2026-06-08T14:31:16.424Z`
- `stale_after`: `2026-06-15T14:31:16.424Z`
- `promo_count`: `16590`
- `sha256`: `de0d1bb32cb4feabda446a858980b19ca21bfeccf015773fd27f08e6ff58bad1`

The public URL is still blocked until `pagamenos.app` DNS and hosting are configured.

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
4. check `Hash remoto`
5. check `Fresco hasta`
6. tap `Revisar descuentos ahora`
7. confirm there is no remote error

In store:

1. scan the merchant QR
2. confirm the merchant name is correct
3. confirm the amount is detected or easy to enter
4. review the top recommendation and explanation
5. if something looks wrong, open `Profile` and review `Eventos recientes`

For payable ARS 100-500 validation with Naranja X, use `docs/real-low-value-qr-testing.md` and the `npm run qr:real:*` commands. Those commands create a test run, open Pagamax scan on the connected phone, and record evidence without storing raw QR payloads.

## 6. Cheapest operating model

For personal testing:

- app delivery: EAS preview APK
- daily data hosting: GitHub Pages
- daily refresh: GitHub Actions schedule
- first alerting layer: GitHub Actions failure, step summary, and `promo-refresh-report.json`

For longer-term scale:

- keep the same manifest format
- move the artifact hosting from GitHub Pages to Cloudflare R2 or similar object storage
- only change `app/src/config/remote-data.ts`

See also: `docs/promo-data-observability.md`.
