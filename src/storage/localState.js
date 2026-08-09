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
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  bookmarks: 'bookmarkedInnovations',
  downloads: 'completedDownloads',
  likes: 'likedInnovations',
};

/**
 * Read a JSON array, tolerating absent, malformed, or wrong-typed entries.
 * @returns {Promise<Array>} always an array
 */
async function readArray(key) {
  let raw;
  try {
    raw = await AsyncStorage.getItem(key);
  } catch (err) {
    console.error(`[storage] Failed to read ${key}:`, err);
    return [];
  }
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(raw);
    // A non-array here means something else wrote this key. Treating it as
    // empty is safer than handing a string or object to a list renderer.
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`[storage] Corrupt JSON at ${key}, treating as empty:`, err);
    return [];
  }
}

/**
 * @returns {Promise<boolean>} false when the write failed; the caller should
 *   not update its UI state as though it succeeded.
 */
async function writeArray(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`[storage] Failed to write ${key}:`, err);
    return false;
  }
}

async function removeKey(key) {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (err) {
    console.error(`[storage] Failed to clear ${key}:`, err);
    return false;
  }
}

/** Entries are innovation objects with a `bookmarkedAt` timestamp. */
export const readBookmarks = () => readArray(STORAGE_KEYS.bookmarks);
export const writeBookmarks = (list) => writeArray(STORAGE_KEYS.bookmarks, list);
export const clearBookmarks = () => removeKey(STORAGE_KEYS.bookmarks);

/** Entries are innovation objects with a `downloadedAt` timestamp. */
export const readDownloads = () => readArray(STORAGE_KEYS.downloads);
export const writeDownloads = (list) => writeArray(STORAGE_KEYS.downloads, list);
export const clearDownloads = () => removeKey(STORAGE_KEYS.downloads);

/**
 * Likes are held as a Set in memory but stored as an array. Callers previously
 * did the Array.from / new Set conversion themselves at each site.
 * @returns {Promise<Set>}
 */
export async function readLikedIds() {
  return new Set(await readArray(STORAGE_KEYS.likes));
}

/** @param {Set|Array} ids */
export function writeLikedIds(ids) {
  return writeArray(STORAGE_KEYS.likes, Array.from(ids ?? []));
}

/** Toggle one id and persist. @returns {Promise<{liked: boolean, saved: boolean}>} */
export async function toggleLikedId(id) {
  const ids = await readLikedIds();
  const liked = !ids.has(id);
  if (liked) ids.add(id);
  else ids.delete(id);
  return { liked, saved: await writeLikedIds(ids) };
}
