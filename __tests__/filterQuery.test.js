import { buildFilterQuery } from '../src/database/filterQuery';
import { CHALLENGES, TYPES, USER_GROUPS } from '../src/data/constants';

const challenge = CHALLENGES.find((c) => c.keywords?.length);
const type = TYPES.find((t) => t.keywords?.length);

/** Every bound parameter must have exactly one placeholder to bind to. */
function placeholderCount({ conditions }) {
  return conditions.join(' AND ').split('?').length - 1;
}

describe('buildFilterQuery — shape', () => {
  it('returns the three-part fragment set', () => {
    const q = buildFilterQuery({});
    expect(Array.isArray(q.joins)).toBe(true);
    expect(Array.isArray(q.conditions)).toBe(true);
    expect(Array.isArray(q.params)).toBe(true);
  });

  it('always starts conditions with 1=1 so callers can AND unconditionally', () => {
    expect(buildFilterQuery({}).conditions[0]).toBe('1=1');
  });

  it('produces no joins and no params for an empty filter set', () => {
    const q = buildFilterQuery({});
    expect(q.joins).toEqual([]);
    expect(q.params).toEqual([]);
  });

  it('keeps placeholders and params in step for every filter combination', () => {
    const combos = [
      {},
      { challengeKeywords: ['a', 'b'] },
      { typeKeywords: ['x'] },
      { challenges: [challenge.id] },
      { types: [type.id] },
      { readinessMin: 5 },
      { adoptionMin: 3 },
      { countries: ['Kenya', 'Uganda'] },
      { userGroups: [USER_GROUPS[0].value] },
      { grassrootsOnly: true },
      { challengeKeywords: ['a'], typeKeywords: ['b'], readinessMin: 4, countries: ['Kenya'] },
    ];
    for (const filters of combos) {
      const q = buildFilterQuery(filters);
      expect(placeholderCount(q)).toBe(q.params.length);
    }
  });
});

describe('buildFilterQuery — keyword precedence', () => {
  it('uses explicit challengeKeywords when supplied', () => {
    const q = buildFilterQuery({ challengeKeywords: ['drought', 'flood'] });
    expect(q.joins.join(' ')).toContain('innovation_use_cases');
    expect(q.params).toEqual(['%drought%', '%flood%']);
  });

  it('expands a challenge id to its keywords when no explicit keywords are given', () => {
    const q = buildFilterQuery({ challenges: [challenge.id] });
    expect(q.joins.join(' ')).toContain('innovation_use_cases');
    expect(q.params.length).toBe(challenge.keywords.length);
  });

  it('lets challengeKeywords win over challenges rather than combining them', () => {
    const q = buildFilterQuery({ challengeKeywords: ['only-this'], challenges: [challenge.id] });
    expect(q.params).toEqual(['%only-this%']);
  });

  it('uses explicit typeKeywords when supplied', () => {
    const q = buildFilterQuery({ typeKeywords: ['sensor'] });
    expect(q.joins.join(' ')).toContain('innovation_types');
    expect(q.params).toEqual(['%sensor%']);
  });

  it('lets typeKeywords win over types', () => {
    const q = buildFilterQuery({ typeKeywords: ['only-this'], types: [type.id] });
    expect(q.params).toEqual(['%only-this%']);
  });

  it('ignores an unknown challenge id instead of emitting a broken join', () => {
    const q = buildFilterQuery({ challenges: ['no-such-challenge'] });
    expect(q.params).toEqual([]);
    expect(placeholderCount(q)).toBe(0);
  });

  it('ignores an unknown type id', () => {
    const q = buildFilterQuery({ types: ['no-such-type'] });
    expect(q.params).toEqual([]);
  });

  it('treats empty keyword arrays as absent', () => {
    const q = buildFilterQuery({ challengeKeywords: [], typeKeywords: [] });
    expect(q.joins).toEqual([]);
    expect(q.params).toEqual([]);
  });
});

describe('buildFilterQuery — thresholds', () => {
  it('omits readiness at the default of 1', () => {
    expect(buildFilterQuery({ readinessMin: 1 }).params).toEqual([]);
  });

  it('applies readiness above the default', () => {
    const q = buildFilterQuery({ readinessMin: 6 });
    expect(q.conditions.join(' ')).toMatch(/readiness_level/);
    expect(q.params).toContain(6);
  });

  it('omits adoption at the default of 1', () => {
    expect(buildFilterQuery({ adoptionMin: 1 }).params).toEqual([]);
  });

  it('applies adoption above the default', () => {
    const q = buildFilterQuery({ adoptionMin: 4 });
    expect(q.conditions.join(' ')).toMatch(/adoption_level/);
    expect(q.params).toContain(4);
  });
});

