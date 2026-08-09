import { CHALLENGES, TYPES } from '../data/constants';

/**
 * Translation between the two encodings a filters object can carry.
 *
 * A filters object identifies challenges and types two different ways:
 *
 * - `challenges: ['violence']` / `types: ['app']` — entry ids, what the data
 *   layer matches on.
 * - `challengeKeywords: [...]` / `typeKeywords: [...]` — the individual search
 *   terms behind an entry, what FilterPanel shows as checkable sub-items.
 *
 * Both are legitimate: an id means "the whole entry", a keyword list means "these
 * specific sub-terms". The problem was that converting between them was written
 * out inline wherever it was needed, in four different modules, with the
 * fallback conditions subtly different in each. This is that conversion, once.
 */

const KEYWORD_SOURCES = [
  { idKey: 'challenges', keywordKey: 'challengeKeywords', entries: CHALLENGES },
  { idKey: 'types', keywordKey: 'typeKeywords', entries: TYPES },
];

/**
 * Fill in the keyword encoding from the id encoding, so a panel that displays
 * sub-terms opens with all of a selected entry's sub-terms checked.
 *
 * Existing keywords win: if the caller already narrowed to specific sub-terms,
 * expanding the parent id would silently re-select the ones they unchecked.
 *
 * @param {object} filters
 * @returns {object} a new filters object; the input is not modified
 */
export function withExpandedKeywords(filters) {
  const expanded = { ...filters };
  for (const { idKey, keywordKey, entries } of KEYWORD_SOURCES) {
    const ids = filters[idKey];
    if (!ids?.length) continue;
    if (filters[keywordKey]?.length > 0) continue;

    const keywords = [];
    for (const id of ids) {
      const entry = entries.find((e) => e.id === id);
      if (entry?.subTerms) {
        for (const subTerm of entry.subTerms) keywords.push(subTerm.keyword);
      }
    }
    expanded[keywordKey] = keywords;
  }
  return expanded;
}
