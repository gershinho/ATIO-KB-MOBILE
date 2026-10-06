/**
 * One pass over the whole catalogue, kept so the rest of Explore is free.
 *
 * Explore asks questions the portal has no way to answer. "How many
 * innovations address water scarcity in East Africa, and what is their average
 * readiness?" is not a count — it is an average, and no count endpoint can
 * produce one however many of them FAO add. The only way to know is to look at
 * every record.
 *
 * So this walks the collection once: 6,287 published records, 50 at a time,
 * six requests in flight, asking for ids only — readiness, adoption, countries,
 * use cases, types — and resolving every one of those ids to a name from the
 * vocabularies already in hand. About 3 MB over the wire, two to three minutes
 * cold, and the result is kept in IndexedDB for a few hours.
 *
 * Out of that single pass come the Explore grid counts, the hub region counts,
 * the data source list and both heat maps. The mapping card describes exactly
 * this for the heat maps — "about 6300 records at 50 per page is 126 requests.
 * Cache the result in IndexedDB with a TTL of a few hours and gate the compute
 * behind a background fetch, so the first paint uses the cached grid."
 *
 * The rows are stored rather than only the grids they feed. They are the raw
 * material: a release that changes the challenge keywords recomputes every grid
 * from what is already on the device instead of crawling again.
 */
import { fetchJsonApi } from './client';
import { buildFilterSpec } from './filterSpec';
import { MAX_PAGE_SIZE } from './query';
import { loadTaxonomies } from './taxonomies';
import { STORES, idbGet, idbPut, isIndexedDbAvailable } from '../../storage/idb';
import { parseLeadingLevel } from '../../database/levels';
import { createLogger } from '../../utils/logger';

const log = createLogger('catalog');

const INNOVATIONS = '/node/innovation';
// v2 added the fields the drilldown filters on (regions, SDGs, users,
// grassroots, level names, source titles) and `changed` for its order. A v1
// copy lacks them, and filtering on it would silently match nothing, so it is
// left unread rather than migrated.
const CACHE_KEY = 'catalogIndex:v2';

/** A few hours, as the offline card specifies. */
export const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * How old a stored copy can be and still be served while a fresh one is built.
 *
 * Past the TTL the copy is still used at once and refreshed behind it: records
 * change slowly, and a returning visitor made to wait a minute for a fresh pass
 * would wait for nothing they could see. Past this, it is old enough that a
 * pass is worth waiting for.
 */
export const CATALOG_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Pages in flight at once.
 *
 * Six rather than one because the pass is otherwise 126 round trips end to
 * end, and rather than twenty because this is a public site serving other
 * people at the same time.
 */
const CONCURRENCY = 6;

/** A ceiling on pages, so a portal that never ends cannot spin forever. */
const MAX_PAGES = 400;

/**
 * Ids only. No titles, no descriptions, no includes: every name in a row is
 * resolved from the preloaded vocabularies, which is what makes a pass over
 * the whole catalogue about 3 MB rather than 30.
 */
const INDEX_FIELDS = {
  'node--innovation': [
    'changed',
    'field_if_grassroots',
    'field_region',
    'field_impact_sdgs',
    'field_prospective_users',
    'field_readiness_level',
    'field_adoption_level',
    'field_countries_adoption',
    'field_innovation_type',
    'field_use_cases',
    'field_data_source',
  ],
};

/** Resolve a relationship to the names behind it, dropping what we cannot name. */
function namesFor(record, field, index) {
  const data = record?.relationships?.[field]?.data;
  if (!data) return [];
  const refs = Array.isArray(data) ? data : [data];
  return refs
    .map((ref) => index.get(`${ref.type}:${ref.id}`))
    .filter((name) => typeof name === 'string' && name.length > 0);
}

/** The ids of a relationship, for things the vocabularies cannot name. */
function idsFor(record, field) {
  const data = record?.relationships?.[field]?.data;
  if (!data) return [];
  return (Array.isArray(data) ? data : [data]).map((ref) => ref.id);
}

/**
 * One page of records, reduced to what the grids and counts read.
 *
 * Readiness falls back to 1 where a record has no level, matching the bundled
 * build's own reading — see heatmaps.js. `readinessExact` keeps the honest
 * answer alongside it, because the ready-to-use grid skips those records
 * rather than averaging them in.
 */