describe('buildFilterQuery — sets and flags', () => {
  it('binds one parameter per country', () => {
    const q = buildFilterQuery({ countries: ['Kenya', 'Uganda', 'Tanzania'] });
    expect(q.params.filter((p) => typeof p === 'string' && p.includes('Kenya')).length).toBe(1);
    expect(placeholderCount(q)).toBe(q.params.length);
  });

  it('handles an empty country list as absent', () => {
    expect(buildFilterQuery({ countries: [] }).params).toEqual([]);
  });

  it('applies the grassroots flag as a condition, not a parameter mismatch', () => {
    const q = buildFilterQuery({ grassrootsOnly: true });
    expect(placeholderCount(q)).toBe(q.params.length);
    expect(q.conditions.join(' ')).toMatch(/grassroots/i);
  });

  it('omits the grassroots condition when the flag is false', () => {
    const q = buildFilterQuery({ grassrootsOnly: false });
    expect(q.conditions.join(' ')).not.toMatch(/grassroots/i);
  });
});

describe('buildFilterQuery — derived filters are deliberately absent', () => {
  // cost and complexity are computed in JS from description text, so they
  // cannot be expressed in SQL. paginate.js applies them after the query runs.
  // If they ever start appearing here, the post-filter would double-apply them.
  it('ignores cost', () => {
    const q = buildFilterQuery({ cost: ['low'] });
    expect(q.conditions.join(' ')).not.toMatch(/cost/i);
    expect(q.params).toEqual([]);
  });

  it('ignores complexity', () => {
    const q = buildFilterQuery({ complexity: ['simple'] });
    expect(q.conditions.join(' ')).not.toMatch(/complexity/i);
    expect(q.params).toEqual([]);
  });
});

describe('buildFilterQuery — join hygiene', () => {
  it('does not repeat the same join when both taxonomies are filtered', () => {
    const q = buildFilterQuery({ challengeKeywords: ['a'], typeKeywords: ['b'] });
    const unique = new Set(q.joins);
    expect(unique.size).toBe(q.joins.length);
  });
});

describe('buildFilterQuery — remaining filter keys', () => {
  const cases = [
    ['hubRegions', { hubRegions: ['r1'] }],
    ['regions', { regions: ['africa'] }],
    ['sdgs', { sdgs: [2, 6] }],
    ['sources', { sources: ['ATIO KB'] }],
    ['userGroups', { userGroups: [USER_GROUPS[0].value] }],
  ];

  it.each(cases)('keeps placeholders and params in step for %s', (_name, filters) => {
    const q = buildFilterQuery(filters);
    expect(placeholderCount(q)).toBe(q.params.length);
  });

  it.each(cases)('treats an empty %s list as absent', (name) => {
    const q = buildFilterQuery({ [name]: [] });
    expect(q.joins).toEqual([]);
    expect(q.params).toEqual([]);
  });

  it('binds one parameter per SDG', () => {
    expect(buildFilterQuery({ sdgs: [2, 6, 13] }).params.length).toBeGreaterThanOrEqual(3);
  });

  it('binds one parameter per source', () => {
    const q = buildFilterQuery({ sources: ['A', 'B'] });
    expect(placeholderCount(q)).toBe(q.params.length);
  });

  it('ignores an unknown user group rather than emitting a dangling condition', () => {
    const q = buildFilterQuery({ userGroups: ['no-such-group'] });
    expect(placeholderCount(q)).toBe(q.params.length);
  });

  it('combines every filter at once without desynchronising params', () => {
    const q = buildFilterQuery({
      challengeKeywords: ['a'],
      typeKeywords: ['b'],
      readinessMin: 5,
      adoptionMin: 3,
      countries: ['Kenya'],
      hubRegions: ['r1'],
      regions: ['africa'],
      sdgs: [2],
      sources: ['ATIO KB'],
      userGroups: [USER_GROUPS[0].value],
      grassrootsOnly: true,
    });
    expect(placeholderCount(q)).toBe(q.params.length);
    expect(new Set(q.joins).size).toBe(q.joins.length);
  });
});
