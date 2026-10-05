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
import { STORES, idbGet, idbPut, idbDelete, isIndexedDbAvailable } from '../storage/idb';
import { createLogger } from '../utils/logger';

const log = createLogger('heatmaps');

/**
 * Where the computed grids are kept between sessions.
 *
 * The card lists them alongside the taxonomies as things IndexedDB should hold,
 * and they are cheap to keep: two grids of a few hundred cells against the
 * 6,287-row pass they are derived from.
 *
 * Keyed on the pass's own `builtAt` rather than a lifetime of their own. A grid
 * is a pure function of those rows, so it is current exactly as long as they
 * are — and when the pass refreshes, the mismatch rebuilds them without anyone
 * having to remember to invalidate anything.
 */
const GRID_CACHE_KEY = 'heatmapGrids';

/** The stored grid for `name`, if it was built from the rows we now hold. */
async function readGrid(name, builtAt) {
  if (!isIndexedDbAvailable()) return null;
  try {
    const cached = await idbGet(STORES.meta, GRID_CACHE_KEY);
    if (!cached || cached.builtAt !== builtAt) return null;
    return cached[name] ?? null;
  } catch (err) {
    log.degraded('could not read the stored grids:', err?.message);
    return null;
  }
}

/**
 * Store one grid against the pass it came from.
 *
 * Read-modify-write rather than two keys: the two grids share a `builtAt`, and
 * splitting them would let one be current while the other was not.
 */
async function writeGrid(name, builtAt, grid) {
  if (!isIndexedDbAvailable()) return;
  try {
    const cached = await idbGet(STORES.meta, GRID_CACHE_KEY);
    const base = cached?.builtAt === builtAt ? cached : { builtAt };
    await idbPut(STORES.meta, GRID_CACHE_KEY, { ...base, builtAt, [name]: grid });
  } catch (err) {
    // Quota, or a grid holding something structuredClone will not take. The
    // grid was computed and is being returned either way.
    log.degraded('could not store a grid:', err?.message);
  }
}

/** Build a grid, or hand back the stored one if the rows have not moved. */
async function cachedGrid(name, build) {
  const { rows, builtAt } = await loadCatalogIndex();

  const stored = await readGrid(name, builtAt);
  if (stored) return stored;

  const grid = build(rows);
  await writeGrid(name, builtAt, grid);
  return grid;
}

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
export const getOpportunityHeatmapData = memoizeForSession(() =>
  cachedGrid('opportunity', buildOpportunityGrid)
);

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
export const getReadyToUseHeatmapData = memoizeForSession(() =>
  cachedGrid('readyToUse', (rows) =>
    buildReadyToUseGrid(rows.map((row) => ({ ...row, readiness: row.readinessExact })))
  )
);

/** Drop both grids, and the pass behind them, so the next request rebuilds. */
export function resetHeatmapCaches() {
  getOpportunityHeatmapData.reset();
  getReadyToUseHeatmapData.reset();
  resetCatalogIndex();
  if (isIndexedDbAvailable()) {
    idbDelete(STORES.meta, GRID_CACHE_KEY).catch(() => {});
  }
}
