/**
 * ATIO database layer. All innovation content (stats, lists, search, filters, detail)
 * is read from the SQLite database (atiokb.db). No innovation data is hardcoded.
 *
 * Most tables are read-only: we never modify the bundled innovation records.
 * The only writeable data we track is anonymous aggregate feedback (e.g. thumbs up
 * counts) in dedicated auxiliary tables that do not change the source content.
 * The only file operation is copying the bundled atiokb.db from assets into app
 * storage so SQLite can open it.
 */

/**
 * The shape every list-returning query in this module hands back.
 *
 * Declared here because it is this module's central output and was previously
 * described nowhere: callers had to read enrichInnovations to learn that
 * `readinessLevel` is a number while `readinessName` is the source text, or
 * that `sdgs` are goal numbers rather than the "Goal 7: …" strings stored.
 *
 * @typedef {object} Innovation
 * @property {number} id
 * @property {string} title
 * @property {string} shortDescription
 * @property {string} longDescription
 * @property {number|null} readinessLevel - 1-9, parsed from the leading digit of readinessName
 * @property {string} readinessName - the level as stored, e.g. "5: Validated"
 * @property {number|null} adoptionLevel - 1-9, parsed the same way
 * @property {string} adoptionName
 * @property {string} region - the innovation's own region text, not its hub region
 * @property {boolean} isGrassroots
 * @property {string} owner
 * @property {string} partner
 * @property {string} dataSource
 * @property {string[]} countries
 * @property {string[]} types
 * @property {number[]} sdgs - goal numbers, e.g. [2, 13]
 * @property {string[]} useCases
 * @property {string[]} users
 * @property {'Low'|'Moderate'|'High'} cost - derived in memory, never stored
 * @property {'Simple'|'Moderate'|'Advanced'} complexity - derived in memory, never stored
 * @property {number} thumbsUpCount
 * @property {number} commentCount
 */

/**
 * The filter bag accepted by searchInnovations and countInnovations.
 *
 * Every key is optional and every present key narrows the result; an empty
 * object matches everything. Values within one key are OR'd, and separate keys
 * are AND'd together.
 *
 * Two of these are not SQL columns. `cost` and `complexity` are derived in
 * memory from an innovation's types, use cases, users and description, so they
 * cannot be pushed into the WHERE clause: when either is present the query
 * switches to fetching candidate rows in chunks and filtering them in JS. That
 * is why a filtered count can be slower than an unfiltered one.
 *
 * @typedef {object} InnovationFilters
 * @property {string[]} [challenges] - challenge entry ids, matched via their keywords
 * @property {string[]} [types] - type entry ids, matched via their keywords
 * @property {string[]} [challengeKeywords] - specific sub-terms, narrower than `challenges`
 * @property {string[]} [typeKeywords] - specific sub-terms, narrower than `types`
 * @property {string[]} [countries] - country names, substring matched
 * @property {string[]} [hubRegions] - innovation hub region names
 * @property {string[]} [regions] - the innovation's own region text, substring matched
 * @property {number} [readinessMin] - lower bound, 1-9; ignored at 1
 * @property {number} [adoptionMin] - lower bound, 1-9; ignored at 1
 * @property {number[]} [sdgs] - goal numbers, matched as "Goal N"
 * @property {string[]} [userGroups] - prospective-user entry ids
 * @property {string[]} [sources] - data source titles, substring matched
 * @property {boolean} [grassrootsOnly] - only truthy narrows; false is the same as absent
 * @property {string[]} [cost] - derived, not a column; see above
 * @property {string[]} [complexity] - derived, not a column; see above
 */
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { CHALLENGES, TYPES, deriveCost, deriveComplexity, COUNTRY_TO_REGION } from '../data/constants';
import { INNOVATION_HUB_REGIONS } from '../data/innovationHubRegions';
import {
  hasCostOrComplexityFilters,
  filterByCostAndComplexity,
  collectFilteredPage,
  countFiltered,
} from './paginate';
import { buildKeywordLikeClause } from './likeClause';
import { buildFilterQuery } from './filterQuery';

