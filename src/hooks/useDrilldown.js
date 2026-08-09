import { useCallback, useRef, useState } from 'react';
import { searchInnovations, countInnovations } from '../database/db';
import { createLogger } from '../utils/logger';

const log = createLogger('drilldown');

const DRILLDOWN_PAGE_SIZE = 10;

/**
 * The filtered-results view reached by tapping a challenge, a type, a hub, a
 * heatmap cell, or "browse all".
 *
 * Every entry point used to repeat the same twelve statements, differing only
 * in the values now passed to `open`. They also each swallowed load failures
 * into a log and left the modal showing an empty list, so a failed query looked
 * identical to a genuine no-results — hence the separate `error` slot.
 */
export default function useDrilldown() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState(null);
  const [iconColor, setIconColor] = useState('#333');
  const [source, setSource] = useState(null); // 'challenge' | 'type' | 'region' | 'all'
  const [results, setResults] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({});
  const [entryFilters, setEntryFilters] = useState(null);

  // Mirrors `results` so loadMore can page from the current length without
  // depending on the array itself.
  const resultsRef = useRef([]);

  // Captured before every await that writes results, and re-checked after. A
  // page in flight from loadMore used to land after open/applyFilters had
  // already replaced the list, appending the previous slice's rows to the new
  // one. The list calls loadMore from onEndReached, so overlapping was always
  // reachable.
  const requestIdRef = useRef(0);
  const replaceResults = useCallback((next) => {
    resultsRef.current = next;
    setResults(next);
  }, []);

  /** Load a filtered page and its total, sharing one error path. */
  const fetchPage = useCallback(
    async (nextFilters, limit) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const [items, total] = await Promise.all([
          searchInnovations(nextFilters, { limit }),
          countInnovations(nextFilters),
        ]);
        if (requestId !== requestIdRef.current) return;
        replaceResults(items);
        setCount(total);
        setHasMore(items.length < total);
      } catch (e) {
        if (requestId !== requestIdRef.current) return;
        log.failed('Could not load this slice:', e);
        replaceResults([]);
        setCount(0);
        setHasMore(false);
        setError('Could not load these solutions. Pull to try again.');
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [replaceResults]
  );

  /**
   * @param {object} config
   * @param {string} config.source - which surface opened this, for the count wording
   * @param {string} config.title
   * @param {string} config.icon - Ionicons name
   * @param {string} [config.iconColor]
   * @param {object} config.filters - passed straight to the data layer
   * @param {object} [config.entryFilters] - pre-selection for the filter panel
   * @param {number} [config.limit]
   */
  const open = useCallback(
    async ({
      source: nextSource,
      title: nextTitle,
      icon: nextIcon,
      iconColor: nextIconColor = '#333',
      filters: nextFilters,
      entryFilters: nextEntryFilters = {},
      limit = DRILLDOWN_PAGE_SIZE,
    }) => {
      setSource(nextSource);
      setTitle(nextTitle);
      setIcon(nextIcon);
      setIconColor(nextIconColor);
      setVisible(true);
      setFilters(nextFilters);
      setEntryFilters(nextEntryFilters);
      await fetchPage(nextFilters, limit);
    },
    [fetchPage]
  );

  /** Re-run the current drilldown against a different filter set. */
  const applyFilters = useCallback(
    async (nextFilters) => {
      setFilters(nextFilters);
      await fetchPage(nextFilters, DRILLDOWN_PAGE_SIZE);
    },
    [fetchPage]
  );

  /**
   * Append the next page.
   *
   * Safe to call at any time, including while open/applyFilters is replacing the
   * slice: a page that lands after the filters have moved on is discarded rather
   * than appended.
   */
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    const requestId = ++requestIdRef.current;
    setLoadingMore(true);
    try {
      const nextPage = await searchInnovations(filters, {
        limit: DRILLDOWN_PAGE_SIZE,
        offset: resultsRef.current.length,
      });
      if (requestId !== requestIdRef.current) return;
      const appended = [...resultsRef.current, ...nextPage];
      replaceResults(appended);
      setHasMore(appended.length < count);
    } catch (e) {
      log.degraded('Could not load the next page; keeping what is shown:', e);
    } finally {
      // Always cleared, unlike `loading`: this flag has exactly one writer, so a
      // superseded page that skipped this would latch it true for the life of
      // the hook — and `if (loadingMore) return` above would then kill every
      // later page while the list pinned its footer spinner. A superseding
      // run/fetch owns `loading` and clears it itself; nothing else owns this.
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loading, filters, count, replaceResults]);

  const close = useCallback(() => setVisible(false), []);

  return {
    visible,
    title,
    icon,
    iconColor,
    source,
    results,
    count,
    loading,
    loadingMore,
    hasMore,
    error,
    filters,
    entryFilters,
    open,
    applyFilters,
    loadMore,
    close,
  };
}
