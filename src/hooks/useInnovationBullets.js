import { useEffect, useState } from 'react';
import { summarizeBullets } from '../services/api';
import { getCachedBullets, setCachedBullets } from '../database/engagement';
import { createLogger } from '../utils/logger';

const log = createLogger('detail drawer');

/** The bullet summary is exactly three lines, or it is not a summary. */
const BULLET_COUNT = 3;

/**
 * The three-bullet summary of an innovation's description, cached per record.
 *
 * Lifted out of DetailDrawer, which reached into services/ and database/ itself
 * — the components/ directory otherwise imports only data/, context/, utils/ and
 * sibling components, and hooks/ exists to be the data-access layer for exactly
 * this. The logic is unchanged: check the cache, call the backend only on a
 * miss, and write the result back so each record is summarised at most once.
 *
 * Sends description text only. Never metadata (title, cost, region, owner).
 *
 * @param {object|null} innovation
 * @param {boolean} visible - no work happens until the drawer is actually open
 * @returns {{bullets: string[]|null, loading: boolean}} bullets is null when
 *   there is nothing to show, in which case the caller renders the raw
 *   description — a failure here is a missing enhancement, not an error state.
 */
export default function useInnovationBullets(innovation, visible) {
  const [bullets, setBullets] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !innovation) return undefined;
    setBullets(null);
    setLoading(false);

    const parts = [innovation.shortDescription, innovation.longDescription].filter(Boolean);
    const text = parts.join('\n\n').trim();
    if (!text) return undefined;

    let cancelled = false;
    (async () => {
      const cached = await getCachedBullets(innovation.id);
      if (cancelled) return;
      // Array.isArray already excludes null and undefined.
      if (Array.isArray(cached) && cached.length === BULLET_COUNT) {
        setBullets(cached);
        return;
      }
      setLoading(true);
      try {
        const fetched = await summarizeBullets(text, innovation.id);
        if (cancelled) return;
        if (fetched) {
          await setCachedBullets(innovation.id, fetched);
          if (!cancelled) setBullets(fetched);
        }
      } catch (err) {
        // Bullets are an enhancement over the raw description, so a failure is
        // not worth interrupting the user for — but it should not vanish either.
        log.degraded('Bullet summary unavailable; showing the raw description:', err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // Keyed on the innovation's id rather than the object: the description text
    // this reads is fixed for a given id, so re-summarising because a thumbs-up
    // count changed would be a wasted AI call.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [innovation?.id, visible]);

  return { bullets, loading };
}
