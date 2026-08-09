/**
 * Tagged logging with a severity convention.
 *
 * Two things had drifted. Tags were applied by hand, so most sites had none and
 * a console line could not be traced back to the module that wrote it. And
 * caught failures were logged at three different severities with no rule behind
 * the choice — the same class of problem was `console.log` in one module and
 * `console.error` in its sibling.
 *
 * The severity says what the *user* got, not how the developer feels about it:
 *
 * - `failed`   the operation did not happen and the user is looking at an error
 *              state or a missing feature.
 * - `degraded` the user got something useful, but less than intended — a
 *              fallback ran, an enhancement was skipped.
 * - `note`     expected and fully handled; recorded only to make a later
 *              investigation possible.
 *
 * @param {string} tag - the module, e.g. 'home' or 'ATIO DB'
 */
export function createLogger(tag) {
  const prefix = `[${tag}]`;
  return {
    failed: (message, ...details) => console.error(prefix, message, ...details),
    degraded: (message, ...details) => console.warn(prefix, message, ...details),
    note: (message, ...details) => console.log(prefix, message, ...details),
  };
}
