/**
 * Searching what is already on the device.
 *
 * The offline card raises the case against keeping only what people pin — "a
 * user who never bookmarks sees no offline content" — and then strikes out the
 * preload that would have answered it. So what is on the device is what the
 * user put there: bookmarks, downloads, and the records they opened.
 *
 * Until this module nothing could reach any of it. They were stored, evicted
 * correctly, and invisible, because every route to a record is a live query
 * that fails with no connection.
 *
 * So when a filtered list cannot be fetched, it is answered from the cache
 * instead: everything bookmarked or downloaded, and everything read recently.
 * A partial list that says it is partial beats an error page over a store that
 * holds the answer.
 *
 * The filters are applied here in JavaScript rather than sent anywhere, which
 * means the matching has to agree with filterSpec.js — the same keywords
 * against the same term names. Where they disagree the offline list is wrong
 * in a way nobody can see, so the tests check the two together.
 *
 * Web only, like its neighbours: the phone has the whole catalogue in SQLite.
 */
import { CHALLENGES, TYPES, USER_GROUPS } from '../data/constants';
import { INNOVATION_HUB_REGIONS } from '../data/innovationHubRegions';
import { filterByCostAndComplexity } from '../database/paginate';
import { STORES, idbGetAll, isIndexedDbAvailable } from './idb';
import { createLogger } from '../utils/logger';

const log = createLogger('cached-search');

/** Case-insensitive substring match, as the SQL LIKE and the portal's CONTAINS do. */
const containsAny = (values, keywords) =>
  (keywords ?? []).some((keyword) => {
    const needle = String(keyword).toLowerCase();
    return (values ?? []).some((value) => String(value).toLowerCase().includes(needle));
  });

/** Every keyword behind the chosen entries of a constant list. */
function keywordsFor(list, ids, idKey = 'id') {
  const keywords = [];
  for (const id of ids ?? []) {
    const entry = list.find((x) => x[idKey] === id);
    if (entry) keywords.push(...entry.keywords);
  }
  return keywords;
}

/**
 * Does one cached innovation satisfy the filter bag?
 *
 * Mirrors buildFilterSpec: sub-term keywords take precedence over the broad
 * entry, hub regions expand to their countries, levels are minimums, and an
 * absent filter narrows nothing.
 */
export function matchesFilters(innovation, filters = {}) {
  const challengeKeywords = filters.challengeKeywords?.length
    ? filters.challengeKeywords
    : keywordsFor(CHALLENGES, filters.challenges);
  if (challengeKeywords.length && !containsAny(innovation.useCases, challengeKeywords)) return false;

  const typeKeywords = filters.typeKeywords?.length
    ? filters.typeKeywords
    : keywordsFor(TYPES, filters.types);
  if (typeKeywords.length && !containsAny(innovation.types, typeKeywords)) return false;

  const userKeywords = keywordsFor(USER_GROUPS, filters.userGroups, 'value');
  if (userKeywords.length && !containsAny(innovation.users, userKeywords)) return false;

  const countries = new Set(filters.countries ?? []);
  for (const id of filters.hubRegions ?? []) {
    const region = INNOVATION_HUB_REGIONS.find((r) => r.id === id);
    for (const country of region?.countries ?? []) countries.add(country);
  }
  if (countries.size && !(innovation.countries ?? []).some((c) => countries.has(c))) return false;

  if (filters.regions?.length && !containsAny([innovation.region], filters.regions)) return false;
  if (filters.sources?.length && !containsAny([innovation.dataSource], filters.sources)) return false;

  // "Goal 2:" with the colon, so goal 1 does not match goal 15 — the same
  // reading filterSpec.js and the SQL builder take.
  if (filters.sdgs?.length && !(filters.sdgs ?? []).some((n) => (innovation.sdgs ?? []).includes(n))) {
    return false;
  }

  if (filters.readinessMin > 1 && !(innovation.readinessLevel >= filters.readinessMin)) return false;
  if (filters.adoptionMin > 1 && !(innovation.adoptionLevel >= filters.adoptionMin)) return false;
  if (filters.grassrootsOnly && !innovation.isGrassroots) return false;

  return true;
}

/**
 * The cached records matching `filters`, newest copy first.
 *
 * @param {object} [filters] - an InnovationFilters bag
 * @param {{limit?: number, offset?: number}} [options]
 * @returns {Promise<{results: Array<object>, total: number}>} `total` is how
 *   many the cache holds, not how many exist — the caller says so on screen.
 */
export async function searchCached(filters = {}, { limit = 10, offset = 0 } = {}) {
  if (!isIndexedDbAvailable()) return { results: [], total: 0 };

  try {
    const records = await idbGetAll(STORES.innovations);
    const matching = records
      .filter((record) => record?.data && matchesFilters(record.data, filters))
      // Most recently cached first, which is the closest thing the cache has
      // to the portal's "most recently updated".
      .sort((a, b) => (b.cachedAt ?? 0) - (a.cachedAt ?? 0))
      // Marks every row as served from storage, which is what puts the
      // "Available offline" badge on the record when it is opened.
      .map((record) => ({ ...record.data, availableOffline: true }));

    const kept = filterByCostAndComplexity(matching, filters);
    return { results: kept.slice(offset, offset + limit), total: kept.length };
  } catch (err) {
    log.degraded('could not search the cache:', err?.message);
    return { results: [], total: 0 };
  }
}
