/**
 * The app's filter bag, translated into JSON:API conditions.
 *
 * The sibling of database/filterQuery.js, which turns the same bag into SQL.
 * Both read the same InnovationFilters and must agree about what it means, so
 * the two live side by side in the tests: a filter that narrows on the phone
 * has to narrow in the browser.
 *
 * The one thing neither handles is cost and complexity. They are derived in
 * JavaScript from the description text, so no query language can express them;
 * they are applied after the rows come back, by paginate.js, on both platforms.
 *
 * JSON:API's grammar for "any of these" is a named group that conditions join
 * with memberOf. Groups left unjoined sit at the top level, where the implicit
 * conjunction is AND — which is what we want between different filters.
 */
import { CHALLENGES, TYPES, USER_GROUPS } from '../../data/constants';
import { INNOVATION_HUB_REGIONS } from '../../data/innovationHubRegions';
import { parseLeadingLevel } from '../../database/levels';

/**
 * A value no term can have, so an IN condition with nothing in it matches
 * nothing. Dropping the condition instead would widen the query to the whole
 * catalogue — a filter that found no terms would return everything, which is
 * the opposite of what the user asked for.
 */
const MATCHES_NOTHING = '\u0000 no such term';

/** Field paths, in one place, because a typo here returns everything. */
export const PATHS = {
  useCase: 'field_use_cases.name',
  type: 'field_innovation_type.name',
  country: 'field_countries_adoption.name',
  region: 'field_region.name',
  sdg: 'field_impact_sdgs.name',
  user: 'field_prospective_users.name',
  readiness: 'field_readiness_level.name',
  adoption: 'field_adoption_level.name',
  source: 'field_data_source.title',
  grassroots: 'field_if_grassroots',
  title: 'title',
  body: 'body.value',
};

/**
 * The terms in a vocabulary whose names contain any of these keywords.
 *
 * The app's challenges, types and user groups are keyword lists, and the SQL
 * builder matches them with LIKE '%keyword%' against the term names. The same
 * match is done here, locally, against the vocabulary already in hand — and
 * the query then names the terms outright.
 *
 * It is not only a translation: the portal takes 40 seconds or more over a
 * group of CONTAINS conditions on a related field combined with any sort, and
 * under 12 for the same question asked as IN. Resolving the names here is what
 * makes a filtered list usable.
 */
export function termsMatching(byType, type, keywords) {
  const names = (byType?.[type] ?? []).map(([, name]) => name);
  const wanted = (keywords ?? []).map((k) => String(k).toLowerCase());
  if (wanted.length === 0) return [];
  const matched = names.filter((name) => {
    const lower = name.toLowerCase();
    return wanted.some((keyword) => lower.includes(keyword));
  });
  return matched.length > 0 ? matched : [MATCHES_NOTHING];
}

/** Terms for "this level or better", read from the preloaded vocabulary. */
export function levelsAtLeast(byType, type, minimum) {
  return (byType?.[type] ?? [])
    .filter(([, name]) => {
      const level = parseLeadingLevel(name, null);
      return level != null && level >= minimum;
    })
    .map(([, name]) => name);
}

/**
 * Builder for one filter spec, keeping the group names unique.
 *
 * Group names are part of the query string, so two filters that both wanted a
 * group called "or" would silently merge into one — a narrowing filter turning
 * into a widening one.
 */
function specBuilder() {
  const filter = {};
  const groups = {};
  let n = 0;

  return {
    /** `path` equals one of `values` — an OR of CONTAINS, as SQL does with LIKE. */
    anyContaining(path, values) {
      const list = (values ?? []).filter(Boolean);
      if (list.length === 0) return;
      if (list.length === 1) {
        filter[`f${n++}`] = { path, operator: 'CONTAINS', value: list[0] };
        return;
      }
      const group = `g${n++}`;
      groups[group] = { conjunction: 'OR' };
      for (const value of list) {
        filter[`f${n++}`] = { path, operator: 'CONTAINS', value, memberOf: group };
      }
    },

    /** `path` is one of `values`, matched whole. */
    anyOf(path, values) {
      const list = [...new Set((values ?? []).filter(Boolean))];
      if (list.length === 0) return;
      filter[`f${n++}`] = { path, operator: 'IN', value: list };
    },

    /** A plain equality. */
    equals(path, value) {
      filter[`f${n++}`] = { path, operator: '=', value };
    },

    build: () => ({ filter, groups }),
  };
}

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
 * Translate the filter bag.
 *
 * @param {object} filters - an InnovationFilters bag
 * @param {object} [options]
 * @param {object} [options.byType] - preloaded vocabularies, needed to turn a
 *   minimum level into the term names that satisfy it
 * @returns {{filter: object, groups: object}} ready for buildQuery
 */
