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
 * Search the live catalogue by a typed question.
 *
 * Matches the shape aiSearch returns, so the hooks above cannot tell which
 * platform they are on: `{query, results, hasMore, total}`, each result carrying
 * `matchScore`.
 *
 * @param {string} query
 * @param {{offset?: number, limit?: number}} [options]
 */
export async function searchByQuery(query, { offset = 0, limit = 5 } = {}) {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) return { query: trimmed, results: [], hasMore: false, total: 0 };

  try {
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
    const { candidates, conjunction } = await findCandidates(terms);
    if (candidates.length === 0) {
      return { query: trimmed, results: [], hasMore: false, total: 0 };
    }

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
    let ordered = shortlist;
    try {
      const { ranked: scored } = await rankSearchCandidates(
        englishQuery,
        shortlist.map((c) => ({ id: c.id, short_description: c.summary }))
      );
      const scores = new Map((scored ?? []).map((r) => [r.id, r.score]));
      if (scores.size > 0) {
        ordered = shortlist
          .filter((c) => scores.has(c.id))
          .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
          .map((c) => ({ ...c, matchScore: scores.get(c.id) }));
      }
    } catch (err) {
      log.degraded('could not rank with the model; keeping our own order:', err?.message);
    }

    // Only the page being shown is fetched in full. Stage 2 asked for titles and
    // summaries because that is what ranking needs; a card needs the rest, and
    // fetching it for sixty records to show five would be five of them useful.
    const page = ordered.slice(offset, offset + limit);
    const full = await getInnovationsByIds(page.map((c) => c.id));
    const byId = new Map(full.map((r) => [r.id, r]));

    const results = page
      .map((c, i) => {
        const record = byId.get(c.id);
        if (!record) return null;
        return {
          ...record,
          // The model's score when it ran, our rank's position when it did not.
          matchScore: c.matchScore ?? Math.max(1, 100 - (offset + i) * 2),
        };
      })
      .filter(Boolean);

    log.note(
      `"${trimmed}" → ${candidates.length} candidates (${conjunction}), ${ordered.length} ranked, ${results.length} shown`
    );

    return {
      query: trimmed,
      results,
      hasMore: offset + limit < ordered.length,
      total: ordered.length,
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

    throw err;
  }
}
