/**
 * Readiness and adoption level parsing.
 *
 * Lived in db.js, which made db.js both the query front door and a utility
 * source for its own siblings: enrich.js imported this helper back out of db.js
 * while db.js imported enrich.js, the one import cycle in the app. db.js never
 * called it. Kept here as a leaf module alongside likeClause.js and paginate.js,
 * free of expo imports so it can be unit-tested directly.
 */

/**
 * Readiness and adoption arrive as strings like "4 - Prototype"; the numeric
 * prefix is the level. This was parsed inline in six places, each with its own
 * fallback — hence the explicit `fallback` argument rather than one hardcoded
 * default: enrichment wants 1, the count aggregators want to skip the row.
 *
 * @param {*} value
 * @param {number|null} [fallback=1] returned when the value has no leading integer
 * @returns {number|null}
 */
export function parseLeadingLevel(value, fallback = 1) {
  const match = value != null ? String(value).match(/^(\d+)/) : null;
  return match ? parseInt(match[1], 10) : fallback;
}
