/**
 * Answering the Explore landing page from the device.
 *
 * Five things fill that page, and offline they divide in two. The three grids —
 * challenges, types, hub regions — are counted from the catalogue pass, which
 * caches its rows in IndexedDB and serves them stale when the portal cannot be
 * reached, so they already work. The two above them do not: the headline
 * figures come from a live count, and "most advanced" from a live query, and
 * both throwing is what put "Could not load database" over the whole page —
 * wrong twice over, since on web there is no database and the grids below could
 * have rendered.
 *
 * So both are answered from storage instead. The headline count is the cached
 * catalogue's row count, which is the same number by construction: the pass
 * walks every published innovation and keeps one row each. The most advanced
 * come from the cached records, which is a hundred-odd rather than six thousand
 * — so this is the most advanced of what is saved, and the page says so.
 *
 * Web only. The phone holds the whole catalogue in SQLite and has nothing to
 * fall back from.
 */
import { peekCatalogIndex } from '../api/jsonapi/catalogIndex';
import { loadTaxonomies, termNames } from '../api/jsonapi/taxonomies';
import { STORES, idbGetAll, isIndexedDbAvailable } from './idb';
import { createLogger } from '../utils/logger';

const log = createLogger('cached-explore');

/** How many SDGs there are. Fixed, and not worth a request even when online. */
const SDG_COUNT = 17;

/** The cached records, most advanced first. */
async function mostAdvancedCached(limit) {
  if (!isIndexedDbAvailable()) return [];
  try {
    const records = await idbGetAll(STORES.innovations);
    return records
      .map((record) => record?.data)
      .filter((innovation) => innovation && innovation.readinessLevel != null)
      .sort((a, b) => (b.readinessLevel ?? 0) - (a.readinessLevel ?? 0))
      .slice(0, limit)
      .map((innovation) => ({ ...innovation, availableOffline: true }));
  } catch (err) {
    log.degraded('could not read the cached records:', err?.message);
    return [];
  }
}

/**
 * What the device can put on the Explore page, or null if it can put nothing.
 *
 * Null rather than zeroes: a page of zeroes reads as "there are no innovations",
 * which is a far worse lie than an error message. The caller shows its error
 * when this returns null.
 *
 * @param {{advancedLimit?: number}} [options]
 * @returns {Promise<{stats: object, mostAdvanced: Array, cachedCount: number}|null>}
 */
export async function exploreFromCache({ advancedLimit = 5 } = {}) {
  const index = await peekCatalogIndex();
  if (!index?.rows?.length) {
    log.degraded('no catalogue on this device, so Explore has nothing to show');
    return null;
  }

  // Both of these serve their stale copy when the portal is unreachable, which
  // is the whole reason they are cached.
  let countries = 0;
  try {
    const { byType } = await loadTaxonomies({});
    countries = termNames(byType, 'taxonomy_term--countries').length;
  } catch (err) {
    log.degraded('no cached vocabularies, so the country figure is omitted:', err?.message);
  }

  return {
    stats: { innovations: index.rows.length, countries, sdgs: SDG_COUNT },
    mostAdvanced: await mostAdvancedCached(advancedLimit),
    cachedCount: index.rows.length,
  };
}
