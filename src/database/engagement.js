/**
 * Anonymous engagement: likes, comments, and cached AI bullet summaries.
 *
 * Everything here writes. It is separate from db.js — which is otherwise a
 * read-only view of the bundled catalogue — so the one part of the data layer
 * that mutates anything is easy to find. None of it touches the bundled
 * innovation records; it uses the auxiliary tables created in connection.js.
 *
 * There is no user identity in this app, so "one like per device" is enforced
 * by the caller holding its own set of liked ids (see useInnovationInteractions),
 * not by anything here.
 */
import { initDatabase } from './connection';

/**
 * Read the cached three-bullet summary for an innovation.
 *
 * @param {number|string} innovationId
 * @returns {Promise<string[]|null>} null when nothing is cached, or when the
 *   cached JSON is unreadable — a corrupt row is treated as a miss so the
 *   caller simply regenerates rather than surfacing a parse error.
 */
export async function getCachedBullets(innovationId) {
  if (innovationId == null) return null;
  const database = await initDatabase();
  const row = await database.getFirstAsync(
    'SELECT bullets FROM innovation_bullet_cache WHERE innovation_id = ?',
    [innovationId]
  );
  if (!row?.bullets) return null;
  try {
    const arr = JSON.parse(row.bullets);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

/**
 * Cache a generated bullet summary, replacing any existing one.
 *
 * Silently does nothing when given a null id or a non-array, because the only
 * caller passes whatever the summarizer returned and a failed generation is not
 * worth propagating as an error.
 *
 * @param {number|string} innovationId
 * @param {string[]} bulletsArray
 * @returns {Promise<void>}
 */
export async function setCachedBullets(innovationId, bulletsArray) {
  if (innovationId == null || !Array.isArray(bulletsArray)) return;
  const database = await initDatabase();
  await database.runAsync(
    `INSERT INTO innovation_bullet_cache (innovation_id, bullets) VALUES (?, ?)
     ON CONFLICT(innovation_id) DO UPDATE SET bullets = excluded.bullets`,
    [innovationId, JSON.stringify(bulletsArray)]
  );
}

// Anonymous, click-based "thumbs up" tracking (no user authentication).
// Writes only to the auxiliary counter table; innovation content is never modified.
/** @returns {Promise<boolean>} whether the write was attempted. */
export async function incrementThumbsUp(innovationId) {
  if (innovationId == null) return false;
  const database = await initDatabase();
  await database.runAsync(
    `INSERT INTO innovation_thumbs_up_counts (innovation_id, thumbs_up_count)
     VALUES (?, 1)
     ON CONFLICT(innovation_id) DO UPDATE SET thumbs_up_count = thumbs_up_count + 1`,
    [innovationId]
  );
  return true;
}

// Mirror operation for a "remove like" action. This keeps the aggregate count in
// sync when a device toggles its single allowed like off again. We never let the
// counter go below zero; if the row does not exist yet, this is a no‑op.
/** @returns {Promise<boolean>} whether the write was attempted. */
export async function decrementThumbsUp(innovationId) {
  if (innovationId == null) return false;
  const database = await initDatabase();
  await database.runAsync(
    `UPDATE innovation_thumbs_up_counts
     SET thumbs_up_count = CASE
       WHEN thumbs_up_count > 0 THEN thumbs_up_count - 1
       ELSE 0
     END
     WHERE innovation_id = ?`,
    [innovationId]
  );
  return true;
}

// Anonymous comments per innovation (no authentication).
/**
 * Comments on one innovation, newest first.
 *
 * `createdAt` is epoch milliseconds, matching `bookmarkedAt` and `downloadedAt`
 * elsewhere in the app. The column itself is SQLite TEXT written by
 * CURRENT_TIMESTAMP, i.e. "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker.
 * That used to be handed to the UI raw and passed straight to `new Date(...)`,
 * where a space-separated, zone-less string is outside the formats the language
 * requires an engine to understand: Hermes reads it as *local* time, so every
 * comment displayed shifted by the reader's UTC offset. strftime('%s') reads it
 * as the UTC it is.
 *
 * @param {number|string} innovationId
 * @returns {Promise<Array<{id: number, innovationId: number, authorName: string,
 *   body: string, createdAt: number|null}>>} createdAt is null only if the
 *   stored text was unparseable.
 */
export async function getCommentsForInnovation(innovationId) {
  if (innovationId == null) return [];
  const database = await initDatabase();
  return await database.getAllAsync(
    `SELECT id,
            innovation_id                              as innovationId,
            author_name                                as authorName,
            body,
            CAST(strftime('%s', created_at) AS INTEGER) * 1000 as createdAt
     FROM innovation_comments
     WHERE innovation_id = ?
     ORDER BY datetime(created_at) DESC, id DESC`,
    [innovationId]
  );
}

/**
 * Insert an anonymous comment. Writes only to the auxiliary comments table.
 *
 * @returns {Promise<boolean>} false when the input was rejected and nothing was
 *   written, so the caller can tell a discarded comment from a saved one.
 *   Rejects if the insert itself fails.
 */
export async function addCommentToInnovation(innovationId, authorName, body) {
  if (innovationId == null) return false;
  const name = (authorName || '').trim();
  const text = (body || '').trim();
  if (!name || !text) return false;
  const database = await initDatabase();
  await database.runAsync(
    `INSERT INTO innovation_comments (innovation_id, author_name, body)
     VALUES (?, ?, ?)`,
    [innovationId, name, text]
  );
  return true;
}
