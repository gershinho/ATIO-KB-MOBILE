/**
 * What to show when a list cannot be fetched. Nothing, on the phone.
 *
 * The web build answers from its cache of records — see offlineFallback.web.js.
 * The phone has the whole catalogue in SQLite, so a failed query there is a
 * real failure rather than a connection problem, and there is nothing to fall
 * back to.
 *
 * @returns {Promise<{results: Array, total: number}>} always empty
 */
export async function searchCachedInnovations() {
  return { results: [], total: 0 };
}

/**
 * What the device can put on the Explore page. Nothing, on the phone.
 *
 * @returns {Promise<null>} always null, so the caller shows its error
 */
export async function exploreFromCache() {
  return null;
}