function toRows(document, index) {
  return (document?.data ?? []).map((record) => {
    const readinessTerm = namesFor(record, 'field_readiness_level', index)[0] ?? null;
    const adoptionTerm = namesFor(record, 'field_adoption_level', index)[0] ?? null;
    const changed = Date.parse(record.attributes?.changed ?? '');
    return {
      id: record.id,
      readiness: parseLeadingLevel(readinessTerm),
      readinessExact: parseLeadingLevel(readinessTerm, null),
      adoption: parseLeadingLevel(adoptionTerm),
      countries: namesFor(record, 'field_countries_adoption', index),
      useCases: namesFor(record, 'field_use_cases', index),
      types: namesFor(record, 'field_innovation_type', index),
      sourceId: idsFor(record, 'field_data_source')[0] ?? null,
      // What the drilldown filters on, in the form the filter spec names them:
      // term names, not parsed levels. See localFilter.js.
      readinessTerm,
      adoptionTerm,
      regions: namesFor(record, 'field_region', index),
      sdgs: namesFor(record, 'field_impact_sdgs', index),
      users: namesFor(record, 'field_prospective_users', index),
      grassroots: record.attributes?.field_if_grassroots === true,
      // Milliseconds, for the drilldown's most-recently-updated order.
      changed: Number.isNaN(changed) ? 0 : changed,
    };
  });
}

/**
 * Walk the collection, `CONCURRENCY` pages at a time.
 *
 * Pages are claimed from a shared counter rather than split into fixed blocks,
 * so one slow page does not hold up the workers beside it. The walk ends when
 * a page comes back short, which is the portal's way of saying there is no
 * more — `links.next` is present even on a last full page.
 */
