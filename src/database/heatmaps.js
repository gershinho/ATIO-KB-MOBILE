/**
 * Derived analytics over the catalogue: the two heat maps.
 *
 * Split out of db.js, which had grown past a thousand lines by holding three
 * separable things — the catalogue queries, the engagement writes, and these
 * grid builders. A heat map scans every innovation and reshapes it into a grid;
 * nothing else in the data layer works that way, and nothing else needs
 * session-length memoization.
 */
import { CHALLENGES, TYPES, COUNTRY_TO_REGION } from '../data/constants';
import { INNOVATION_HUB_REGIONS } from '../data/innovationHubRegions';
import { initDatabase } from './connection';
import { parseLeadingLevel } from './levels';

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
 * Group child-table rows by innovation id.
 *
 * Written out four times here — the same three-line accumulate loop — while the
 * sibling module enrich.js already had collectByInnovationId for exactly this
 * shape, with a docstring explaining that writing it once was the point. That
 * one takes an id list and issues its own query; these two heat maps read whole
 * tables, so this is the same idea over rows already in hand.
 *
 * @param {Array<object>} rows - each carrying innovation_id
 * @param {string} column - the field to collect
 * @returns {Object<string, Array>} plain object, which is what the cell loops want
 */
function groupByInnovationId(rows, column) {
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.innovation_id]) grouped[row.innovation_id] = [];
    grouped[row.innovation_id].push(row[column]);
  }
  return grouped;
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

  const innovations = await database.getAllAsync(
    'SELECT i.id, i.readiness_level, i.adoption_level FROM innovations i'
  );

  const allCountries = await database.getAllAsync(
    'SELECT innovation_id, country_name FROM innovation_countries'
  );
  const allUseCases = await database.getAllAsync(
    'SELECT innovation_id, term_name FROM innovation_use_cases'
  );

  const countriesByInnovation = groupByInnovationId(allCountries, 'country_name');
  const useCasesByInnovation = groupByInnovationId(allUseCases, 'term_name');

  const rows = INNOVATION_HUB_REGIONS.map((r) => r.name);
  const cols = CHALLENGES.map((c) => ({ id: c.id, name: c.name }));

  const cells = {};
  for (const r of rows) {
    cells[r] = {};
    for (const col of cols) {
      cells[r][col.id] = { count: 0, sumReadiness: 0, sumAdoption: 0 };
    }
  }

  for (const innovation of innovations) {
    const readiness = parseLeadingLevel(innovation.readiness_level);
    const adoption = parseLeadingLevel(innovation.adoption_level);
    const countries = countriesByInnovation[innovation.id] || [];
    const useCases = useCasesByInnovation[innovation.id] || [];

    const regionNames = [...new Set(countries.map((c) => COUNTRY_TO_REGION[c]).filter(Boolean))];
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
 * "challengeId::typeId" string here rather than nested by row, because this grid
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

  const useCasesByInnovation = groupByInnovationId(allUseCases, 'term_name');
  const typesByInnovation = groupByInnovationId(allTypes, 'term_name');

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

  for (const innovation of innovations) {
    const readiness = parseLeadingLevel(innovation.readiness_level, null);
    if (readiness == null) continue;

    const useCases = useCasesByInnovation[innovation.id] || [];
    const typeTerms = typesByInnovation[innovation.id] || [];

    const challengeIds = CHALLENGES.filter((c) =>
      useCases.some((uc) => termMatchesKeywords(uc, c.keywords))
    ).map((c) => c.id);
    const typeIds = TYPES.filter((t) =>
      typeTerms.some((tt) => termMatchesKeywords(tt, t.keywords))
    ).map((t) => t.id);

    if (challengeIds.length === 0 || typeIds.length === 0) continue;

    for (const cid of challengeIds) {
      for (const tid of typeIds) {
        // Every CHALLENGES x TYPES pair is seeded above and both id sets are
        // drawn from those same taxonomies, so there is no cell to create here.
        const key = `${cid}::${tid}`;
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
