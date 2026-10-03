/**
 * Derived analytics over the bundled catalogue: the two heat maps.
 *
 * Split out of db.js, which had grown past a thousand lines by holding three
 * separable things — the catalogue queries, the engagement writes, and these
 * grid builders. A heat map scans every innovation and reshapes it into a grid;
 * nothing else in the data layer works that way, and nothing else needs
 * session-length memoization.
 *
 * What a grid *is* now lives in heatmapGrids.js, which takes plain rows and
 * knows nothing about where they came from. This file's job is the reading:
 * three queries, grouped into those rows. The web build collects the same rows
 * from the portal and calls the same builders, so the two platforms cannot
 * drift into disagreeing about what a cell means.
 */
import { initDatabase } from './connection';
import { parseLeadingLevel } from './levels';
import { buildOpportunityGrid, buildReadyToUseGrid } from './heatmapGrids';

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

  return buildOpportunityGrid(innovations.map((innovation) => ({
    // parseLeadingLevel's own fallback of 1 where the label has no leading
    // digit, which is what this grid has always done: an unlevelled record
    // counts towards a cell and is averaged in as the lowest level rather than
    // excluded from it. Deliberately not 0 — matching the bundled build's
    // numbers mattered more here than tidying a reading nobody has questioned.
    readiness: parseLeadingLevel(innovation.readiness_level),
    adoption: parseLeadingLevel(innovation.adoption_level),
    countries: countriesByInnovation[innovation.id] || [],
    useCases: useCasesByInnovation[innovation.id] || [],
  })));
});

/**
 * Challenge × Type readiness grid.
 *
 * Uses the same top-level key names as getOpportunityHeatmapData ({rows, cols,
 * cells}) — this returned `columns` before, so the two sibling APIs read
 * differently at every call site. The `cells` value is keyed by a composite
 * "challengeId::typeId" string here rather than nested by row, because this
 * grid is sparse where the other is dense.
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

  return buildReadyToUseGrid(innovations.map((innovation) => ({
    // Null, not 0: this grid is about readiness, so a record that does not
    // state one is skipped rather than averaged in as the lowest possible.
    readiness: parseLeadingLevel(innovation.readiness_level, null),
    useCases: useCasesByInnovation[innovation.id] || [],
    types: typesByInnovation[innovation.id] || [],
  })));
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
