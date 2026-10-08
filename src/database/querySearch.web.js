/**
 * Searching by a typed question, on the web.
 *
 * Four stages, each doing what it is actually good at:
 *
 *   1. our backend   turns the question into words, translating it first
 *   2. the portal     says which of its 6,287 records contain those words
 *   3. this file      ranks them, on text stage 2 already returned
 *   4. our backend    orders the best of them with the model
 *
 * The point of the arrangement is stage 2. Search used to go to our backend,
 * which reads the bundled SQLite file: 3,075 records a year old, keyed by
 * integer, while Explore reads the portal's 6,287 keyed by uuid. The two
 * surfaces disagreed about what an innovation *is*, so the same record
 * bookmarked from each was stored twice, and one saved from search could not be
 * refreshed from the portal at all — `/node/innovation/40479` is a 404 there.
 *
 * Now both surfaces read the portal and nothing can drift, because there is one
 * copy. Our backend keeps the two jobs only it can do, and holds no catalogue
 * for either of them.
 *
 * What this gives up: FTS5's BM25 over the whole catalogue, which our backend
 * could do and the portal cannot. What replaces it is narrowing hard before
 * ranking — see textSearch.js — plus a ranking of our own in
 * search/rankCandidates.js. On the measurements in that file's header the trade
 * is worth it, because a pool of sixteen records that all contain every word
 * needs far less ranking than six hundred that each contain one.
 */
import { searchTerms, rankSearchCandidates } from '../services/api';
import { findCandidates } from '../api/jsonapi/textSearch';
import { usingSupabase, rpc } from '../api/supabase/client';
import { fetchSearchCandidates } from '../api/supabase/reads';
import { rankCandidates } from '../search/rankCandidates';
import { getInnovationsByIds } from './db';
import { searchCachedInnovations } from './offlineFallback';
import { createLogger } from '../utils/logger';

const log = createLogger('query-search');

/**
 * How many candidates the model is asked to judge.
 *
 * The backend caps its own stage at sixty and truncates each document, so
 * sending more would be sending rows that get sliced off there instead of here.
 */
const RANK_LIMIT = 60;

/** Fallback terms when the backend cannot be reached for stage 1. */
function localTerms(query) {
  return String(query)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 2);
}

/**
 * How long a search's ordered list is kept for paging and repeat searches.
 *
 * Long enough to read through the results; short enough that a catalogue
 * change or a fresh model judgement is not held back for the rest of the day.
 */
const KEEP_MS = 10 * 60 * 1000;

/** Searches kept at once. Each is a list of ids and a few dozen records. */
const MAX_KEPT = 20;

/**
 * Records fetched with the first page: the model returns at most fifteen, and
 * one request for fifteen by id costs what one for five does. Every "load more"
 * through the model's picks is then answered with no request at all.
 */
const FIRST_BATCH = 15;

/** Records per later request: the portal's page ceiling. */
const LATER_BATCH = 50;

/** query → {at, session: Promise} */
const kept = new Map();

/**
 * Stages 1 to 4: from a typed question to an ordered list of ids.
 *
 * The model's picks first, best first, carrying its score. Behind them the rest
 * of the shortlist in our own ranking's order, with no score: they are real
 * matches the model did not choose, and a reader who has gone through fifteen
 * results and wants more is better served by them than by the list ending.
 * With no model, the whole shortlist in our order, with positional scores.
 */
