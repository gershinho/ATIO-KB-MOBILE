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

/**
 * @typedef {import('../database/db').InnovationFilters} InnovationFilters
 */

const KEYWORD_SOURCES = [
  { idKey: 'challenges', keywordKey: 'challengeKeywords', entries: CHALLENGES },
  { idKey: 'types', keywordKey: 'typeKeywords', entries: TYPES },
];

/**
 * Group keywords under the entries that own them.
 *
 * FilterPanel keeps its checkbox state in this shape. Lived there as
 * `buildSelectedSubTerms`, one of three functions splitting the same
 * translation across two modules.
 *
 * @param {Array<{id: string, subTerms?: Array<{keyword: string}>}>} taxonomy
 * @param {string[]} keywords
 * @returns {Record<string, string[]>} keyed by entry id; entries with no
 *   matching keyword are absent rather than present-and-empty
 */
export function keywordsByEntryId(taxonomy, keywords) {
  if (!keywords?.length) return {};
  const grouped = {};
  for (const entry of taxonomy) {
    for (const subTerm of entry.subTerms || []) {
      if (keywords.includes(subTerm.keyword)) {
        grouped[entry.id] = grouped[entry.id] || [];
        grouped[entry.id].push(subTerm.keyword);
      }
    }
  }
  return grouped;
}

/**
 * The reverse: which entries do these keywords belong to?
 *
 * FilterPanel needs this to decide which taxonomy entries to show as "in scope"
 * when it opens on a filter set expressed in keywords. It lived in that file as
 * `buildInScopeIds`, the exact inverse of the function below, in a different
 * module — so the two halves of one translation could drift apart.
 *
 * @param {Array<{id: string, subTerms?: Array<{keyword: string}>}>} taxonomy
 * @param {string[]} keywords
 * @returns {string[]} ids of entries owning at least one of the keywords
 */
export function entryIdsForKeywords(taxonomy, keywords) {
  if (!keywords?.length) return [];
  const ids = new Set();
  for (const entry of taxonomy) {
    const entryKeywords = (entry.subTerms || []).map((subTerm) => subTerm.keyword);
    if (keywords.some((keyword) => entryKeywords.includes(keyword))) ids.add(entry.id);
  }
  return Array.from(ids);
}

/**
 * Keywords to apply for a set of in-scope entries.
 *
 * An entry with specific sub-terms checked contributes exactly those; an entry
 * that is in scope with nothing checked contributes all of its sub-terms, which
 * is what "the whole entry" means.
 *
 * @param {Array<{id: string, subTerms?: Array<{keyword: string}>}>} taxonomy
 * @param {string[]} inScopeIds
 * @param {Record<string, string[]>} selectedByEntryId
 * @returns {string[]}
 */
export function keywordsForEntries(taxonomy, inScopeIds, selectedByEntryId) {
  const keywords = [];
  for (const id of inScopeIds) {
    const entry = taxonomy.find((candidate) => candidate.id === id);
    if (!entry) continue;
    const selected = selectedByEntryId[id];
    if (selected?.length > 0) keywords.push(...selected);
    else keywords.push(...(entry.subTerms || []).map((subTerm) => subTerm.keyword));
  }
  return keywords;
}

/**
 * Fill in the keyword encoding from the id encoding, so a panel that displays
 * sub-terms opens with all of a selected entry's sub-terms checked.
 *
 * Existing keywords win: if the caller already narrowed to specific sub-terms,
 * expanding the parent id would silently re-select the ones they unchecked.
 *
 * @param {InnovationFilters} filters
 * @returns {InnovationFilters} a new filters object; the input is not modified
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
