/**
 * Filters answered from the catalogue index instead of the portal.
 *
 * The property worth protecting is agreement: these specs come from the real
 * buildFilterSpec, the same one the portal is sent, so a filter that narrows
 * there must narrow the same way here. A drilldown that matched differently in
 * the browser would show a list the portal disagrees with.
 */
import { buildFilterSpec } from '../src/api/jsonapi/filterSpec';
import { compileSpec, matchIndex } from '../src/api/jsonapi/localFilter';
import { INNOVATION_HUB_REGIONS } from '../src/data/innovationHubRegions';
import readiness from './fixtures/jsonapi/readinessLevels.json';

const byType = {
  'taxonomy_term--readiness_levels': readiness.data.map((t) => [t.id, t.attributes.name]),
  'taxonomy_term--adoption_levels': [['a1', '1. None'], ['a3', '3. Early'], ['a9', '9. Widespread']],
  'taxonomy_term--type': [['t1', 'Digital technologies'], ['t2', 'Mobile app'], ['t3', 'Seeds']],
  'taxonomy_term--use_cases': [['u1', 'water scarcity'], ['u2', 'crop production']],
  'taxonomy_term--geographic_regions': [['g1', 'Africa'], ['g2', 'Asia']],
  'taxonomy_term--actors': [['p1', 'Smallholder farmers'], ['p2', 'Academia']],
};

/** An index row, as catalogIndex.js stores it. Unset lists are empty. */
const row = (id, fields = {}) => ({
  id,
  countries: [],
  useCases: [],
  types: [],
  regions: [],
  sdgs: [],
  users: [],
  readinessTerm: null,
  adoptionTerm: null,
  sourceTitle: null,
  grassroots: false,
  changed: 0,
  ...fields,
});

const match = (filters, rows) => matchIndex(buildFilterSpec(filters, { byType }), rows);

describe('answering the drilldown that timed out on the portal', () => {
  // Digital & ICT, East Africa, a readiness floor and an adoption floor: more
  // than two minutes on the portal on 6 October.
  const filters = {
    typeKeywords: ['Digital technologies', 'Mobile app'],
    hubRegions: ['east-africa'],
    readinessMin: 5,
    adoptionMin: 3,
  };
  const kenya = INNOVATION_HUB_REGIONS.find((r) => r.id === 'east-africa').countries[0];

  it('keeps a record that meets every filter', () => {
    const rows = [
      row('hit', { types: ['Mobile app'], countries: [kenya], readinessTerm: '9. Ready', adoptionTerm: '3. Early' }),
    ];
    expect(match(filters, rows)).toEqual(['hit']);
  });

  it('drops a record that misses any one of them', () => {
    const good = { types: ['Mobile app'], countries: [kenya], readinessTerm: '9. Ready', adoptionTerm: '3. Early' };
    const rows = [
      row('wrong-type', { ...good, types: ['Seeds'] }),
      row('wrong-place', { ...good, countries: ['Peru'] }),
      row('too-early', { ...good, readinessTerm: '2. Basic research' }),
      row('no-level', { ...good, readinessTerm: 'NOT INDICATED' }),
      row('not-adopted', { ...good, adoptionTerm: '1. None' }),
    ];
    expect(match(filters, rows)).toEqual([]);
  });
});

describe('each kind of condition', () => {
  it('matches any of several values in one list (IN)', () => {
    const rows = [row('a', { countries: ['Kenya', 'Peru'] }), row('b', { countries: ['Peru'] })];
    expect(match({ countries: ['Kenya', 'Uganda'] }, rows)).toEqual(['a']);
  });

  it('matches keywords as substrings of term names, ignoring case', () => {
    // termsMatching resolves "water" to the term "water scarcity" before the
    // spec is built, as it does for the portal.
    const rows = [row('a', { useCases: ['water scarcity'] }), row('b', { useCases: ['crop production'] })];
    expect(match({ challengeKeywords: ['WATER'] }, rows)).toEqual(['a']);
  });

  it('matches an SDG by its "Goal n:" prefix, and not goal 1 for goal 15', () => {
    const rows = [
      row('two', { sdgs: ['Goal 2: Zero Hunger'] }),
      row('fifteen', { sdgs: ['Goal 15: Life on Land'] }),
      row('one', { sdgs: ['Goal 1: No Poverty'] }),
    ];
    expect(match({ sdgs: [1, 2] }, rows).sort()).toEqual(['one', 'two']);
  });

  it('matches a data source by part of its title', () => {
    const rows = [row('a', { sourceTitle: 'FAO TECA' }), row('b', { sourceTitle: 'WOCAT' })];
    expect(match({ sources: ['teca'] }, rows)).toEqual(['a']);
  });

  it('keeps only grassroots records when asked', () => {
    const rows = [row('yes', { grassroots: true }), row('no', { grassroots: false })];
    expect(match({ grassrootsOnly: true }, rows)).toEqual(['yes']);
  });

  it('matches regions and user groups through their vocabularies', () => {
    const rows = [
      row('a', { regions: ['Africa'], users: ['Smallholder farmers'] }),
      row('b', { regions: ['Asia'], users: ['Smallholder farmers'] }),
    ];
    expect(match({ regions: ['Africa'], userGroups: ['farmers'] }, rows)).toEqual(['a']);
  });

  it('matches nothing when a keyword resolves to no term, rather than everything', () => {
    const rows = [row('a', { types: ['Seeds'] })];
    expect(match({ typeKeywords: ['no such type'] }, rows)).toEqual([]);
  });

  it('matches everything when there are no filters', () => {
    expect(match({}, [row('a'), row('b')])).toHaveLength(2);
  });
});

describe('order', () => {
  it('lists the most recently changed first, as the portal sort does', () => {
    const rows = [row('old', { changed: 1 }), row('new', { changed: 3 }), row('mid', { changed: 2 })];
    expect(match({}, rows)).toEqual(['new', 'mid', 'old']);
  });
});

describe('knowing when to ask the portal instead', () => {
  it('declines a spec with a path the index does not hold', () => {
    const spec = { filter: { x: { path: 'body.value', operator: 'CONTAINS', value: 'drip' } }, groups: {} };
    expect(compileSpec(spec)).toBeNull();
    expect(matchIndex(spec, [row('a')])).toBeNull();
  });

  it('declines an operator it does not implement', () => {
    const spec = { filter: { x: { path: 'field_readiness_level.name', operator: 'IS NOT NULL' } }, groups: {} };
    expect(matchIndex(spec, [row('a')])).toBeNull();
  });

  it('declines rows stored before a field existed, rather than reading them as no match', () => {
    const old = { id: 'a', countries: ['Kenya'], types: [] };
    expect(match({ regions: ['Africa'] }, [old])).toBeNull();
  });
});
