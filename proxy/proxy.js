// Dev-only CORS proxy for https://sti-portal.fao.org/jsonapi/.
// Run with: npm run proxy  (defaults to port 3002)
// Opt-in only: production must call the FAO API directly once CORS is enabled.
//
// Written by Diego Miola and kept here verbatim apart from this header, so the
// copy the team shares and the copy we run stay the same file.
//
// Why it exists: the portal serves the JSON:API to anyone — curl included —
// but sends no Access-Control-Allow-Origin, so a browser discards the response
// before our code sees it. This asks on the browser's behalf, server to server,
// where that rule does not apply, and re-serves the answer with the header. It
// unlocks nothing: everything it fetches is already public.

const express = require('express');
const { Readable } = require('stream');

const UPSTREAM = 'https://sti-portal.fao.org/jsonapi';
const PORT = process.env.PROXY_PORT || 3002;
const TIMEOUT_MS = 30_000; // spike showed cold responses up to ~22s

const app = express();

// CORS headers for dev origins. Deliberately permissive: this server
// must never be exposed beyond localhost / LAN.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

app.use((req, res, next) => {
  res.set(corsHeaders);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Regex route (works in Express 4 and 5; Express 5 dropped the '/a/*' wildcard syntax).
app.get(/^\/jsonapi\/(.*)$/, async (req, res) => {
  const suffix = req.originalUrl.slice('/jsonapi'.length); // e.g. /node/innovation?page[limit]=10
  const upstreamUrl = `${UPSTREAM}${suffix}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.api+json',
        // No cookies, no auth: public anonymous API only.
      },
      redirect: 'follow',
    });

    res.status(upstream.status);

    // Forward safe response headers (skip hop-by-hop and CORS-conflicting ones).
    for (const h of ['cache-control', 'etag', 'last-modified']) {
      const v = upstream.headers.get(h);
      if (v) res.set(h, v);
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.includes('application/vnd.api+json') && !contentType.includes('application/json')) {
      // Cloudflare error pages, HTML, etc.: don't pass through with a lying content type.
      res.set('Content-Type', 'application/json');
      return res.status(502).json({
        errors: [{
          status: '502',
          title: 'Upstream returned non-JSON content',
          detail: `Expected JSON:API, got Content-Type: ${contentType || 'none'}`,
        }],
      });
    }

    // Stream instead of buffering. Keeps memory flat on large paginated responses.
    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end();
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      return res
        .status(504)
        .json({ errors: [{ status: '504', title: 'Upstream timeout', detail: `${TIMEOUT_MS}ms exceeded for ${upstreamUrl}` }] });
    }
    res
      .status(502)
      .json({ errors: [{ status: '502', title: 'Upstream failed', detail: e.message }] });
  } finally {
    clearTimeout(timer);
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[dev-proxy] http://127.0.0.1:${PORT}/jsonapi -> ${UPSTREAM}`);
  console.log('[dev-proxy] Dev only. Never expose beyond localhost/LAN.');
});
