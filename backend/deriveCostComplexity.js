/**
 * Cost and complexity derivation for the backend.
 *
 * This used to be a hand-maintained port of the app's copy in
 * src/data/constants.js, kept honest only by __tests__/derive-parity.test.js —
 * which could detect divergence after it shipped, for the inputs it happened to
 * try, but could not prevent it. Both packages now load the same file.
 */
module.exports = require('../shared/deriveCostComplexity');
