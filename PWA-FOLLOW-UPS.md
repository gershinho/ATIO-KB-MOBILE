# Follow-ups

Things still to do from the Sprint 1 web work.
Fuller detail: [docs/WEB-SUPPORT-MATRIX.md](docs/WEB-SUPPORT-MATRIX.md).

## 1. The app icons are still placeholder artwork

The icons in `public/` are generated from the existing app mark, not drawn for
this. They still need proper artwork from the brand owners.

They are at least on the FAO palette now. They were previously the legacy green
(`#22C55E`) while the manifest, the splash and the in-app logo were all FAO
Primary, so an installed app showed a green tile under a blue theme. The mark
was recoloured onto `#116AAB` and everything in `public/` regenerated from it;
`public/favicon.png` was the stock Expo logo and now uses the ATIO mark too.

This was a recolour, not a redraw. Replacing the artwork is still open, and
whether ATIO overrides FAO's corporate blue is still unconfirmed — ask Chiko or
Diego. To remake them from a new source icon:

```sh
sips -z 192 192 assets/icon.png --out public/logo192.png
sips -z 512 512 assets/icon.png --out public/logo512.png
sips -z 410 410 assets/icon.png --out /tmp/inner.png
sips -p 512 512 --padColor 116AAB /tmp/inner.png --out public/logo512-maskable.png
sips -z 48 48 assets/icon.png --out public/favicon.png
```

The 410-then-pad step is the maskable safe zone: Android crops the tile to its
own shape, so the mark has to sit inside the middle 80%. `--padColor` must match
the artwork's own background or the crop shows a ring.


## 2. For Diego: Explore and the heat maps need something built

On a phone the app counts things itself, using the database that ships inside it. The
website has no database, so it has to ask the server for those numbers — and nothing on
the server answers those questions yet.

Two sets of numbers are missing:

- **Explore's counts** — the totals, the challenge and type grids, top regions. Listed in
  the **Backend integration** card, which sits in the backlog with no date.
- **The heat maps** — two addresses are written down in the **Drupal JSON:API mapping**
  doc, but no task card anywhere asks anyone to build them.


## 3. Voice search could work on the web

Browsers can record audio, and the backend already accepts whatever audio file it is sent.
The only change needed is how the app packages the recording before uploading it. Hidden
for now.
