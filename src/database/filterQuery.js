/**
 * Translate the app's filters object into SQL fragments.
 *
 * This is the core filter-to-SQL translation behind every list in the app, and
 * it had no test coverage because it lived inside db.js, which cannot be
 * imported outside the app (expo-sqlite, expo-asset and expo-file-system all
 * load at module scope). Moved here, free of those imports, so it can be
 * exercised directly.
 *
 * Note what it does NOT handle: `cost` and `complexity`. Those are derived in
 * JavaScript from description text, so they cannot appear in a WHERE clause and
 * are applied after the query runs — see paginate.js.
 */
import { CHALLENGES, TYPES, USER_GROUPS } from '../data/constants';
import { INNOVATION_HUB_REGIONS } from '../data/innovationHubRegions';

/**
 * @param {object} filters
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
    const ucConds = filters.challengeKeywords.map(k => `uc.term_name LIKE ?`);
    conditions.push(`(${ucConds.join(' OR ')})`);
    filters.challengeKeywords.forEach(k => params.push(`%${k}%`));
  } else if (filters.challenges && filters.challenges.length > 0) {
    const challengeKeywords = [];
    filters.challenges.forEach(cid => {
      const c = CHALLENGES.find(x => x.id === cid);
      if (c) challengeKeywords.push(...c.keywords);
    });
    if (challengeKeywords.length > 0) {
      joins.push('JOIN innovation_use_cases uc ON uc.innovation_id = i.id');
      const ucConds = challengeKeywords.map(k => `uc.term_name LIKE ?`);
      conditions.push(`(${ucConds.join(' OR ')})`);
      challengeKeywords.forEach(k => params.push(`%${k}%`));
    }
  }

  // Type filter: typeKeywords (from sub-terms) take precedence over broad types
  if (filters.typeKeywords && filters.typeKeywords.length > 0) {
    joins.push('JOIN innovation_types it ON it.innovation_id = i.id');
    const tConds = filters.typeKeywords.map(k => `it.term_name LIKE ?`);
    conditions.push(`(${tConds.join(' OR ')})`);
    filters.typeKeywords.forEach(k => params.push(`%${k}%`));
  } else if (filters.types && filters.types.length > 0) {
    const typeKeywords = [];
    filters.types.forEach(tid => {
      const t = TYPES.find(x => x.id === tid);
      if (t) typeKeywords.push(...t.keywords);
    });
    if (typeKeywords.length > 0) {
      joins.push('JOIN innovation_types it ON it.innovation_id = i.id');
      const tConds = typeKeywords.map(k => `it.term_name LIKE ?`);
      conditions.push(`(${tConds.join(' OR ')})`);
      typeKeywords.forEach(k => params.push(`%${k}%`));
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
    const rConds = filters.regions.map(() => `i.region LIKE ?`);
    conditions.push(`(${rConds.join(' OR ')})`);
    filters.regions.forEach(r => params.push(`%${r}%`));
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
    const sConds = filters.sdgs.map(() => `isd.sdg_name LIKE ?`);
    conditions.push(`(${sConds.join(' OR ')})`);
    filters.sdgs.forEach(s => params.push(`%Goal ${s}%`));
  }

  if (filters.userGroups && filters.userGroups.length > 0) {
    const userKeywords = [];
    filters.userGroups.forEach(uid => {
      const u = USER_GROUPS.find(x => x.value === uid);
      if (u) userKeywords.push(...u.keywords);
    });
    if (userKeywords.length > 0) {
      joins.push('JOIN innovation_prospective_users ipu ON ipu.innovation_id = i.id');
      const uConds = userKeywords.map(k => `ipu.user_name LIKE ?`);
      conditions.push(`(${uConds.join(' OR ')})`);
      userKeywords.forEach(k => params.push(`%${k}%`));
    }
  }

  if (filters.grassrootsOnly) {
    conditions.push('i.is_grassroots = 1');
  }

  if (filters.sources && filters.sources.length > 0) {
    const sConds = filters.sources.map(() => `i.data_source LIKE ?`);
    conditions.push(`(${sConds.join(' OR ')})`);
    filters.sources.forEach(s => params.push(`%${s}%`));
  }

  return { joins: [...new Set(joins)], conditions, params };
}
