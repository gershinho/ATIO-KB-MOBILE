# Follow-ups

Things still to do from the Sprint 1 web work.
Fuller detail: [docs/WEB-SUPPORT-MATRIX.md](docs/WEB-SUPPORT-MATRIX.md).

## 1. The app icons are placeholders

The three icons in `public/` were made from the existing app icon. They need proper
artwork. To remake them:

```sh
sips -z 192 192 assets/<icon>.png --out public/logo192.png
sips -z 512 512 assets/<icon>.png --out public/logo512.png
sips -z 410 410 assets/<icon>.png --out /tmp/inner.png
sips -p 512 512 --padColor <background-hex> /tmp/inner.png --out public/logo512-maskable.png
```

Android crops icons into a circle, so the maskable one needs its background reaching all
four edges and the artwork kept in the middle 80%, or the edges get cut off. Check it in
Chrome: DevTools → Application → Manifest, tick "minimum safe area".

The **Adapt UI style** card owns this.

## 2. For Diego: Explore and the heat maps need something built

On a phone the app counts things itself, using the database that ships inside it. The
website has no database, so it has to ask the server for those numbers — and nothing on
the server answers those questions yet.

Two sets of numbers are missing:

- **Explore's counts** — the totals, the challenge and type grids, top regions. Listed in
  the **Backend integration** card, which sits in the backlog with no date.
- **The heat maps** — two addresses are written down in the **Drupal JSON:API mapping**
  doc, but no task card anywhere asks anyone to build them.

Two things worth knowing:

- **The JSON:API won't cover this on its own.** It hands back innovations, one at a time
  or as a list. It doesn't count. The counting has to be built on top of it.
- **The categories live in the app, not the database.** Challenges, types and regions are
  defined in `src/data/constants.js`. Whoever builds the counting has to use those same
  lists, or the numbers will look believable and be wrong. `shared/` exists so both sides
  can read one copy.

**The ask:** add both to *Confirm the API endpoints and fields needed for launch*, with a
date before the booth build on 9 Oct.

## 3. Voice search could work on the web

Browsers can record audio, and the backend already accepts whatever audio file it is sent.
The only change needed is how the app packages the recording before uploading it. Hidden
for now.
