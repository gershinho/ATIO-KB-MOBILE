/**
 * How many records match — with or without the portal's help.
 *
 * JSON:API has no count. Drupal can add one as `meta.count` on a collection
 * response, and FAO have it coming, but until it lands there is nothing to read:
 * `page[limit]=0` is rejected outright ("The page size needs to be a positive
 * integer"), and a list response carries only the page you asked for.
 *
 * So this asks a different question. A request at some offset either returns a
 * row or does not, which makes "how many are there" a search for the first
 * offset that comes back empty. Doubling to find an upper bound and halving to
 * close in costs about 13 requests for 6,287 records, against the 126 a full
 * walk would take. The technique is from Diego's example.js.
 *
 * Both paths live behind one function on purpose: the day meta.count appears,
 * every caller gets it without being changed, and nothing has to be unpicked.
 */
import { fetchJsonApi } from './client';
import { createLogger } from '../../utils/logger';

const log = createLogger('count');

/** Guard against an unbounded doubling if the portal starts lying. */
const MAX_OFFSET = 1_000_000;

/**
 * First probes, sent together.
 *
 * Doubling from 16 one request at a time costs nine round trips before the
 * halving even starts, and against a cold portal a round trip is seconds.
 * These six go at once and bracket anything up to 16,384 in a single step.
 */
const BRACKET_PROBES = [16, 64, 256, 1024, 4096, 16384];

/**
 * Counts already worked out this session, keyed by what was asked.
 *
 * A drilldown reopened, a filter removed and put back, a screen remounted:
 * all of them ask the same question again, and the answer costs ~20 requests
 * and the best part of a minute against a cold portal. Cleared by
 * resetCountCache, and irrelevant once meta.count lands.
 */
const cache = new Map();

/**
 * Count the records matching a query.
 *
 * @param {string} path - e.g. '/node/innovation'
 * @param {object} [query] - a spec for buildQuery; its page is replaced
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.attempts]
 * @param {number} [options.timeoutMs] - per request; see client.js
 * @returns {Promise<{count: number, requests: number, fromMeta: boolean}>}
 *   `fromMeta` says which way the answer came, which is worth logging the day
 *   the endpoint lands and worth knowing when a count is slow.
 */
export async function countMatching(path, query = {}, { fetchImpl, attempts, timeoutMs } = {}) {
  const cacheKey = `${path}|${JSON.stringify(query)}`;
  const remembered = cache.get(cacheKey);
  if (remembered) return { ...remembered, requests: 0, cached: true };

  let requests = 0;

  const ask = async (page) => {
    requests += 1;
    return fetchJsonApi(path, {
      query: { ...query, fields: { 'node--innovation': ['drupal_internal__nid'] }, page },
      fetchImpl,
      attempts,
      timeoutMs,
    });
  };

  // One request, which doubles as the meta.count probe: if the portal supplies
  // the total, this is the whole job.
  const remember = (result) => {
    cache.set(cacheKey, { count: result.count, fromMeta: result.fromMeta });
    return result;
  };

  const first = await ask({ limit: 1, offset: 0 });
  const metaCount = first?.meta?.count;
  if (typeof metaCount === 'number') {
    return remember({ count: metaCount, requests, fromMeta: true });
  }

  if ((first?.data?.length ?? 0) === 0) return remember({ count: 0, requests, fromMeta: false });

  const hasRow = async (offset) => (await ask({ limit: 1, offset })).data?.length > 0;

  // Bracket in one round trip rather than nine.
  const probes = await Promise.all(BRACKET_PROBES.map(hasRow));
  const firstEmpty = probes.indexOf(false);

  let low;
  let high;
  if (firstEmpty === -1) {
    // More than the largest probe: fall back to doubling from there.
    low = BRACKET_PROBES[BRACKET_PROBES.length - 1] + 1;
    high = low * 2;
    while (await hasRow(high)) {
      low = high + 1;
      high *= 2;
      if (high > MAX_OFFSET) {
        log.degraded(`giving up counting ${path} past ${MAX_OFFSET}`);
        return remember({ count: high, requests, fromMeta: false });
      }
    }
  } else {
    low = firstEmpty === 0 ? 1 : BRACKET_PROBES[firstEmpty - 1] + 1;
    high = BRACKET_PROBES[firstEmpty];
  }

  // Halve the gap until they meet. `low` ends on the first empty offset, which
  // is the number of records before it.
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (await hasRow(middle)) low = middle + 1;
    else high = middle;
  }

  return remember({ count: low, requests, fromMeta: false });
}

/** Forget what has been counted. For tests, and for a manual refresh. */
export function resetCountCache() {
  cache.clear();
}
