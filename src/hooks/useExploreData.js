import { useCallback, useState } from 'react';
import {
  getStats,
  getTopRegions,
  getChallengeCounts,
  getTypeCounts,
  getRecentInnovations,
} from '../database/db';

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
  const [recentInnovations, setRecentInnovations] = useState([]);
  const [topRegions, setTopRegions] = useState([]);
  const [challengeCounts, setChallengeCounts] = useState({});
  const [typeCounts, setTypeCounts] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStats, nextRecent] = await Promise.all([
        getStats(),
        getRecentInnovations(5),
      ]);
      setStats(nextStats);
      setRecentInnovations(nextRecent);
      setLoading(false);

      const [nextRegions, nextChallengeCounts, nextTypeCounts] = await Promise.all([
        getTopRegions(15),
        getChallengeCounts(),
        getTypeCounts(),
      ]);
      setTopRegions(nextRegions);
      setChallengeCounts(nextChallengeCounts);
      setTypeCounts(nextTypeCounts);
    } catch (e) {
      setError(e?.message || String(e));
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    stats,
    recentInnovations,
    topRegions,
    challengeCounts,
    typeCounts,
    load,
  };
}
