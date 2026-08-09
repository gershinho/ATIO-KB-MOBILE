/**
 * The single owner of on-device user state: bookmarks, downloads, and likes.
 *
 * These three keys and their JSON read-modify-write cycles used to be
 * re-declared across six modules — including one inside a component body — so
 * nothing owned the format and every caller re-implemented the same parse.
 * Several call sites also assumed `JSON.parse` would hand back an array, which
 * turns a single corrupted write into a crash on next launch.
 *
 * Every read here is total: it returns a valid empty value rather than throwing,
 * so a bad or absent entry degrades to "nothing saved" instead of a broken
 * screen. Every write reports whether it succeeded, so callers can tell the user
 * when something was not saved instead of silently showing stale state.
 *
 * That report is a boolean, and it means persisted — not attempted. Every write
 * in this module and in database/engagement.js uses that same meaning, so a
 * caller consuming both does not have to remember which is which. The one richer
 * shape in the app is downloadInnovationToFile's {success, error}, which exists
 * because it carries a message that is actually shown.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '../utils/logger';

/**
 * @typedef {import('../database/enrich').Innovation} Innovation
 * @typedef {Innovation & {bookmarkedAt: number}} BookmarkedInnovation
 * @typedef {Innovation & {downloadedAt: number}} DownloadedInnovation
 */

const log = createLogger('storage');

export const STORAGE_KEYS = {
  bookmarks: 'bookmarkedInnovations',
  downloads: 'completedDownloads',
  likes: 'likedInnovations',
  reduceMotion: 'settingsReduceMotion',
  textSize: 'settingsTextSize',
  colorBlindMode: 'settingsColorBlindMode',
};

/**
 * Read a JSON array, tolerating absent, malformed, or wrong-typed entries.
 *
 * @param {string} key - one of STORAGE_KEYS
 * @returns {Promise<Array>} always an array
 */
async function readArray(key) {
  let raw;
  try {
    raw = await AsyncStorage.getItem(key);
  } catch (err) {
    log.failed(`Could not read ${key}:`, err);
    return [];
  }
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(raw);
    // A non-array here means something else wrote this key. Treating it as
    // empty is safer than handing a string or object to a list renderer.
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    log.degraded(`Corrupt JSON at ${key}, treating as empty:`, err);
    return [];
  }
}

/**
 * @param {string} key - one of STORAGE_KEYS
 * @param {Array} value
 * @returns {Promise<boolean>} false when the write failed; the caller should
 *   not update its UI state as though it succeeded.
 */
async function writeArray(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    log.failed(`Could not write ${key}:`, err);
    return false;
  }
}

/**
 * @param {string} key - one of STORAGE_KEYS
 * @returns {Promise<boolean>} false when the key could not be removed
 */
async function removeKey(key) {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (err) {
    log.failed(`Could not clear ${key}:`, err);
    return false;
  }
}

/** @returns {Promise<BookmarkedInnovation[]>} always an array, never a throw */
export const readBookmarks = () => readArray(STORAGE_KEYS.bookmarks);
/**
 * @param {BookmarkedInnovation[]} list
 * @returns {Promise<boolean>} false when the write failed
 */
export const writeBookmarks = (list) => writeArray(STORAGE_KEYS.bookmarks, list);
/** @returns {Promise<boolean>} false when the key could not be removed */
export const clearBookmarks = () => removeKey(STORAGE_KEYS.bookmarks);

/** @returns {Promise<DownloadedInnovation[]>} always an array, never a throw */
export const readDownloads = () => readArray(STORAGE_KEYS.downloads);
/**
 * @param {DownloadedInnovation[]} list
 * @returns {Promise<boolean>} false when the write failed
 */
export const writeDownloads = (list) => writeArray(STORAGE_KEYS.downloads, list);
/** @returns {Promise<boolean>} false when the key could not be removed */
export const clearDownloads = () => removeKey(STORAGE_KEYS.downloads);

/**
 * Likes are held as a Set in memory but stored as an array. Callers previously
 * did the Array.from / new Set conversion themselves at each site.
 *
 * Ids are numbers, matching innovation.id from the database. A string id would
 * never match under Set membership, so callers coming from a route param have
 * to convert.
 *
 * @returns {Promise<Set<number>>}
 */
export async function readLikedIds() {
  return new Set(await readArray(STORAGE_KEYS.likes));
}

/**
 * @param {Set<number>|number[]} ids
 * @returns {Promise<boolean>} false when the write failed
 */
export function writeLikedIds(ids) {
  return writeArray(STORAGE_KEYS.likes, Array.from(ids ?? []));
}

/**
 * Toggle one id and persist.
 *
 * @param {number} id
 *
 * Returns both facts because the caller needs both: `liked` is the new state to
 * render, `saved` is whether that state survived. This is the only write here
 * that returns more than a boolean, and only because it computes a value the
 * caller would otherwise have to recompute.
 *
 * @returns {Promise<{liked: boolean, saved: boolean}>}
 */
export async function toggleLikedId(id) {
  const ids = await readLikedIds();
  const liked = !ids.has(id);
  if (liked) ids.add(id);
  else ids.delete(id);
  return { liked, saved: await writeLikedIds(ids) };
}

/**
 * Accessibility settings are scalars, not lists, so they get their own pair.
 *
 * AccessibilityContext used to call AsyncStorage directly with `catch {}` on
 * every write — the only fully silent catches in the app, and the only place
 * that bypassed this module's promise that every write reports whether it
 * succeeded.
 *
 * @param {string} key - one of STORAGE_KEYS
 * @param {string} [fallback] - returned when absent or unreadable
 * @returns {Promise<string|null>}
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

/**
 * @param {string} key - one of STORAGE_KEYS
 * @param {string} value
 * @returns {Promise<boolean>} false when the write failed
 */
export async function writeSetting(key, value) {
  try {
    await AsyncStorage.setItem(key, String(value));
    return true;
  } catch (err) {
    log.failed(`Could not write ${key}:`, err);
    return false;
  }
}
