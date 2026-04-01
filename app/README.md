# PagaMax Android MVP

Expo-managed Android app for the first installable PagaMax beta.

## What is included

- bundled promo snapshot loaded locally from `assets/data/`
- shared QR parsing, merchant matching, and recommendation logic from `@pagamax/core`
- manual merchant + amount flow
- QR scan flow with camera permission requested only on demand
- local payment-method setup with AsyncStorage
- Play Store fallback handoff for payment apps

## Local development

From the repo root:

```bash
npm install
npm run data:sync
npm run mobile:start
```

From the `app/` directory directly:

```bash
npm run sync-data
npx expo start
```

## Android preview APK

```bash
cd app
npx eas build --platform android --profile preview
```

## Notes

- The promo index is mirrored to `promo-index.bundle.txt` so Expo can load it as a lazy asset instead of inlining the 11 MB JSON into the JS bundle.
- Deep links are intentionally conservative in this branch: providers fall back to Google Play search until a device-verified app URL is confirmed.
- The app is Android-first and Spanish-only for this beta.
