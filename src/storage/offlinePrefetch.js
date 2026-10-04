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
 * It was built because the Sprint 2 task card asks for "pin, prefetch (100
 * innovations), LRU eviction" and links to that page, and the page was read
 * with a tool that dropped strikethrough — so a crossed-out option read as a
 * live one. The two cards still disagree; the design page is the one followed.
 *
 * Best-effort. Nothing here is awaited by a screen, and a failure leaves the
 * cache exactly as it was.
 *
 * Web only, like its neighbours here: the phone carries the whole catalogue.
 */
import { getInnovationById } from '../database/db.web';
import { putManyContent, listPinned, PINS } from './offlineStore';
import { isIndexedDbAvailable } from './idb';
import { createLogger } from '../utils/logger';

const log = createLogger('prefetch');

/** Pinned records refreshed per launch, so a heavy user does not stall startup. */
export const REFRESH_BATCH = 20;

/**
 * Only the portal's own records can be refreshed from the portal.
 *
 * The web build has two sources of innovations and they do not share an
 * identity. Explore and its drilldowns come from the JSON:API, where an id is a
 * uuid. Search goes through our Node backend, which reads the bundled SQLite
 * catalogue, where an id is the integer 40479 — and asking the portal for
 * /node/innovation/40479 is a 404, which is exactly what the first run did.
 *
 * So a record bookmarked from search keeps the copy it was saved with. It is
 * not stale in any sense that matters: the catalogue it came from is a fixed
 * file that does not change. The real fix is one identity for both sources,
 * which means the backend's search index being rebuilt from the portal — noted
 * in PWA-FOLLOW-UPS.md.
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
