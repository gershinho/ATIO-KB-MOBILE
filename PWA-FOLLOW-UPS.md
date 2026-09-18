# Follow-ups

Sprint 1 web work, open items. Detail: [docs/WEB-SUPPORT-MATRIX.md](docs/WEB-SUPPORT-MATRIX.md).

## 1. Manifest icons are placeholders

Generated from `assets/icon.png`; new artwork needed. Owned by the **Adapt UI style** card.

```sh
sips -z 192 192 assets/<icon>.png --out public/logo192.png
sips -z 512 512 assets/<icon>.png --out public/logo512.png
sips -z 410 410 assets/<icon>.png --out /tmp/inner.png
sips -p 512 512 --padColor <background-hex> /tmp/inner.png --out public/logo512-maskable.png
```

Maskable needs background to all four edges, artwork inside the central 80%. Verify in
DevTools → Application → Manifest with "minimum safe area" ticked.

## 2. For Diego — endpoints Explore and the heat maps need

Web ships no catalogue, so both depend on server endpoints that don't exist yet:

- **Explore counts** (stats, top regions, challenge and type counts) — in **Backend
  integration**, Backlog, no date.
- **Heat maps** — `/api/atiokb/heatmap/opportunity` and `/api/atiokb/heatmap/ready-to-use`,
  specified in **Drupal JSON:API mapping**, in no task card at all.

JSON:API returns records, not counts, so every aggregate is a custom endpoint on top of it.
The axes also come from `src/data/constants.js` rather than the database — a server using
different definitions renders plausible wrong numbers. `shared/` exists for this.

**Ask:** put both on *Confirm the API endpoints and fields needed for launch*, dated before
the 9 Oct booth freeze.

## 3. Voice search on web

Feasible: browsers record with `getUserMedia` + `MediaRecorder` and the backend accepts any
format. Only `transcribeAudio` needs a Blob instead of the React-Native upload shape.

## 4. Booth feedback — decide before 7 Oct

WFF needs rating, comment and user type, and the booth runs on web. In-app comments are
device-local and can't serve it. Form link or Sprint 2 capture, undecided.
