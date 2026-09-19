# Eshaan — start here (Adapt UI style)

Three of Diego's four Phase 1 goals are done and sit on the `sprint1` branch.
Yours is the fourth: **FAO brand shell**.

## Get the code

```sh
git fetch origin
git checkout -b adapt-ui-style origin/sprint1   # branch off sprint1, not main
npm install
npm --prefix backend install
```

`main` is still 20 commits behind — branching off it means no manifest, no
icons, no service worker, so start from `sprint1`.

## Run it

| Command | What you get |
|---|---|
| `npm run web` | Dev server on :8081, hot reload. What you'll use all day. |
| `npm --prefix backend start` | The API on :3001. Needed for search; without it search shows "unavailable". |
| `npm run build:web` then `npx serve dist` | The real built output with the service worker. Only needed to test offline or installability. |
| `npm start` | Metro for phones — see the Expo Go note below. |

Search needs `backend/.env` with `OPENAI_API_KEY`. It isn't in the repo; ask
Krishna. Without it the AI paths return a clear 503 and everything else works,
which is fine for UI work.

## Your card

**Adapt UI style** — official FAO palette and logo **in the shell only**: PWA
icons (192/512/maskable), splash, manifest theme colour. Broader screen
typography and a full UI redesign are explicitly *not* Phase 1.

Files that matter:

- `public/manifest.json` — `theme_color` and `background_color`, currently
  `#116AAB` / `#F7F8F9` from design-system.fao.org
- `public/index.html` — the `<meta name="theme-color">` must match the manifest
- `public/logo192.png`, `logo512.png`, `logo512-maskable.png` — **placeholders**,
  generated from the existing app icon. Replacing them is the main job.
  Commands are in `PWA-FOLLOW-UPS.md`.
- `app.json` — native splash colour

Whether ATIO overrides FAO's corporate blue is unconfirmed; the values live in a
SharePoint folder nobody on the dev side can open. Ask Chiko or Diego.

## Gotchas that cost us time

- **Never run `npx expo install <pkg>`.** It upgraded the whole project from SDK
  54 to 57 in one go. Use `npm install <pkg>`.
- **Expo Go won't open this project.** The App Store version only supports the
  newest SDK (57) and we're on 54. Either use an Android device with the SDK 54
  APK from `expo.dev/go`, or build to your own phone through Xcode.
- **The service worker only exists in built output**, never on `npm run web`. If
  a built page seems frozen in the past, DevTools → Application → Service
  Workers → **Unregister**.
- **Don't delete the registration script** at the bottom of `public/index.html`.
- **Run `npm test` and `npx eslint .` before pushing.** CI runs both.

## Worth reading

- `docs/WEB-SUPPORT-MATRIX.md` — every dependency classified for web, and what
  works on web versus what doesn't
- `docs/SERVICE-WORKER.md` — what's cached and how updates reach people
- `PWA-FOLLOW-UPS.md` — open items, including the icons you're replacing

## For your Claude session

Paste this in:

> This is an Expo/React Native app (SDK 54) for the FAO ATIO knowledge base,
> being converted to a PWA for a booth demo on 15 October. I'm on branch
> `adapt-ui-style`, off `sprint1`. Three Sprint 1 cards are done: PWA manifest
> and shell, platform splits keeping native-only APIs out of the web bundle, and
> a Workbox service worker caching the app shell. My card is "Adapt UI style":
> official FAO palette and logo in the shell only — PWA icons 192/512/maskable,
> splash, manifest theme colour. Not a wider redesign. Read `FOR-ESHAAN.md`,
> `docs/WEB-SUPPORT-MATRIX.md` and `PWA-FOLLOW-UPS.md` first. Don't run
> `npx expo install`; it upgrades the SDK.

Push your branch and open a PR into `main`, same as PR #2.
