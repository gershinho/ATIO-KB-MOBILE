/**
 * Serve the built PWA the way sti-portal.fao.org will: under /atiokb-webapp.
 *
 *   npm run build:web && npm run serve:web
 *   open http://localhost:8090/atiokb-webapp/
 *
 * A smoke test of the production build, not a dev server: dist/ is mounted at
 * the base path, any other path under it gets index.html (as the service
 * worker's navigation fallback does), and `/` redirects there. Port 8090 keeps
 * clear of Metro on 8081, which index.html deliberately skips registering the
 * service worker on.
 */
const path = require('path');
const express = require('express');

const BASE = '/atiokb-webapp';
const PORT = Number(process.env.PORT) || 8090;
const DIST = path.resolve(__dirname, '..', 'dist');

const app = express();

// The service worker must never be cached by the browser, or an old build
// keeps control after a new one is deployed.
app.use(`${BASE}/sw.js`, (req, res, next) => {
  res.set('Cache-Control', 'no-cache');
  next();
});

app.use(BASE, express.static(DIST, { index: 'index.html' }));

// Deep links and refreshes on any route: the app shell decides what to show.
// Not for a missing file, though — a 404 for /_expo/missing.js is a broken
// build worth seeing, where index.html in its place would fail far away.
app.get(new RegExp(`^${BASE}(/.*)?$`), (req, res) => {
  if (path.extname(req.path)) return res.status(404).end();
  return res.sendFile(path.join(DIST, 'index.html'));
});

app.get('/', (req, res) => res.redirect(`${BASE}/`));

app.listen(PORT, () => {
  console.log(`[serve-web] http://localhost:${PORT}${BASE}/ ← ${DIST}`);
});
