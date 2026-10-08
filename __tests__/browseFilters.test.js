/**
 * browse_innovations must select exactly the records the current web path
 * selects, or switching the data source would change what a drilldown shows.
 *
 * The current path is buildFilterSpec → localFilter.matchIndex over the
 * catalogue index, then the cost and complexity filters in paginate.js. The
 * new one is buildFilterSpec → browseFilters.js → the SQL in
 * supabase/migrations/*_browse.sql. `evaluate` below is that SQL's reading of
 * the clauses, condition for condition, so these tests pin the translation
 * against the oracle; importer/checks/browseParity.js then runs the real SQL
 * against the same oracle over the live snapshot.
 */
import { browseFiltersFor, specToBrowseFilters } from '../src/api/supabase/browseFilters';
import { buildFilterSpec } from '../src/api/jsonapi/filterSpec';
import { matchIndex } from '../src/api/jsonapi/localFilter';
import { filterByCostAndComplexity } from '../src/database/paginate';
import { INNOVATION_HUB_REGIONS } from '../src/data/innovationHubRegions';

const EAST_AFRICA = INNOVATION_HUB_REGIONS.find((r) => r.id === 'east-africa');
const HUB_COUNTRY = EAST_AFRICA.countries[0];

const byType = {
  'taxonomy_term--use_cases': [['u1', 'Crop production'], ['u2', 'Crop monitoring'], ['u3', 'Water management']],
  'taxonomy_term--type': [['t1', 'Nature-based solutions'], ['t2', 'Digital & ICT']],
  'taxonomy_term--actors': [['p1', 'Smallholder farmers'], ['p2', 'Academia']],
  'taxonomy_term--geographic_regions': [['g1', 'Africa'], ['g2', 'Asia']],
  'taxonomy_term--readiness_levels': [['r9', '9. Ready'], ['r5', '5. Validation'], ['r1', '1. Idea'], ['rn', 'NOT INDICATED']],
  'taxonomy_term--adoption_levels': [['a9', '9. Widespread'], ['a3', '3. Low'], ['an', 'NOT INDICATED']],
};

/** Index rows plus the derived fields, as the snapshot stores them. */
const row = (id, changed, fields) => ({
  id,
  changed,
  useCases: [],
  types: [],
  countries: [],
  regions: [],
  sdgs: [],
  users: [],
  readinessTerm: null,
  adoptionTerm: null,
  sourceTitle: null,
  grassroots: false,
  cost: 'med',
  complexity: 'moderate',
  ...fields,
});

const ROWS = [
  row('a', 9, { useCases: ['Crop production'], types: ['Nature-based solutions'], countries: [HUB_COUNTRY], sdgs: ['Goal 1: No poverty'], readinessTerm: '9. Ready', adoptionTerm: '9. Widespread', sourceTitle: 'FAO Innovation Platform', grassroots: true, cost: 'low', complexity: 'simple', users: ['Smallholder farmers'], regions: ['Africa'] }),
  row('b', 8, { useCases: ['Crop monitoring'], types: ['Digital & ICT'], countries: ['Kenya'], sdgs: ['Goal 10: Reduced inequalities'], readinessTerm: '5. Validation', adoptionTerm: '3. Low', sourceTitle: 'CGIAR', cost: 'high', users: ['Academia'], regions: ['Africa'] }),
  row('c', 7, { useCases: ['Water management'], countries: ['India'], sdgs: ['Goal 2: Zero hunger', 'Goal 1: No poverty'], readinessTerm: 'NOT INDICATED', adoptionTerm: 'NOT INDICATED', regions: ['Asia'], cost: 'low' }),
  row('d', 7, { useCases: ['Crop production'], countries: ['Peru'], cost: 'low', complexity: 'advanced', sourceTitle: 'fao innovation platform' }),
  row('e', 5, { types: ['Nature-based solutions'], readinessTerm: '1. Idea', countries: [HUB_COUNTRY], sdgs: ['Goal 15: Life on land'] }),
];

/** What the current web path returns, as an id set. */
function oracle(filters) {
  const ids = matchIndex(buildFilterSpec(filters, { byType }), ROWS);
  const byId = new Map(ROWS.map((r) => [r.id, r]));
  return filterByCostAndComplexity(ids.map((id) => byId.get(id)), filters).map((r) => r.id).sort();
}

/** The browse SQL's reading of the clauses, over the same rows. */
const COLUMN = {
  useCase: 'useCases', type: 'types', country: 'countries', region: 'regions', sdg: 'sdgs', user: 'users',
  readiness: 'readinessTerm', adoption: 'adoptionTerm', source: 'sourceTitle', title: 'title', grassroots: 'grassroots',
};
const values = (r, field) => {
  const v = r[COLUMN[field]];
  return Array.isArray(v) ? v : v == null ? [] : [v];
};
function test(condition, r) {
  const vs = values(r, condition.field);
  switch (condition.op) {
    case 'in': return vs.some((v) => condition.values.includes(v));
    case 'contains': return vs.some((v) => String(v).toLowerCase().includes(condition.value.toLowerCase()));
    case 'present': return vs.length > 0;
    case 'eq': return r.grassroots === ['1', 'true'].includes(condition.value);
    default: throw new Error(`no such op ${condition.op}`);
  }
}
function evaluate(browse) {
  return ROWS.filter(
    (r) =>
      browse.all.every((clause) => clause.some((c) => test(c, r))) &&
      (!browse.cost || browse.cost.includes(r.cost)) &&
      (!browse.complexity || browse.complexity.includes(r.complexity))
  ).map((r) => r.id).sort();
}
const viaRpc = (filters) => evaluate(browseFiltersFor(filters, byType));

