import { useEffect, useRef, useState } from 'react';
import { aiSearch } from '../services/api';
import { getHelpInnovations } from '../database/db';
import { createLogger } from '../utils/logger';

const log = createLogger('help');

const HELP_QUERIES = ['hotlines and helplines', 'hotline', 'help', 'helpline'];
const HELP_PAGE_SIZE = 100;

/**
 * Hard ceiling on how much the help section will accumulate. The loop below
 * already terminates on its own; this only bounds how long a pathological
 * backend can keep it running.
 */
const MAX_HELP_RESULTS = 1000;

const TITLE_KEYWORDS = /hotline|helpline|help|service/i;

/**
 * Hotlines and helplines to offer when a search or a drilldown comes back empty.
 *
 * Fetched lazily — only once an empty state is actually on screen — because
 * doing it on mount cost four AI calls on every visit to Home, for a section
 * most sessions never see.
 *
 * @param {boolean} needed - an empty state is showing and wants content
 * @returns {{items: Array, loading: boolean}}
 */
export default function useHelpInnovations(needed) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!needed || fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const byId = new Map();
        for (const query of HELP_QUERIES) {
          if (cancelled) break;
          let offset = 0;
          let hasMore = true;
          while (hasMore && !cancelled && byId.size < MAX_HELP_RESULTS) {
            const data = await aiSearch(query, { offset, limit: HELP_PAGE_SIZE });
            const page = data.results || [];

            // A backend that reports hasMore alongside an empty page would
            // otherwise spin here forever: offset advances by page.length, so
            // an empty page means the next request is byte-identical to this
            // one. An empty page is the end of the results whatever the flag
            // claims.
            if (page.length === 0) break;

            for (const item of page) {
              const score = item.matchScore ?? 0;
              const existing = byId.get(item.id);
              if (!existing || (existing.matchScore ?? 0) < score) {
                byId.set(item.id, { ...item, matchScore: score });
              }
            }
            offset += page.length;
            hasMore = data.hasMore || false;
          }
        }
        if (cancelled) return;

        // Title matches first, then by score: a result literally called
        // "National Helpline" is more useful here than a better-scoring one
        // that merely mentions help in its description.
        const merged = Array.from(byId.values()).sort((a, b) => {
          const aTitle = TITLE_KEYWORDS.test(a.title || '') ? 1 : 0;
          const bTitle = TITLE_KEYWORDS.test(b.title || '') ? 1 : 0;
          if (bTitle !== aTitle) return bTitle - aTitle;
          return (b.matchScore ?? 0) - (a.matchScore ?? 0);
        });
        setItems(merged);
      } catch (e) {
        if (cancelled) return;
        log.degraded('AI search failed, using the local fallback:', e);
        try {
          setItems(await getHelpInnovations(500));
        } catch (fallbackError) {
          log.failed('Local fallback also failed; showing no help results:', fallbackError);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [needed]);

  return { items, loading };
}
