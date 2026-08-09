# ATIO-KB-MOBILE

Expo React Native app for exploring the ATIO (Agricultural Technology and Innovation Outlook) knowledge base. Browse and search agricultural innovations by challenge, type, region, and more.

## Deployed demo

- **Expo app (recommended)**: _Add your published link here_ (e.g. an **Expo EAS Update** URL like `https://expo.dev/@<account>/<slug>` or an install link from EAS Build).
- **Backend API**: typically runs locally (see setup below). If you deploy it, add the public URL here.

## Features

The app has four tabs:

- **Home** — Describe a problem and search solutions (AI-ranked search via the backend, with local SQLite full-text search behind it). Also browse by challenge, solution type, innovation hub and region, filter, and drill into results.
- **Bookmarks** — Saved innovations, with an AI comparison view for any two of them.
- **Downloads** — Innovations exported to a local file for offline reading.
- **Settings** — Accessibility preferences (reduce motion, text size, colour-blind palette) and data management.

Data is stored in a bundled SQLite database (`atiokb.db`) and copied to app storage on first run. The bundled database is treated as read-only; the app only writes to auxiliary tables for anonymous likes and comments.

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

   ```bash
   cp .env.example .env
   ```

   - **`EXPO_PUBLIC_API_URL`** *(optional in development)*: the backend origin. Leave blank locally and the app derives the host from the Metro dev server. Set it for any release build.
   - **`EXPO_PUBLIC_API_CLIENT_TOKEN`** *(optional; must match the backend)*: shared secret the app sends as `Authorization: Bearer …` on every `/api` call. Leave it blank **only if** `API_CLIENT_TOKEN` is also blank in `backend/.env` — setting one side without the other makes every backend call fail with `401 Unauthorized`. It is a build-time constant inlined into the bundle, so it gates casual traffic rather than authenticating a user.

   > The app holds **no OpenAI credential**. `EXPO_PUBLIC_*` values are inlined into the shipped JS bundle at build time, so anything secret placed there is readable by anyone with the app binary. Every OpenAI call is proxied through the backend, which keeps the key server-side.

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

   - **`OPENAI_API_KEY`**: required for `/api/transcribe` (Whisper), `/api/search` LLM reranking, `/api/summarize-bullets` and `/api/compare-summary`. Without it the backend still runs — search falls back to plain full-text ranking and the summary endpoints return `503` or `null` rather than failing.
   - **`API_CLIENT_TOKEN`** *(optional)*: when set, `/api` requires `Authorization: Bearer <this value>` and the app must be built with a matching `EXPO_PUBLIC_API_CLIENT_TOKEN`. When unset, the server prints a warning and leaves `/api` open to anyone who can reach the host.
   - **`PORT`**: defaults to `3001` (matches the app’s default in `src/services/api.js`).

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

The app determines the backend host automatically based on the Metro host (see `src/services/api.js`), so the phone can reach your machine on the LAN.

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

Note: Android emulators access your machine via `10.0.2.2` by default; this is handled automatically by `src/services/api.js`.

## Tests

```bash
npm test                                # app: logic + component suites
npm test -- --selectProjects logic      # fast, pure-logic only
npm test -- --selectProjects components # React Native rendering only
npm --prefix backend test               # backend API suite
npm run test:all                        # everything
npx eslint .                            # lint
```

Jest runs two projects. **logic** covers the pure modules (`src/utils`, `src/data`, `src/database/paginate.js`, `src/database/likeClause.js`) in a plain Node environment. **components** uses `jest-expo` with React Native Testing Library; shared mocks for the data, network and native layers live in `__tests__/setup/componentSetup.js`.

## Other commands

- `npm run ios` — open in iOS Simulator (macOS only)
- `npm run android` — open in Android emulator
- `npm run web` — starts a web build. Note that several dependencies the app relies on (`expo-sqlite`, `expo-audio`, `expo-file-system`) have no web support, so the web target is not currently a working target.

## Troubleshooting

- **Backend not reachable from phone**:
  - Confirm the backend is running and your phone is on the same network.
  - Confirm your machine firewall allows inbound connections on **port 3001**.
  - Re-start Expo and re-scan the QR so the app picks up the correct Metro host.
- **Every backend call fails with `401 Unauthorized`**:
  - `API_CLIENT_TOKEN` is set in `backend/.env` but the app was built without a matching `EXPO_PUBLIC_API_CLIENT_TOKEN` (or the two values differ). Set both to the same value, or clear both. Changing the app-side value needs a restart of the Expo dev server, since `EXPO_PUBLIC_*` is inlined at build time.
- **`Transcription not available. Set OPENAI_API_KEY on the server.`**:
  - You started the backend without `OPENAI_API_KEY` set in `backend/.env`.
- **`Summaries not available. Set OPENAI_API_KEY on the server.`**:
  - You started the backend without `OPENAI_API_KEY` set in `backend/.env`. This is a backend setting; the app never holds the key.

## Project structure

- `App.js` — root component, registers the four tabs
- `app.json` — Expo config (name, slug, icons, splash)
- `assets/` — images, icons, and the bundled `db/atiokb.db`
- `src/screens/` — Home, Bookmarks, Downloads, Settings
- `src/components/` — cards, drawer, filter panel, heatmaps, modals
- `src/context/` — accessibility, bookmark count, download progress
- `src/screens/home/` — the Home shell's three views: `SearchMode`, `ExploreMode`, `DrilldownView`
- `src/database/` — SQLite access (`db.js`, `connection.js`, `engagement.js`, `enrich.js`, `heatmaps.js`) plus pure helpers (`filterQuery.js`, `paginate.js`, `likeClause.js`)
- `src/services/` — `api.js`, the HTTP client for every outbound backend call, plus `aiSummary.js` for comparison summaries
- `src/storage/` — `localState.js`, sole owner of the bookmarks/downloads/likes AsyncStorage keys
- `src/hooks/` — the data hooks behind the screens (`useAiSearch`, `useExploreData`, `useDrilldown`, `useHelpInnovations`, `useInnovationInteractions`, `useSpeechToText`)
- `src/utils/`, `src/data/` — helpers (filter encoding, active-filter tags, logging, export) and taxonomy constants
- `shared/` — `deriveCostComplexity.js`, loaded by **both** the app and the backend so a cost or complexity value cannot differ between them
- `__tests__/` — logic suites, `components/` for rendering suites, `setup/` for shared mocks
- `backend/` — Express API (`/api/search`, `/api/transcribe`, `/api/summarize-bullets`, `/api/compare-summary`, `/health`)
