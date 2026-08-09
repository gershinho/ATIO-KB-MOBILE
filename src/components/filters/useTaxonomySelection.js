import { useCallback, useState } from 'react';
import {
  entryIdsForKeywords, keywordsByEntryId, keywordsForEntries,
} from '../../utils/filterEncoding';

/**
 * One taxonomy's selection state: which entries are in scope, which sub-terms
 * are picked within them, and which entry is open.
 *
 * FilterPanel held these three slots and their four handlers twice — once for
 * challenges, once for types — as ~75 lines that differed only in which setter
 * they called. The presentational half was already parameterised: one
 * TaxonomySection component serves both, taking the taxonomy as a prop. This is
 * the state half of that same refactor, and it is why the two halves could drift
 * apart at all: adding a behaviour meant remembering to add it twice.
 *
 * @param {Array<{id: string, subTerms: Array}>} taxonomy - CHALLENGES or TYPES
 * @param {string[]} [initialKeywords] - keywords to restore a selection from
 * @param {() => void} [beforeChange] - runs before any state change, so the
 *   caller can stage a layout animation without this hook knowing about one
 */
export default function useTaxonomySelection(taxonomy, initialKeywords, beforeChange) {
  const [expandedId, setExpandedId] = useState(null);
  const [selectedSubTerms, setSelectedSubTerms] = useState(() =>
    keywordsByEntryId(taxonomy, initialKeywords)
  );
  const [inScopeIds, setInScopeIds] = useState(() =>
    entryIdsForKeywords(taxonomy, initialKeywords)
  );

  /** Restore the whole selection from a keyword list, closing anything open. */
  const restore = useCallback(
    (keywords) => {
      setSelectedSubTerms(keywordsByEntryId(taxonomy, keywords));
      setInScopeIds(entryIdsForKeywords(taxonomy, keywords));
      setExpandedId(null);
    },
    [taxonomy]
  );

  const toggleSubTerm = useCallback(
    (entryId, keyword) => {
      beforeChange?.();
      setSelectedSubTerms((prev) => {
        const arr = prev[entryId] || [];
        const next = { ...prev };
        if (arr.includes(keyword)) {
          next[entryId] = arr.filter((k) => k !== keyword);
          if (next[entryId].length === 0) delete next[entryId];
        } else {
          next[entryId] = [...arr, keyword];
        }
        return next;
      });
    },
    [beforeChange]
  );

  const expand = useCallback(
    (id) => {
      beforeChange?.();
      setInScopeIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setExpandedId(id);
    },
    [beforeChange]
  );

  const collapse = useCallback(() => {
    beforeChange?.();
    setExpandedId(null);
  }, [beforeChange]);

  const clearEntry = useCallback(
    (id) => {
      beforeChange?.();
      setInScopeIds((prev) => prev.filter((x) => x !== id));
      setSelectedSubTerms((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setExpandedId(null);
    },
    [beforeChange]
  );

  /** The keywords this selection means, for the filter bag. */
  const keywordsForApply = useCallback(
    () => keywordsForEntries(taxonomy, inScopeIds, selectedSubTerms),
    [taxonomy, inScopeIds, selectedSubTerms]
  );

  return {
    restore,
    keywordsForApply,
    /** Spread straight onto TaxonomySection; the names line up deliberately. */
    sectionProps: {
      taxonomy,
      inScopeIds,
      selectedSubTerms,
      expandedId,
      onExpand: expand,
      onCollapse: collapse,
      onClearEntry: clearEntry,
      onToggleSubTerm: toggleSubTerm,
    },
  };
}