let db = null;
let initPromise = null;

/**
 * Readiness and adoption arrive as strings like "4 - Prototype"; the numeric
 * prefix is the level. This was parsed inline in six places, each with its own
 * fallback — hence the explicit `fallback` argument rather than one hardcoded
 * default: enrichment wants 1, the count aggregators want to skip the row.
 *
 * @param {*} value
 * @param {number|null} [fallback=1] returned when the value has no leading integer
 * @returns {number|null}
 */
function parseLeadingLevel(value, fallback = 1) {
  const match = value != null ? String(value).match(/^(\d+)/) : null;
  return match ? parseInt(match[1], 10) : fallback;
}

async function ensureThumbsUpTable(database) {
  // Anonymous aggregate "thumbs up" counts per innovation. This does not modify
  // the core innovation records – it only tracks click-based feedback.
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
  // Anonymous comments per innovation. We only store user-entered display names
  // and comment text; there is no authentication or identity management.
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
  // Match expo-sqlite default: documentDirectory + "SQLite"
  const docDir = FileSystem.documentDirectory || '';
  const dbDir = docDir.endsWith('/') ? `${docDir}SQLite` : `${docDir}/SQLite`;
  const dbPath = `${dbDir}/${dbName}`;

  const dirInfo = await FileSystem.getInfoAsync(dbDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dbDir, { intermediates: true });
  }

  const fileInfo = await FileSystem.getInfoAsync(dbPath);
  if (!fileInfo.exists) {
    try {
      // Copy bundled DB into app storage so SQLite can open it. Read-only: we never modify the file or its data.
      const asset = Asset.fromModule(require('../../assets/db/atiokb.db'));
      const sourceUri = asset.localUri || asset.uri;
      if (!sourceUri) {
        throw new Error('Asset URI is null');
      }
      const isLocal = sourceUri.startsWith('file://') || sourceUri.startsWith('content://');
      if (isLocal) {
        await FileSystem.copyAsync({ from: sourceUri, to: dbPath });
      } else {
        // Expo Go / Metro: download from dev server (can be slow)
        const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
        const downloadPromise = FileSystem.downloadAsync(sourceUri, dbPath);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Database download timed out (5 min). Use a development build or try again on faster Wi‑Fi.')), DOWNLOAD_TIMEOUT_MS);
        });
        await Promise.race([downloadPromise, timeoutPromise]);
      }
    } catch (e) {
      console.error('[ATIO DB] Failed to copy database from assets:', e);
      throw e;
    }
  }

  // Open using the same directory we copied to
  db = await SQLite.openDatabaseAsync(dbName, undefined, dbDir);
  await ensureThumbsUpTable(db);
  await ensureCommentsTable(db);
  await ensureBulletCacheTable(db);
  return db;
}

/**
 * Headline counts for the Explore landing page.
 *
 * @returns {Promise<{innovations: number, countries: number, sdgs: number}>}
 *   All three are read from the data; none is hardcoded.
 */
export async function getStats() {
  const database = await initDatabase();
  const innovCount = await database.getFirstAsync('SELECT COUNT(*) as count FROM innovations');
  const countryCount = await database.getFirstAsync('SELECT COUNT(DISTINCT country_name) as count FROM innovation_countries');
  const sdgCount = await database.getFirstAsync('SELECT COUNT(DISTINCT sdg_name) as count FROM innovation_sdgs');
  return {
    innovations: innovCount.count,
    countries: countryCount.count,
    // Read from the data rather than hardcoded, per this module's own contract.
    sdgs: sdgCount?.count ?? 0,
  };
}

/**
 * Get innovation counts per region (distinct innovations). Regions are defined in innovationHubRegions.js.
 * Returns regions sorted by count descending, limited to top regions.
 */
