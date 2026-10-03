/**
 * The web build's own catalogue: one copy of each innovation it has seen, and
 * three small lists pointing at it.
 *
 * The shape is the one the offline card specifies:
 *
 *   innovations   { uuid, data, cachedAt, lastViewedAt, sizeBytes, pinnedBy[] }
 *   bookmarks     { uuid: { addedAt, title } }
 *   downloads     { uuid: { addedAt, title } }
 *   likes         { uuid: { likedAt } }
 *
 * Two ideas do the work.
 *
 * **One copy of the content.** Today a record that is bookmarked and downloaded
 * is stored twice, in two localStorage arrays, each a full copy. Here the
 * content lives once and the lists hold ids.
 *
 * **pinnedBy is a set of reasons to keep it.** Bookmarking adds 'bookmark';
 * downloading adds 'download'. Removing a bookmark takes its reason away but
 * leaves the record, because the download still wants it. Only a record nobody
 * has a reason to keep may be evicted — which is what step 7's LRU will do.
 *
 * The index entries carry the title as well as the timestamp. The card has them
 * hold metadata only so a row still renders after its content is evicted, and
 * a row with no title renders as nothing at all.
 *
 * Not a recreation of the SQLite schema table for table. The phone normalises
 * countries, types, SDGs and use cases into child tables because SQL has no
 * arrays; a mapped Innovation already carries them as arrays, and splitting
 * them apart here would be undoing work to imitate a shape we no longer have.
 * What the schema is really for — look up an innovation by id — is the store.
 */
import {
  STORES,
  idbTransaction,
  idbGet,
  idbPut,
  idbGetAll,
  isIndexedDbAvailable,
} from './idb';
import { createLogger } from '../utils/logger';

const log = createLogger('offline-store');

/**
 * How much unpinned content to keep, and how much room to use.
 *
 * The offline card's Settings mock reads "47 records, 1.2 MB used of 20 MB" and
 * names no record cap, so the 20 MB is theirs and the 500 is ours: at the ~6 KB
 * a mapped record measures, 500 records is about 3 MB, which leaves the quota
 * the headroom rather than the record count doing it.
 *
 * Both are ceilings on the *unpinned* tail. A bookmark or a download is never
 * evicted, however many of them there are — a Bookmarks screen that quietly
 * forgot things would be worse than one that fills the disk.
 */
export const MAX_UNPINNED_RECORDS = 500;
export const MAX_CACHE_BYTES = 20 * 1024 * 1024;

/** The reasons a record may be kept. A pin is one of these, never free text. */
export const PINS = { bookmark: 'bookmark', download: 'download' };

/** Which index store holds which pin. */
const STORE_FOR_PIN = {
  [PINS.bookmark]: STORES.bookmarks,
  [PINS.download]: STORES.downloads,
};

/**
 * Roughly how much room a record takes, for the storage figure in Settings and
 * for step 7's quota. Measured on the JSON because that is what IndexedDB
 * stores, and an approximation nobody will audit beats a second serialisation.
 */
function measure(data) {
  try {
    return JSON.stringify(data).length;
  } catch {
    return 0;
  }
}

/** Keep a record's existing timestamps and pins when it is written again. */
function merge(existing, innovation, now) {
  return {
    uuid: innovation.id,
    data: innovation,
    cachedAt: now,
    lastViewedAt: existing?.lastViewedAt ?? now,
    sizeBytes: measure(innovation),
    pinnedBy: existing?.pinnedBy ?? [],
  };
}

/**
 * Write a record's content, leaving its pins alone.
 *
 * Used when a record is read from the portal: it refreshes what we hold
 * without claiming anyone asked to keep it.
 */
export async function putContent(innovation, { now = Date.now() } = {}) {
  if (!innovation?.id) return false;

  try {
    await idbTransaction([STORES.innovations], 'readwrite', (stores) => {
      const store = stores[STORES.innovations];
      const read = store.get(innovation.id);
      read.onsuccess = () => store.put(merge(read.result, innovation, now), innovation.id);
    });
    return true;
  } catch (err) {
    log.failed('could not cache an innovation:', err?.message);
    return false;
  }
}

/** The stored innovation, or null. */
export async function getContent(uuid) {
  try {
    const record = await idbGet(STORES.innovations, uuid);
    return record?.data ?? null;
  } catch (err) {
    log.degraded('could not read a cached innovation:', err?.message);
    return null;
  }
}

