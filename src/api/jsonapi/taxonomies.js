/**
 * The portal's vocabularies, fetched once and kept for a day.
 *
 * JSON:API does not put "Kenya" or "9. Ready" on an innovation. It puts a uuid,
 * and the name lives in a taxonomy term somewhere else. There are two ways to
 * read it:
 *
 *   include=       every page of results drags the terms along, re-sending
 *                  "Kenya" and "Technological" on every page, for every record
 *   preload        fetch the vocabularies once, translate ids locally, and ask
 *                  the portal for nothing but ids thereafter
 *
 * Preloading is the entire low-bandwidth half of the offline card, and the
 * numbers justify it: nine vocabularies, 616 terms, 18 requests, about 275 KB
 * uncompressed — once a day, against pages that would otherwise each carry
 * their own copy of the same few hundred names.
 *
 * node--digital_asset is deliberately not here. It is the target of
 * field_data_source, but it holds 544+ records where the app's data-source
 * filter offers 7, so preloading it would cost more than the include= it saves.
 * Data sources, owners and partners stay per-record lookups — which is what the
 * mapping card reserves include= for.
 */
import { fetchJsonApi } from './client';
import { MAX_PAGE_SIZE } from './query';
import { STORES, idbGet, idbPut, isIndexedDbAvailable } from '../../storage/idb';
import { createLogger } from '../../utils/logger';
import { usingSupabase, rpc } from '../supabase/client';
import { fetchTaxonomies } from '../supabase/reads';

const log = createLogger('taxonomies');

/** Key inside the taxonomies store. One record holds the whole set. */
const CACHE_KEY = 'vocabularies';

/** A day, as the offline card specifies. Terms change on the scale of months. */
export const TAXONOMY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * What to fetch, and what each is for.
 *
 * `type` is the JSON:API resource type, which is also the first half of every
 * key in the index — relationships name their target type, so a lookup never
 * has to guess which vocabulary a uuid belongs to.
 */
export const VOCABULARIES = [
  { path: '/taxonomy_term/readiness_levels', type: 'taxonomy_term--readiness_levels' },
  { path: '/taxonomy_term/adoption_levels', type: 'taxonomy_term--adoption_levels' },
  { path: '/taxonomy_term/countries', type: 'taxonomy_term--countries' },
  { path: '/taxonomy_term/type', type: 'taxonomy_term--type' },
  { path: '/taxonomy_term/impact_sdgs', type: 'taxonomy_term--impact_sdgs' },
  { path: '/taxonomy_term/use_cases', type: 'taxonomy_term--use_cases' },
  { path: '/taxonomy_term/afs_challenges', type: 'taxonomy_term--afs_challenges' },
  { path: '/taxonomy_term/actors', type: 'taxonomy_term--actors' },
  { path: '/taxonomy_term/geographic_regions', type: 'taxonomy_term--geographic_regions' },
];

/**
 * Page through one vocabulary.
 *
 * Pages rather than asking for 250 at once because the portal caps a page at
 * 50 and says nothing when you ask for more — it just returns 50, which reads
 * as "that was all of them" to anyone who trusted the number.
 */
async function fetchVocabulary({ path, type }, { fetchImpl, attempts, maxPages = 20 } = {}) {
  const terms = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const document = await fetchJsonApi(path, {
      query: {
        fields: { [type]: ['name'] },
        page: { limit: MAX_PAGE_SIZE, offset },
      },
      fetchImpl,
      attempts,
    });

    const rows = Array.isArray(document?.data) ? document.data : [];
    for (const row of rows) {
      const name = row?.attributes?.name;
      if (row?.id && name != null) terms.push([row.id, String(name)]);
    }

    // `next` is present even on a last full page, so the row count is what
    // ends the loop. A short page means the collection is exhausted.
    if (rows.length < MAX_PAGE_SIZE) break;
    offset += MAX_PAGE_SIZE;
  }

  return terms;
}

/**
 * All nine, in parallel. One slow vocabulary should not delay the rest.
 *
 * From the published snapshot when the data source is Supabase: one request,
 * in the same {type: [[id, name]]} shape, cached under the same key.
 */
