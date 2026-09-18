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
