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
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { CHALLENGES, TYPES, USER_GROUPS, deriveCost, deriveComplexity } from '../data/constants';
import { INNOVATION_HUB_REGIONS } from '../data/innovationHubRegions';

let db = null;

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

export async function initDatabase() {
  if (db) return db;

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
  return db;
}

export async function getStats() {
  const database = await initDatabase();
  const innovCount = await database.getFirstAsync('SELECT COUNT(*) as count FROM innovations');
  const countryCount = await database.getFirstAsync('SELECT COUNT(DISTINCT country_name) as count FROM innovation_countries');
  return {
    innovations: innovCount.count,
    countries: countryCount.count,
    sdgs: 17,
  };
}

export async function getTopCountries(limit = 15) {
  const database = await initDatabase();
  const rows = await database.getAllAsync(
    'SELECT country_name as name, COUNT(*) as count FROM innovation_countries GROUP BY country_name ORDER BY count DESC LIMIT ?',
    [limit]
  );
  return rows;
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

export async function getChallengeCounts() {
  const database = await initDatabase();
  const counts = {};
  for (const challenge of CHALLENGES) {
    const conditions = challenge.keywords.map(k => `uc.term_name LIKE '%${k.replace(/'/g, "''")}%'`).join(' OR ');
    const result = await database.getFirstAsync(
      `SELECT COUNT(DISTINCT uc.innovation_id) as count FROM innovation_use_cases uc WHERE ${conditions}`
    );
    counts[challenge.id] = result.count;
  }
  return counts;
}

export async function getTypeCounts() {
  const database = await initDatabase();
  const counts = {};
  for (const type of TYPES) {
    const conditions = type.keywords.map(k => `it.term_name LIKE '%${k.replace(/'/g, "''")}%'`).join(' OR ');
    const result = await database.getFirstAsync(
      `SELECT COUNT(DISTINCT it.innovation_id) as count FROM innovation_types it WHERE ${conditions}`
    );
    counts[type.id] = result.count;
  }
  return counts;
}

export async function getReadinessCounts() {
  const database = await initDatabase();
  const rows = await database.getAllAsync(
    'SELECT readiness_level, COUNT(*) as count FROM innovations GROUP BY readiness_level ORDER BY readiness_level'
  );
  const counts = {};
  rows.forEach(r => {
    const match = r.readiness_level ? r.readiness_level.match(/^(\d+)/) : null;
    if (match) counts[parseInt(match[1])] = r.count;
  });
  return counts;
}

export async function getAdoptionCounts() {
  const database = await initDatabase();
  const rows = await database.getAllAsync(
    'SELECT adoption_level, COUNT(*) as count FROM innovations GROUP BY adoption_level ORDER BY adoption_level'
  );
  const counts = {};
  rows.forEach(r => {
    const match = r.adoption_level ? r.adoption_level.match(/^(\d+)/) : null;
    if (match) counts[parseInt(match[1])] = r.count;
  });
  return counts;
}

// Build a SQL query for filtered innovations
function buildFilterQuery(filters) {
  let joins = [];
  let conditions = ['1=1'];
  let params = [];

  // Challenge filter: challengeKeywords (from sub-terms) take precedence over broad challenges
  if (filters.challengeKeywords && filters.challengeKeywords.length > 0) {
    joins.push('JOIN innovation_use_cases uc ON uc.innovation_id = i.id');
    const ucConds = filters.challengeKeywords.map(k => `uc.term_name LIKE ?`);
    conditions.push(`(${ucConds.join(' OR ')})`);
    filters.challengeKeywords.forEach(k => params.push(`%${k}%`));
  } else if (filters.challenges && filters.challenges.length > 0) {
    const challengeKeywords = [];
    filters.challenges.forEach(cid => {
      const c = CHALLENGES.find(x => x.id === cid);
      if (c) challengeKeywords.push(...c.keywords);
    });
    if (challengeKeywords.length > 0) {
      joins.push('JOIN innovation_use_cases uc ON uc.innovation_id = i.id');
      const ucConds = challengeKeywords.map(k => `uc.term_name LIKE ?`);
      conditions.push(`(${ucConds.join(' OR ')})`);
      challengeKeywords.forEach(k => params.push(`%${k}%`));
    }
  }

  // Type filter: typeKeywords (from sub-terms) take precedence over broad types
  if (filters.typeKeywords && filters.typeKeywords.length > 0) {
    joins.push('JOIN innovation_types it ON it.innovation_id = i.id');
    const tConds = filters.typeKeywords.map(k => `it.term_name LIKE ?`);
    conditions.push(`(${tConds.join(' OR ')})`);
    filters.typeKeywords.forEach(k => params.push(`%${k}%`));
  } else if (filters.types && filters.types.length > 0) {
    const typeKeywords = [];
    filters.types.forEach(tid => {
      const t = TYPES.find(x => x.id === tid);
      if (t) typeKeywords.push(...t.keywords);
    });
    if (typeKeywords.length > 0) {
      joins.push('JOIN innovation_types it ON it.innovation_id = i.id');
      const tConds = typeKeywords.map(k => `it.term_name LIKE ?`);
      conditions.push(`(${tConds.join(' OR ')})`);
      typeKeywords.forEach(k => params.push(`%${k}%`));
    }
  }

  if (filters.readinessMin && filters.readinessMin > 1) {
    conditions.push(`CAST(SUBSTR(i.readiness_level, 1, 1) AS INTEGER) >= ?`);
    params.push(filters.readinessMin);
  }

  if (filters.adoptionMin && filters.adoptionMin > 1) {
    conditions.push(`CAST(SUBSTR(i.adoption_level, 1, 1) AS INTEGER) >= ?`);
    params.push(filters.adoptionMin);
  }

  if (filters.regions && filters.regions.length > 0) {
    const rConds = filters.regions.map(() => `i.region LIKE ?`);
    conditions.push(`(${rConds.join(' OR ')})`);
    filters.regions.forEach(r => params.push(`%${r}%`));
  }

  // Expand hubRegions to countries, merge with explicit countries filter
  let effectiveCountries = [...(filters.countries || [])];
  if (filters.hubRegions && filters.hubRegions.length > 0) {
    for (const rid of filters.hubRegions) {
      const region = INNOVATION_HUB_REGIONS.find(r => r.id === rid);
      if (region) effectiveCountries.push(...region.countries);
    }
    effectiveCountries = [...new Set(effectiveCountries)];
  }
  if (effectiveCountries.length > 0) {
    joins.push('JOIN innovation_countries ic ON ic.innovation_id = i.id');
    const cConds = effectiveCountries.map(() => `ic.country_name = ?`);
    conditions.push(`(${cConds.join(' OR ')})`);
    effectiveCountries.forEach(c => params.push(c));
  }

  if (filters.sdgs && filters.sdgs.length > 0) {
    joins.push('JOIN innovation_sdgs isd ON isd.innovation_id = i.id');
    const sConds = filters.sdgs.map(() => `isd.sdg_name LIKE ?`);
    conditions.push(`(${sConds.join(' OR ')})`);
    filters.sdgs.forEach(s => params.push(`%Goal ${s}%`));
  }

  if (filters.userGroups && filters.userGroups.length > 0) {
    const userKeywords = [];
    filters.userGroups.forEach(uid => {
      const u = USER_GROUPS.find(x => x.value === uid);
      if (u) userKeywords.push(...u.keywords);
    });
    if (userKeywords.length > 0) {
      joins.push('JOIN innovation_prospective_users ipu ON ipu.innovation_id = i.id');
      const uConds = userKeywords.map(k => `ipu.user_name LIKE ?`);
      conditions.push(`(${uConds.join(' OR ')})`);
      userKeywords.forEach(k => params.push(`%${k}%`));
    }
  }

  if (filters.grassrootsOnly) {
    conditions.push('i.is_grassroots = 1');
  }

  if (filters.sources && filters.sources.length > 0) {
    const sConds = filters.sources.map(() => `i.data_source LIKE ?`);
    conditions.push(`(${sConds.join(' OR ')})`);
    filters.sources.forEach(s => params.push(`%${s}%`));
  }

  return { joins: [...new Set(joins)], conditions, params };
}

export async function searchInnovations(filters = {}, limit = 50, offset = 0) {
  const database = await initDatabase();
  const { joins, conditions, params } = buildFilterQuery(filters);

  const sql = `
    SELECT DISTINCT i.id, i.title, i.short_description, i.long_description,
           i.readiness_level, i.adoption_level, i.region, i.is_grassroots,
           i.owner_text, i.partner_text, i.data_source
    FROM innovations i
    ${joins.join(' ')}
    WHERE ${conditions.join(' AND ')}
    ORDER BY i.readiness_level_id DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await database.getAllAsync(sql, [...params, limit, offset]);
  return await enrichInnovations(rows);
}

export async function countInnovations(filters = {}) {
  const database = await initDatabase();
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

export async function fullTextSearch(query, limit = 50) {
  const database = await initDatabase();
  const rows = await database.getAllAsync(
    `SELECT i.id, i.title, i.short_description, i.long_description,
            i.readiness_level, i.adoption_level, i.region, i.is_grassroots,
            i.owner_text, i.partner_text, i.data_source
     FROM innovations i
     JOIN innovations_fts fts ON fts.rowid = i.id
     WHERE innovations_fts MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [query, limit]
  );
  return await enrichInnovations(rows);
}

