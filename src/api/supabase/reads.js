/**
 * The Supabase reads behind the web data layer, in the shapes its callers
 * already take.
 *
 * Each function here stands in for a portal read elsewhere:
 *
 *   fetchCatalogIndex     catalogIndex.js's crawl → {rows, sources, builtAt}
 *   fetchTaxonomies       taxonomies.js's nine vocabulary walks → byType
 *   fetchInnovationsByIds db.web.js getInnovationsByIds / getInnovationById
 *   fetchChangedTimes     db.web.js getChangedTimes
 *   fetchSearchCandidates textSearch.js findCandidates
 *
 * None of them caches anything. The modules that call them keep their own
 * IndexedDB keys, TTLs and stale fallbacks, so offline behaviour does not move.
 *
 * `rpc(name, args)` is injected — the Supabase client in the app, a fake in
 * the tests — and resolves with the function's JSON or throws.
 */

/** Rows per catalogue index page. Measured at about 1.3 MB per thousand. */
export const INDEX_PAGE = 1000;

/** Ids per detail request, and per changed-stamp request: the RPCs' limits. */
const DETAIL_BATCH = 100;
const CHANGED_BATCH = 200;

/** get_catalog_index's error when a publish lands mid-walk. */
const SNAPSHOT_CHANGED = 'P0002';

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function walkIndex(rpc, onProgress) {
  const rows = [];
  let after = null;
  let snapshot = null;
  let sources = [];
  let total = null;
  let pages = 0;

  do {
    const page = await rpc('get_catalog_index', { after, lim: INDEX_PAGE, snapshot });
    rows.push(...page.rows);
    ({ snapshotVersion: snapshot, sources, total } = page);
    after = page.next;
    pages += 1;
    onProgress?.({ pages, rows: rows.length, total });
  } while (after);

  return { rows, sources, snapshot };
}

/**
 * Every published record as a catalogIndex:v2 row, plus the data sources.
 *
 * A publish during the walk makes the RPC refuse the next page rather than mix
 * two catalogues; the walk then starts once more from the beginning.
 *
 * @param {object} options
 * @param {Function} options.rpc
 * @param {number} [options.now] - stamped as builtAt, as the crawl does
 * @param {Function} [options.onProgress] - {pages, rows, total}, per page
 * @returns {Promise<{rows: object[], sources: string[], builtAt: number, snapshotVersion: string}>}
 */
export async function fetchCatalogIndex({ rpc, now = Date.now(), onProgress }) {
  let walked;
  try {
    walked = await walkIndex(rpc, onProgress);
  } catch (err) {
    if (err?.code !== SNAPSHOT_CHANGED) throw err;
    walked = await walkIndex(rpc, onProgress);
  }
  return {
    rows: walked.rows,
    // Sorted as the crawl sorts them, rather than in Postgres's collation.
    sources: [...new Set(walked.sources)].sort((a, b) => a.localeCompare(b)),
    builtAt: now,
    snapshotVersion: walked.snapshot,
  };
}

/** The nine vocabularies as `{type: [[id, name]]}`, what taxonomies.js caches. */
export async function fetchTaxonomies({ rpc }) {
  const { byType } = await rpc('get_taxonomies', {});
  return byType;
}

/**
 * Mapped records for `ids`, in the order asked, skipping any the snapshot does
 * not hold — what getInnovationsByIds returns from the portal.
 */
export async function fetchInnovationsByIds(ids, { rpc }) {
  const wanted = [...new Set(ids.filter(Boolean))];
  const found = new Map();
  for (const batch of chunks(wanted, DETAIL_BATCH)) {
    for (const record of await rpc('get_innovations', { ids: batch })) found.set(record.id, record);
  }
  return ids.map((id) => found.get(id)).filter(Boolean);
}

/** id → the portal's `changed` string, what getChangedTimes returns. */
export async function fetchChangedTimes(ids, { rpc }) {
  const changed = new Map();
  for (const batch of chunks([...new Set(ids.filter(Boolean))], CHANGED_BATCH)) {
    for (const { id, changed: stamp } of await rpc('get_changed', { ids: batch })) changed.set(id, stamp ?? null);
  }
  return changed;
}

/**
 * Search candidates, in findCandidates' result shape.
 *
 * @param {string[]} terms
 * @param {object} options
 * @param {string[]} [options.expandedTerms]
 * @param {Function} options.rpc
 */
export async function fetchSearchCandidates(terms = [], { expandedTerms = [], rpc }) {
  const cleaned = [...new Set(terms.filter((t) => typeof t === 'string' && t.length > 2))];
  if (cleaned.length === 0) return { candidates: [], conjunction: null, requests: 0 };

  const result = await rpc('search_candidates', { terms: cleaned, expanded: expandedTerms });
  return {
    candidates: result.candidates,
    conjunction: result.conjunction,
    strictCount: result.strictCount,
    requests: result.requests,
  };
}