export async function getTopRegions(limit = 15) {
  const database = await initDatabase();
  const results = [];

  for (const region of INNOVATION_HUB_REGIONS) {
    if (region.countries.length === 0) continue;
    const placeholders = region.countries.map(() => '?').join(', ');
    const row = await database.getFirstAsync(
      `SELECT COUNT(DISTINCT innovation_id) as count
       FROM innovation_countries
       WHERE country_name IN (${placeholders})`,
      region.countries
    );
    results.push({
      id: region.id,
      name: region.name,
      icon: region.icon,
      iconColor: region.iconColor,
      count: row?.count ?? 0,
      countries: region.countries,
    });
  }

  results.sort((a, b) => b.count - a.count);
  return results.slice(0, limit);
}

/**
 * How many innovations sit under each challenge.
 *
 * Counts by use-case keyword rather than by a foreign key, because a challenge
 * is a curated grouping of use-case terms rather than a column. One query per
 * challenge: the keyword lists differ per entry, so they cannot share a scan.
 *
 * @returns {Promise<Record<string, number>>} keyed by challenge id
 */
export async function getChallengeCounts() {
  const database = await initDatabase();
  const counts = {};
  for (const challenge of CHALLENGES) {
    const { clause, params } = buildKeywordLikeClause('uc.term_name', challenge.keywords);
    const result = await database.getFirstAsync(
      `SELECT COUNT(DISTINCT uc.innovation_id) as count FROM innovation_use_cases uc WHERE ${clause}`,
      params
    );
    counts[challenge.id] = result.count;
  }
  return counts;
}

/**
 * How many innovations sit under each solution type.
 *
 * The type-side mirror of getChallengeCounts, matching against type terms.
 *
 * @returns {Promise<Record<string, number>>} keyed by type id
 */
export async function getTypeCounts() {
  const database = await initDatabase();
  const counts = {};
  for (const type of TYPES) {
    const { clause, params } = buildKeywordLikeClause('it.term_name', type.keywords);
    const result = await database.getFirstAsync(
      `SELECT COUNT(DISTINCT it.innovation_id) as count FROM innovation_types it WHERE ${clause}`,
      params
    );
    counts[type.id] = result.count;
  }
  return counts;
}

// Build a SQL query for filtered innovations

const PAGE_SELECT_COLUMNS = `i.id, i.title, i.short_description, i.long_description,
           i.readiness_level, i.adoption_level, i.region, i.is_grassroots,
           i.owner_text, i.partner_text, i.data_source`;

/** Only what deriveCost/deriveComplexity read — used on the counting path. */
const COUNT_SELECT_COLUMNS = `i.id, i.short_description, i.long_description, i.is_grassroots`;

/**
 * Build a chunk reader over the filtered innovation set.
 * Returns `(limit, offset) => rows[]`, which is what the paginate helpers want.
 */
function makeChunkFetcher(database, filters, columns) {
  const { joins, conditions, params } = buildFilterQuery(filters);
  const sql = `
    SELECT DISTINCT ${columns}
    FROM innovations i
    ${joins.join(' ')}
    WHERE ${conditions.join(' AND ')}
    ORDER BY i.readiness_level_id DESC
    LIMIT ? OFFSET ?
  `;
  return (limit, offset) => database.getAllAsync(sql, [...params, limit, offset]);
}

/**
 * Attach cost/complexity to raw rows using three batched lookups.
 *
 * enrichInnovations does the same derivation, but issues five queries per row
 * to also assemble countries, SDGs and display fields. Counting needs none of
 * that, so this stays O(1) queries regardless of how many rows are scanned.
 */
