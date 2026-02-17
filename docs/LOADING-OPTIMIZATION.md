# Loading optimization: innovations with no download wait

This doc explains **why** the first load can take 1–2 minutes and **how** to get innovations to load automatically with effectively no download time.

---

## Why the first load is slow in Expo Go

### What happens today

1. **Expo Go** is a generic app. It does **not** ship with your project’s assets (like `atiokb.db`). It only has the Expo runtime and common native modules.
2. When you open your project in Expo Go, Metro serves:
   - Your **JavaScript bundle**
   - Your **assets** (e.g. `assets/db/atiokb.db`) **on demand** via URLs like `http://<your-ip>:8081/assets/?unstable_path=./assets/db/atiokb.db&...`
3. Your app calls `Asset.fromModule(require('../../assets/db/atiokb.db'))`. In Expo Go that resolves to the **Metro URL** above.
4. The app then has to **download** that file (e.g. 37MB) from your dev machine to the device over Wi‑Fi. That’s the 1–2 minute (or more) you see.
5. Only after the download does the app copy the file into the SQLite directory and open the DB. Then queries run and the UI shows innovations.

So in Expo Go, the database is **not** on the device until that first download completes. There’s no way to avoid that download while still using Expo Go for this project, because Expo Go never bundles your custom `.db` file.

---

## Goal: “no minutes to download”

To get innovations to appear quickly with **no** (or negligible) download time, the database must **already be on the device** when the app starts. That means it has to be **bundled inside your app** (or already cached from a previous run).

Two main approaches:

1. **Use a development or production build** (recommended) so the DB is bundled and the first run is a fast local copy.
2. **Use a small “seed” DB in Expo Go** so the download is short; keep the full DB for built apps.

---

## Option 1: Development / production build (recommended)

When you build your **own** app binary (development or production), the build process **bundles** your assets (including `assets/db/atiokb.db`) into the app. No asset is fetched from Metro at runtime.

- **First launch:** The app copies the DB from the **bundled asset** (on disk) to the app’s document directory. That’s a **local file copy** (e.g. a few seconds for 37MB), not a network download.
- **Later launches:** The DB is already in the document directory, so the app skips the copy and opens it immediately. Load is then dominated by running the first queries, not by any download.

So: **innovations load automatically with no minutes of download** because there is no download step—only a one-time local copy (or no copy on subsequent runs).

### How to do it

**A. Local development build (run on device/simulator)**

1. Install the dev client and create a native build:
   ```bash
   npx expo install expo-dev-client
   npx expo prebuild
   ```
2. Run the app on iOS or Android:
   ```bash
   npx expo run:ios
   # or
   npx expo run:android
   ```
   This builds an app that includes your JS and assets (including `atiokb.db`). You open **this** app instead of Expo Go.

3. For day-to-day development you still use Metro (e.g. `npx expo start`), but you connect to it from **your built app**. The DB is already in the binary, so the first time you open the app it only does the local copy; no long download.

**B. EAS Build (cloud build)**

1. Configure EAS and create a development build:
   ```bash
   npm install -g eas-cli
   eas build:configure
   eas build --profile development --platform ios
   # or --platform android
   ```
2. Install the built app on your device (from the link EAS gives you). That build again includes your assets, so the DB is bundled and the first run is a fast local copy.

**C. Production / preview build**

- Same idea: `eas build --profile preview` or `--profile production` bundles everything, including the DB. Users (or you) install that build; first launch is a quick local copy, then innovations load with no download wait.

### What the app does in this setup

The app already has a **fast path** in `src/database/db.js`:

- If the asset has a **local** URI (`file://` or `content://`), it uses **copy** (fast).
- If the URI is **remote** (e.g. `http://...` from Metro), it uses **download** (slow in Expo Go).

In a development or production build, the DB asset is bundled, so the resolver gives a local URI and the app uses the fast copy. No “minutes to download” anymore.

---

## Option 2: Small “seed” DB for Expo Go (optional)

If you want to keep using **Expo Go** without building your own binary, you can’t avoid **some** download when the DB isn’t cached. You can still make that download short:

- Add a **small** SQLite file (e.g. `atiokb.seed.db`) with a subset of innovations (e.g. a few hundred) and point the app to it when running in Expo Go.
- That file might be 2–5 MB instead of 37 MB, so it downloads in **seconds** instead of minutes.
- In a **built** app you keep using the **full** `atiokb.db` (bundled), so there’s no download and full data.

Implementation outline:

1. Create `atiokb.seed.db` (e.g. export a subset from your main DB).
2. In code, choose which asset to load based on environment, e.g.:
   - `__DEV__` and some “use seed” flag → `require('../../assets/db/atiokb.seed.db')`
   - else → `require('../../assets/db/atiokb.db')`
3. Put both in `assets/db/` and ensure `metro.config.js` still includes `db` in `assetExts`.

Then in Expo Go you get a quick download and innovations (subset) load; in a build you get the full DB with no download.

---

## Summary

| Environment              | Where DB comes from        | First-run experience        |
|--------------------------|----------------------------|-----------------------------|
| **Expo Go**              | Downloaded from Metro      | 1–2+ min download           |
| **Dev build / Prod build** | Bundled in app           | Fast local copy, no download |

To get **innovations to load automatically with no minutes of download**:

1. **Use a development or production build** so the DB is bundled and the app only does a fast local copy (or reuses an already-copied DB). This is the main recommendation.
2. Optionally, use a **small seed DB** in Expo Go so the only download is short; keep the full DB for builds.

The code in `src/database/db.js` already optimizes for the built-app case by using a local copy when the asset URI is `file://` or `content://`, so once you run from a build instead of Expo Go, you get the desired “no download” behavior.