/**
 * Add a pin, writing the index entry and the content in one transaction.
 *
 * The card's rule: "adding a bookmark or a download is a single transaction
 * that writes both the index entry and (if missing) the offline_innovations
 * record". Two separate writes could leave a bookmark pointing at nothing.
 *
 * @param {string} pin - one of PINS
 * @param {object} innovation - the mapped record
 * @returns {Promise<boolean>} whether it was stored
 */
export async function addPin(pin, innovation, { now = Date.now() } = {}) {
  const indexStore = STORE_FOR_PIN[pin];
  if (!indexStore || !innovation?.id) return false;

  try {
    await idbTransaction([STORES.innovations, indexStore], 'readwrite', (stores) => {
      const content = stores[STORES.innovations];
      const read = content.get(innovation.id);
      read.onsuccess = () => {
        const record = merge(read.result, innovation, now);
        if (!record.pinnedBy.includes(pin)) record.pinnedBy = [...record.pinnedBy, pin];
        content.put(record, innovation.id);
      };
      stores[indexStore].put({ addedAt: now, title: innovation.title ?? '' }, innovation.id);
    });
    return true;
  } catch (err) {
    log.failed(`could not save a ${pin}:`, err?.message);
    return false;
  }
}

/**
 * Remove a pin and its index entry.
 *
 * The content record stays. Its other pins may still want it, and even with
 * none left it is a perfectly good cached copy — it simply becomes eligible
 * for eviction, which is the LRU's business and not this function's.
 */
export async function removePin(pin, uuid) {
  const indexStore = STORE_FOR_PIN[pin];
  if (!indexStore || !uuid) return false;

  try {
    await idbTransaction([STORES.innovations, indexStore], 'readwrite', (stores) => {
      const content = stores[STORES.innovations];
      const read = content.get(uuid);
      read.onsuccess = () => {
        const record = read.result;
        if (!record) return;
        content.put({ ...record, pinnedBy: record.pinnedBy.filter((p) => p !== pin) }, uuid);
      };
      stores[indexStore].delete(uuid);
    });
    return true;
  } catch (err) {
    log.failed(`could not remove a ${pin}:`, err?.message);
    return false;
  }
}

/**
 * One pin's list, newest first, each joined to its content.
 *
 * An entry whose content is gone comes back as a placeholder carrying the id,
 * the title and `availableOffline: false`, rather than being dropped: the card
 * is explicit that the Bookmarks screen should never silently lose a row.
 *
 * @returns {Promise<Array<object>>} always an array, never a throw
 */
export async function listPinned(pin, { timestampKey = 'addedAt' } = {}) {
  const indexStore = STORE_FOR_PIN[pin];
  if (!indexStore) return [];

  try {
    const rows = await idbTransaction([STORES.innovations, indexStore], 'readonly', (stores) => {
      const collected = [];
      const cursorRequest = stores[indexStore].openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const uuid = cursor.key;
        const entry = cursor.value;
        const contentRequest = stores[STORES.innovations].get(uuid);
        contentRequest.onsuccess = () => {
          const record = contentRequest.result;
          collected.push(record?.data
            ? { ...record.data, [timestampKey]: entry.addedAt, availableOffline: true }
            : { id: uuid, title: entry.title ?? '', [timestampKey]: entry.addedAt, availableOffline: false });
        };
        cursor.continue();
      };

      // The array is returned now and filled by those callbacks; the
      // transaction's completion is what guarantees they have all run.
      return collected;
    });

    // Sorted after the fact rather than by cursor direction: IndexedDB orders
    // by key, and the key is a uuid. Both lists are shown newest first.
    return rows.sort((a, b) => b[timestampKey] - a[timestampKey]);
  } catch (err) {
    log.degraded(`could not read the ${pin} list:`, err?.message);
    return [];
  }
}

/**
 * Replace a pin's whole list.
 *
 * The screens still hand us an array — "here is what the list should now be" —
 * so this diffs against what is stored and applies the difference. Rewriting
 * every entry instead would reset each addedAt and reorder the list under the
 * user on every toggle.
 */
