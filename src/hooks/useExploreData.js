import { useCallback, useState } from 'react';
import {
  getStats,
  getTopRegions,
  getChallengeCounts,
  getTypeCounts,
  getMostAdvancedInnovations,
} from '../database/db';
import { exploreFromCache } from '../database/offlineFallback';
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
/**
 * What the last load produced, kept for the session.
 *
 * ExploreMode unmounts whenever the user switches to Search and mounts again
 * when they come back, so this hook starts from nothing several times a visit.
 * On the phone that costs two local queries and nobody notices. On web it put
 * the "Loading ATIO database" screen back up and refetched, which is a second
 * or two of nothing every time someone glances at Search.
 *
 * The catalogue is read-only for the length of a session, so the previous
 * answer is still the right answer: the page paints from it immediately and a
 * fresh load runs behind it. Module scope rather than a context because
 * nothing else needs it, and it should not survive a reload.
 */
let lastLoaded = null;

export default function useExploreData() {
  // Starts false when there is something to show: a spinner over data we
  // already have is a worse lie than slightly stale numbers.
  const [loading, setLoading] = useState(!lastLoaded);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(lastLoaded?.stats ?? EMPTY_STATS);
  const [mostAdvanced, setMostAdvanced] = useState(lastLoaded?.mostAdvanced ?? []);
  const [topRegions, setTopRegions] = useState(lastLoaded?.topRegions ?? []);
  const [challengeCounts, setChallengeCounts] = useState(lastLoaded?.challengeCounts ?? {});
  const [typeCounts, setTypeCounts] = useState(lastLoaded?.typeCounts ?? {});
  // The grid counts arrive after the page has painted. On the phone that is a
  // query and the gap is invisible; the web build has to read every record to
  // know what a challenge contains, which takes seconds against a warm portal
  // and minutes against a cold one. Rendering 0 in the meantime states
  // something false, so the screens show the number only once it is real.
  const [countsReady, setCountsReady] = useState(Boolean(lastLoaded?.countsReady));
  // True when the figures on screen were answered by the device rather than the
  // portal, as on the drilldowns and in search.
  const [fromCache, setFromCache] = useState(false);

  /**
   * The second wave, below the fold.
   *
   * A failure here must not replace a page that has already painted: it used to
   * share the catch below, so a late-arriving grid-count error blanked the stats
   * and list the user was already reading. Each count renders as 0 until it
   * lands, which is what it does anyway while the request is in flight.
   *
   * Reached from both paths, because these three read the catalogue pass rather
   * than the network and so have their own answer offline.
   */
  const loadCounts = useCallback(async () => {
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
      lastLoaded = {
        ...lastLoaded,
        topRegions: nextRegions,
        challengeCounts: nextChallengeCounts,
        typeCounts: nextTypeCounts,
        countsReady: true,
      };
    } catch (e) {
      // The page keeps what it has: headline figures and the list above the
      // fold are already on screen, and the counts stay blank rather than
      // becoming zeroes.
      log.degraded('Explore grid counts unavailable:', e);
    }
  }, []);

  const load = useCallback(async () => {
    // Only shows the loading screen when there is nothing to show instead.
    setLoading(!lastLoaded);
    setError(null);
    setFromCache(false);
    try {
      const [nextStats, nextAdvanced] = await Promise.all([
        getStats(),
        getMostAdvancedInnovations(5),
      ]);
      setStats(nextStats);
      setMostAdvanced(nextAdvanced);
      setLoading(false);
      lastLoaded = { ...lastLoaded, stats: nextStats, mostAdvanced: nextAdvanced };

      await loadCounts();
    } catch (e) {
      // Every other hook logs its failure and shows written copy. This one
      // logged nothing and rendered the raw exception, so a SQLite message like
      // 'no such table: innovations_fts' was the user-facing text.
      log.failed('Could not load the Explore page:', e);

      // Only two of this page's five figures need the network: the headline
      // counts and the most advanced list. The three grids below them are
      // counted from the catalogue pass, which serves its cached rows when the
      // portal cannot be reached — so they were rendering fine underneath an
      // error that had replaced the entire page.
      const cached = await exploreFromCache({ advancedLimit: 5 });
      if (cached) {
        setStats(cached.stats);
        setMostAdvanced(cached.mostAdvanced);
        setFromCache(true);
        setError(null);
        setLoading(false);
        lastLoaded = { ...lastLoaded, stats: cached.stats, mostAdvanced: cached.mostAdvanced };
        await loadCounts();
        return;
      }

      setError('Could not load these solutions. Pull to try again.');
      setLoading(false);
    }
  }, [loadCounts]);

  return {
    loading,
    error,
    fromCache,
    stats,
    mostAdvanced,
    topRegions,
    challengeCounts,
    typeCounts,
    countsReady,
    load,
  };
}
