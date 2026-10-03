/**
 * Web twin of heatmaps.js: the same two grids, from the catalogue pass.
 *
 * The maths is not duplicated — both platforms call the builders in
 * heatmapGrids.js. What differs is where the rows come from: SQLite on the
 * phone, and here the single pass over the portal that catalogIndex.js makes
 * and keeps for a few hours.
 *
 * Which is the whole reason the heat maps needed a pass at all. Each cell holds
 * an *average* — of readiness, and of adoption — and no count endpoint can
 * produce an average. `meta.count` will not change that when it arrives.
 */
import { buildOpportunityGrid, buildReadyToUseGrid } from './heatmapGrids';
import { loadCatalogIndex, resetCatalogIndex } from '../api/jsonapi/catalogIndex';

/**
 * Memoize for the session, holding the promise rather than the value.
 *
 * Same reasoning as the native module: Home can ask for both grids at once, and
 * a second caller arriving mid-computation should join the first rather than
 * start another. A rejection is not kept, so a failure at startup does not
 * poison the rest of the session.
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
 * Region × Challenge, scored by how far readiness runs ahead of adoption.
 *
 * @returns {Promise<{rows: string[], cols: string[], colNames: object, cells: object}>}
 */
export const getOpportunityHeatmapData = memoizeForSession(async () => {
  const { rows } = await loadCatalogIndex();
  return buildOpportunityGrid(rows);
});

/**
 * Challenge × Type, scored by average readiness.
 *
 * `readinessExact` rather than `readiness`: this grid skips records with no
 * level, where the opportunity grid counts them at the bundled build's
 * fallback of 1. The pass stores both readings so neither grid has to settle
 * for the other's.
 *
 * @returns {Promise<{rows: object[], cols: object[], cells: object,
 *   minReadiness: number, maxReadiness: number}>}
 */
export const getReadyToUseHeatmapData = memoizeForSession(async () => {
  const { rows } = await loadCatalogIndex();
  return buildReadyToUseGrid(rows.map((row) => ({ ...row, readiness: row.readinessExact })));
});

/** Drop both grids, and the pass behind them, so the next request rebuilds. */
export function resetHeatmapCaches() {
  getOpportunityHeatmapData.reset();
  getReadyToUseHeatmapData.reset();
  resetCatalogIndex();
}
