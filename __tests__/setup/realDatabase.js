import { DatabaseSync } from 'node:sqlite';

/**
 * A real SQLite database for the data-layer tests.
 *
 * ## Why this exists
 *
 * db.js, enrich.js, engagement.js and heatmaps.js were replaced wholesale by
 * jest.mock factories everywhere they appeared, so no test had ever run one of
 * their queries. The whole point of those modules is the SQL: the joins, the
 * GROUP BY, the LIKE escaping, the N+1 collapse. A fake that returns canned rows
 * verifies the shape of the JavaScript around the SQL and nothing about the SQL,
 * which is where the bugs live.
 *
 * ## Why not the bundled database
 *
 * `assets/db/atiokb.db` is 37MB of real records and is never to be modified. A
 * test that reads it would be slow, and any test that writes — engagement.js
 * only writes — could not use it at all. The fixture below carries the real
 * schema and a handful of purpose-built rows, so assertions can name exact
 * expected values instead of whatever the catalogue happens to contain.
 *
 * ## Why node:sqlite
 *
 * It ships with Node, so real SQL in tests costs no new dependency. Its API is
 * synchronous; expo-sqlite's is async. The adapter below is the whole bridge —
 * four methods, each awaiting nothing, so the async surface the app codes
 * against behaves identically over a synchronous engine.
 */

/** The subset of the real schema the app queries. Column names must match. */
const SCHEMA = `
  CREATE TABLE innovations (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    short_description TEXT,
    long_description TEXT,
    readiness_level TEXT,
    readiness_level_id INTEGER,
    adoption_level TEXT,
    adoption_level_id INTEGER,
    country_origin TEXT,
    region TEXT,
    region_id INTEGER,
    is_grassroots INTEGER DEFAULT 0,
    owner_text TEXT,
    partner_text TEXT,
    data_source TEXT,
    data_source_id INTEGER
  );
  CREATE TABLE innovation_types (
    innovation_id INTEGER NOT NULL, term_id INTEGER NOT NULL, term_name TEXT,
    PRIMARY KEY (innovation_id, term_id)
  );
  CREATE TABLE innovation_use_cases (
    innovation_id INTEGER NOT NULL, term_id INTEGER NOT NULL, term_name TEXT,
    PRIMARY KEY (innovation_id, term_id)
  );
  CREATE TABLE innovation_countries (
    innovation_id INTEGER NOT NULL, term_id INTEGER NOT NULL, country_name TEXT,
    PRIMARY KEY (innovation_id, term_id)
  );
  CREATE TABLE innovation_sdgs (
    innovation_id INTEGER NOT NULL, term_id INTEGER NOT NULL, sdg_name TEXT,
    PRIMARY KEY (innovation_id, term_id)
  );
  CREATE TABLE innovation_prospective_users (
    innovation_id INTEGER NOT NULL, term_id INTEGER NOT NULL, user_name TEXT,
    PRIMARY KEY (innovation_id, term_id)
  );
  CREATE TABLE data_sources (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, use_cases_description TEXT
  );
  CREATE VIRTUAL TABLE innovations_fts USING fts5(title, short_description, long_description, content='');
`;

/**
 * expo-sqlite's async surface over node:sqlite's synchronous one.
 *
 * Only the four methods the app actually calls. Anything the data layer starts
 * using will fail loudly here rather than silently passing against a mock that
 * happened to define it.
 */
function asExpoSqlite(db) {
  return {
    getAllAsync: async (sql, params = []) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql, params = []) => db.prepare(sql).get(...params) ?? null,
    runAsync: async (sql, params = []) => db.prepare(sql).run(...params),
    execAsync: async (sql) => db.exec(sql),
  };
}

/**
 * Rows chosen so every branch of the filter builder has something to match and
 * something to miss: two regions, a grassroots record and a non-grassroots one,
 * one record with no child rows at all, and — deliberately — a data source whose
 * name contains an underscore, which is a LIKE wildcard unless escaped.
 */