export async function replacePinned(pin, list, { now = Date.now(), timestampKey = 'addedAt' } = {}) {
  const indexStore = STORE_FOR_PIN[pin];
  if (!indexStore) return false;

  const wanted = new Map((list ?? []).filter((i) => i?.id).map((i) => [i.id, i]));

  try {
    const existing = await idbTransaction([indexStore], 'readonly', (stores) =>
      stores[indexStore].getAllKeys()
    );

    for (const uuid of existing) {
      if (!wanted.has(uuid)) await removePin(pin, uuid);
    }

    for (const [uuid, innovation] of wanted) {
      if (existing.includes(uuid)) continue;
      // Keeps the timestamp the caller already stamped, so a list written back
      // unchanged does not quietly become a list of brand-new entries.
      await addPin(pin, innovation, { now: innovation[timestampKey] ?? now });
    }
    return true;
  } catch (err) {
    log.failed(`could not update the ${pin} list:`, err?.message);
    return false;
  }
}

/** Every liked id. Likes have no content of their own to keep. */
export async function readLikes() {
  try {
    const keys = await idbTransaction([STORES.likes], 'readonly', (stores) =>
      stores[STORES.likes].getAllKeys()
    );
    return new Set(keys);
  } catch (err) {
    log.degraded('could not read likes:', err?.message);
    return new Set();
  }
}

/** Replace the set of liked ids. */
export async function writeLikes(ids, { now = Date.now() } = {}) {
  const wanted = new Set(ids ?? []);

  try {
    await idbTransaction([STORES.likes], 'readwrite', (stores) => {
      const store = stores[STORES.likes];
      const existing = store.getAllKeys();
      existing.onsuccess = () => {
        for (const key of existing.result) {
          if (!wanted.has(key)) store.delete(key);
        }
        for (const id of wanted) {
          if (!existing.result.includes(id)) store.put({ likedAt: now }, id);
        }
      };
    });
    return true;
  } catch (err) {
    log.failed('could not save likes:', err?.message);
    return false;
  }
}

/** Drop a pin's entire list, leaving the content for the LRU. */
export async function clearPinned(pin) {
  const indexStore = STORE_FOR_PIN[pin];
  if (!indexStore) return false;

  try {
    const keys = await idbTransaction([indexStore], 'readonly', (stores) =>
      stores[indexStore].getAllKeys()
    );
    for (const uuid of keys) await removePin(pin, uuid);
    return true;
  } catch (err) {
    log.failed(`could not clear the ${pin} list:`, err?.message);
    return false;
  }
}

/**
 * What is stored, for the Settings line the card describes:
 * "Offline: 47 records, 1.2 MB used of 20 MB".
 *
 * @returns {Promise<{records: number, bytes: number, pinned: number, quota: number}>}
 */
export async function storageUsage() {
  if (!isIndexedDbAvailable()) return { records: 0, bytes: 0, pinned: 0, quota: MAX_CACHE_BYTES };

  try {
    const records = await idbGetAll(STORES.innovations);
    return {
      records: records.length,
      bytes: records.reduce((total, r) => total + (r.sizeBytes ?? 0), 0),
      pinned: records.filter((r) => r.pinnedBy?.length).length,
      quota: MAX_CACHE_BYTES,
    };
  } catch (err) {
    log.degraded('could not measure storage:', err?.message);
    return { records: 0, bytes: 0, pinned: 0, quota: MAX_CACHE_BYTES };
  }
}

/**
 * Note that a record was just looked at, caching it if it is new.
 *
 * The card: "Every detail-drawer open upserts the record into
 * offline_innovations with lastViewedAt = now." That timestamp is what the
 * eviction below sorts by, so without this the cache would have no idea which
 * of its records anyone still cares about.
 *
 * @returns {Promise<boolean>} whether it was recorded
 */
export async function recordView(innovation, { now = Date.now() } = {}) {
  if (!innovation?.id) return false;

  try {
    await idbTransaction([STORES.innovations], 'readwrite', (stores) => {
      const store = stores[STORES.innovations];
      const read = store.get(innovation.id);
      read.onsuccess = () => {
        const record = merge(read.result, innovation, now);
        record.lastViewedAt = now;
        store.put(record, innovation.id);
      };
    });
    return true;
  } catch (err) {
    log.degraded('could not note a view:', err?.message);
    return false;
  }
}

/**
 * Cache several records at once, without pinning any of them.
 *
 * One transaction rather than one per record: the prefetch writes a hundred,
 * and a hundred transactions is a hundred chances to be interrupted halfway.
 *
 * @returns {Promise<number>} how many were written
 */
