/**
 * Finding candidates for a typed query in the FAO catalogue.
 *
 * The mapping card strikes out "implement full-text search", and for the portal
 * alone that is right: it has no relevance score, cannot sort by one, and will
 * happily return an arbitrary fifty of the six hundred records containing the
 * word "water". What it is good at is answering, quickly, which records contain
 * a given set of words.
 *
 * So this asks only that. Measured against the live portal through the dev proxy:
 *
 *   every word must appear      "solar irrigation pump"   16 records   1.1s
 *   every word must appear      "water storage"           42 records   1.9s
 *   any word may appear         "water"                  600+ records  2.0s
 *
 * Narrowing is what makes the difference. A pool of sixteen records that all
 * contain every word needs no relevance score to be good; a pool of six hundred
 * that each contain one word needs one badly. So two searches are run:
 *
 *   strict   every word must appear, in the title or the description
 *   loose    any word may appear
 *
 * and their results are merged. The strict matches are a subset of the loose
 * ones in principle, but not in practice: the loose search can match six hundred
 * records and we read the first hundred and fifty of them, in the portal's order
 * rather than any relevance order, so the records that contain *every* word are
 * quite capable of not being among them. Running the strict search as well puts
 * them in the pool, and the ranking in search/rankCandidates.js — which already
 * pays for every term matched — floats them to the top.
 *
 * Both run at once. They were sequential at first, strict then loose only if
 * strict found too little, which is the obvious reading of "narrow first" and
 * cost eleven seconds for a five-word query: the stages added up where they
 * could have overlapped. Together they cost one stage's wall time.
 *
 * A one-word query has only one search to run, strict and loose being the same
 * thing, and costs half as much again.
 */
import { fetchJsonApi } from './client';
import { MAX_PAGE_SIZE } from './query';
import { htmlToText } from './htmlToText';
import { createLogger } from '../../utils/logger';

const log = createLogger('text-search');

const INNOVATIONS = '/node/innovation';

/** Only what ranking needs. A full record is ~5 KB and there are hundreds. */
const SEARCH_FIELDS = {
  'node--innovation': ['title', 'field_shorter_description'],
};

/**
 * Enough to rank well without paying for pages nobody will read.
 *
 * Three pages of fifty. The fourth and fifth pages measured at no extra wall
 * time, running in parallel, but each is 90 KB on a connection the offline card
 * exists because we cannot rely on.
 */
const MAX_PAGES = 3;

/**
 * Enough strict matches for the pool to be called a narrow one.
 *
 * Used only to describe the search afterwards, not to decide what to run: both
 * searches run regardless, so this changes a log line and nothing a user sees.
 */
const ENOUGH_CANDIDATES = 25;

/**
 * The portal rejects a filter on a text field's bare name — `field_shorter_
 * description` is "incomplete, it must end with one of the following
 * specifiers" — so the stored value is addressed explicitly. `title` is a plain
 * string and takes no specifier.
 */
const SEARCHABLE_PATHS = ['title', 'field_shorter_description.value'];

/**
 * A query asking for records that contain words, in the title or description.
 *
 * Builds nested groups: one outer group with the caller's conjunction, and per
 * word an inner OR group holding one CONTAINS condition per searchable field.
 * With AND outside and OR inside, "every word, in either field" is expressible
 * without demanding that every word appear in the *same* field.
 *
 * @param {string[]} terms
 * @param {{conjunction?: 'AND'|'OR'}} [options]
 */
export function buildTextQuery(terms, { conjunction = 'AND' } = {}) {
  const groups = { match: { conjunction } };
  const filter = { status: 1 };

  terms.forEach((term, i) => {
    const wordGroup = `w${i}`;
    groups[wordGroup] = { conjunction: 'OR', memberOf: 'match' };
    SEARCHABLE_PATHS.forEach((path, j) => {
      filter[`c${i}_${j}`] = {
        path,
        operator: 'CONTAINS',
        value: term,
        memberOf: wordGroup,
      };
    });
  });

  return { filter, groups, fields: SEARCH_FIELDS };
}

