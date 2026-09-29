/**
 * Web twin of engagement.js: likes, comments and cached AI bullets, stored in
 * the browser instead of SQLite.
 *
 * These have always been per-device. The tables the native file writes to are
 * created empty by connection.js and hold nothing from the bundled catalogue,
 * so a fresh phone install already starts with zero likes and no comments.
 * Backing them with AsyncStorage — which is localStorage on web — therefore
 * reproduces native behaviour exactly, rather than approximating it.
 *
 * AsyncStorage rather than window.localStorage directly: it is already a
 * dependency, it is what storage/localState.js uses, and it keeps this file
 * testable without a DOM.
 *
 * Every export below matches engagement.js in name, arguments and return shape.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '../utils/logger';

const log = createLogger('engagement.web');

const KEYS = {
  bullets: 'atio.web.bulletCache',
  thumbsUp: 'atio.web.thumbsUpCounts',
  comments: 'atio.web.comments',
};

/**
 * Read one of the maps above. A missing or corrupt value is treated as empty,
 * matching the native module's habit of treating an unreadable row as a miss
 * rather than surfacing a parse error.
 */
async function readMap(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    log.failed(`Could not read ${key}:`, e);
    return {};
  }
}

async function writeMap(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    // Private browsing and cleared site data both make this throw. Losing a
    // like is not worth breaking the screen over.
    log.failed(`Could not write ${key}:`, e);
    return false;
  }
}

/** @see engagement.js */
export async function getCachedBullets(innovationId) {
  if (innovationId == null) return null;
  const map = await readMap(KEYS.bullets);
  const arr = map[String(innovationId)];
  return Array.isArray(arr) ? arr : null;
}

/** @see engagement.js */
export async function setCachedBullets(innovationId, bulletsArray) {
  if (innovationId == null || !Array.isArray(bulletsArray)) return;
  const map = await readMap(KEYS.bullets);
  map[String(innovationId)] = bulletsArray;
  await writeMap(KEYS.bullets, map);
}

/** @see engagement.js */
export async function incrementThumbsUp(innovationId) {
  if (innovationId == null) return false;
  const map = await readMap(KEYS.thumbsUp);
  const key = String(innovationId);
  map[key] = (Number(map[key]) || 0) + 1;
  return writeMap(KEYS.thumbsUp, map);
}

/** @see engagement.js — the counter never drops below zero. */
export async function decrementThumbsUp(innovationId) {
  if (innovationId == null) return false;
  const map = await readMap(KEYS.thumbsUp);
  const key = String(innovationId);
  const next = (Number(map[key]) || 0) - 1;
  map[key] = next > 0 ? next : 0;
  return writeMap(KEYS.thumbsUp, map);
}

/**
 * @see engagement.js — newest first, createdAt in epoch milliseconds.
 *
 * The native version derives epoch ms from SQLite's CURRENT_TIMESTAMP; here the
 * value is written as epoch ms in the first place, so the two agree without the
 * timezone care the SQL needs.
 */
export async function getCommentsForInnovation(innovationId) {
  if (innovationId == null) return [];
  const map = await readMap(KEYS.comments);
  const list = map[String(innovationId)];
  if (!Array.isArray(list)) return [];
  return [...list].sort(
    (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || (b.id ?? 0) - (a.id ?? 0)
  );
}

/** @see engagement.js */
export async function addCommentToInnovation(innovationId, authorName, body) {
  if (innovationId == null) return false;
  const name = (authorName || '').trim();
  const text = (body || '').trim();
  if (!name || !text) return false;

  const map = await readMap(KEYS.comments);
  const key = String(innovationId);
  const list = Array.isArray(map[key]) ? map[key] : [];
  // SQLite hands out AUTOINCREMENT ids; here the highest existing id + 1 keeps
  // them unique per innovation, which is all any caller relies on.
  const nextId = list.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0) + 1;
  list.push({
    id: nextId,
    innovationId,
    authorName: name,
    body: text,
    createdAt: Date.now(),
  });
  map[key] = list;
  await writeMap(KEYS.comments, map);
  return true;
}