/** Every key of the filter contract (see filterContract.test.js), alone. */
const ALONE = {
  challenges: { challenges: ['crops'] },
  types: { types: ['nature'] },
  challengeKeywords: { challengeKeywords: ['crop monitoring'] },
  typeKeywords: { typeKeywords: ['Digital'] },
  countries: { countries: ['Kenya'] },
  hubRegions: { hubRegions: ['east-africa'] },
  regions: { regions: ['Africa'] },
  sdgs: { sdgs: [1] },
  sources: { sources: ['FAO'] },
  userGroups: { userGroups: ['farmers'] },
  readinessMin: { readinessMin: 5 },
  adoptionMin: { adoptionMin: 3 },
  grassrootsOnly: { grassrootsOnly: true },
  cost: { cost: ['low'] },
  complexity: { complexity: ['simple', 'advanced'] },
};

describe('browse filters select what the current web path selects', () => {
  it('returns everything for an empty bag', () => {
    expect(viaRpc({})).toEqual(ROWS.map((r) => r.id).sort());
    expect(browseFiltersFor({}, byType)).toEqual({ all: [] });
  });

  it.each(Object.entries(ALONE))('%s alone', (_, filters) => {
    const expected = oracle(filters);
    expect(viaRpc(filters)).toEqual(expected);
    // A filter that matches every row would not prove anything.
    expect(expected.length).toBeLessThan(ROWS.length);
  });

  it.each([
    ['AND across categories', { challenges: ['crops'], countries: ['Peru'] }],
    ['OR within a category', { countries: ['Kenya', 'India'] }],
    ['hub region merged with a chosen country', { hubRegions: ['east-africa'], countries: ['India'] }],
    ['SDG 1 does not match SDG 10 or 15', { sdgs: [1] }],
    ['several SDGs are an OR', { sdgs: [2, 10] }],
    ['readiness minimum excludes NOT INDICATED and unlevelled', { readinessMin: 2 }],
    ['adoption minimum excludes NOT INDICATED', { adoptionMin: 2 }],
    ['source is a case-insensitive substring', { sources: ['fao innovation'] }],
    ['cost with a vocabulary filter', { cost: ['low'], challenges: ['crops'] }],
    ['cost and complexity together', { cost: ['low'], complexity: ['simple'] }],
    ['a keyword matching no term matches nothing', { challengeKeywords: ['no such thing'] }],
    ['everything at once', { types: ['nature'], hubRegions: ['east-africa'], sdgs: [1], readinessMin: 5, grassrootsOnly: true, cost: ['low'] }],
  ])('%s', (_, filters) => {
    expect(viaRpc(filters)).toEqual(oracle(filters));
  });
});

describe('specToBrowseFilters', () => {
  it('drops the published-only condition, which every snapshot row meets', () => {
    expect(specToBrowseFilters({ filter: { s: { path: 'status', operator: '=', value: 1 } } })).toEqual({ all: [] });
  });

  it('keeps a has-a-level condition, for the most-advanced list', () => {
    const spec = { filter: { lvl: { path: 'field_readiness_level.name', operator: 'IS NOT NULL' } } };
    expect(specToBrowseFilters(spec).all).toEqual([[{ field: 'readiness', op: 'present' }]]);
  });

  it('turns an OR group into one clause', () => {
    const spec = {
      filter: {
        a: { path: 'title', operator: 'CONTAINS', value: 'hotline', memberOf: 'help' },
        b: { path: 'title', operator: 'CONTAINS', value: 'support', memberOf: 'help' },
      },
      groups: { help: { conjunction: 'OR' } },
    };
    expect(specToBrowseFilters(spec).all).toEqual([
      [{ field: 'title', op: 'contains', value: 'hotline' }, { field: 'title', op: 'contains', value: 'support' }],
    ]);
  });

  it('sends no NUL character, which Postgres rejects, for a keyword matching no term', () => {
    const browse = browseFiltersFor({ challengeKeywords: ['no such thing'] }, byType);
    expect(JSON.stringify(browse)).not.toContain('\\u0000');
    expect(browse.all).toEqual([[{ field: 'useCase', op: 'in', values: [] }]]);
  });

  it('refuses what it cannot express, so the caller filters locally instead', () => {
    expect(specToBrowseFilters({ filter: { x: { path: 'body.value', operator: 'CONTAINS', value: 'x' } } })).toBeNull();
    expect(specToBrowseFilters({ filter: {}, groups: { g: { conjunction: 'AND' } } })).toBeNull();
    expect(specToBrowseFilters({ filter: {}, groups: { g: { conjunction: 'OR', memberOf: 'h' } } })).toBeNull();
    expect(specToBrowseFilters({ filter: { x: { path: 'title', operator: 'STARTS_WITH', value: 'a' } } })).toBeNull();
  });
});
