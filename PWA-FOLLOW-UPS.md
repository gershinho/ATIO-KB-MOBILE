# Follow-ups

Open items from the Sprint 1 web work. None of them block running or testing the app.
Detail and evidence: [docs/WEB-SUPPORT-MATRIX.md](docs/WEB-SUPPORT-MATRIX.md).

## 1. Manifest icons are placeholders

`public/logo192.png`, `logo512.png` and `logo512-maskable.png` are generated from the
existing `assets/icon.png`. New artwork is needed. Regenerate with:

```sh
sips -z 192 192 assets/<icon>.png --out public/logo192.png
sips -z 512 512 assets/<icon>.png --out public/logo512.png
sips -z 410 410 assets/<icon>.png --out /tmp/inner.png
sips -p 512 512 --padColor <background-hex> /tmp/inner.png --out public/logo512-maskable.png
```

The maskable one needs its background bleeding to all four edges and the artwork inside
the central 80%; padding with white leaves visible wedges once Android crops it round.
Check in DevTools → Application → Manifest with "minimum safe area" ticked.

Owned by the **Adapt UI style** card, which claims the PWA icons and the theme colour.

## 2. For Diego — endpoints Explore and the heat maps need

The web build ships no catalogue, so anything counted on the device is unavailable there.
Both need server-side endpoints that do not exist yet:

- **Explore counts** — stats, top regions, challenge counts, type counts. Listed in
  **Backend integration**, still Backlog, no date.
- **Heat maps** — `/api/atiokb/heatmap/opportunity` and `/api/atiokb/heatmap/ready-to-use`,
  specified in **Drupal JSON:API mapping** but **in no task card at all**.

Two things worth saying explicitly:

- **JSON:API alone will not cover this.** It returns records, not counts. Every aggregate
  is a custom endpoint on top of it.
- **The axes are not in the database.** Rows and columns come from `CHALLENGES`, `TYPES`
  and `INNOVATION_HUB_REGIONS` in `src/data/constants.js`. Whoever computes the cells needs
  those exact definitions, or the maps render with quietly wrong numbers. `shared/` exists
  for this.

**Ask:** can both go on *Confirm the API endpoints and fields needed for launch*, with a
date before the 9 Oct booth freeze?

## 3. Voice search on web

Feasible — browsers record with `getUserMedia` + `MediaRecorder`, and the backend already
accepts any format it is given. Only `transcribeAudio` needs a Blob instead of the
React-Native upload shape. Hidden for now, out of scope for the split.

## 4. Booth feedback capture — needs a decision before 7 Oct

The WFF cards require rating, comment and user type from visitors, and the booth runs on
web. The app's per-innovation comments cannot serve it: they are device-local, and the
mapping doc keeps them that way until an auth model exists. So it is either purpose-built
capture in Sprint 2 or the form-link fallback. No card says which.
