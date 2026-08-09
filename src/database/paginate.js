/**
 * Pagination over a post-filtered result set.
 *
 * cost and complexity are derived in JavaScript from description text, so they
 * cannot appear in a SQL WHERE clause. Any page of results filtered by them has
 * to be assembled by reading rows from SQL and discarding non-matches in memory.
 *
 * The naive version of that — fetch one oversized window, filter it, then slice
 * [offset, offset+limit] out of the *shrunken* array — silently returns empty
 * pages once offset exceeds the number of survivors in that window, even when
 * plenty of matching rows sit further down the table. These helpers instead
 * keep pulling chunks until enough survivors have accumulated to satisfy the
 * requested page, or the source runs out.
 *
 * Kept free of expo imports so the paging arithmetic is unit-testable on its own.
 */

/** True when the filter bag contains a derived key that SQL cannot evaluate. */
export function hasCostOrComplexityFilters(filters) {
  if (!filters) return false;
  return Boolean(
    (filters.cost && filters.cost.length > 0) ||
      (filters.complexity && filters.complexity.length > 0)
  );
}

/** Apply the derived cost/complexity filters to already-enriched rows. */
export function filterByCostAndComplexity(innovations, filters) {
  let out = innovations;
  if (filters?.cost?.length > 0) {
    out = out.filter((inn) => inn.cost && filters.cost.includes(inn.cost));
  }
  if (filters?.complexity?.length > 0) {
    out = out.filter(
      (inn) => inn.complexity && filters.complexity.includes(inn.complexity)
    );
  }
  return out;
}

export const DEFAULT_CHUNK_SIZE = 250;

/**
 * Read chunks until `predicate`-surviving rows cover [offset, offset+limit).
 *
 * @param {object}   opts
 * @param {Function} opts.fetchChunk  async (limit, offset) => rows[]; [] or a
 *                                    short read signals the source is exhausted
 * @param {Function} opts.keep        async (rows) => survivors[] (may enrich)
 * @param {number}   opts.offset      page offset, in survivor space
 * @param {number}   opts.limit       page size, in survivor space
 * @param {number}   [opts.chunkSize] rows to read per underlying query
 * @returns {Promise<Array>} exactly the requested page (possibly short at the end)
 */
export async function collectFilteredPage({
  fetchChunk,
  keep,
  offset = 0,
  limit = 50,
  chunkSize = DEFAULT_CHUNK_SIZE,
}) {
  if (limit <= 0) return [];

  const needed = offset + limit;
  const survivors = [];
  let sourceOffset = 0;

  while (survivors.length < needed) {
    const rows = await fetchChunk(chunkSize, sourceOffset);
    if (!rows || rows.length === 0) break;
    sourceOffset += rows.length;

    survivors.push(...(await keep(rows)));

    // A short read means there is nothing left behind it.
    if (rows.length < chunkSize) break;
  }

  return survivors.slice(offset, offset + limit);
}

/**
 * Count every surviving row, reading the source in chunks.
 *
 * `keep` should use a cheap projection here — counting does not need the full
 * enrichment that rendering a page does.
 *
 * @param {object}   opts
 * @param {Function} opts.fetchChunk  async (limit, offset) => rows[]
 * @param {Function} opts.keep        async (rows) => survivors[]
 * @param {number}   [opts.chunkSize]
 * @param {number}   [opts.maxScan]   safety ceiling on rows read; Infinity to
 *                                    scan everything
 * @returns {Promise<{count: number, exact: boolean}>} `exact` is false only if
 *          maxScan cut the scan short
 */
export async function countFiltered({
  fetchChunk,
  keep,
  chunkSize = DEFAULT_CHUNK_SIZE,
  maxScan = Infinity,
}) {
  let count = 0;
  let scanned = 0;
  let exact = true;

  for (;;) {
    if (scanned >= maxScan) {
      exact = false;
      break;
    }
    const take = Math.min(chunkSize, maxScan - scanned);
    const rows = await fetchChunk(take, scanned);
    if (!rows || rows.length === 0) break;
    scanned += rows.length;

    count += (await keep(rows)).length;

    if (rows.length < take) break;
  }

  return { count, exact };
}
