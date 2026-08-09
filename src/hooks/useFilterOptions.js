import { useEffect, useState } from 'react';
import { getAllCountries, getDataSources } from '../database/db';
import { createLogger } from '../utils/logger';

const log = createLogger('filters');

/**
 * The country and data-source lists the filter panel offers.
 *
 * FilterPanel used to query the database itself, which made it the only
 * component doing async data work with no cancellation guard: it re-ran both
 * queries on every open, and could set state after unmount. Its siblings
 * DetailDrawer and CommentsModal both guarded their own effects, so the same
 * concern was handled to three different standards depending on which file you
 * opened.
 *
 * Loaded once per mount rather than per open — the lists are fixed for a
 * session, so re-querying when the panel is dismissed and reopened bought
 * nothing.
 *
 * @returns {{allCountries: Array<{name: string}>, dataSources: Array<{title: string}>}}
 */
export default function useFilterOptions() {
  const [allCountries, setAllCountries] = useState([]);
  const [dataSources, setDataSources] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Settled, not all: an empty source list should not also empty the
      // country list. Each failure degrades only its own filter.
      const [countries, sources] = await Promise.allSettled([
        getAllCountries(),
        getDataSources(),
      ]);

      if (cancelled) return;
      if (countries.status === 'fulfilled') setAllCountries(countries.value);
      else log.degraded('Country list unavailable; that filter will be empty:', countries.reason);

      if (sources.status === 'fulfilled') setDataSources(sources.value);
      else log.degraded('Source list unavailable; that filter will be empty:', sources.reason);
    })();

    return () => { cancelled = true; };
  }, []);

  return { allCountries, dataSources };
}