async function deriveCostComplexityForRows(database, rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id).filter((id) => id != null);
  if (ids.length === 0) return [];

  const [typeMap, useCaseMap, userMap] = await Promise.all([
    collectByInnovationId(database, 'innovation_types', 'term_name', ids),
    collectByInnovationId(database, 'innovation_use_cases', 'term_name', ids),
    collectByInnovationId(database, 'innovation_prospective_users', 'user_name', ids),
  ]);

  return rows.map((row) => {
    const signals = {
      types: typeMap.get(row.id) || [],
      useCases: useCaseMap.get(row.id) || [],
      users: (userMap.get(row.id) || []).map(decodeApostrophes),
      shortDescription: row.short_description || '',
      longDescription: row.long_description || '',
      isGrassroots: row.is_grassroots === 1,
    };
    return {
      ...row,
      cost: deriveCost(signals),
      complexity: deriveComplexity(signals),
    };
  });
}

/**
 * Page through innovations matching `filters`.
 *
 * Takes an options object rather than positional limit/offset: this function
 * used to be (filters, limit, offset) while aiSearch was (query, offset, limit),
 * so the two paginated search APIs read the same at a call site but meant
 * opposite things — a silent wrong-page bug waiting to happen.
 *
 * @param {object} filters
 * @param {{limit?: number, offset?: number}} [options]
 */
export async function searchInnovations(filters = {}, options = {}) {
  if (typeof options === 'number') {
    throw new TypeError(
      'searchInnovations(filters, { limit, offset }) — positional limit/offset was removed because it was ordered opposite to aiSearch.'
    );
  }
  const { limit = 50, offset = 0 } = options;
  const database = await initDatabase();

  // Without derived filters SQL can do the paging itself — one query, no scan.
  if (!hasCostOrComplexityFilters(filters)) {
    const rows = await makeChunkFetcher(database, filters, PAGE_SELECT_COLUMNS)(limit, offset);
    return enrichInnovations(rows);
  }

  return collectFilteredPage({
    fetchChunk: makeChunkFetcher(database, filters, PAGE_SELECT_COLUMNS),
    keep: async (rows) =>
      filterByCostAndComplexity(await enrichInnovations(rows), filters),
    offset,
    limit,
  });
}

/**
 * How many innovations match `filters`.
 *
 * Takes the same filter bag as searchInnovations and must agree with it, since
 * the UI pages one against the other's total.
 *
 * When a derived cost or complexity filter is present this cannot be a COUNT in
 * SQL — those values do not exist as columns — so it scans candidate rows in
 * chunks and counts what survives in JS. That path is bounded, so a very broad
 * derived filter reports the bound rather than scanning the whole table.
 *
 * @param {InnovationFilters} [filters]
 * @returns {Promise<number>}
 */
export async function countInnovations(filters = {}) {
  const database = await initDatabase();

  if (hasCostOrComplexityFilters(filters)) {
    const { count } = await countFiltered({
      fetchChunk: makeChunkFetcher(database, filters, COUNT_SELECT_COLUMNS),
      keep: async (rows) =>
        filterByCostAndComplexity(await deriveCostComplexityForRows(database, rows), filters),
    });
    return count;
  }

  const { joins, conditions, params } = buildFilterQuery(filters);
  const sql = `
    SELECT COUNT(DISTINCT i.id) as count
    FROM innovations i
    ${joins.join(' ')}
    WHERE ${conditions.join(' AND ')}
  `;

  const result = await database.getFirstAsync(sql, params);
  return result.count;
}

/**
 * The most advanced innovations, for the Explore landing page's recent list.
 *
 * "Recent" is by readiness level then id, not by date: the bundled records
 * carry no reliable ingestion timestamp.
 *
 * @param {number} [limit]
 * @returns {Promise<Innovation[]>}
 */
export async function getRecentInnovations(limit = 10) {
  const database = await initDatabase();
  const rows = await database.getAllAsync(
    `SELECT i.id, i.title, i.short_description, i.long_description,
            i.readiness_level, i.adoption_level, i.region, i.is_grassroots,
            i.owner_text, i.partner_text, i.data_source
     FROM innovations i
     ORDER BY i.readiness_level_id DESC, i.id DESC
     LIMIT ?`,
    [limit]
  );
  return await enrichInnovations(rows);
}

