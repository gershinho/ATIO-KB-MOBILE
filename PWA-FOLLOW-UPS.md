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

### Who owns it

The Notion card **Adapt UI style** was rewritten on 15 September to claim "PWA
icons: 192, 512 and maskable" and "splash and manifest theme color" as its own
scope. This work most likely belongs there, with the FAO brand shell, rather
than in **PWA Manifest + HTML Shell**.

---

## 2. ATIO-specific palette values are unconfirmed

**Where:** `theme_color` and `background_color` in `public/manifest.json`, and the
matching `<meta name="theme-color">` in `public/index.html`

The shell now uses the FAO design system's published values: `#116AAB` (FAO
primary blue) for the theme colour and `#F7F8F9` (FAO white) for the background.
These come from design-system.fao.org, the site the Notion **FAO Design System**
document links to, so they are sourced from FAO's own documentation rather than
guessed.

What is still open is whether ATIO overrides them. The Notion **ATIO Visual
Identity** document says the identity is "rooted in FAO's corporate identity"
while having "its own recognizable expression", and the app's existing icon is
green (`#22C55E`), not FAO blue. The values that would settle this live in a
SharePoint folder — Phase 1 / Documentation / UI and design Docs — which needs an
FAO login and returns 403 from outside it.

Searched and not found: the entire ATIO Notion workspace, 125 pages across all
seven databases, contains no hex value, RGB, CMYK or Pantone reference anywhere.
Both brand documents describe the identity in prose and link out.

To change: one line per colour in `public/manifest.json`, plus the meta tag in
`public/index.html`. Ask Chiko or Diego for the ATIO palette, or for access to
that folder.

---

## 3. The app itself does not run on web yet

Expected, and not this card's job. Explore fails to load because the data layer
uses `expo-sqlite` over a file copied with `expo-file-system`, neither of which
works in a browser. Cataloguing and splitting those modules is the Notion card
**Platform Splits for Native-Only APIs**.

The shell and the manifest load correctly regardless, which is what
installability depends on.
