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

  cleanupOutdatedCaches: true,
};
