/**
 * Opening the database, and the schema this app adds to it.
 *
 * Separated from db.js so every query module can share one connection without
 * that file also owning the copy-out-of-assets dance and the CREATE TABLE
 * statements. The tables created here are ours — anonymous aggregate feedback
 * and cached AI summaries. They are additive and never touch the bundled
 * innovation records, and they store no identity: a display name typed into a
 * comment is the only user-supplied text anywhere in the schema.
 */
import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import { Asset } from 'expo-asset';
import { createLogger } from '../utils/logger';

const log = createLogger('ATIO DB');

let db = null;
let initPromise = null;

async function ensureThumbsUpTable(database) {
  await database.execAsync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS innovation_thumbs_up_counts (
      innovation_id    INTEGER PRIMARY KEY,
      thumbs_up_count  INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (innovation_id) REFERENCES innovations(id) ON DELETE CASCADE
    );
  `);
}

async function ensureCommentsTable(database) {
  await database.execAsync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS innovation_comments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      innovation_id  INTEGER NOT NULL,
      author_name    TEXT NOT NULL,
      body           TEXT NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      FOREIGN KEY (innovation_id) REFERENCES innovations(id) ON DELETE CASCADE
    );
  `);
}

async function ensureBulletCacheTable(database) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS innovation_bullet_cache (
      innovation_id INTEGER PRIMARY KEY,
      bullets       TEXT NOT NULL
    );
  `);
}

/**
 * Open the bundled database, copying it out of assets on first run.
 *
 * The work is memoized on `initPromise`, not just on `db`: every exported query
 * below starts with `await initDatabase()`, and several screens mount at once,
 * so concurrent callers used to sail past the `if (db)` guard together — each
 * one copying the same ~37MB asset to the same path simultaneously. Callers now
 * share one in-flight promise. A failed attempt clears it so the next call can
 * retry rather than caching the rejection forever.
 */
export function initDatabase() {
  if (db) return Promise.resolve(db);
  if (!initPromise) {
    initPromise = openDatabase().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

async function openDatabase() {
  const dbName = 'atiokb.db';
  // Match expo-sqlite's own default location: <documents>/SQLite
  const dbDirectory = new Directory(Paths.document, 'SQLite');
  const dbFile = new File(dbDirectory, dbName);

  if (!dbDirectory.exists) {
    dbDirectory.create({ intermediates: true, idempotent: true });
  }

  if (!dbFile.exists) {
    try {
      // Copy the bundled DB into app storage so SQLite can open it. Read-only:
      // we never modify the file or its data.
      const asset = Asset.fromModule(require('../../assets/db/atiokb.db'));
      const sourceUri = asset.localUri || asset.uri;
      if (!sourceUri) {
        throw new Error('Asset URI is null');
      }
      const isLocal = sourceUri.startsWith('file://') || sourceUri.startsWith('content://');
      if (isLocal) {
        new File(sourceUri).copy(dbFile);
      } else {
        // Expo Go / Metro: fetch from the dev server, which can be slow.
        const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
        const downloadPromise = File.downloadFileAsync(sourceUri, dbFile, { idempotent: true });
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Database download timed out (5 min). Use a development build or try again on faster Wi‑Fi.')), DOWNLOAD_TIMEOUT_MS);
        });
        await Promise.race([downloadPromise, timeoutPromise]);
      }
    } catch (e) {
      log.failed('Could not copy the database out of assets:', e);
      throw e;
    }
  }

  // openDatabaseAsync wants a directory path, and matched the old
  // documentDirectory-derived string which had no trailing slash.
  const dbDirectoryPath = dbDirectory.uri.replace(/\/+$/, '');
  db = await SQLite.openDatabaseAsync(dbName, undefined, dbDirectoryPath);
  await ensureThumbsUpTable(db);
  await ensureCommentsTable(db);
  await ensureBulletCacheTable(db);
  return db;
}
