/**
 * A filter spec, as clauses for the browse_innovations RPC.
 *
 * The filter bag is still turned into a spec by buildFilterSpec(), exactly as
 * for the portal — keyword lists resolved to vocabulary terms, hub regions
 * expanded to countries, level minimums turned into the terms that meet them,
 * SDGs written as "Goal N:". This only re-expresses that spec in the RPC's
 * shape, the way localFilter.js reads it for the catalogue index:
 *
 *   a condition with no group      → a clause of its own
 *   an OR group of conditions      → one clause holding all of them
 *   clauses                        → ANDed
 *
 * Cost and complexity are not in the spec — they are derived, and the portal
 * cannot filter on them — so they are passed alongside, from the bag itself.
 * See supabase/migrations/*_browse.sql for the other half.
 */
import { buildFilterSpec, PATHS } from '../jsonapi/filterSpec';
import { DERIVED_FILTER_KEYS } from '../../database/paginate';

/** Spec paths the RPC can filter on, by the field name it knows them as. */
const FIELDS = {
  [PATHS.useCase]: 'useCase',
  [PATHS.type]: 'type',
  [PATHS.country]: 'country',
  [PATHS.region]: 'region',
  [PATHS.sdg]: 'sdg',
  [PATHS.user]: 'user',
  [PATHS.readiness]: 'readiness',
  [PATHS.adoption]: 'adoption',
  [PATHS.source]: 'source',
  [PATHS.title]: 'title',
  [PATHS.grassroots]: 'grassroots',
};

/**
 * filterSpec.js answers "no term matched this keyword" with a sentinel term
 * that starts with a NUL, so the IN it builds matches nothing. Postgres refuses
 * NUL in any text, so it is dropped here instead — an empty IN list matches
 * nothing in SQL too, which keeps the meaning.
 */
const isSentinel = (value) => typeof value === 'string' && value.includes('\u0000');

/** One spec condition as an RPC condition, or null if the RPC cannot express it. */
function toCondition({ path, operator = '=', value }) {
  const field = FIELDS[path];
  if (!field) return null;
  switch (operator) {
    case 'IN':
      return { field, op: 'in', values: value.filter((v) => !isSentinel(v)) };
    case 'CONTAINS':
      return { field, op: 'contains', value: String(value) };
    case 'IS NOT NULL':
      return { field, op: 'present' };
    case '=':
      return { field, op: 'eq', value: String(value) };
    default:
      return null;
  }
}

/**
 * @param {{filter?: object, groups?: object}} spec - from buildFilterSpec
 * @param {object} [filters] - the original bag, for cost and complexity
 * @returns {object|null} the RPC's `filters`, or null when the spec holds
 *   something the RPC cannot answer (the caller then filters locally)
 */
export function specToBrowseFilters({ filter = {}, groups = {} } = {}, filters = {}) {
  const all = [];
  const grouped = new Map();

  for (const [name, group] of Object.entries(groups)) {
    // buildFilterSpec only builds flat OR groups. Anything else is a spec this
    // was not written for, and guessing at it would change what a filter means.
    if (group.memberOf || (group.conjunction ?? 'AND') !== 'OR') return null;
    grouped.set(name, []);
  }

  for (const condition of Object.values(filter)) {
    // Every row in a snapshot is published, which is all `status = 1` asks.
    if (condition.path === 'status') continue;
    const converted = toCondition(condition);
    if (!converted) return null;
    if (condition.memberOf) {
      if (!grouped.has(condition.memberOf)) return null;
      grouped.get(condition.memberOf).push(converted);
    } else {
      all.push([converted]);
    }
  }

  for (const members of grouped.values()) {
    if (members.length > 0) all.push(members);
  }

  const result = { all };
  for (const key of DERIVED_FILTER_KEYS) {
    if (filters?.[key]?.length > 0) result[key] = [...filters[key]];
  }
  return result;
}

/**
 * The RPC's `filters` for a filter bag.
 *
 * @param {object} filters - an InnovationFilters bag
 * @param {object} byType - the vocabularies, from loadTaxonomies
 */
export function browseFiltersFor(filters = {}, byType) {
  return specToBrowseFilters(buildFilterSpec(filters, { byType }), filters);
}