/**
 * One search: its pages in parallel.
 *
 * A page that fails costs only itself, because two pages of candidates are
 * worth ranking and refusing to rank them because a third timed out would be
 * worse. But the failures are counted and handed back, because *every* page
 * failing is not an empty catalogue — it is a catalogue we cannot reach, and
 * the two have to reach the caller as different things. Reported as the same,
 * they were: with the network off this returned an empty pool, search called
 * that "no solutions found", and the records sitting in the cache were never
 * offered.
 */
async function runStage(terms, conjunction, { fetchImpl, attempts }) {
  const spec = buildTextQuery(terms, { conjunction });

  const outcomes = await Promise.all(
    Array.from({ length: MAX_PAGES }, (_, page) =>
      fetchJsonApi(INNOVATIONS, {
        query: { ...spec, page: { limit: MAX_PAGE_SIZE, offset: page * MAX_PAGE_SIZE } },
        fetchImpl,
        attempts,
      }).then(
        (document) => ({ rows: document?.data ?? [] }),
        (error) => {
          log.degraded(`page ${page} of a ${conjunction} search failed:`, error?.message);
          return { rows: [], error };
        }
      )
    )
  );

  return {
    rows: outcomes.flatMap((o) => o.rows),
    failures: outcomes.filter((o) => o.error).length,
    error: outcomes.find((o) => o.error)?.error ?? null,
  };
}

/**
 * The records whose title or description contain the query's words.
 *
 * @param {string[]} terms - stopwords already removed, lower case
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - injected by the tests
 * @param {number} [options.attempts]
 * @returns {Promise<{candidates: Array<{id, title, summary}>, conjunction: string,
 *   strictCount: number, requests: number}>}
 */
export async function findCandidates(terms = [], { fetchImpl, attempts } = {}) {
  // Three characters, matching the backend's own term extraction. A shorter
  // word is noise in a substring search — "of" is contained in a good fraction
  // of six thousand descriptions — and the terms arrive stopword-free anyway,
  // so this is a net rather than the filter.
  const cleaned = [...new Set(terms.filter((t) => typeof t === 'string' && t.length > 2))];
  if (cleaned.length === 0) return { candidates: [], conjunction: null, requests: 0 };

  // One word makes the two searches identical, so only one is worth running.
  const conjunctions = cleaned.length > 1 ? ['AND', 'OR'] : ['OR'];

  const searches = await Promise.all(
    conjunctions.map((conjunction) => runStage(cleaned, conjunction, { fetchImpl, attempts }))
  );

  // Nothing answered. Not an empty catalogue — an unreachable one, and the
  // caller has a cache to fall back on if it is told which this was.
  const attempted = conjunctions.length * MAX_PAGES;
  const failed = searches.reduce((n, s) => n + s.failures, 0);
  if (failed === attempted) throw searches.find((s) => s.error)?.error ?? new Error('Search failed');

  const [strict, loose] = searches;

  // Strict first into the map, so a record found by both keeps the strict
  // reading of itself — and so the pool's own order, which breaks ranking ties,
  // puts the all-words matches ahead of the any-word ones before scoring starts.
  const byId = new Map();
  for (const row of [...strict.rows, ...(loose?.rows ?? [])]) {
    if (!row?.id || byId.has(row.id)) continue;
    byId.set(row.id, {
      id: row.id,
      title: row.attributes?.title ?? '',
      // The portal publishes this as a processed-HTML object. Ranking counts
      // words, and "<p>" is not one.
      summary: htmlToText(
        row.attributes?.field_shorter_description?.processed ??
          row.attributes?.field_shorter_description?.value ??
          ''
      ),
    });
  }

  const requests = attempted;
  const strictCount = strict.rows.length;
  log.note(
    `"${cleaned.join(' ')}" → ${byId.size} candidates (${strictCount} matching every word, ${requests} requests)`
  );

  return {
    candidates: [...byId.values()],
    // What the pool is mostly made of, for the caller's log: AND when the strict
    // search carried it, OR when the loose one had to.
    conjunction: strictCount >= ENOUGH_CANDIDATES ? 'AND' : 'OR',
    strictCount,
    requests,
  };
}
