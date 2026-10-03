/**
 * Filling the offline cache before anyone asks it for anything.
 *
 * Two jobs, from the offline card's chosen strategy — "pin, prefetch (100
 * innovations), LRU eviction".
 *
 * **Prefetch** answers the complaint against keeping only what people pin:
 * someone who has never bookmarked anything has nothing to read the moment
 * their connection goes. A hundred recently updated records is two requests
 * and a megabyte or so, and it means the app is never empty offline.
 *
 * **Refresh** answers the opposite complaint. A pinned record was cached when
 * it was pinned, and the portal has moved on since. On a launch with a
 * connection, the pinned records are fetched again so what you kept is what is
 * current — the card's "on next launch with network, refresh all pinned
 * records".
 *
 * Both are best-effort. Neither is awaited by a screen, and a failure in
 * either leaves the cache exactly as it was.
 *
 * Web only, like its neighbours here: the phone carries the whole catalogue.
 */
import { searchInnovations, getInnovationById } from '../database/db.web';
import { MAX_PAGE_SIZE } from '../api/jsonapi/query';
import { putManyContent, evictOverflow, listPinned, PINS } from './offlineStore';
import { isIndexedDbAvailable } from './idb';
import { createLogger } from '../utils/logger';

const log = createLogger('prefetch');

/** What the card asks for. */
export const PREFETCH_COUNT = 100;

/** Pinned records refreshed per launch, so a heavy user does not stall startup. */
export const REFRESH_BATCH = 20;

/**
 * Cache the most recently updated records, then tidy up.
 *
 * Unpinned, so they are the first thing eviction takes — which is correct:
 * nobody asked for them, they are only there so the app is not empty.
 *
 * @returns {Promise<number>} how many were cached
 */
export async function prefetchRecent({ count = PREFETCH_COUNT } = {}) {
  if (!isIndexedDbAvailable()) return 0;

  try {
    // searchInnovations already sorts most recently updated first, which is
    // exactly the hundred worth having — but the portal caps a page at 50 and
    // silently returns 50 when asked for more, so a single call would quietly
    // prefetch half of what the card asks for.
    const innovations = [];
    while (innovations.length < count) {
      const page = await searchInnovations(
        {},
        { limit: Math.min(MAX_PAGE_SIZE, count - innovations.length), offset: innovations.length }
      );
      innovations.push(...page);
      if (page.length < MAX_PAGE_SIZE) break;
    }

    const written = await putManyContent(innovations);
    await evictOverflow();
    log.note(`prefetched ${written} records`);
    return written;
  } catch (err) {
    // An empty cache is a worse offline experience, not a broken app.
    log.degraded('could not prefetch:', err?.message);
    return 0;
  }
}

/**
 * Fetch pinned records again, so what was kept is current.
 *
 * Capped per launch and spread across sessions rather than refreshing
 * everything at once: the card warns that the cost grows with the number of
 * pins, and someone with three hundred bookmarks should not pay for all of
 * them on every launch. The oldest copies go first, so the queue drains.
 *
 * @returns {Promise<number>} how many were refreshed
 */
export async function refreshPinned({ limit = REFRESH_BATCH } = {}) {
  if (!isIndexedDbAvailable()) return 0;

  try {
    const pinned = [
      ...await listPinned(PINS.bookmark),
      ...await listPinned(PINS.download),
    ];

    // One entry per record: something both bookmarked and downloaded is one
    // record, and fetching it twice would be two requests for one answer.
    const ids = [...new Set(pinned.map((p) => p.id).filter(Boolean))].slice(0, limit);
    if (ids.length === 0) return 0;

    const fresh = [];
    for (const id of ids) {
      // One at a time rather than in parallel: this is background work behind
      // whatever the user is actually doing, and the portal is shared.
      const innovation = await getInnovationById(id).catch(() => null);
      if (innovation) fresh.push(innovation);
    }

    // putManyContent keeps each record's pins, so refreshing never unpins.
    const written = await putManyContent(fresh);
    log.note(`refreshed ${written} pinned records`);
    return written;
  } catch (err) {
    log.degraded('could not refresh pinned records:', err?.message);
    return 0;
  }
}