async function crawl({ spec, index, onProgress, fetchImpl, attempts }) {
  const rows = [];
  let nextPage = 0;
  let finished = false;
  let pagesDone = 0;
  let total = null;

  const worker = async () => {
    while (!finished) {
      const page = nextPage;
      nextPage += 1;
      if (page >= MAX_PAGES) {
        log.degraded(`stopping the catalogue pass at ${MAX_PAGES} pages`);
        finished = true;
        return;
      }

      const document = await fetchJsonApi(INNOVATIONS, {
        query: { ...spec, fields: INDEX_FIELDS, page: { limit: MAX_PAGE_SIZE, offset: page * MAX_PAGE_SIZE } },
        fetchImpl,
        attempts,
      });

      const pageRows = toRows(document, index);
      rows.push(...pageRows);
      pagesDone += 1;
      // meta.count rides on every page, so the size of the job is known from
      // the first one back, at no extra cost.
      if (typeof document?.meta?.count === 'number') total = document.meta.count;
      onProgress?.({ pages: pagesDone, rows: rows.length, total });

      if (pageRows.length < MAX_PAGE_SIZE) finished = true;
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return rows;
}

/**
 * Name the data sources the catalogue actually cites.
 *
 * node--digital_asset holds 544+ records, which is why it is not preloaded with
 * the vocabularies. The pass collects the handful of ids that innovations point
 * at — seven, in the bundled catalogue — and this asks for just those.
 */
async function fetchSourceNames(rows, { fetchImpl, attempts } = {}) {
  const ids = [...new Set(rows.map((r) => r.sourceId).filter(Boolean))];
  if (ids.length === 0) return new Map();

  try {
    const document = await fetchJsonApi('/node/digital_asset', {
      query: {
        filter: { ids: { path: 'id', operator: 'IN', value: ids } },
        fields: { 'node--digital_asset': ['title'] },
        page: { limit: MAX_PAGE_SIZE },
      },
      fetchImpl,
      attempts,
    });
    return new Map(
      (document?.data ?? [])
        .filter((node) => node.attributes?.title)
        .map((node) => [node.id, node.attributes.title])
    );
  } catch (err) {
    // One filter with no options is a smaller loss than a failed catalogue pass.
    log.degraded('could not name the data sources:', err?.message);
    return new Map();
  }
}

async function readCache() {
  if (!isIndexedDbAvailable()) return null;
  try {
    const cached = await idbGet(STORES.meta, CACHE_KEY);
    return cached?.rows && typeof cached.builtAt === 'number' ? cached : null;
  } catch (err) {
    log.degraded('could not read the cached catalogue:', err?.message);
    return null;
  }
}

async function writeCache(payload) {
  if (!isIndexedDbAvailable()) return;
  try {
    await idbPut(STORES.meta, CACHE_KEY, payload);
  } catch (err) {
    // Quota, private browsing, a locked store: the pass still served this
    // session, it just will not be there for the next one.
    log.degraded('could not cache the catalogue:', err?.message);
  }
}

let sessionPromise = null;

/**
 * Where a pass the user may be waiting on has got to.
 *
 * The drilldown filters on this index, so a visitor whose browser has none yet
 * has to wait for one — and a wait with a number on it reads as progress where
 * a bare spinner reads as broken. Only passes something is blocked on report
 * here: a refresh behind a stored copy changes nothing on screen, so it stays
 * silent.
 */
let progress = { loading: false, rows: 0, total: null };
const progressListeners = new Set();

function setProgress(next) {
  progress = next;
  for (const listener of progressListeners) listener(progress);
}

/**
 * Hear about a pass in progress. Called at once with the current state.
 *
 * @param {(progress: {loading: boolean, rows: number, total: number|null}) => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeCatalogProgress(listener) {
  progressListeners.add(listener);
  listener(progress);
  return () => progressListeners.delete(listener);
}

/** Walk the catalogue and store what it found. */
async function buildIndex({ now, onProgress, fetchImpl, attempts }) {
  const { index, byType } = await loadTaxonomies({ fetchImpl });
  const spec = buildFilterSpec({}, { byType });

  const startedAt = Date.now();
  const rows = await crawl({ spec, index, onProgress, fetchImpl, attempts });
  const sourceTitles = await fetchSourceNames(rows, { fetchImpl, attempts });
  for (const row of rows) row.sourceTitle = sourceTitles.get(row.sourceId) ?? null;
  const sources = [...new Set(sourceTitles.values())].sort((a, b) => a.localeCompare(b));
  log.note(`catalogue pass: ${rows.length} records in ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);

  const payload = { rows, sources, builtAt: now };
  await writeCache(payload);
  return { ...payload, fromCache: false };
}

/**
 * The catalogue index: every published record, reduced to what Explore reads.
 *
 * A stored copy is served at once while it is under CATALOG_MAX_STALE_MS old.
 * Past CATALOG_TTL_MS that copy is refreshed in the background, and callers
 * after the refresh get the new one.
 *
 * @param {object} [options]
 * @param {boolean} [options.force] - crawl even if a fresh copy is stored
 * @param {number} [options.now]
 * @param {(progress: {pages: number, rows: number, total: number|null}) => void} [options.onProgress]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.attempts]
 * @returns {Promise<{rows: Array<object>, sources: string[], builtAt: number, fromCache: boolean, stale?: boolean}>}
 */
export function loadCatalogIndex({ force = false, now = Date.now(), onProgress, fetchImpl, attempts } = {}) {
  if (sessionPromise && !force) return sessionPromise;

  const work = (async () => {
    const cached = await readCache();
    const age = cached ? now - cached.builtAt : Infinity;

    if (cached && !force && age < CATALOG_TTL_MS) {
      return { ...cached, fromCache: true };
    }

    if (cached && !force && age < CATALOG_MAX_STALE_MS) {
      buildIndex({ now, fetchImpl, attempts }).then(
        (fresh) => {
          sessionPromise = Promise.resolve(fresh);
        },
        (err) => log.degraded('could not refresh the stored catalogue; keeping it:', err?.message)
      );
      return { ...cached, fromCache: true, stale: true };
    }

    // Nothing usable is stored, so whoever asked is waiting on this pass.
    setProgress({ loading: true, rows: 0, total: null });
    try {
      return await buildIndex({
        now,
        fetchImpl,
        attempts,
        onProgress: (step) => {
          setProgress({ loading: true, rows: step.rows, total: step.total ?? null });
          onProgress?.(step);
        },
      });
    } finally {
      setProgress({ loading: false, rows: 0, total: null });
    }
  })();

  // A stale copy is better than none if the pass fails partway: the next call
  // tries again rather than inheriting the failure.
  sessionPromise = work.catch(async (err) => {
    sessionPromise = null;
    const cached = await readCache();
    if (cached) {
      log.degraded('catalogue pass failed; serving the stored copy:', err?.message);
      return { ...cached, fromCache: true, stale: true };
    }
    throw err;
  });

  return sessionPromise;
}

/** Whatever is already stored, without starting a pass. */
export async function peekCatalogIndex() {
  return readCache();
}

/** Forget the session's copy. For tests, and for a manual refresh. */
export function resetCatalogIndex() {
  sessionPromise = null;
  setProgress({ loading: false, rows: 0, total: null });
}
