# PWA follow-ups

Open items from the Sprint 1 PWA work, written down so they don't have to be
rediscovered. Nothing here blocks running or testing the web build.

---

## 1. The manifest icons need replacing

**Status:** open — agreed 16 September 2026, after the first DevTools check
**Where:** `public/logo192.png`, `public/logo512.png`, `public/logo512-maskable.png`,
referenced by the `icons` array in `public/manifest.json`

### What is there now

All three are generated from `assets/icon.png` (4000x4000, green `#22C55E`) — the
existing app icon, used as a placeholder to get the manifest validating:

- `logo192.png` — 192x192, full bleed
- `logo512.png` — 512x512, full bleed
- `logo512-maskable.png` — artwork at 80% on a `#22C55E` ground sampled from the
  icon itself, so a circular mask crops background rather than the wordmark

### What needs to happen

These are not the icons we want to ship. New artwork is needed; the exact
reason and the approved source file are to be recorded on the Notion card.

Replacing them:

1. Put the new source artwork in `assets/`.
2. Regenerate the three sizes:
   ```sh
   sips -z 192 192 assets/<new-icon>.png --out public/logo192.png
   sips -z 512 512 assets/<new-icon>.png --out public/logo512.png
   sips -z 410 410 assets/<new-icon>.png --out /tmp/maskable-inner.png
   sips -p 512 512 --padColor <background-hex> /tmp/maskable-inner.png --out public/logo512-maskable.png
   ```
   The maskable one needs its background bleeding to all four edges, with the
   artwork inside the central 80%. Padding with white leaves visible wedges once
   Android crops it round.
3. Keep the filenames, or update the `icons` array in `public/manifest.json`.
4. Re-check Chrome DevTools -> Application -> Manifest, including **Show only the
   minimum safe area for maskable icons**.



