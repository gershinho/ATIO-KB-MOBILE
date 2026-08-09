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
import { CHALLENGES, TYPES } from '../data/constants';
import { INNOVATION_HUB_REGIONS } from '../data/innovationHubRegions';
import {
  hasDerivedFilters,
  filterByCostAndComplexity,
  collectFilteredPage,
  countFiltered,
} from './paginate';
import { buildKeywordLikeClause } from './likeClause';
import { buildFilterQuery } from './filterQuery';
import { initDatabase } from './connection';
import { enrichInnovations, deriveCostComplexityForRows } from './enrich';
import { createLogger } from '../utils/logger';

// Re-exported because screens and hooks already reach the data layer through
// this module, and splitting the file should not move every call site.
export { initDatabase } from './connection';

const log = createLogger('ATIO DB');

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
export function parseLeadingLevel(value, fallback = 1) {
  const match = value != null ? String(value).match(/^(\d+)/) : null;
  return match ? parseInt(match[1], 10) : fallback;
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
  if (!hasDerivedFilters(filters)) {
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

  if (hasDerivedFilters(filters)) {
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
    log.failed('Help-innovation FTS query failed:', err);
    return [];
  }
  // Zero matches is a real answer, not an error — no help resources exist for
  // this query, and recent innovations are not a substitute.
  return await enrichInnovations(rows);
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