/** Innovations that are hotlines, helplines, or general help/support (for "Seek further help" section). */
export async function getHelpInnovations(limit = 30) {
  const database = await initDatabase();
  // FTS5: space-separated terms are OR'd; match hotline, helpline, support, help line, etc.
  const ftsQuery = 'hotline helpline support "help line" "general help"';
  let rows = [];
  try {
    rows = await database.getAllAsync(
      `SELECT i.id, i.title, i.short_description, i.long_description,
              i.readiness_level, i.adoption_level, i.region, i.is_grassroots,
              i.owner_text, i.partner_text, i.data_source
       FROM innovations i
       JOIN innovations_fts fts ON fts.rowid = i.id
       WHERE innovations_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
      [ftsQuery, limit]
    );
  } catch (err) {
    // The FTS table or MATCH syntax can vary by build. Previously this fell
    // through to getRecentInnovations, which renders arbitrary innovations
    // under a "Seek further help" heading — wrong content presented as help
    // resources, and it hid the query failure entirely. Return nothing instead
    // so the caller shows its empty state.
    //
    // Deliberately does not throw: the only call site invokes this from inside
    // a catch block (HomeScreen), where a rejection would escape unhandled.
    console.error('[ATIO DB] Help-innovation FTS query failed:', err);
    return [];
  }
  // Zero matches is a real answer, not an error — no help resources exist for
  // this query, and recent innovations are not a substitute.
  return await enrichInnovations(rows);
}

/**
 * Group one column of a child table by innovation_id for a batch of ids.
 *
 * Every child-table lookup in this file has the same shape — select a column
 * keyed by innovation_id, bucket the rows per innovation — so it is written
 * once. Doing it per innovation instead is what made enrichInnovations issue
 * five queries per row.
 */
async function collectByInnovationId(database, table, column, ids) {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await database.getAllAsync(
    `SELECT innovation_id, ${column} FROM ${table} WHERE innovation_id IN (${placeholders})`,
    ids
  );
  const grouped = new Map();
  for (const row of rows) {
    const values = grouped.get(row.innovation_id) || [];
    values.push(row[column]);
    grouped.set(row.innovation_id, values);
  }
  return grouped;
}

/** SDG rows arrive as "Goal 7: Affordable and Clean Energy"; the UI wants the 7. */
function sdgNumbers(names) {
  return (names || [])
    .map((name) => {
      const match = name.match(/Goal (\d+)/);
      return match ? parseInt(match[1], 10) : null;
    })
    .filter(Boolean);
}

/** Apostrophes survive in the source data as the HTML entity. */
const decodeApostrophes = (value) => value.replace(/&#039;/g, "'");

/**
 * Expand innovation rows into the shape the UI consumes: related countries,
 * types, SDGs, use cases and prospective users, plus engagement counts and the
 * derived cost/complexity.
 *
 * Seven queries total, regardless of how many rows are passed. This used to
 * batch the two count lookups and then issue five more per row inside the same
 * loop, so a 30-row drilldown cost 152 round trips instead of 7.
 *
 * @param {Array<object>} rows - raw innovation rows
 * @returns {Promise<Array<object>>}
 */
async function enrichInnovations(rows) {
  if (rows.length === 0) return [];
  const database = await initDatabase();
  const ids = rows.map((r) => r.id).filter((id) => id != null);
  const placeholders = ids.map(() => '?').join(',');

  const [countryMap, typeMap, sdgMap, useCaseMap, userMap, thumbRows, commentRows] =
    await Promise.all([
      collectByInnovationId(database, 'innovation_countries', 'country_name', ids),
      collectByInnovationId(database, 'innovation_types', 'term_name', ids),
      collectByInnovationId(database, 'innovation_sdgs', 'sdg_name', ids),
      collectByInnovationId(database, 'innovation_use_cases', 'term_name', ids),
      collectByInnovationId(database, 'innovation_prospective_users', 'user_name', ids),
      ids.length
        ? database.getAllAsync(
            `SELECT innovation_id, thumbs_up_count
             FROM innovation_thumbs_up_counts
             WHERE innovation_id IN (${placeholders})`,
            ids
          )
        : [],
      ids.length
        ? database.getAllAsync(
            `SELECT innovation_id, COUNT(*) as comment_count
             FROM innovation_comments
             WHERE innovation_id IN (${placeholders})
             GROUP BY innovation_id`,
            ids
          )
        : [],
    ]);

  const thumbsUpMap = new Map(thumbRows.map((r) => [r.innovation_id, r.thumbs_up_count]));
  const commentCountMap = new Map(commentRows.map((r) => [r.innovation_id, r.comment_count]));

  return rows.map((row) => {
    const typeNames = typeMap.get(row.id) || [];
    const useCaseNames = useCaseMap.get(row.id) || [];
    const userNames = (userMap.get(row.id) || []).map(decodeApostrophes);

    // Cost and complexity are derived in memory from read-only data; never
    // written back to the database.
    const costComplexitySignals = {
      types: typeNames,
      useCases: useCaseNames,
      users: userNames,
      shortDescription: row.short_description || '',
      longDescription: row.long_description || '',
      isGrassroots: row.is_grassroots === 1,
    };

    return {
      id: row.id,
      title: row.title,
      shortDescription: row.short_description || '',
      longDescription: row.long_description || '',
      readinessLevel: parseLeadingLevel(row.readiness_level),
      readinessName: row.readiness_level || '',
      adoptionLevel: parseLeadingLevel(row.adoption_level),
      adoptionName: row.adoption_level || '',
      region: row.region || '',
      isGrassroots: row.is_grassroots === 1,
      owner: row.owner_text || '',
      partner: row.partner_text || '',
      dataSource: row.data_source || '',
      countries: countryMap.get(row.id) || [],
      types: typeNames,
      sdgs: sdgNumbers(sdgMap.get(row.id)),
      useCases: useCaseNames,
      users: userNames,
      cost: deriveCost(costComplexitySignals),
      complexity: deriveComplexity(costComplexitySignals),
      thumbsUpCount: thumbsUpMap.get(row.id) ?? 0,
      commentCount: commentCountMap.get(row.id) ?? 0,
    };
  });
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

/**
 * Every country present in the data, with how many innovations mention it.
 *
 * @returns {Promise<Array<{name: string, count: number}>>} alphabetical by name
 */
export async function getAllCountries() {
  const database = await initDatabase();
  return await database.getAllAsync(
    'SELECT country_name as name, COUNT(*) as count FROM innovation_countries GROUP BY country_name ORDER BY country_name'
  );
}

/**
 * The data sources the catalogue was assembled from, largest first.
 *
 * @returns {Promise<Array<{title: string, count: number}>>}
 */
export async function getDataSources() {
  const database = await initDatabase();
  const rows = await database.getAllAsync(
    `SELECT ds.title, COUNT(i.id) as count
     FROM data_sources ds
     JOIN innovations i ON i.data_source_id = ds.id
     GROUP BY ds.id
     ORDER BY count DESC`
  );
  return rows;
}

/**
 * Memoize a derived data set for the length of the app session.
 *
 * Both heat maps used to cache their resolved value in a module-level `let`.
 * That leaves a window between the first call starting and finishing in which a
 * second caller still sees an empty cache and starts the whole computation
 * again — and both of these scan every innovation in the database. Home can
 * genuinely ask for both at once. Holding the *promise* means the second caller
 * joins the first instead of racing it.
 *
 * A rejected computation is not kept, so a failure during startup does not
 * poison the value for the rest of the session.
 *
 * `reset` exists because previously there was no way to invalidate these at
 * all: assigned once, with no exported way back.
 */
function memoizeForSession(compute) {
  let pending = null;
  const memoized = () => {
    if (!pending) {
      pending = compute().catch((err) => {
        pending = null;
        throw err;
      });
    }
    return pending;
  };
  memoized.reset = () => { pending = null; };
  return memoized;
}

/**
 * Case-insensitive substring match of a taxonomy term against a keyword list.
 * Used by both heatmaps; previously duplicated byte-for-byte as
 * useCaseMatchesChallenge and typeTermMatchesType.
 */
function termMatchesKeywords(termName, keywords) {
  if (!termName || !keywords?.length) return false;
  const lower = String(termName).toLowerCase();
  return keywords.some((k) => lower.includes(String(k).toLowerCase()));
}

/**
 * Region × Challenge grid scored by adoption opportunity: how much readiness
 * exceeds adoption, i.e. proven solutions that have not spread yet.
 *
 * Memoized for the session; call resetHeatmapCaches() to recompute.
 *
 * @returns {Promise<{rows: string[], cols: string[], colNames: object, cells: object}>}
 */
export const getOpportunityHeatmapData = memoizeForSession(async () => {
  const database = await initDatabase();
  const countryToRegion = COUNTRY_TO_REGION;

  const innovations = await database.getAllAsync(
    'SELECT i.id, i.readiness_level, i.adoption_level FROM innovations i'
  );

  const allCountries = await database.getAllAsync(
    'SELECT innovation_id, country_name FROM innovation_countries'
  );
  const allUseCases = await database.getAllAsync(
    'SELECT innovation_id, term_name FROM innovation_use_cases'
  );

  const countriesByInv = {};
  for (const r of allCountries) {
    if (!countriesByInv[r.innovation_id]) countriesByInv[r.innovation_id] = [];
    countriesByInv[r.innovation_id].push(r.country_name);
  }

  const useCasesByInv = {};
  for (const r of allUseCases) {
    if (!useCasesByInv[r.innovation_id]) useCasesByInv[r.innovation_id] = [];
    useCasesByInv[r.innovation_id].push(r.term_name);
  }

  const parseLevel = (val) => {
    return parseLeadingLevel(val);
  };

  const rows = INNOVATION_HUB_REGIONS.map((r) => r.name);
  const cols = CHALLENGES.map((c) => ({ id: c.id, name: c.name }));

  const cells = {};
  for (const r of rows) {
    cells[r] = {};
    for (const col of cols) {
      cells[r][col.id] = { count: 0, sumReadiness: 0, sumAdoption: 0 };
    }
  }

  for (const inv of innovations) {
    const readiness = parseLevel(inv.readiness_level);
    const adoption = parseLevel(inv.adoption_level);
    const countries = countriesByInv[inv.id] || [];
    const useCases = useCasesByInv[inv.id] || [];

    const regionNames = [...new Set(countries.map((c) => countryToRegion[c]).filter(Boolean))];
    const challengeIds = CHALLENGES.filter((c) =>
      useCases.some((uc) => termMatchesKeywords(uc, c.keywords))
    ).map((c) => c.id);

    if (regionNames.length === 0 || challengeIds.length === 0) continue;

    for (const rn of regionNames) {
      for (const cid of challengeIds) {
        cells[rn][cid].count += 1;
        cells[rn][cid].sumReadiness += readiness;
        cells[rn][cid].sumAdoption += adoption;
      }
    }
  }

  for (const r of rows) {
    for (const col of cols) {
      const cell = cells[r][col.id];
      const count = cell.count;
      const avgReadiness = count > 0 ? cell.sumReadiness / count : 0;
      const avgAdoption = count > 0 ? cell.sumAdoption / count : 0;
      const opportunityScore = Math.max(0, avgReadiness - avgAdoption);
      cells[r][col.id] = { count, avgReadiness, avgAdoption, opportunityScore };
    }
  }

  return {
    rows,
    cols: cols.map((c) => c.id),
    colNames: cols.reduce((acc, c) => {
      acc[c.id] = c.name;
      return acc;
    }, {}),
    cells,
  };
});

/**
 * Challenge x Type readiness grid.
 *
 * Uses the same top-level key names as getOpportunityHeatmapData ({rows, cols,
 * cells}) — this returned `columns` before, so the two sibling APIs read
 * differently at every call site. The `cells` value is keyed by a composite
 * "challengeId|typeId" string here rather than nested by row, because this grid
 * is sparse where the other is dense.
 *
 * Memoized for the session; call resetHeatmapCaches() to recompute.
 *
 * @returns {Promise<{rows: object[], cols: object[], cells: object,
 *   minReadiness: number, maxReadiness: number}>}
 */
export const getReadyToUseHeatmapData = memoizeForSession(async () => {
  const database = await initDatabase();

  const innovations = await database.getAllAsync(
    'SELECT i.id, i.readiness_level FROM innovations i WHERE i.readiness_level IS NOT NULL'
  );
  const allUseCases = await database.getAllAsync(
    'SELECT innovation_id, term_name FROM innovation_use_cases'
  );
  const allTypes = await database.getAllAsync(
    'SELECT innovation_id, term_name FROM innovation_types'
  );

  const useCasesByInv = {};
  for (const r of allUseCases) {
    if (!useCasesByInv[r.innovation_id]) useCasesByInv[r.innovation_id] = [];
    useCasesByInv[r.innovation_id].push(r.term_name);
  }
  const typesByInv = {};
  for (const r of allTypes) {
    if (!typesByInv[r.innovation_id]) typesByInv[r.innovation_id] = [];
    typesByInv[r.innovation_id].push(r.term_name);
  }

  const parseReadiness = (val) => parseLeadingLevel(val, null);

  const rows = CHALLENGES.map((c) => ({
    id: c.id, name: c.name, icon: c.icon, iconColor: c.iconColor || '#333',
  }));
  const cols = TYPES.map((t) => ({
    id: t.id, name: t.name, icon: t.icon, iconColor: t.iconColor || '#333',
  }));

  const cells = {};
  for (const r of rows) {
    for (const col of cols) {
      const key = `${r.id}::${col.id}`;
      cells[key] = { count: 0, totalReadiness: 0 };
    }
  }

  for (const inv of innovations) {
    const readiness = parseReadiness(inv.readiness_level);
    if (readiness == null) continue;

    const useCases = useCasesByInv[inv.id] || [];
    const typeTerms = typesByInv[inv.id] || [];

    const challengeIds = CHALLENGES.filter((c) =>
      useCases.some((uc) => termMatchesKeywords(uc, c.keywords))
    ).map((c) => c.id);
    const typeIds = TYPES.filter((t) =>
      typeTerms.some((tt) => termMatchesKeywords(tt, t.keywords))
    ).map((t) => t.id);

    if (challengeIds.length === 0 || typeIds.length === 0) continue;

    for (const cid of challengeIds) {
      for (const tid of typeIds) {
        const key = `${cid}::${tid}`;
        if (!cells[key]) cells[key] = { count: 0, totalReadiness: 0 };
        cells[key].count += 1;
        cells[key].totalReadiness += readiness;
      }
    }
  }

  let minReadiness = 9;
  let maxReadiness = 0;
  for (const key of Object.keys(cells)) {
    const cell = cells[key];
    const count = cell.count;
    const avgReadiness = count > 0 ? cell.totalReadiness / count : 0;
    cells[key] = { count, avgReadiness };
    if (count > 0) {
      minReadiness = Math.min(minReadiness, avgReadiness);
      maxReadiness = Math.max(maxReadiness, avgReadiness);
    }
  }
  if (minReadiness >= maxReadiness) {
    minReadiness = 0;
    maxReadiness = 9;
  }

  return { rows, cols, cells, minReadiness, maxReadiness };
});

/**
 * Drop both memoized heat maps so the next request recomputes them.
 *
 * Nothing in the app calls this yet — the underlying data is read-only for the
 * length of a session. It exists so that "computed once per session" is a
 * decision rather than an accident of module scope, and so a test can start
 * from a known state.
 */
export function resetHeatmapCaches() {
  getOpportunityHeatmapData.reset();
  getReadyToUseHeatmapData.reset();
}
