# ATIO-KB-MOBILE

Expo Go React Native app for exploring the ATIO (Agricultural Technology and Innovation Outlook) knowledge base. Browse and search agricultural innovations by challenge, type, region, and more.

## Features

- **Home (Search)** — Describe a problem and search solutions (full-text search).
- **Discover** — Browse by challenge, solution type, innovation hubs, and recent innovations; filter and drill into results.
- **Saved** — Placeholder for bookmarked innovations.
- **Profile** — Placeholder for preferences.

Data is stored in a bundled SQLite database (`atiokb.db`) and copied to app storage on first run.

### Fast load (no download wait)

In **Expo Go**, the DB is downloaded from Metro on first launch (~1–2 min for 37MB). To get **innovations to load with no download**, use a **development build** so the DB is bundled in the app:

```bash
npx expo install expo-dev-client
npx expo run:ios   # or npx expo run:android
```

Then open the built app (not Expo Go). First launch does a quick local copy; after that, load is instant. See [docs/LOADING-OPTIMIZATION.md](docs/LOADING-OPTIMIZATION.md) for the full explanation and options.

## Prerequisites

- Node.js 18+
- [Expo Go](https://expo.dev/go) installed on your phone (iOS App Store or Google Play)

## Run with Expo Go

1. **Start the dev server**
   ```bash
   npm start
   ```
   Or: `npx expo start`

2. **Open on your device**
   - Ensure your phone and computer are on the same Wi‑Fi.
   - **iOS:** Open the Camera app and scan the QR code from the terminal.
   - **Android:** Open the Expo Go app and scan the QR code from the terminal.

The app will load in Expo Go and reload when you save files.

## Other commands

- `npm run ios` — open in iOS Simulator (macOS only)
- `npm run android` — open in Android emulator
- `npm run web` — run in the browser

## Project structure

- `App.js` — root component
- `app.json` — Expo config (name, slug, icons, splash)
- `assets/` — images and static files
