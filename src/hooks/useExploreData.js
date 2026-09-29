import { useCallback, useState } from 'react';
import {
  getStats,
  getTopRegions,
  getChallengeCounts,
  getTypeCounts,
  getMostAdvancedInnovations,
} from '../database/db';
import {
  isWebDataUnavailable,
  WEB_DATA_UNAVAILABLE_MESSAGE,
} from '../database/webDataUnavailable';
import { createLogger } from '../utils/logger';

const log = createLogger('explore');

const EMPTY_STATS = { innovations: 0, countries: 0, sdgs: 17 };

/**
 * The Explore landing page's data: headline counts, the challenge and type
 * grids, innovation hubs, and the recent list.
 *
 * Loads in two waves on purpose. The first wave is what the user sees without
 * scrolling, and clearing `loading` after it lets the page paint while the
 * grid counts are still arriving. The second wave fills in numbers that render
 * as 0 until they land.
 */
export default function useExploreData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Distinct from `error`: the web build has no bundled catalogue by design, so
  // the page offers an explanation rather than a retry that cannot succeed.
  const [unavailable, setUnavailable] = useState(false);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [mostAdvanced, setMostAdvanced] = useState([]);
  const [topRegions, setTopRegions] = useState([]);
  const [challengeCounts, setChallengeCounts] = useState({});
  const [typeCounts, setTypeCounts] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const [nextStats, nextAdvanced] = await Promise.all([
        getStats(),
        getMostAdvancedInnovations(5),
      ]);
      setStats(nextStats);
      setMostAdvanced(nextAdvanced);
      setLoading(false);

      // Second wave, below the fold. A failure here must not replace a page
      // that has already painted: it used to share the catch below, so a
      // late-arriving grid-count error blanked the stats and list the user was
      // already reading. Each count renders as 0 until it lands, which is what
      // it does anyway while the request is in flight.
      try {
        const [nextRegions, nextChallengeCounts, nextTypeCounts] = await Promise.all([
          getTopRegions(15),
          getChallengeCounts(),
          getTypeCounts(),
        ]);
        setTopRegions(nextRegions);
        setChallengeCounts(nextChallengeCounts);
        setTypeCounts(nextTypeCounts);
      } catch (e) {
        log.degraded('Explore grid counts unavailable; showing zeroes:', e);
      }
    } catch (e) {
      // Every other hook logs its failure and shows written copy. This one
      // logged nothing and rendered the raw exception, so a SQLite message like
      // 'no such table: innovations_fts' was the user-facing text.
      if (isWebDataUnavailable(e)) {
        // Expected on web, not a fault: Explore is computed from the bundled
        // database, which the web build deliberately does not ship.
        log.note('Explore is unavailable in the web build.');
        setUnavailable(true);
        setError(WEB_DATA_UNAVAILABLE_MESSAGE);
      } else {
        log.failed('Could not load the Explore page:', e);
        setError('Could not load the database. Pull to try again.');
      }
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    unavailable,
    stats,
    mostAdvanced,
    topRegions,
    challengeCounts,
    typeCounts,
    load,
  };
}
