/**
 * Service worker generation for the web build.
 *
 * Run by `npm run build:web`, after `expo export -p web` has written dist/.
 * Workbox reads the built files and writes dist/sw.js with a precache manifest
 * listing each one plus a revision hash.
 *
 * Update policy is documented in docs/SERVICE-WORKER.md. In short: this config
 * deliberately does not set skipWaiting or clientsClaim, so a new build takes
 * over on the next fresh load rather than swapping assets under someone who is
 * mid-session. cleanupOutdatedCaches removes the previous version's files when
 * that happens, so nobody accumulates stale caches.
 */
module.exports = {
  globDirectory: 'dist/',

  // The app shell: markup, code, styles, icons and the fonts the icon set
  // needs. Enough to render the frame with no network.
  globPatterns: ['**/*.{html,js,css,json,png,ico,svg,ttf,woff,woff2}'],

  // The 37 MB catalogue is never served to a browser (decision D9), so it
  // should never appear here either. The web export does not currently emit a
  // .db file at all; this keeps that true if anything changes. Source maps are
  // excluded because they are large and only useful to a developer with
  // devtools open, who has a network.
  globIgnores: ['**/*.db', '**/*.db-*', '**/*.map'],

  swDest: 'dist/sw.js',

  // Any route the user lands on is served the app shell, which is what a
  // single-page app needs. /api is excluded so a request meant for the backend
  // is never answered with HTML.
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/api\//],

  // The catalogue, served from the copy we have while a fresh one is fetched
  // behind it. The offline card asks for exactly this — "for /jsonapi/* GETs
  // use stale-while-revalidate with a short lifetime, since the API already
  // sends cache-control: max-age=3600, public".
  //
  // It is not the same thing as the IndexedDB fallbacks, and does not replace
  // them. Those answer "this list could not be fetched at all"; this answers
  // "this exact request was made recently", and makes a second visit to a
  // drilldown instant rather than a three-to-twenty-five-second wait on a
  // portal computing a query it has seen before.
  //
  // The browser's own HTTP cache already does a crude version of this, because
  // the portal allows an hour of reuse — which is why Explore appeared to work
  // offline until "Disable cache" was ticked in devtools. Doing it here makes
  // it deliberate: our own lifetime, our own entry cap, and it survives the
  // browser evicting its HTTP cache.
  //
  // Matched by path rather than by host: the origin differs between the dev
  // proxy on 127.0.0.1:3002 and the portal itself, and both end up here.
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/jsonapi'),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'jsonapi',
        expiration: {
          // The catalogue pass alone is ~130 requests, and a session's
          // drilldowns and searches add more. Capped so a heavy session cannot
          // fill the origin's storage quota with query results.
          maxEntries: 300,
          // The portal's own max-age. Keeping a copy longer than the portal
          // says it is good for would be us inventing a freshness it never
          // promised.
          maxAgeSeconds: 60 * 60,
          purgeOnQuotaError: true,
        },
        // 0 covers an opaque response, which is what a cross-origin request to
        // the portal is until FAO enable CORS. Caching one is still worth it:
        // it cannot be read by our code, but the browser can replay it.
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],

  cleanupOutdatedCaches: true,
};
