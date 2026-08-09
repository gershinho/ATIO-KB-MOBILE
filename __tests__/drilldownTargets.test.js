import {
  challengeTarget, typeTarget, regionTarget, allTarget,
  opportunityCellTarget, readyCellTarget,
} from '../src/screens/home/drilldownTargets';
import { CHALLENGES, TYPES, getCountriesForRegion } from '../src/data/constants';

const CROPS = CHALLENGES.find((c) => c.id === 'crops');
const NATURE = TYPES.find((t) => t.id === 'nature');

describe('challengeTarget', () => {
  it('filters by the challenge id and pre-selects its keywords', () => {
    expect(challengeTarget(CROPS)).toMatchObject({
      source: 'challenge',
      title: CROPS.name,
      icon: CROPS.icon,
      filters: { challenges: ['crops'] },
      entryFilters: { challengeKeywords: CROPS.keywords },
    });
  });

  it('falls back to an empty keyword list when the entry has none', () => {
    const target = challengeTarget({ id: 'x', name: 'X', icon: 'i' });
    expect(target.entryFilters.challengeKeywords).toEqual([]);
  });
});

describe('typeTarget', () => {
  it('filters by the type id and pre-selects its keywords', () => {
    expect(typeTarget(NATURE)).toMatchObject({
      source: 'type',
      title: NATURE.name,
      filters: { types: ['nature'] },
      entryFilters: { typeKeywords: NATURE.keywords },
    });
  });
});

describe('regionTarget', () => {
  const region = { id: 'East Africa', name: 'East Africa', count: 12 };

  it('filters by hub region on both sides', () => {
    expect(regionTarget(region)).toMatchObject({
      source: 'region',
      filters: { hubRegions: ['East Africa'] },
      entryFilters: { hubRegions: ['East Africa'] },
    });
  });

  it('supplies a globe icon when the region has none', () => {
    expect(regionTarget(region).icon).toBe('earth-outline');
  });

  it('keeps an icon the region does supply', () => {
    expect(regionTarget({ ...region, icon: 'flag' }).icon).toBe('flag');
  });
});

describe('allTarget', () => {
  it('applies no filters at all', () => {
    expect(allTarget()).toMatchObject({ source: 'all', title: 'All Solutions', filters: {} });
  });
});

describe('opportunityCellTarget', () => {
  it('combines the challenge with every country in the region hub', () => {
    const target = opportunityCellTarget('East Africa', 'crops');
    expect(target.filters.challenges).toEqual(['crops']);
    expect(target.filters.countries).toEqual(getCountriesForRegion('East Africa'));
  });

  it('names the cell for both of its axes', () => {
    expect(opportunityCellTarget('East Africa', 'crops').title)
      .toBe(`${CROPS.name} in East Africa`);
  });

  it('falls back to the region name when the challenge id is unknown', () => {
    const target = opportunityCellTarget('East Africa', 'nope');
    expect(target.title).toBe('East Africa');
    expect(target.icon).toBe('grid-outline');
  });

  it('asks for a wider first page than a list entry does', () => {
    expect(opportunityCellTarget('East Africa', 'crops').limit)
      .toBeGreaterThan(challengeTarget(CROPS).limit ?? 10);
  });
});

describe('readyCellTarget', () => {
  it('filters on the challenge and the type together', () => {
    expect(readyCellTarget('crops', 'nature').filters)
      .toEqual({ challenges: ['crops'], types: ['nature'] });
  });

  it('names the cell for both of its axes', () => {
    expect(readyCellTarget('crops', 'nature').title).toBe(`${CROPS.name} × ${NATURE.name}`);
  });

  it('pre-selects the keywords of both axes', () => {
    expect(readyCellTarget('crops', 'nature').entryFilters).toEqual({
      challengeKeywords: CROPS.keywords,
      typeKeywords: NATURE.keywords,
    });
  });

  it('shows the raw ids rather than "undefined" when a lookup misses', () => {
    expect(readyCellTarget('nope', 'also-nope').title).toBe('nope × also-nope');
  });
});
