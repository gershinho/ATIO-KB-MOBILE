import {
  getActiveFilterTags,
  getFiltersAfterRemove,
  FILTER_CATEGORY_COLORS,
} from '../src/utils/activeFilterTags';
import { CHALLENGES, TYPES, REGIONS, USER_GROUPS, SDGS } from '../src/data/constants';
import { INNOVATION_HUB_REGIONS } from '../src/data/innovationHubRegions';

describe('getActiveFilterTags — guards', () => {
  it('returns an empty array for missing or non-object input', () => {
    expect(getActiveFilterTags(undefined)).toEqual([]);
    expect(getActiveFilterTags(null)).toEqual([]);
    expect(getActiveFilterTags('nope')).toEqual([]);
  });

  it('returns an empty array when no filters are set', () => {
    expect(getActiveFilterTags({})).toEqual([]);
  });

  it('ignores values that do not resolve to a known taxonomy entry', () => {
    expect(
      getActiveFilterTags({
        regions: ['not-a-region'],
        userGroups: ['not-a-group'],
        sdgs: [999],
        types: ['not-a-type'],
        challenges: ['not-a-challenge'],
      })
    ).toEqual([]);
  });
});

describe('getActiveFilterTags — tag shape', () => {
  it('builds a region tag with label, colour and category', () => {
    const region = REGIONS[0];
    const [tag] = getActiveFilterTags({ regions: [region.value] });
    expect(tag).toMatchObject({
      id: `region-${region.value}`,
      label: region.name,
      category: 'regions',
      value: region.value,
    });
    expect(tag.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('builds a hub region tag from INNOVATION_HUB_REGIONS', () => {
    const hub = INNOVATION_HUB_REGIONS[0];
    const [tag] = getActiveFilterTags({ hubRegions: [hub.id] });
    expect(tag).toMatchObject({ id: `hubRegion-${hub.id}`, label: hub.name, category: 'hubRegions' });
  });

  it('builds a user group tag', () => {
    const group = USER_GROUPS[0];
    const [tag] = getActiveFilterTags({ userGroups: [group.value] });
    expect(tag).toMatchObject({ label: group.name, category: 'userGroups' });
  });

  it('passes countries and sources through verbatim as labels', () => {
    const tags = getActiveFilterTags({ countries: ['Kenya'], sources: ['ATIO KB'] });
    expect(tags.map((t) => t.label)).toEqual(['Kenya', 'ATIO KB']);
  });

  it('labels SDGs as "SDG <number>"', () => {
    const sdg = SDGS[0];
    const [tag] = getActiveFilterTags({ sdgs: [sdg.number] });
    expect(tag.label).toBe(`SDG ${sdg.number}`);
    expect(tag.color).toBe(sdg.color);
  });

  it('adds a grassroots tag whose removal value is false', () => {
    const [tag] = getActiveFilterTags({ grassrootsOnly: true });
    expect(tag).toMatchObject({ id: 'grassroots', label: 'Grassroots only', value: false });
  });

  it('omits the grassroots tag when the flag is false', () => {
    expect(getActiveFilterTags({ grassrootsOnly: false })).toEqual([]);
  });

  it('replaces spaces with underscores in generated keyword ids', () => {
    const [tag] = getActiveFilterTags({ challengeKeywords: ['water scarcity'] });
    expect(tag.id).toBe('challengeKw-water_scarcity');
  });
});

describe('getActiveFilterTags — threshold filters', () => {
  it('omits readiness and adoption tags at the default minimum of 1', () => {
    expect(getActiveFilterTags({ readinessMin: 1, adoptionMin: 1 })).toEqual([]);
  });

  it('adds a readiness tag above the minimum', () => {
    const [tag] = getActiveFilterTags({ readinessMin: 5 });
    expect(tag).toMatchObject({ id: 'readinessMin', label: 'Readiness ≥ 5', value: 1 });
  });

  it('adds an adoption tag above the minimum', () => {
    const [tag] = getActiveFilterTags({ adoptionMin: 3 });
    expect(tag).toMatchObject({ id: 'adoptionMin', label: 'Adoption ≥ 3', value: 1 });
  });
});

describe('getActiveFilterTags — keyword precedence', () => {
  it('suppresses the parent challenge tag when challenge keywords are active', () => {
    const challenge = CHALLENGES.find((c) => c.subTerms?.length);
    const tags = getActiveFilterTags({
      challenges: [challenge.id],
      challengeKeywords: [challenge.subTerms[0].keyword],
    });
    expect(tags.some((t) => t.category === 'challenges')).toBe(false);
    expect(tags.some((t) => t.category === 'challengeKeywords')).toBe(true);
  });

  it('suppresses the parent type tag when type keywords are active', () => {
    const type = TYPES.find((t) => t.subTerms?.length);
    const tags = getActiveFilterTags({
      types: [type.id],
      typeKeywords: [type.subTerms[0].keyword],
    });
    expect(tags.some((t) => t.category === 'types')).toBe(false);
  });

  it('uses the subTerm label when the keyword is known', () => {
    const challenge = CHALLENGES.find((c) => c.subTerms?.length);
    const sub = challenge.subTerms[0];
    const [tag] = getActiveFilterTags({ challengeKeywords: [sub.keyword] });
    expect(tag.label).toBe(sub.label);
  });

  it('falls back to the raw keyword when it matches no subTerm', () => {
    const [tag] = getActiveFilterTags({ challengeKeywords: ['unmatched-keyword'] });
    expect(tag.label).toBe('unmatched-keyword');
  });
});

describe('getActiveFilterTags — colour-blind mode', () => {
  it('remaps green to teal for the grassroots tag', () => {
    const [normal] = getActiveFilterTags({ grassrootsOnly: true });
    const [safe] = getActiveFilterTags({ grassrootsOnly: true }, { colorBlindMode: true });
    expect(normal.color).toBe('#16a34a');
    expect(safe.color).toBe('#0d9488');
  });

  it('remaps red to blue for user group tags', () => {
    const group = USER_GROUPS[0];
    const [safe] = getActiveFilterTags({ userGroups: [group.value] }, { colorBlindMode: true });
    expect(safe.color).toBe('#2563eb');
  });

  it('leaves already-safe colours untouched', () => {
    const region = REGIONS[0];
    const [normal] = getActiveFilterTags({ regions: [region.value] });
    const [safe] = getActiveFilterTags({ regions: [region.value] }, { colorBlindMode: true });
    expect(safe.color).toBe(normal.color);
  });

  it('defaults to normal colours when no options are passed', () => {
    const [tag] = getActiveFilterTags({ grassrootsOnly: true });
    expect(tag.color).toBe('#16a34a');
  });
});

describe('FILTER_CATEGORY_COLORS', () => {
  it('exposes a colour entry for each simple category', () => {
    for (const key of ['region', 'readiness', 'adoption', 'userGroup', 'country', 'source', 'grassroots']) {
      expect(FILTER_CATEGORY_COLORS[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('exposes per-value maps for cost and complexity', () => {
    expect(Object.keys(FILTER_CATEGORY_COLORS.cost).sort()).toEqual(['high', 'low', 'med']);
    expect(typeof FILTER_CATEGORY_COLORS.complexity).toBe('object');
  });
});

describe('getFiltersAfterRemove', () => {
  it('removes a single value from a list filter', () => {
    const next = getFiltersAfterRemove(
      { regions: ['a', 'b', 'c'] },
      { category: 'regions', value: 'b' }
    );
    expect(next.regions).toEqual(['a', 'c']);
  });

  it('does not mutate the original filters object', () => {
    const original = { regions: ['a', 'b'] };
    getFiltersAfterRemove(original, { category: 'regions', value: 'a' });
    expect(original.regions).toEqual(['a', 'b']);
  });

  it('preserves unrelated filter keys', () => {
    const next = getFiltersAfterRemove(
      { regions: ['a'], countries: ['Kenya'], grassrootsOnly: true },
      { category: 'regions', value: 'a' }
    );
    expect(next.countries).toEqual(['Kenya']);
    expect(next.grassrootsOnly).toBe(true);
  });

  it('resets readinessMin and adoptionMin to 1 rather than removing them', () => {
    expect(getFiltersAfterRemove({ readinessMin: 7 }, { category: 'readinessMin' }).readinessMin).toBe(1);
    expect(getFiltersAfterRemove({ adoptionMin: 4 }, { category: 'adoptionMin' }).adoptionMin).toBe(1);
  });

  it('clears grassrootsOnly to false', () => {
    expect(
      getFiltersAfterRemove({ grassrootsOnly: true }, { category: 'grassrootsOnly' }).grassrootsOnly
    ).toBe(false);
  });

  it('returns an equivalent object for an unknown category', () => {
    const filters = { regions: ['a'] };
    expect(getFiltersAfterRemove(filters, { category: 'mystery', value: 'x' })).toEqual(filters);
  });

  it('handles removal when the target list is absent', () => {
    expect(getFiltersAfterRemove({}, { category: 'regions', value: 'a' }).regions).toEqual([]);
  });

  it('round-trips: every generated tag can be removed by its own category and value', () => {
    const region = REGIONS[0];
    const filters = { regions: [region.value], countries: ['Kenya'], grassrootsOnly: true };
    let next = filters;
    for (const tag of getActiveFilterTags(filters)) {
      next = getFiltersAfterRemove(next, tag);
    }
    expect(getActiveFilterTags(next)).toEqual([]);
  });
});
