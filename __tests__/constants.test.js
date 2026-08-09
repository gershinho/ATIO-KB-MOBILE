import {
  CHALLENGES,
  TYPES,
  REGIONS,
  USER_GROUPS,
  READINESS_LEVELS,
  ADOPTION_LEVELS,
  SDGS,
  COST_LEVELS,
  COMPLEXITY_LEVELS,
  deriveCost,
  deriveComplexity,
  getCountriesForRegion,
} from '../src/data/constants';
import { INNOVATION_HUB_REGIONS } from '../src/data/innovationHubRegions';

describe('taxonomy data integrity', () => {
  it.each([
    ['CHALLENGES', CHALLENGES],
    ['TYPES', TYPES],
    ['REGIONS', REGIONS],
    ['USER_GROUPS', USER_GROUPS],
    ['READINESS_LEVELS', READINESS_LEVELS],
    ['ADOPTION_LEVELS', ADOPTION_LEVELS],
    ['SDGS', SDGS],
    ['COST_LEVELS', COST_LEVELS],
    ['COMPLEXITY_LEVELS', COMPLEXITY_LEVELS],
  ])('%s is a non-empty array', (_name, arr) => {
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBeGreaterThan(0);
  });

  it('CHALLENGES have unique ids', () => {
    const ids = CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('TYPES have unique ids', () => {
    const ids = TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('SDGS have unique numbers and a colour each', () => {
    const nums = SDGS.map((s) => s.number);
    expect(new Set(nums).size).toBe(nums.length);
    for (const s of SDGS) expect(s.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('COST_LEVELS cover exactly the values deriveCost can return', () => {
    expect(COST_LEVELS.map((c) => c.value).sort()).toEqual(['high', 'low', 'med']);
  });

  it('COMPLEXITY_LEVELS cover exactly the values deriveComplexity can return', () => {
    expect(COMPLEXITY_LEVELS.map((c) => c.value).sort()).toEqual([
      'advanced',
      'moderate',
      'simple',
    ]);
  });

  it('every challenge subTerm has a keyword and a label', () => {
    for (const c of CHALLENGES) {
      for (const st of c.subTerms || []) {
        expect(typeof st.keyword).toBe('string');
        expect(st.keyword.length).toBeGreaterThan(0);
        expect(typeof st.label).toBe('string');
      }
    }
  });
});

describe('deriveCost', () => {
  it('returns low for low-cost signals only', () => {
    expect(deriveCost({ shortDescription: 'affordable low-cost tool' })).toBe('low');
  });

  it('returns high for high-cost signals only', () => {
    expect(deriveCost({ shortDescription: 'drone and satellite mapping' })).toBe('high');
  });

  it('returns med when signals conflict', () => {
    expect(deriveCost({ shortDescription: 'low-cost drone' })).toBe('med');
  });

  it('returns med for unmatched text', () => {
    expect(deriveCost({ shortDescription: 'a farmer cooperative' })).toBe('med');
  });

  it('treats isGrassroots as low cost', () => {
    expect(deriveCost({ isGrassroots: true })).toBe('low');
  });

  it('handles undefined, null and empty input', () => {
    expect(deriveCost(undefined)).toBe('med');
    expect(deriveCost(null)).toBe('med');
    expect(deriveCost({})).toBe('med');
  });

  it('reads the types alias as well as typeNames', () => {
    expect(deriveCost({ types: ['smallholder irrigation'] })).toBe('low');
    expect(deriveCost({ typeNames: ['smallholder irrigation'] })).toBe('low');
  });
});

describe('deriveComplexity', () => {
  it('returns simple for simple signals only', () => {
    expect(deriveComplexity({ shortDescription: 'a basic manual tool' })).toBe('simple');
  });

  it('returns advanced for advanced signals only', () => {
    expect(deriveComplexity({ shortDescription: 'remote sensing with machine learning' })).toBe(
      'advanced'
    );
  });

  it('returns moderate when signals conflict', () => {
    expect(deriveComplexity({ shortDescription: 'a simple digital platform' })).toBe('moderate');
  });

  it('returns moderate for unmatched text', () => {
    expect(deriveComplexity({ shortDescription: 'a farmer cooperative' })).toBe('moderate');
  });

  it('ignores isGrassroots', () => {
    expect(deriveComplexity({ isGrassroots: true })).toBe('moderate');
  });
});

describe('getCountriesForRegion', () => {
  it('returns the countries listed for a known hub region', () => {
    const hub = INNOVATION_HUB_REGIONS[0];
    const countries = getCountriesForRegion(hub.name);
    expect(countries.length).toBeGreaterThan(0);
    for (const c of hub.countries) expect(countries).toContain(c);
  });

  it('returns an empty array for an unknown region', () => {
    expect(getCountriesForRegion('Atlantis')).toEqual([]);
    expect(getCountriesForRegion(undefined)).toEqual([]);
  });

  it('round-trips every hub region', () => {
    for (const hub of INNOVATION_HUB_REGIONS) {
      const countries = getCountriesForRegion(hub.name);
      // A country assigned to two hubs would be lost from one of them; this
      // asserts the mapping is total for each region as declared.
      for (const c of hub.countries) {
        expect(countries).toContain(c);
      }
    }
  });
});