const FIXTURE = {
  innovations: [
    [1, 'Solar Dryer', 'Dries produce', 'A solar dryer for smallholders', '7 - Proven', 7, '3 - Early', 3, 'Kenya', 'East Africa', 1, 1, 'Owner A', 'Partner A', 'ATIO_KB', 1],
    [2, 'Drip Kit', 'Saves water', 'A low-cost drip irrigation kit', '4 - Prototype', 4, '2 - Pilot', 2, 'India', 'South Asia', 2, 0, 'Owner B', 'Partner B', 'Other Source', 2],
    [3, 'Seed Tracker', 'Tracks seed', 'A digital seed traceability tool', '9 - Scaled', 9, '5 - Wide', 5, 'Kenya', 'East Africa', 1, 0, 'Owner C', null, 'ATIO_KB', 1],
    [4, 'Orphan Record', 'No children', 'Has no taxonomy rows at all', null, null, null, null, null, 'East Africa', 1, 0, null, null, 'ATIO_KB', 1],
    // Differs from 'ATIO_KB' only where the underscore is. An unescaped LIKE
    // pattern treats that underscore as "any single character", so a search for
    // ATIO_KB would wrongly return this row too.
    [5, 'Wildcard Trap', 'Decoy', 'Exists to catch an unescaped LIKE', '2 - Idea', 2, '1 - None', 1, 'India', 'South Asia', 2, 0, null, null, 'ATIOxKB', 3],
  ],
  innovation_types: [
    [1, 10, 'Machinery and equipment'],
    [2, 10, 'Machinery and equipment'],
    [3, 11, 'Digital tools'],
  ],
  innovation_use_cases: [
    [1, 20, 'Post-harvest losses'],
    [2, 21, 'Water scarcity'],
    [3, 22, 'Seed systems'],
  ],
  innovation_countries: [
    [1, 30, 'Kenya'],
    [2, 31, 'India'],
    [3, 30, 'Kenya'],
  ],
  innovation_sdgs: [
    [1, 40, 'Goal 2: Zero Hunger'],
    [2, 41, 'Goal 6: Clean Water'],
    [3, 40, 'Goal 2: Zero Hunger'],
  ],
  innovation_prospective_users: [
    [1, 50, 'Smallholder farmers'],
    [2, 50, 'Smallholder farmers'],
    [3, 51, 'Extension officers'],
  ],
  data_sources: [
    [1, 'ATIO_KB', 'The main catalogue', 'Use cases'],
    [2, 'Other Source', 'A second catalogue', 'Use cases'],
    [3, 'ATIOxKB', 'The decoy source', 'Use cases'],
  ],
};

/** The auxiliary tables connection.js creates at runtime, created here too. */
const AUX_SCHEMA = `
  CREATE TABLE IF NOT EXISTS innovation_thumbs_up_counts (
    innovation_id INTEGER PRIMARY KEY,
    thumbs_up_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS innovation_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    innovation_id INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS innovation_bullet_cache (
    innovation_id INTEGER PRIMARY KEY,
    bullets TEXT NOT NULL
  );
`;

/**
 * Build a fresh in-memory database and return it as an expo-sqlite lookalike.
 *
 * In-memory and rebuilt per test, so a test that writes cannot affect the next
 * one and nothing on disk is touched.
 *
 * @returns {{database: object, raw: import('node:sqlite').DatabaseSync}}
 */
export default function createTestDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  db.exec(AUX_SCHEMA);

  for (const [table, rows] of Object.entries(FIXTURE)) {
    if (rows.length === 0) continue;
    const placeholders = rows[0].map(() => '?').join(', ');
    const insert = db.prepare(`INSERT INTO ${table} VALUES (${placeholders})`);
    for (const row of rows) insert.run(...row);
  }

  // The FTS table is contentless, so rows are pushed in explicitly.
  const fts = db.prepare(
    'INSERT INTO innovations_fts(rowid, title, short_description, long_description) VALUES (?, ?, ?, ?)'
  );
  for (const row of FIXTURE.innovations) fts.run(row[0], row[1], row[2], row[3]);

  return { database: asExpoSqlite(db), raw: db };
}

export { FIXTURE };
