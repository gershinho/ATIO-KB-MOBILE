import { useCallback, useState } from 'react';
import {
  getStats,
  getTopRegions,
  getChallengeCounts,
  getTypeCounts,
  getMostAdvancedInnovations,
} from '../database/db';
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
  const [stats, setStats] = useState(EMPTY_STATS);
  const [mostAdvanced, setMostAdvanced] = useState([]);
  const [topRegions, setTopRegions] = useState([]);
  const [challengeCounts, setChallengeCounts] = useState({});
  const [typeCounts, setTypeCounts] = useState({});
  // The grid counts arrive after the page has painted. On the phone that is a
  // query and the gap is invisible; the web build has to read every record to
  // know what a challenge contains, which takes seconds against a warm portal
  // and minutes against a cold one. Rendering 0 in the meantime states
  // something false, so the screens show the number only once it is real.
  const [countsReady, setCountsReady] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCountsReady(false);
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
        setCountsReady(true);
      } catch (e) {
        // The page keeps what it has: headline figures and the list above the
        // fold are already on screen, and the counts stay blank rather than
        // becoming zeroes.
        log.degraded('Explore grid counts unavailable:', e);
      }
    } catch (e) {
      // Every other hook logs its failure and shows written copy. This one
      // logged nothing and rendered the raw exception, so a SQLite message like
      // 'no such table: innovations_fts' was the user-facing text.
      log.failed('Could not load the Explore page:', e);
      setError('Could not load the database. Pull to try again.');
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    stats,
    mostAdvanced,
    topRegions,
    challengeCounts,
    typeCounts,
    countsReady,
    load,
  };
}
