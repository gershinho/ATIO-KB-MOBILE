/**
 * Turning raw innovation rows into the shape the UI consumes.
 *
 * One seam, one job: everything that reads a row out of the innovations table
 * and expands it with its related countries, types, SDGs, use cases and users,
 * plus engagement counts and the derived cost and complexity. Separated from
 * db.js so the query functions there read as queries rather than as queries
 * plus a hundred lines of row reshaping.
 */
import { deriveCost, deriveComplexity } from '../data/constants';
import { initDatabase } from './connection';
import { parseLeadingLevel } from './levels';

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
 * @property {'low'|'med'|'high'} cost - derived in memory, never stored; see COST_LEVELS
 * @property {'simple'|'moderate'|'advanced'} complexity - derived in memory, never stored
 * @property {number} thumbsUpCount
 * @property {number} commentCount
 */

/**
 * Group one column of a child table by innovation_id for a batch of ids.
 *
 * Every child-table lookup in this file has the same shape — select a column
 * keyed by innovation_id, bucket the rows per innovation — so it is written
 * once. Doing it per innovation instead is what made enrichInnovations issue
 * five queries per row.
 */
export async function collectByInnovationId(database, table, column, ids) {
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
 * Attach cost/complexity to raw rows using three batched lookups.
 *
 * enrichInnovations does the same derivation, but issues five queries per row
 * to also assemble countries, SDGs and display fields. Counting needs none of
 * that, so this stays O(1) queries regardless of how many rows are scanned.
 */
export async function deriveCostComplexityForRows(database, rows) {
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
 * Expand innovation rows into the shape the UI consumes: related countries,
 * types, SDGs, use cases and prospective users, plus engagement counts and the
 * derived cost/complexity.
 *
 * Seven queries total, regardless of how many rows are passed. This used to
 * batch the two count lookups and then issue five more per row inside the same
 * loop, so a 30-row drilldown cost 152 round trips instead of 7.
 *
 * @param {Array<object>} rows - raw innovation rows from the innovations table
 * @returns {Promise<Innovation[]>}
 */
export async function enrichInnovations(rows) {
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

