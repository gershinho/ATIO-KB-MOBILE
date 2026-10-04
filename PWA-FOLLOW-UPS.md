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


## 2. The web app needs CORS on the portal

**Done, except for this.** Explore, the counts and both heat maps now read the FAO
JSON:API directly — no backend endpoints were needed in the end. See
[docs/JSON-API.md](docs/JSON-API.md).

What is left is one setting on FAO's side. The portal serves the JSON:API to anyone —
`curl` it and you get data — but it sends no `Access-Control-Allow-Origin` header, so a
**browser** throws the response away before our code sees it. Until that is enabled, the
web app only works alongside the development proxy (`npm run proxy`), which asks on the
browser's behalf and is not something we can put in front of the public.

Diego's mapping card lists it as agreed ("CORS will be enabled on
https://sti-portal.fao.org, so the PWA can call the JSON:API directly"). It needs a date.


## 3. Search and Explore do not agree on what an innovation is

On web the app now has two sources of innovations, and they do not share an identity.

- **Explore, its drilldowns and the heat maps** read the FAO JSON:API, where an
  innovation is a uuid like `0ee8fd42-…` and there are 6,287 of them.
- **Search** goes through our own Node backend, which reads the bundled SQLite
  catalogue: ids are integers like `40479`, and there are 3,075 of them.

Two consequences, both visible today:

1. Bookmarking the same innovation from search and from Explore stores it twice,
   because nothing can tell the two ids are the same thing.
2. A record bookmarked from search cannot be refreshed from the portal — asking
   for `/node/innovation/40479` is a 404 — so it keeps the copy it was saved
   with. Harmless in itself, since the bundled catalogue is a fixed file, but it
   is the visible edge of the same problem.

The fix is one identity for both. Either the backend's search index is rebuilt
from the portal so it returns uuids, or search moves to the portal — but the
portal has no ranked search, only `CONTAINS`, which is why the mapping card
struck that out. The first is the real answer, and it is a backend task nobody
has written a card for.


## 4. Voice search could work on the web

Browsers can record audio, and the backend already accepts whatever audio file it is sent.
The only change needed is how the app packages the recording before uploading it. Hidden
for now.
