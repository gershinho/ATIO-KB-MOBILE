/**
 * Web twin of localState.js: the same functions, backed by IndexedDB.
 *
 * Every screen keeps calling readBookmarks, writeDownloads, toggleLikedId and
 * the rest, and keeps getting the same shapes back. What changes is where the
 * data sits. On the phone that is AsyncStorage and stays so. In a browser
 * AsyncStorage is localStorage, which holds about 5 MB of strings, parses the
 * whole list on every read, and — because bookmarks and downloads each store a
 * full copy of the innovation — holds the same record twice.
 *
 * Settings are the exception: reduce motion, text size and colour-blind mode
 * stay in AsyncStorage. They are three short strings per viewer, read once at
 * startup, and moving them would buy nothing.
 *
 * Anything already in localStorage is imported the first time this module is
 * asked for a list. The old keys are left where they are rather than deleted:
 * if we ever have to put the previous build back, a user's bookmarks are still
 * there, and the import is marked done so it cannot run twice and resurrect
 * rows someone has since removed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PINS,
  addPin,
  listPinned,
  replacePinned,
  clearPinned,
  readLikes,
  writeLikes,
  readMeta,
  writeMeta,
  recordView as recordViewInStore,
  evictOverflow,
  storageUsage,
  clearUnpinned,
  clearAllOfflineContent,
} from './offlineStore';
import { isIndexedDbAvailable } from './idb';
import { createLogger } from '../utils/logger';

const log = createLogger('storage');

/** Unchanged from the native module: the same keys, for the same settings. */
export const STORAGE_KEYS = {
  bookmarks: 'bookmarkedInnovations',
  downloads: 'completedDownloads',
  likes: 'likedInnovations',
  reduceMotion: 'settingsReduceMotion',
  textSize: 'settingsTextSize',
  colorBlindMode: 'settingsColorBlindMode',
};

const MIGRATED_KEY = 'localStorageImported';

/** Read one of the old localStorage arrays, tolerating anything found there. */
async function readLegacyArray(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    log.degraded(`could not read the previous ${key}:`, err);
    return [];
  }
}

let migration = null;

/**
 * Move what the previous build stored into the new stores, once.
 *
 * Runs before the first read of any list, and is shared between callers so
 * three screens mounting at once do not import three times.
 */
function migrateOnce() {
  if (migration) return migration;

  migration = (async () => {
    if (!isIndexedDbAvailable()) return;

    try {
      if (await readMeta(MIGRATED_KEY)) return;

      const [bookmarks, downloads, likes] = await Promise.all([
        readLegacyArray(STORAGE_KEYS.bookmarks),
        readLegacyArray(STORAGE_KEYS.downloads),
        readLegacyArray(STORAGE_KEYS.likes),
      ]);

      for (const innovation of bookmarks) {
        if (innovation?.id) {
          await addPin(PINS.bookmark, innovation, { now: innovation.bookmarkedAt ?? Date.now() });
        }
      }
      for (const innovation of downloads) {
        if (innovation?.id) {
          await addPin(PINS.download, innovation, { now: innovation.downloadedAt ?? Date.now() });
        }
      }
      if (likes.length) await writeLikes(likes);

      await writeMeta(MIGRATED_KEY, { at: Date.now(), bookmarks: bookmarks.length, downloads: downloads.length });

      if (bookmarks.length || downloads.length || likes.length) {
        log.note(`imported ${bookmarks.length} bookmarks, ${downloads.length} downloads, ${likes.length} likes`);
      }
    } catch (err) {
      // A failed import must not take the app down with it: the lists come back
      // empty this time, and the mark is unset, so the next load tries again.
      log.failed('could not import the previous local data:', err);
      migration = null;
    }
  })();

  return migration;
}

/** @returns {Promise<Array<object>>} newest first, never a throw */
export async function readBookmarks() {
  await migrateOnce();
  return listPinned(PINS.bookmark, { timestampKey: 'bookmarkedAt' });
}

/** @param {Array<object>} list @returns {Promise<boolean>} */
export async function writeBookmarks(list) {
  await migrateOnce();
  return replacePinned(PINS.bookmark, list, { timestampKey: 'bookmarkedAt' });
}

/** @returns {Promise<boolean>} */
export const clearBookmarks = () => clearPinned(PINS.bookmark);

/** @returns {Promise<Array<object>>} newest first, never a throw */
export async function readDownloads() {
  await migrateOnce();
  return listPinned(PINS.download, { timestampKey: 'downloadedAt' });
}

/** @param {Array<object>} list @returns {Promise<boolean>} */
export async function writeDownloads(list) {
  await migrateOnce();
  return replacePinned(PINS.download, list, { timestampKey: 'downloadedAt' });
}

/** @returns {Promise<boolean>} */
export const clearDownloads = () => clearPinned(PINS.download);

/**
 * @returns {Promise<Set<string>>} uuids, where the native build holds numbers.
 *   Membership is checked with .has, and a uuid never collides with an integer
 *   id, so a mixed set cannot produce a false match.
 */
export async function readLikedIds() {
  await migrateOnce();
  return readLikes();
}

/** @param {Set<string>|string[]} ids @returns {Promise<boolean>} */
export function writeLikedIds(ids) {
  return writeLikes(Array.from(ids ?? []));
}

/**
 * Toggle one id and persist.
 *
 * @returns {Promise<{liked: boolean, saved: boolean}>} the new state, and
 *   whether it survived — the same pair the native module returns
 */
export async function toggleLikedId(id) {
  const ids = await readLikedIds();
  const liked = !ids.has(id);
  if (liked) ids.add(id);
  else ids.delete(id);
  return { liked, saved: await writeLikedIds(ids) };
}

/**
 * Note that a record was opened, caching it and tidying up after.
 *
 * The card's read path: every detail-drawer open upserts the record with
 * lastViewedAt = now. That timestamp is what eviction sorts by, so this is
 * what makes "keep what they have been reading" mean anything.
 *
 * Eviction runs here rather than on a timer because this is the only moment
 * the cache grows by something nobody pinned.
 *
 * @returns {Promise<boolean>} whether it was recorded
 */
export async function recordView(innovation) {
  const recorded = await recordViewInStore(innovation);
  if (recorded) await evictOverflow();
  return recorded;
}

/**
 * What the offline cache is holding, for the Settings line.
 *
 * @returns {Promise<{records: number, bytes: number, pinned: number, quota: number}|null>}
 */
export async function readStorageUsage() {
  if (!isIndexedDbAvailable()) return null;
  return storageUsage();
}

/** Drop everything nobody pinned. Bookmarks and downloads survive. */
export const clearRecentlyViewed = () => clearUnpinned();

/** Drop the cache and all three lists. */
export const clearOfflineContent = () => clearAllOfflineContent();

/**
 * Settings stay in AsyncStorage, which on web is localStorage.
 *
 * Identical to the native implementation on purpose: three short strings read
 * once at startup gain nothing from a database, and a per-viewer preference is
 * exactly what localStorage is for.
 */
export async function readSetting(key, fallback = null) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ?? fallback;
  } catch (err) {
    log.failed(`Could not read ${key}:`, err);
    return fallback;
  }
}

/** @returns {Promise<boolean>} false when the write failed */
export async function writeSetting(key, value) {
  try {
    await AsyncStorage.setItem(key, String(value));
    return true;
  } catch (err) {
    log.failed(`Could not write ${key}:`, err);
    return false;
  }
}

/** Let a test run the import again. */
export function resetMigration() {
  migration = null;
}