async function runPipeline(trimmed) {
  // Stage 1. A failure here is survivable: the words can be extracted locally,
  // losing only translation and expansion, so a backend that is down degrades
  // search rather than ending it.
  let terms = [];
  let expandedTerms = [];
  let englishQuery = trimmed;
  try {
    const prepared = await searchTerms(trimmed);
    englishQuery = prepared?.englishQuery || trimmed;
    terms = prepared?.terms ?? [];
    expandedTerms = prepared?.expandedTerms ?? [];
  } catch (err) {
    log.degraded('could not prepare the query; using the words as typed:', err?.message);
    terms = localTerms(trimmed);
  }
  if (terms.length === 0) terms = localTerms(englishQuery);

  // Stage 2.
  // The suggestions go to the search, not just to the ranking. Ranking can
  // only reorder what was fetched, so a word the search never used can never
  // surface the record it was suggested for — which is how "help with bunny"
  // found nothing while the portal held "Raising rabbits in the tropics".
  // From the published snapshot when the data source is Supabase: the same
  // strict and loose searches, in one call (see search_candidates).
  const { candidates, conjunction } = usingSupabase()
    ? await fetchSearchCandidates(terms, { expandedTerms, rpc })
    : await findCandidates(terms, { expandedTerms });
  if (candidates.length === 0) return [];

  // Stage 3. The phrase bonus uses the English form, so a translated query
  // can still match a phrase in the catalogue.
  const ranked = rankCandidates(candidates, {
    terms,
    expandedTerms,
    phrase: englishQuery,
  });

  // Stage 4. A failure here leaves our own ranking standing, which is a real
  // ordering rather than a fallback to arbitrary — so search stays usable
  // when only the model is unavailable.
  const shortlist = ranked.slice(0, RANK_LIMIT);
  let ordered = shortlist.map((c, i) => ({ id: c.id, matchScore: Math.max(1, 100 - i * 2) }));
  try {
    const { ranked: scored } = await rankSearchCandidates(
      englishQuery,
      shortlist.map((c) => ({ id: c.id, short_description: c.summary }))
    );
    const scores = new Map((scored ?? []).map((r) => [r.id, r.score]));
    if (scores.size > 0) {
      const picked = shortlist
        .filter((c) => scores.has(c.id))
        .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
        .map((c) => ({ id: c.id, matchScore: scores.get(c.id) }));
      // No score, rather than a made-up one: the list above re-sorts by score
      // on every page, and a positional number could lift these over the
      // model's own picks.
      const rest = shortlist.filter((c) => !scores.has(c.id)).map((c) => ({ id: c.id, matchScore: null }));
      ordered = [...picked, ...rest];
    }
  } catch (err) {
    log.degraded('could not rank with the model; keeping our own order:', err?.message);
  }

  log.note(`"${trimmed}" → ${candidates.length} candidates (${conjunction}), ${ordered.length} ordered`);
  return ordered;
}

/**
 * One search's ordered list and the records fetched for it so far.
 *
 * Records are fetched in batches by id — the first FIRST_BATCH, then
 * LATER_BATCH at a time — and each batch once. A batch that fails is forgotten
 * so the next page can try it again.
 */
function createSession(ordered) {
  const ids = ordered.map((c) => c.id);
  const batches = [ids.slice(0, FIRST_BATCH)];
  for (let at = FIRST_BATCH; at < ids.length; at += LATER_BATCH) {
    batches.push(ids.slice(at, at + LATER_BATCH));
  }
  const batchOf = new Map();
  batches.forEach((batch, i) => batch.forEach((id) => batchOf.set(id, i)));

  const records = new Map();
  const fetched = new Set();
  const loads = [];

  const load = (i) => {
    if (!loads[i]) {
      loads[i] = getInnovationsByIds(batches[i]).then(
        (rows) => {
          for (const row of rows) records.set(row.id, row);
          for (const id of batches[i]) fetched.add(id);
        },
        (err) => {
          loads[i] = null;
          throw err;
        }
      );
    }
    return loads[i];
  };

  /**
   * The page at `offset`, in the order the user sees.
   *
   * An id whose batch came back without it — unpublished since stage 2 found
   * it — is dropped from the list rather than left as a gap, so offsets count
   * what was shown and a page never repeats a record from the one before.
   */
  const page = async (offset, limit) => {
    for (;;) {
      const visible = ordered.filter((c) => !fetched.has(c.id) || records.has(c.id));
      const slice = visible.slice(offset, offset + limit);
      const missing = [...new Set(slice.filter((c) => !fetched.has(c.id)).map((c) => batchOf.get(c.id)))];
      if (missing.length === 0) {
        return {
          results: slice.map((c) => ({ ...records.get(c.id), matchScore: c.matchScore })),
          total: visible.length,
        };
      }
      await Promise.all(missing.map(load));
    }
  };

  return { page, load, batchCount: batches.length };
}