export async function putManyContent(innovations, { now = Date.now() } = {}) {
  const records = (innovations ?? []).filter((i) => i?.id);
  if (records.length === 0) return 0;

  try {
    await idbTransaction([STORES.innovations], 'readwrite', (stores) => {
      const store = stores[STORES.innovations];
      for (const innovation of records) {
        const read = store.get(innovation.id);
        read.onsuccess = () => store.put(merge(read.result, innovation, now), innovation.id);
      }
    });
    return records.length;
  } catch (err) {
    log.failed('could not cache a batch of innovations:', err?.message);
    return 0;
  }
}

/**
 * Drop the least recently seen unpinned records until the cache is inside its
 * limits.
 *
 * Least recently *viewed*, not least recently cached: what matters is when
 * someone last wanted it. A record that has never been opened falls back to
 * when it arrived, so the prefetch's hundred are the first to go, which is
 * right — nobody asked for them.
 *
 * @returns {Promise<{evicted: number, records: number, bytes: number}>}
 */
export async function evictOverflow({
  maxRecords = MAX_UNPINNED_RECORDS,
  maxBytes = MAX_CACHE_BYTES,
} = {}) {
  try {
    const all = await idbTransaction([STORES.innovations], 'readonly', (stores) =>
      stores[STORES.innovations].getAll()
    );

    const pinned = all.filter((r) => r.pinnedBy?.length);
    const unpinned = all
      .filter((r) => !r.pinnedBy?.length)
      .sort((a, b) => (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0));

    const pinnedBytes = pinned.reduce((total, r) => total + (r.sizeBytes ?? 0), 0);

    const doomed = [];
    let keptBytes = pinnedBytes;
    unpinned.forEach((record, position) => {
      keptBytes += record.sizeBytes ?? 0;
      // Past the record cap, or past the quota: either way this one goes.
      if (position >= maxRecords || keptBytes > maxBytes) doomed.push(record.uuid);
    });

    if (doomed.length > 0) {
      await idbTransaction([STORES.innovations], 'readwrite', (stores) => {
        for (const uuid of doomed) stores[STORES.innovations].delete(uuid);
      });
      log.note(`evicted ${doomed.length} unpinned records`);
    }

    const remaining = all.length - doomed.length;
    return { evicted: doomed.length, records: remaining, bytes: Math.min(keptBytes, maxBytes) };
  } catch (err) {
    log.degraded('could not tidy the cache:', err?.message);
    return { evicted: 0, records: 0, bytes: 0 };
  }
}

/**
 * Drop everything nobody pinned — the card's "Clear recently viewed".
 *
 * Bookmarks and downloads survive, which is the difference between this and
 * clearing everything.
 */
export async function clearUnpinned() {
  try {
    const all = await idbTransaction([STORES.innovations], 'readonly', (stores) =>
      stores[STORES.innovations].getAll()
    );
    const doomed = all.filter((r) => !r.pinnedBy?.length).map((r) => r.uuid);

    await idbTransaction([STORES.innovations], 'readwrite', (stores) => {
      for (const uuid of doomed) stores[STORES.innovations].delete(uuid);
    });
    return doomed.length;
  } catch (err) {
    log.failed('could not clear the recently viewed:', err?.message);
    return 0;
  }
}

/**
 * Drop the content cache and all three lists — the card's "Clear everything".
 *
 * The vocabularies and the catalogue pass are left alone: they are not the
 * user's data, they are what makes the app usable, and re-fetching them costs
 * minutes.
 */
export async function clearAllOfflineContent() {
  try {
    await idbTransaction(
      [STORES.innovations, STORES.bookmarks, STORES.downloads, STORES.likes],
      'readwrite',
      (stores) => {
        for (const name of [STORES.innovations, STORES.bookmarks, STORES.downloads, STORES.likes]) {
          stores[name].clear();
        }
      }
    );
    return true;
  } catch (err) {
    log.failed('could not clear the offline content:', err?.message);
    return false;
  }
}

/** Read a small singleton from the meta store. */
export const readMeta = (key) => idbGet(STORES.meta, key);

/** Write a small singleton to the meta store. */
export const writeMeta = (key, value) => idbPut(STORES.meta, key, value);