async function fetchAllVocabularies({ fetchImpl, attempts } = {}) {
  if (usingSupabase()) return fetchTaxonomies({ rpc });

  const results = await Promise.all(
    VOCABULARIES.map(async (vocabulary) => [
      vocabulary.type,
      await fetchVocabulary(vocabulary, { fetchImpl, attempts }),
    ])
  );
  return Object.fromEntries(results);
}

/**
 * `{type: [[id, name]]}` → the flat `type:id → name` Map the mapper reads.
 */
export function buildIndex(byType) {
  const index = new Map();
  for (const [type, terms] of Object.entries(byType || {})) {
    for (const [id, name] of terms) index.set(`${type}:${id}`, name);
  }
  return index;
}

/** Stored as arrays rather than Maps: IndexedDB cannot hold a Map. */
async function readCache() {
  if (!isIndexedDbAvailable()) return null;
  try {
    const cached = await idbGet(STORES.taxonomies, CACHE_KEY);
    if (!cached?.byType || typeof cached.fetchedAt !== 'number') return null;
    return cached;
  } catch (err) {
    // A cache that cannot be read is a slow start, not a failure.
    log.degraded('could not read the cached vocabularies:', err?.message);
    return null;
  }
}

async function writeCache(byType, fetchedAt) {
  if (!isIndexedDbAvailable()) return;
  try {
    await idbPut(STORES.taxonomies, CACHE_KEY, { byType, fetchedAt });
  } catch (err) {
    log.degraded('could not cache the vocabularies:', err?.message);
  }
}

/**
 * Held for the session so the second screen to ask does not re-read IndexedDB.
 * Cleared by resetTaxonomies().
 */
let sessionPromise = null;

/**
 * The vocabularies, from cache when fresh and from the portal when not.
 *
 * What happens when the portal cannot be reached depends on what is already
 * stored: a stale cache is used and flagged, because month-old term names are
 * overwhelmingly still correct and an empty Explore page is not. With nothing
 * cached there is nothing to fall back to, and the error carries a message fit
 * to show someone.
 *
 * @param {object} [options]
 * @param {boolean} [options.force] - refetch even if the cache is fresh
 * @param {number} [options.now] - injected clock, for the TTL
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.attempts] - retries per request; see client.js
 * @returns {Promise<{index: Map<string, string>, byType: object, fetchedAt: number, stale: boolean}>}
 */
export function loadTaxonomies({ force = false, now = Date.now(), fetchImpl, attempts } = {}) {
  if (sessionPromise && !force) return sessionPromise;

  const work = (async () => {
    const cached = await readCache();
    const fresh = cached && now - cached.fetchedAt < TAXONOMY_TTL_MS;

    if (fresh && !force) {
      return { index: buildIndex(cached.byType), byType: cached.byType, fetchedAt: cached.fetchedAt, stale: false };
    }

    try {
      const byType = await fetchAllVocabularies({ fetchImpl, attempts });
      await writeCache(byType, now);
      return { index: buildIndex(byType), byType, fetchedAt: now, stale: false };
    } catch (err) {
      if (cached) {
        log.degraded('serving stale vocabularies; the portal is unreachable:', err?.message);
        return { index: buildIndex(cached.byType), byType: cached.byType, fetchedAt: cached.fetchedAt, stale: true };
      }
      throw err;
    }
  })();

  // Only a successful load is remembered. A failure that stuck would outlive
  // the outage that caused it, for as long as the page stays open.
  sessionPromise = work.catch((err) => {
    sessionPromise = null;
    throw err;
  });

  return sessionPromise;
}

/**
 * Every term name in one vocabulary, sorted.
 *
 * What the filter panel's country and type lists are built from, where the
 * bundled build reads them out of the catalogue with SELECT DISTINCT.
 *
 * @param {object} byType - from loadTaxonomies
 * @param {string} type - e.g. 'taxonomy_term--countries'
 */
export function termNames(byType, type) {
  return (byType?.[type] ?? [])
    .map(([, name]) => name)
    .sort((a, b) => a.localeCompare(b));
}

/** Forget the session's copy. For tests, and for a manual refresh. */
export function resetTaxonomies() {
  sessionPromise = null;
}
