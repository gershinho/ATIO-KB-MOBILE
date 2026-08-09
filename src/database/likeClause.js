/**
 * Bound-parameter LIKE clause construction.
 *
 * Every LIKE in the app is built here, so % and _ inside a keyword are escaped
 * rather than treated as wildcards. That distinction is not cosmetic: hand-built
 * patterns returned the wrong rows for any value containing either character,
 * and would have become a real injection the moment a keyword came from user
 * input rather than the hardcoded taxonomy.
 *
 * Kept free of expo imports so the escaping is unit-testable.
 */

/** Characters that LIKE treats specially, plus the escape character itself. */
const LIKE_SPECIALS = /[\\%_]/g;

/** Escape a value for use inside a LIKE pattern with ESCAPE '\'. */
export function escapeLikePattern(value) {
  return String(value ?? '').replace(LIKE_SPECIALS, '\\$&');
}

/**
 * Build an OR-ed LIKE clause plus its bound parameters.
 *
 * @param {string} column - already-trusted column reference, e.g. 'uc.term_name'
 * @param {string[]} keywords
 * @returns {{clause: string, params: string[]}} clause is '0' when there are no
 *   keywords, so the caller still produces valid SQL that matches nothing.
 */
export function buildKeywordLikeClause(column, keywords) {
  const list = Array.isArray(keywords) ? keywords.filter((k) => k != null && k !== '') : [];
  if (list.length === 0) {
    return { clause: '0', params: [] };
  }
  return {
    clause: list.map(() => `${column} LIKE ? ESCAPE '\\'`).join(' OR '),
    params: list.map((k) => `%${escapeLikePattern(k)}%`),
  };
}