export function buildFilterSpec(filters = {}, { byType } = {}) {
  const spec = specBuilder();

  // Published only. The portal's collection includes unpublished drafts —
  // records titled "TEST Athira (draft)" are in there — and without this every
  // count and every list is wrong.
  spec.equals('status', 1);

  // Sub-terms win over the broad entry, exactly as the SQL builder has it:
  // picking a specific use case means that use case, not its whole challenge.
  const challengeKeywords = filters.challengeKeywords?.length
    ? filters.challengeKeywords
    : keywordsFor(CHALLENGES, filters.challenges);
  if (challengeKeywords.length) {
    spec.anyOf(PATHS.useCase, termsMatching(byType, 'taxonomy_term--use_cases', challengeKeywords));
  }

  const typeKeywords = filters.typeKeywords?.length
    ? filters.typeKeywords
    : keywordsFor(TYPES, filters.types);
  if (typeKeywords.length) {
    spec.anyOf(PATHS.type, termsMatching(byType, 'taxonomy_term--type', typeKeywords));
  }

  // Hub regions are groups of countries, merged with any country chosen
  // directly — one country list, not two filters that would AND each other.
  const countries = new Set(filters.countries ?? []);
  for (const id of filters.hubRegions ?? []) {
    const region = INNOVATION_HUB_REGIONS.find((r) => r.id === id);
    for (const country of region?.countries ?? []) countries.add(country);
  }
  spec.anyOf(PATHS.country, [...countries]);

  if (filters.regions?.length) {
    spec.anyOf(PATHS.region, termsMatching(byType, 'taxonomy_term--geographic_regions', filters.regions));
  }

  const userKeywords = keywordsFor(USER_GROUPS, filters.userGroups, 'value');
  if (userKeywords.length) {
    spec.anyOf(PATHS.user, termsMatching(byType, 'taxonomy_term--actors', userKeywords));
  }

  // Sources stay substring matches: field_data_source points at a collection of
  // 544+ digital assets, which is the one vocabulary not worth preloading, so
  // there are no names here to resolve against.
  spec.anyContaining(PATHS.source, filters.sources);

  // SDG terms are preloaded too, but "Goal 2:" is a prefix of exactly one term
  // name, so a substring match is already precise and costs no resolution.
  //
  // "Goal 2:" with the colon, not "Goal 2". The SQL builder matches
  // LIKE '%Goal 1%', which also matches "Goal 15: Life on Land" — so choosing
  // SDG 1 on the phone quietly returns goals 10 through 17 as well. The term
  // names all carry the colon, so including it is both correct and harmless.
  spec.anyContaining(PATHS.sdg, (filters.sdgs ?? []).map((n) => `Goal ${n}:`));

  // A level filter becomes the set of terms that satisfy it. The portal cannot
  // compare "9. Ready" numerically, but the vocabulary is ten terms and we
  // already hold it.
  if (filters.readinessMin > 1) {
    spec.anyOf(PATHS.readiness, levelsAtLeast(byType, 'taxonomy_term--readiness_levels', filters.readinessMin));
  }
  if (filters.adoptionMin > 1) {
    spec.anyOf(PATHS.adoption, levelsAtLeast(byType, 'taxonomy_term--adoption_levels', filters.adoptionMin));
  }

  if (filters.grassrootsOnly) spec.equals(PATHS.grassroots, 1);

  return spec.build();
}
