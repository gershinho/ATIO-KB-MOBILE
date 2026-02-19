# ATIO-KB-MOBILE

Expo React Native app for exploring the ATIO (Agricultural Technology and Innovation Outlook) knowledge base. Browse and search agricultural innovations by challenge, type, region, and more.

## Deployed demo

- **Expo app (recommended)**: _Add your published link here_ (e.g. an **Expo EAS Update** URL like `https://expo.dev/@<account>/<slug>` or an install link from EAS Build).
- **Backend API**: typically runs locally (see setup below). If you deploy it, add the public URL here.

## Features

- **Home (Search)** — Describe a problem and search solutions (full-text search).
- **Discover** — Browse by challenge, solution type, innovation hubs, and recent innovations; filter and drill into results.
- **Saved** — Placeholder for bookmarked innovations.
- **Profile** — Placeholder for preferences.

Data is stored in a bundled SQLite database (`atiokb.db`) and copied to app storage on first run.

## Fast load (no download wait)

In **Expo Go**, the DB is downloaded from Metro on first launch (~1–2 min for 37MB). To get **innovations to load with no download**, use a **development build** so the DB is bundled in the app:

```bash
npx expo install expo-dev-client
npx expo run:ios   # or npx expo run:android
```

Then open the built app (not Expo Go). First launch does a quick local copy; after that, load is instant. See [docs/LOADING-OPTIMIZATION.md](docs/LOADING-OPTIMIZATION.md) for the full explanation and options.

## Prerequisites

- Node.js 18+
- npm (comes with Node) or your preferred Node package manager
- **For device testing**: [Expo Go](https://expo.dev/go) installed on your phone (iOS App Store / Google Play)
- **For emulators/simulators**:
  - iOS Simulator (macOS + Xcode)
  - Android Emulator (Android Studio)

## Setup

1. **Install app dependencies**

   ```bash
   npm install
   ```

2. **Configure app environment variables**

   The app uses `EXPO_PUBLIC_*` vars. Create `.env` from the example:

   ```bash
   cp .env.example .env
   ```

   Then set:

   - **`EXPO_PUBLIC_OPENAI_API_KEY`**: used for in-app AI summarization flows (see `src/services/aiSummary.js`).

3. **Install backend dependencies**

   ```bash
   cd backend
   npm install
   ```

4. **Configure backend environment variables**

   ```bash
   cp .env.example .env
   ```

   Then set:

   - **`OPENAI_API_KEY`**: required for `/api/transcribe` (Whisper) and any server-side OpenAI calls.
   - **`PORT`**: defaults to `3001` (matches the app’s default in `src/config/api.js`).

## Run (backend + app)

This project is typically run as **two processes**:

1. **Start the backend API**

   ```bash
   cd backend
   npm start
   ```

   The backend should listen on `http://localhost:3001`.

2. **Start the Expo dev server**

   In a separate terminal:

   ```bash
   npm start
   ```

   Or:

   ```bash
   npx expo start
   ```

## Run on a physical device (Expo Go)

1. Start the **backend** (`cd backend && npm start`).
2. Start the **Expo dev server** (`npm start`).
3. Ensure your phone and computer are on the **same Wi‑Fi**.
4. Scan the QR code:
   - **iOS**: Camera app
   - **Android**: Expo Go app

The app determines the backend host automatically based on the Metro host (see `src/config/api.js`), so the phone can reach your machine on the LAN.

If you’re on a restrictive network, try:

```bash
npm run start:tunnel
```

## Run on iOS Simulator (macOS)

1. Start the **backend**:

   ```bash
   cd backend
   npm start
   ```

2. Start the app on iOS Simulator:

   ```bash
   npm run ios
   ```

## Run on Android Emulator

1. Start the **backend**:

   ```bash
   cd backend
   npm start
   ```

2. Start the app on Android Emulator:

   ```bash
   npm run android
   ```

Note: Android emulators access your machine via `10.0.2.2` by default; this is handled automatically by `src/config/api.js`.

## Other commands

- `npm run ios` — open in iOS Simulator (macOS only)
- `npm run android` — open in Android emulator
- `npm run web` — run in the browser

## Troubleshooting

- **Backend not reachable from phone**:
  - Confirm the backend is running and your phone is on the same network.
  - Confirm your machine firewall allows inbound connections on **port 3001**.
  - Re-start Expo and re-scan the QR so the app picks up the correct Metro host.
- **`Transcription not available. Set OPENAI_API_KEY on the server.`**:
  - You started the backend without `OPENAI_API_KEY` set in `backend/.env`.
- **`Missing API key. Set EXPO_PUBLIC_OPENAI_API_KEY in .env`**:
  - You started the app without `EXPO_PUBLIC_OPENAI_API_KEY` set in the repo root `.env`.

## Project structure

- `App.js` — root component
- `app.json` — Expo config (name, slug, icons, splash)
- `assets/` — images and static files
- `src/` — app screens, components, and services
- `backend/` — Express API server used by the app (`/api/search`, `/api/transcribe`, etc.)
