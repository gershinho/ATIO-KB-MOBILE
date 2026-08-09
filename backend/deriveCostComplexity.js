/**
 * Cost and complexity derivation for the backend.
 *
 * This used to be a hand-maintained port of the app's copy in
 * src/data/constants.js, kept honest only by __tests__/derive-parity.test.js —
 * which could detect divergence after it shipped, for the inputs it happened to
 * try, but could not prevent it. Both packages now load the same file.
 *
 * Resolved through the declared `atio-shared` dependency rather than a `../`
 * path out of the package root. backend/ is its own npm package with its own
 * lockfile and node_modules, so a reach across the boundary was invisible to
 * anything that packages backend/ alone — npm pack, a Dockerfile whose build
 * context is this directory, a deploy that uploads only the backend. The
 * failure mode was a MODULE_NOT_FOUND at start-up in the deployed backend,
 * which local development can never reproduce.
 */
module.exports = require('atio-shared');