async function enrichInnovations(rows) {
  const database = await initDatabase();
  const enriched = [];

  // Pre-load thumbs up counts for this batch of innovations in a single query
  const thumbsUpMap = {};
  const ids = rows.map(r => r.id).filter(id => id != null);
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const thumbRows = await database.getAllAsync(
      `SELECT innovation_id, thumbs_up_count
       FROM innovation_thumbs_up_counts
       WHERE innovation_id IN (${placeholders})`,
      ids
    );
    thumbRows.forEach(tr => {
      thumbsUpMap[tr.innovation_id] = tr.thumbs_up_count;
    });
  }

  for (const row of rows) {
    const countries = await database.getAllAsync(
      'SELECT country_name FROM innovation_countries WHERE innovation_id = ?',
      [row.id]
    );

    const types = await database.getAllAsync(
      'SELECT term_name FROM innovation_types WHERE innovation_id = ?',
      [row.id]
    );

    const sdgs = await database.getAllAsync(
      'SELECT sdg_name FROM innovation_sdgs WHERE innovation_id = ?',
      [row.id]
    );

    const useCases = await database.getAllAsync(
      'SELECT term_name FROM innovation_use_cases WHERE innovation_id = ?',
      [row.id]
    );

    const users = await database.getAllAsync(
      'SELECT user_name FROM innovation_prospective_users WHERE innovation_id = ?',
      [row.id]
    );

    const readinessMatch = row.readiness_level ? row.readiness_level.match(/^(\d+)/) : null;
    const readinessNum = readinessMatch ? parseInt(readinessMatch[1]) : 1;

    const adoptionMatch = row.adoption_level ? row.adoption_level.match(/^(\d+)/) : null;
    const adoptionNum = adoptionMatch ? parseInt(adoptionMatch[1]) : 1;

    const typeNames = types.map(t => t.term_name);
    const useCaseNames = useCases.map(u => u.term_name);
    const userNames = users.map(u => u.user_name.replace(/&#039;/g, "'"));
    // Cost and complexity are derived in memory from read-only data; never written back to the database.
    const costComplexitySignals = {
      types: typeNames,
      useCases: useCaseNames,
      users: userNames,
      shortDescription: row.short_description || '',
      longDescription: row.long_description || '',
      isGrassroots: row.is_grassroots === 1,
    };

    enriched.push({
      id: row.id,
      title: row.title,
      shortDescription: row.short_description || '',
      longDescription: row.long_description || '',
      readinessLevel: readinessNum,
      readinessName: row.readiness_level || '',
      adoptionLevel: adoptionNum,
      adoptionName: row.adoption_level || '',
      region: row.region || '',
      isGrassroots: row.is_grassroots === 1,
      owner: row.owner_text || '',
      partner: row.partner_text || '',
      dataSource: row.data_source || '',
      countries: countries.map(c => c.country_name),
      types: typeNames,
      sdgs: sdgs.map(s => {
        const match = s.sdg_name.match(/Goal (\d+)/);
        return match ? parseInt(match[1]) : null;
      }).filter(Boolean),
      useCases: useCaseNames,
      users: userNames,
      cost: deriveCost(costComplexitySignals),
      complexity: deriveComplexity(costComplexitySignals),
      thumbsUpCount: thumbsUpMap[row.id] ?? 0,
    });
  }

  return enriched;
}

export async function getInnovationById(id) {
  const database = await initDatabase();
  const row = await database.getFirstAsync(
    `SELECT i.id, i.title, i.short_description, i.long_description,
            i.readiness_level, i.adoption_level, i.region, i.is_grassroots,
            i.owner_text, i.partner_text, i.data_source
     FROM innovations i WHERE i.id = ?`,
    [id]
  );
  if (!row) return null;
  const [enriched] = await enrichInnovations([row]);
  return enriched;
}

// Anonymous, click-based "thumbs up" tracking (no user authentication).
export async function incrementThumbsUp(innovationId) {
  if (innovationId == null) return;
  const database = await initDatabase();
  await database.runAsync(
    `INSERT INTO innovation_thumbs_up_counts (innovation_id, thumbs_up_count)
     VALUES (?, 1)
     ON CONFLICT(innovation_id) DO UPDATE SET thumbs_up_count = thumbs_up_count + 1`,
    [innovationId]
  );
}

// Anonymous comments per innovation (no authentication).
export async function getCommentsForInnovation(innovationId) {
  if (innovationId == null) return [];
  const database = await initDatabase();
  return await database.getAllAsync(
    `SELECT id,
            innovation_id   as innovationId,
            author_name     as authorName,
            body,
            created_at      as createdAt
     FROM innovation_comments
     WHERE innovation_id = ?
     ORDER BY datetime(created_at) DESC, id DESC`,
    [innovationId]
  );
}

export async function addCommentToInnovation(innovationId, authorName, body) {
  if (innovationId == null) return;
  const name = (authorName || '').trim();
  const text = (body || '').trim();
  if (!name || !text) return;
  const database = await initDatabase();
  await database.runAsync(
    `INSERT INTO innovation_comments (innovation_id, author_name, body)
     VALUES (?, ?, ?)`,
    [innovationId, name, text]
  );
}

export async function getAllCountries() {
  const database = await initDatabase();
  return await database.getAllAsync(
    'SELECT country_name as name, COUNT(*) as count FROM innovation_countries GROUP BY country_name ORDER BY country_name'
  );
}

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
