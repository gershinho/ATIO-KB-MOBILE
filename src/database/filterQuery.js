/**
 * Translate the app's filters object into SQL fragments.
 *
 * This is the core filter-to-SQL translation behind every list in the app, and
 * it had no test coverage because it lived inside db.js, which cannot be
 * imported outside the app (expo-sqlite, expo-asset and expo-file-system all
 * load at module scope). Moved here, free of those imports, so it can be
 * exercised directly.
 *
 * Every LIKE fragment is built with buildKeywordLikeClause so % and _ inside a
 * keyword are escaped rather than treated as wildcards. Parameters were always
 * bound, so this was never injectable; it was a correctness bug — a source or
 * region containing _ would match any single character in its place.
 *
 * Note what it does NOT handle: `cost` and `complexity`. Those are derived in
 * JavaScript from description text, so they cannot appear in a WHERE clause and
 * are applied after the query runs — see paginate.js.
 */
/**
 * @typedef {import('./db').InnovationFilters} InnovationFilters
 */

import { buildKeywordLikeClause } from './likeClause';
import { CHALLENGES, TYPES, USER_GROUPS } from '../data/constants';
import { INNOVATION_HUB_REGIONS } from '../data/innovationHubRegions';

/**
 * @param {InnovationFilters} filters
 * @returns {{joins: string[], conditions: string[], params: Array}}
 *   `conditions` always starts with '1=1' so callers can join with ' AND '
 *   unconditionally.
 */
export function buildFilterQuery(filters) {
  let joins = [];
  let conditions = ['1=1'];
  let params = [];

  // Challenge filter: challengeKeywords (from sub-terms) take precedence over broad challenges
  if (filters.challengeKeywords && filters.challengeKeywords.length > 0) {
    joins.push('JOIN innovation_use_cases uc ON uc.innovation_id = i.id');
    const uc = buildKeywordLikeClause('uc.term_name', filters.challengeKeywords);
    conditions.push(`(${uc.clause})`);
    params.push(...uc.params);
  } else if (filters.challenges && filters.challenges.length > 0) {
    const challengeKeywords = [];
    filters.challenges.forEach(cid => {
      const c = CHALLENGES.find(x => x.id === cid);
      if (c) challengeKeywords.push(...c.keywords);
    });
    if (challengeKeywords.length > 0) {
      joins.push('JOIN innovation_use_cases uc ON uc.innovation_id = i.id');
      const uc = buildKeywordLikeClause('uc.term_name', challengeKeywords);
      conditions.push(`(${uc.clause})`);
      params.push(...uc.params);
    }
  }

  // Type filter: typeKeywords (from sub-terms) take precedence over broad types
  if (filters.typeKeywords && filters.typeKeywords.length > 0) {
    joins.push('JOIN innovation_types it ON it.innovation_id = i.id');
    const it = buildKeywordLikeClause('it.term_name', filters.typeKeywords);
    conditions.push(`(${it.clause})`);
    params.push(...it.params);
  } else if (filters.types && filters.types.length > 0) {
    const typeKeywords = [];
    filters.types.forEach(tid => {
      const t = TYPES.find(x => x.id === tid);
      if (t) typeKeywords.push(...t.keywords);
    });
    if (typeKeywords.length > 0) {
      joins.push('JOIN innovation_types it ON it.innovation_id = i.id');
      const it = buildKeywordLikeClause('it.term_name', typeKeywords);
      conditions.push(`(${it.clause})`);
      params.push(...it.params);
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
    const r = buildKeywordLikeClause('i.region', filters.regions);
    conditions.push(`(${r.clause})`);
    params.push(...r.params);
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
    const sdg = buildKeywordLikeClause(
      'isd.sdg_name',
      filters.sdgs.map((s) => `Goal ${s}`)
    );
    conditions.push(`(${sdg.clause})`);
    params.push(...sdg.params);
  }

  if (filters.userGroups && filters.userGroups.length > 0) {
    const userKeywords = [];
    filters.userGroups.forEach(uid => {
      const u = USER_GROUPS.find(x => x.value === uid);
      if (u) userKeywords.push(...u.keywords);
    });
    if (userKeywords.length > 0) {
      joins.push('JOIN innovation_prospective_users ipu ON ipu.innovation_id = i.id');
      const ipu = buildKeywordLikeClause('ipu.user_name', userKeywords);
      conditions.push(`(${ipu.clause})`);
      params.push(...ipu.params);
    }
  }

  if (filters.grassrootsOnly) {
    conditions.push('i.is_grassroots = 1');
  }

  if (filters.sources && filters.sources.length > 0) {
    const src = buildKeywordLikeClause('i.data_source', filters.sources);
    conditions.push(`(${src.clause})`);
    params.push(...src.params);
  }

  return { joins: [...new Set(joins)], conditions, params };
}