/** The kept session for `trimmed`, or a new one. */
function sessionFor(trimmed) {
  const now = Date.now();
  for (const [query, entry] of kept) {
    if (now - entry.at > KEEP_MS) kept.delete(query);
  }

  const existing = kept.get(trimmed);
  if (existing) return existing.session;

  const session = runPipeline(trimmed).then(createSession);
  kept.set(trimmed, { at: now, session });
  // A search that failed is not kept: the next attempt should run it again.
  session.catch(() => kept.delete(trimmed));
  while (kept.size > MAX_KEPT) kept.delete(kept.keys().next().value);
  return session;
}

/** Forget every kept search. For tests. */
export function resetSearchSessions() {
  kept.clear();
}

/**
 * Search the live catalogue by a typed question.
 *
 * Matches the shape aiSearch returns, so the hooks above cannot tell which
 * platform they are on: `{query, results, hasMore, total}`, each result carrying
 * `matchScore`.
 *
 * The four stages run once per query. Asking again for the same query within
 * KEEP_MS — the next page, or the same search re-run — pages through the list
 * they produced, without asking the backend or the model anything.
 *
 * @param {string} query
 * @param {{offset?: number, limit?: number}} [options]
 */
export async function searchByQuery(query, { offset = 0, limit = 5 } = {}) {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) return { query: trimmed, results: [], hasMore: false, total: 0 };

  try {
    // Offline, every stage below would fail — after its retries — and land in
    // the cache anyway; and a query with no searchable words, like "hi", would
    // not even fail, so it never reached the cache and showed the online
    // "nothing found" page. The browser knows it is offline, so go straight there.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('The browser is offline');
    }

    const session = await sessionFor(trimmed);
    const { results, total } = await session.page(offset, limit);

    // The batch after the one just read, fetched while the user reads, so the
    // first "load more" past the model's picks does not wait either.
    if (session.batchCount > 1) session.load(1).catch(() => {});

    return {
      query: trimmed,
      results,
      hasMore: offset + limit < total,
      total,
    };
  } catch (err) {
    log.failed('could not search the catalogue:', err);

    // Nothing could be reached — but the device may hold records that match.
    // The drilldowns fall back the same way; the difference is that a drilldown
    // has filters the cache can apply and this has words, which it cannot. So
    // the cache is asked for everything it holds and stage 3 is run over it:
    // the same ranking, on the same fields, against a pool of a few hundred
    // instead of the catalogue.
    const cached = await searchCachedInnovations({}, { limit: Number.MAX_SAFE_INTEGER, offset: 0 });
    const matched = rankCandidates(
      cached.results.map((r) => ({ ...r, summary: r.shortDescription })),
      { terms: localTerms(trimmed), phrase: trimmed }
    ).filter((r) => r.rankScore > 0);

    if (matched.length > 0) {
      log.note(`offline: ${matched.length} of ${cached.total} cached records match`);
      return {
        query: trimmed,
        results: matched
          .slice(offset, offset + limit)
          .map((r, i) => ({ ...r, matchScore: Math.max(1, 100 - (offset + i) * 2) })),
        hasMore: offset + limit < matched.length,
        total: matched.length,
        fromCache: true,
      };
    }

    // Nothing saved matches the words, but something is saved. Explore offers
    // everything on the device in this situation; search ended in "the
    // catalogue is unavailable", which is true but leaves the user nowhere.
    // Show what there is, and say none of it matched (`cacheNoMatch`).
    if (cached.total > 0) {
      log.note(`offline: none of ${cached.total} cached records match; showing them all`);
      return {
        query: trimmed,
        results: cached.results.slice(offset, offset + limit).map((r) => ({ ...r, matchScore: null })),
        hasMore: offset + limit < cached.total,
        total: cached.total,
        fromCache: true,
        cacheNoMatch: true,
      };
    }

    // Nothing saved at all. Offline, the useful thing to say is how to have
    // something next time; online, the portal's own error is the true one.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error(
        'You are offline and nothing is saved on this device yet. Bookmark or download solutions while online to keep them here.'
      );
    }
    throw err;
  }
}
