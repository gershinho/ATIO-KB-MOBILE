/**
 * Keeping pinned records current.
 *
 * This is the second half of the offline card's strategy D, "prefetch on pin +
 * background refresh". The first half needs no code here: a record is pinned
 * from a screen already showing it, so `addPin` stores the full record it is
 * handed. What needs code is the other half — a record pinned last week was
 * cached last week and the portal has moved on, so on a launch with a
 * connection the pinned records are fetched again.
 *
 * **This module used to do a second job, and should not have.** It preloaded a
 * hundred recently-updated records on every launch so that someone who had
 * never bookmarked anything still had something offline. That is the card's
 * strategy E, and E is struck through — as are A, F, and the line "preload the
 * top 100 most-viewed or most-recent-changed, fetched on first launch". The
 * chosen strategies are C and D, marked in green.
 *
 * It was built from a reading of that page that lost its strikethrough, so a
 * crossed-out option looked like a live one.
 *
 * Best-effort. Nothing here is awaited by a screen, and a failure leaves the
 * cache exactly as it was.
 *
 * Web only, like its neighbours here: the phone carries the whole catalogue.
 */
import { getInnovationById, getChangedTimes } from '../database/db.web';
import { putManyContent, listPinned, getContent, PINS } from './offlineStore';
import { isIndexedDbAvailable } from './idb';
import { createLogger } from '../utils/logger';

const log = createLogger('prefetch');

/** Pinned records refreshed per launch, so a heavy user does not stall startup. */
export const REFRESH_BATCH = 20;

/**
 * Only the portal's own records can be refreshed from the portal.
 *
 * Search and Explore now read the same catalogue, so every id this sees should
 * be a uuid. The guard stays for the ones saved before that was true: search
 * used to go through our Node backend over the bundled SQLite file, where an id
 * is the integer 40479, and asking the portal for /node/innovation/40479 is a
 * 404 — which is exactly what one early run did.
 *
 * Such a record keeps the copy it was saved with, which is harmless: the
 * catalogue it came from is a fixed file that does not change.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const all = [...new Set(pinned.map((p) => p.id).filter(Boolean))];
    const ids = all.filter((id) => UUID.test(String(id))).slice(0, limit);

    const skipped = all.length - ids.length;
    if (skipped > 0) log.note(`${skipped} pinned records came from search and cannot be refreshed`);
    if (ids.length === 0) return 0;

    // Ask what has moved before downloading anything. One request carrying two
    // fields per row, against the ~5 KB a full record costs — so a launch where
    // nothing changed, which is most launches, costs one small request instead
    // of twenty full ones. This is the card's "comparing the changed
    // attribute", and the reason to prefer it over If-Modified-Since is that it
    // is one request for the batch rather than one per record.
    let moved = ids;
    try {
      const changed = await getChangedTimes(ids);
      const stored = await Promise.all(ids.map((id) => getContent(id).catch(() => null)));
      const changedById = new Map(ids.map((id, i) => [id, stored[i]?.changed ?? null]));

      moved = ids.filter((id) => {
        const now = changed.get(id);
        // Unknown either side means download it: a record the portal did not
        // return, or one cached before we kept the stamp, cannot be compared.
        if (now == null || changedById.get(id) == null) return true;
        return now !== changedById.get(id);
      });

      const unchanged = ids.length - moved.length;
      if (unchanged > 0) log.note(`${unchanged} pinned records are already current`);
    } catch (err) {
      // The cheap question failed; fall back to asking the expensive one.
      log.degraded('could not check what changed; refreshing all:', err?.message);
    }

    if (moved.length === 0) return 0;

    const fresh = [];
    for (const id of moved) {
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
