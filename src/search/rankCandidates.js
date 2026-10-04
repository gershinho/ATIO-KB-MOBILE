/**
 * Ranking candidates the portal found, before the model sees them.
 *
 * The FAO JSON:API can answer "which records contain these words" but not
 * "which of them is the best match" — it has no relevance score and cannot sort
 * by one. Our backend's SQLite copy could, through FTS5's BM25, which is most of
 * why search used to run against a year-old 3,075-record file instead of the
 * live 6,287.
 *
 * So the ranking moves here, onto text the portal returns alongside the ids we
 * were asking for anyway. It costs no extra request.
 *
 * This is BM25's shape rather than BM25 itself. The parts that matter for a few
 * hundred candidates are kept — a rare word counts for more than a common one,
 * a long document is not rewarded for being long, repetition saturates — and the
 * parts that need corpus-wide statistics are dropped, because we have the
 * candidate pool and not the catalogue. Two additions BM25 has no notion of: a
 * word in the title counts for several in the description, and the typed phrase
 * surviving intact counts for more than its words scattered.
 *
 * Shared by both platforms so the tests can pin it, though only the web build
 * calls it: the phone ranks with FTS5, which is better, having the whole
 * catalogue on the device to do it with.
 */

/** A title match is worth this many description matches. */
const TITLE_WEIGHT = 3;

/** Above this, repeating a word stops helping. Mirrors BM25's k1. */
const SATURATION = 1.2;

/** How much a document's length is held against it. Mirrors BM25's b. */
const LENGTH_NORMALISATION = 0.6;

/** Assumed typical description length, in words, when the pool is too small to say. */
const FALLBACK_AVG_LENGTH = 60;

/** Added when the whole typed phrase appears intact. */
const PHRASE_BONUS = 8;

/** Added per word the caller typed, as against one we expanded the query with. */
const TYPED_WORD_BONUS = 1.5;

/** Everything that is not a word, for splitting on. */
const NOT_WORD = /[^a-z0-9]+/;

/**
 * Lower-case words of two characters or more.
 *
 * Deliberately the same shape as the backend's extractQueryTerms, minus the
 * stopword list: stopwords are already gone from the terms by the time they
 * reach us, and a stopword in a *document* still has to be counted, or every
 * document's length would be measured differently from its content.
 */
export function words(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .split(NOT_WORD)
    .filter((w) => w.length > 1);
}

/** How many of `pool`'s documents contain `term`, for the rarity weight. */
function documentFrequency(pool, term) {
  let n = 0;
  for (const doc of pool) {
    if (doc.titleWords.includes(term) || doc.bodyWords.includes(term)) n += 1;
  }
  return n;
}

/**
 * How much a term's presence is worth, given how many candidates have it.
 *
 * BM25's inverse document frequency, with the same smoothing. A term in every
 * candidate tells us nothing and lands near zero; one in a handful is what
 * actually distinguishes them. Floored just above zero rather than at it, so a
 * document containing every term still outranks one containing none.
 */
function inverseDocumentFrequency(total, containing) {
  const value = Math.log(1 + (total - containing + 0.5) / (containing + 0.5));
  return Math.max(value, 0.01);
}

const occurrences = (list, term) => list.reduce((n, w) => (w === term ? n + 1 : n), 0);

/**
 * Score and sort candidates against a query, best first.
 *
 * @param {Array<{id: string, title?: string, summary?: string}>} candidates
 * @param {object} query
 * @param {string[]} query.terms - the words the user typed, stopwords removed
 * @param {string[]} [query.expandedTerms] - words we added, worth less
 * @param {string} [query.phrase] - the query as typed, for the intact-phrase bonus
 * @returns {Array<object>} the same objects, each with `rankScore`, sorted
 */
export function rankCandidates(candidates = [], { terms = [], expandedTerms = [], phrase = '' } = {}) {
  if (candidates.length === 0) return [];

  const pool = candidates.map((candidate) => ({
    candidate,
    titleWords: words(candidate.title),
    bodyWords: words(candidate.summary),
  }));

  // With nothing to match on, the portal's own order is the only information
  // we have; inventing a ranking from it would be worse than admitting that.
  const typed = terms.filter(Boolean).map((t) => t.toLowerCase());
  const expanded = expandedTerms.filter(Boolean).map((t) => t.toLowerCase());
  const allTerms = [...new Set([...typed, ...expanded])];
  if (allTerms.length === 0) {
    return candidates.map((candidate) => ({ ...candidate, rankScore: 0 }));
  }

  const avgLength =
    pool.length > 1
      ? pool.reduce((n, d) => n + d.bodyWords.length, 0) / pool.length || FALLBACK_AVG_LENGTH
      : FALLBACK_AVG_LENGTH;

  const idf = new Map(
    allTerms.map((term) => [term, inverseDocumentFrequency(pool.length, documentFrequency(pool, term))])
  );

  const needle = phrase.trim().toLowerCase();

  const scored = pool.map((doc) => {
    const lengthPenalty =
      1 - LENGTH_NORMALISATION + LENGTH_NORMALISATION * (doc.bodyWords.length / avgLength);

    let score = 0;

    for (const term of allTerms) {
      const inTitle = occurrences(doc.titleWords, term);
      const inBody = occurrences(doc.bodyWords, term);
      if (inTitle === 0 && inBody === 0) continue;

      // Title hits are counted as several body hits rather than scored
      // separately, so saturation applies to the pair of them together: a word
      // in both places should not be paid twice over.
      const frequency = inTitle * TITLE_WEIGHT + inBody;
      const saturated = (frequency * (SATURATION + 1)) / (frequency + SATURATION * lengthPenalty);

      score += saturated * (idf.get(term) ?? 0.01);
      if (typed.includes(term)) score += TYPED_WORD_BONUS;
    }

    // "Solar powered pump" as written beats the three words in three sentences.
    if (needle.includes(' ')) {
      const title = doc.candidate.title?.toLowerCase() ?? '';
      const summary = doc.candidate.summary?.toLowerCase() ?? '';
      if (title.includes(needle)) score += PHRASE_BONUS * TITLE_WEIGHT;
      else if (summary.includes(needle)) score += PHRASE_BONUS;
    }

    return { ...doc.candidate, rankScore: Number(score.toFixed(4)) };
  });

  // Ties broken by the portal's order, which is stable, so the same query
  // twice gives the same list rather than two arbitrary ones.
  return scored
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.rankScore - a.c.rankScore || a.i - b.i)
    .map(({ c }) => c);
}
