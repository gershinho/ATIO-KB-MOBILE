/**
 * db.web.js: the same functions as db.js, answered by the portal.
 *
 * The behaviour worth protecting is the ordering. The portal sorts records with
 * no readiness level before every record that has one, and 1,123 of the 6,287
 * published records have none — so a naive list leads with a sixth of the
 * catalogue in no particular order, and a list that excludes them hides that
 * sixth entirely. Neither is acceptable, so the list is stitched from two
 * queries, and these tests are mostly about that seam.
 */
import { fetchJsonApi } from '../src/api/jsonapi/client';
import { countMatching } from '../src/api/jsonapi/count';
import { loadTaxonomies } from '../src/api/jsonapi/taxonomies';
import {
  searchInnovations,
  countInnovations,
  getMostAdvancedInnovations,
  getInnovationById,
  getHelpInnovations,
  getStats,
  getAllCountries,
  getDataSources,
  getTopRegions,
  getChallengeCounts,
  getTypeCounts,
} from '../src/database/db.web';
import { loadCatalogIndex } from '../src/api/jsonapi/catalogIndex';
import { CHALLENGES, TYPES, COUNTRY_TO_REGION } from '../src/data/constants';
import { INNOVATION_HUB_REGIONS } from '../src/data/innovationHubRegions';
import readiness from './fixtures/jsonapi/readinessLevels.json';

jest.mock('../src/api/jsonapi/client', () => ({
  fetchJsonApi: jest.fn(),
  CATALOGUE_UNAVAILABLE_MESSAGE: 'unavailable',
}));
jest.mock('../src/api/jsonapi/count', () => ({ countMatching: jest.fn() }));
jest.mock('../src/api/jsonapi/catalogIndex', () => ({ loadCatalogIndex: jest.fn() }));
jest.mock('../src/api/jsonapi/taxonomies', () => ({
  loadTaxonomies: jest.fn(async () => ({
    index: new Map([['taxonomy_term--readiness_levels:r9', '9. Ready']]),
    byType: {
      'taxonomy_term--readiness_levels': require('./fixtures/jsonapi/readinessLevels.json')
        .data.map((t) => [t.id, t.attributes.name]),
      'taxonomy_term--countries': [['c1', 'Kenya'], ['c2', 'Angola']],
    },
  })),
  termNames: jest.requireActual('../src/api/jsonapi/taxonomies').termNames,
}));

/** A record as the portal sends it, with or without a readiness level. */
const record = (id, levelled = true) => ({
  type: 'node--innovation',
  id,
  attributes: { title: `Innovation ${id}`, field_if_grassroots: false },
  relationships: levelled
    ? { field_readiness_level: { data: { type: 'taxonomy_term--readiness_levels', id: 'r9' } } }
    : { field_readiness_level: { data: null } },
});

/**
 * Stand in for the portal: a collection of `levelled` records that have a
 * readiness level and `unlevelled` that do not, paged as the real one would be.
 * A query carrying IS NOT NULL sees only the first group.
 */
function portalWith({ levelled = 0, unlevelled = 0 }) {
  fetchJsonApi.mockImplementation(async (path, { query }) => {
    const { limit, offset } = query.page;
    const onlyLevelled = JSON.stringify(query).includes('IS NOT NULL');
    const collection = [
      ...Array.from({ length: levelled }, (_, i) => record(`L${i}`, true)),
      ...(onlyLevelled ? [] : Array.from({ length: unlevelled }, (_, i) => record(`U${i}`, false))),
    ];
    return { data: collection.slice(offset, offset + limit) };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('ordering', () => {
  it('asks for the most recently updated first', async () => {
    // Not the bundled build's "most advanced first": the portal sorts empty
    // relationships before every value, and 1,123 published records have no
    // readiness level, so that order would lead every list with them. Keeping
    // them out needs IS NOT NULL, which times out past 50 seconds when
    // combined with a filter on a related field. See docs/JSON-API.md.
    portalWith({ levelled: 10, unlevelled: 0 });
    await searchInnovations({}, { limit: 3, offset: 0 });

    const [, options] = fetchJsonApi.mock.calls[0];
    expect(options.query.sort).toBe('-changed');
    expect(JSON.stringify(options.query)).not.toContain('IS NOT NULL');
  });

  it('asks the portal for one page, not one page per half', async () => {
    portalWith({ levelled: 10, unlevelled: 10 });
    await searchInnovations({}, { limit: 5, offset: 0 });
    expect(fetchJsonApi).toHaveBeenCalledTimes(1);
  });

  it('pages with the offset it was given', async () => {
    portalWith({ levelled: 100, unlevelled: 0 });
    await searchInnovations({}, { limit: 10, offset: 30 });
    expect(fetchJsonApi.mock.calls[0][1].query.page).toEqual({ limit: 10, offset: 30 });
  });

  it('returns a short page at the end of the list', async () => {
    portalWith({ levelled: 2, unlevelled: 1 });
    const page = await searchInnovations({}, { limit: 10, offset: 0 });
    expect(page.map((i) => i.id)).toEqual(['L0', 'L1', 'U0']);
  });

  it('returns nothing when nothing matches', async () => {
    portalWith({ levelled: 0, unlevelled: 0 });
    expect(await searchInnovations({}, { limit: 10, offset: 0 })).toEqual([]);
  });
});

describe('getMostAdvancedInnovations', () => {
  it('excludes the records with no level rather than moving them to the end', async () => {
    // Whatever "NOT INDICATED" means, it does not mean most advanced.
    portalWith({ levelled: 10, unlevelled: 10 });
    const rows = await getMostAdvancedInnovations(5);

    expect(rows.map((i) => i.id)).toEqual(['L0', 'L1', 'L2', 'L3', 'L4']);
    expect(fetchJsonApi).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fetchJsonApi.mock.calls[0][1].query)).toContain('IS NOT NULL');
  });
});

describe('counting', () => {
  it('asks for a count, and says so when it was not a cheap one', async () => {
    countMatching.mockResolvedValue({ count: 42, requests: 23, fromMeta: false });
    expect(await countInnovations({ countries: ['Kenya'] })).toBe(42);
  });

  it('passes the filters through to the count', async () => {
    countMatching.mockResolvedValue({ count: 1, requests: 1, fromMeta: true });
    await countInnovations({ grassrootsOnly: true });
    expect(JSON.stringify(countMatching.mock.calls[0][1])).toContain('field_if_grassroots');
  });

  it('scans, bounded, when a derived filter is in play', async () => {
    // cost and complexity are computed from the description text, so no query
    // can express them and the rows have to be read and sifted.
    portalWith({ levelled: 30, unlevelled: 0 });
    const count = await countInnovations({ cost: ['low'] });
    expect(countMatching).not.toHaveBeenCalled();
    expect(typeof count).toBe('number');
  });
});

describe('the rest', () => {
  it('fetches one innovation by uuid, asking for its owner too', async () => {
    fetchJsonApi.mockResolvedValue({ data: record('abc') });
    const innovation = await getInnovationById('abc');

    expect(innovation.id).toBe('abc');
    expect(fetchJsonApi.mock.calls[0][0]).toBe('/node/innovation/abc');
    expect(fetchJsonApi.mock.calls[0][1].query.include).toContain('field_owner');
  });

  it('returns null for no id rather than fetching a collection', async () => {
    expect(await getInnovationById(null)).toBeNull();
    expect(fetchJsonApi).not.toHaveBeenCalled();
  });

  it('looks for help across several words in one OR group', async () => {
    portalWith({ levelled: 3, unlevelled: 0 });
    await getHelpInnovations(10);
    const query = JSON.stringify(fetchJsonApi.mock.calls[0][1].query);
    expect(query).toContain('hotline');
    expect(query).toContain('helpline');
    expect(query).toContain('"conjunction":"OR"');
  });

  it('reports the headline counts', async () => {
    countMatching.mockResolvedValue({ count: 6287, requests: 23, fromMeta: false });
    expect(await getStats()).toEqual({ innovations: 6287, countries: 2, sdgs: 17 });
  });

  it('lists countries for the filter panel, sorted', async () => {
    expect(await getAllCountries()).toEqual([{ name: 'Angola' }, { name: 'Kenya' }]);
  });

});

describe('facet counts, one request each', () => {
  const CHALLENGE = CHALLENGES[0];
  const TYPE = TYPES[0];

  beforeEach(() => {
    countMatching.mockResolvedValue({ count: 7, requests: 1, fromMeta: true });
    // The shared fixture has no use-case vocabulary, so every challenge would
    // resolve to the "matches nothing" sentinel and the specs would be
    // indistinguishable. Give two challenges a term each.
    loadTaxonomies.mockResolvedValue({
      index: new Map(),
      byType: {
        'taxonomy_term--use_cases': [
          ['u1', CHALLENGES[0].keywords[0]],
          ['u2', CHALLENGES[1].keywords[0]],
        ],
      },
    });
  });

  it('asks the portal once per challenge rather than walking the catalogue', async () => {
    const counts = await getChallengeCounts();

    expect(countMatching).toHaveBeenCalledTimes(CHALLENGES.length);
    expect(loadCatalogIndex).not.toHaveBeenCalled();
    expect(counts[CHALLENGE.id]).toBe(7);
    expect(Object.keys(counts)).toHaveLength(CHALLENGES.length);
  });

  it('asks once per type', async () => {
    const counts = await getTypeCounts();

    expect(countMatching).toHaveBeenCalledTimes(TYPES.length);
    expect(counts[TYPE.id]).toBe(7);
  });

  it('asks once per hub region, and sorts what comes back', async () => {
    let n = 0;
    countMatching.mockImplementation(async () => ({ count: (n += 1), requests: 1, fromMeta: true }));

    const regions = await getTopRegions(3);

    expect(countMatching).toHaveBeenCalledTimes(INNOVATION_HUB_REGIONS.length);
    expect(regions).toHaveLength(3);
    expect(regions[0].count).toBeGreaterThan(regions[1].count);
  });

  it('reports each count as it lands, not all at the end', async () => {
    const seen = [];
    await getChallengeCounts((id, count) => seen.push([id, count]));

    // One call per challenge, each carrying its own answer — which is what lets
    // a tile show its number without waiting for the other eleven.
    expect(seen).toHaveLength(CHALLENGES.length);
    expect(seen.every(([, count]) => count === 7)).toBe(true);
    expect(new Set(seen.map(([id]) => id)).size).toBe(CHALLENGES.length);
  });

  it('still answers in full for a caller that does not want the running commentary', async () => {
    const counts = await getChallengeCounts();
    expect(Object.keys(counts)).toHaveLength(CHALLENGES.length);
  });

  it('filters each count by its own group', async () => {
    await getChallengeCounts();

    const specs = countMatching.mock.calls.map(([, spec]) => JSON.stringify(spec));
    // The two challenges the fixture gives terms to must ask different
    // questions; otherwise every tile would show the same number.
    expect(specs[0]).not.toEqual(specs[1]);
    expect(specs[0]).toContain(CHALLENGES[0].keywords[0]);
    expect(specs[1]).toContain(CHALLENGES[1].keywords[0]);
  });
});

describe('facet counts, falling back to the catalogue pass', () => {
  const CHALLENGE = CHALLENGES[0];
  const TYPE = TYPES[0];
  const KENYA = Object.keys(COUNTRY_TO_REGION)[0];
  const REGION = COUNTRY_TO_REGION[KENYA];

  const indexed = (rows, sources = []) => loadCatalogIndex.mockResolvedValue({ rows, sources });

  beforeEach(() => {
    // The portal is tried first and these cover what happens when it cannot be
    // reached — which is also the path that keeps numbers on screen offline.
    countMatching.mockRejectedValue(new Error('offline'));
  });

  it('counts innovations per challenge', async () => {
    indexed([
      { useCases: [CHALLENGE.keywords[0]], types: [], countries: [] },
      { useCases: [CHALLENGE.keywords[0]], types: [], countries: [] },
      { useCases: ['nothing matches'], types: [], countries: [] },
    ]);
    expect((await getChallengeCounts())[CHALLENGE.id]).toBe(2);
  });

  it('reports zero for a challenge nothing matched, rather than omitting it', async () => {
    // The grid renders every challenge; a missing key reads as undefined.
    indexed([{ useCases: ['nothing matches'], types: [], countries: [] }]);
    const counts = await getChallengeCounts();
    expect(Object.keys(counts)).toHaveLength(CHALLENGES.length);
    expect(counts[CHALLENGE.id]).toBe(0);
  });

  it('counts innovations per type', async () => {
    indexed([{ useCases: [], types: [TYPE.keywords[0]], countries: [] }]);
    expect((await getTypeCounts())[TYPE.id]).toBe(1);
  });

  it('counts hub regions, largest first', async () => {
    indexed([
      { useCases: [], types: [], countries: [KENYA] },
      { useCases: [], types: [], countries: [KENYA] },
    ]);
    const regions = await getTopRegions(15);
    expect(regions[0]).toMatchObject({ name: REGION, count: 2 });
    expect(regions.every((r, i, all) => i === 0 || all[i - 1].count >= r.count)).toBe(true);
  });

  it('gives every hub its id, which is what the drilldown filters on', async () => {
    // Without it, tapping a hub filtered on hubRegions: [undefined], matched no
    // hub, and opened the whole catalogue under the hub's name.
    indexed([{ useCases: [], types: [], countries: [KENYA] }]);
    const regions = await getTopRegions(15);
    expect(regions.length).toBeGreaterThan(0);
    for (const region of regions) {
      expect(INNOVATION_HUB_REGIONS.find((r) => r.id === region.id)?.name).toBe(region.name);
    }
  });

  it('honours the limit', async () => {
    indexed([{ useCases: [], types: [], countries: [KENYA] }]);
    expect(await getTopRegions(3)).toHaveLength(3);
  });

  it('names the data sources the pass found', async () => {
    indexed([], ['Digital Agri Hub', 'WOCAT']);
    expect(await getDataSources()).toEqual([{ title: 'Digital Agri Hub' }, { title: 'WOCAT' }]);
  });

  it('reports the pass\u2019s numbers too, so tiles do not sit at "counting…"', async () => {
    indexed([
      { useCases: [CHALLENGE.keywords[0]], types: [], countries: [] },
      { useCases: ['nothing matches'], types: [], countries: [] },
    ]);

    const seen = new Map();
    await getChallengeCounts((id, count) => seen.set(id, count));

    expect(seen.size).toBe(CHALLENGES.length);
    expect(seen.get(CHALLENGE.id)).toBe(1);
  });

  it('counts a record once per group it belongs to', async () => {
    // A record in two challenges counts in both, which is the same reading the
    // heat maps take.
    const second = CHALLENGES[1];
    indexed([{ useCases: [CHALLENGE.keywords[0], second.keywords[0]], types: [], countries: [] }]);
    const counts = await getChallengeCounts();
    expect(counts[CHALLENGE.id]).toBe(1);
    expect(counts[second.id]).toBe(1);
  });
});

describe('the sort contract with the portal', () => {
  it('still holds: higher term id means lower readiness level', async () => {
    // The ordering above rests on this. If FAO renumber the vocabulary, every
    // list in the web build silently inverts — so the relationship is pinned
    // here against a captured copy of the real terms.
    const levelled = readiness.data
      .map((t) => ({ tid: t.attributes.drupal_internal__tid, name: t.attributes.name }))
      .filter((t) => /^\d/.test(t.name))
      .sort((a, b) => a.tid - b.tid);

    const levels = levelled.map((t) => parseInt(t.name, 10));
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    expect(levelled[0].name).toBe('9. Ready');
  });
});

describe('filtering on the catalogue index', () => {
  // The portal answers several related-field filters in minutes; the index
  // answers them at once, so only the page shown goes over the network.
  const indexRow = (id, fields = {}) => ({
    id, countries: [], useCases: [], types: [], regions: [], sdgs: [], users: [],
    readinessTerm: null, adoptionTerm: null, sourceTitle: null, grassroots: false, changed: 0,
    ...fields,
  });

  const rows = [
    indexRow('k-old', { countries: ['Kenya'], changed: 1 }),
    indexRow('k-new', { countries: ['Kenya'], changed: 3 }),
    indexRow('k-mid', { countries: ['Kenya'], changed: 2 }),
    indexRow('peru', { countries: ['Peru'], changed: 9 }),
  ];

  beforeEach(() => {
    loadCatalogIndex.mockResolvedValue({ rows, sources: [] });
    // The portal answers an id IN in its own order, not the order asked.
    fetchJsonApi.mockImplementation(async (path, { query }) => {
      const ids = query.filter.ids?.value ?? [];
      return { data: [...ids].reverse().map((id) => record(id)) };
    });
  });

  afterEach(() => loadCatalogIndex.mockReset());

  it('matches in the browser and fetches only the page, by id, most recent first', async () => {
    const results = await searchInnovations({ countries: ['Kenya'] }, { limit: 2, offset: 0 });

    expect(results.map((r) => r.id)).toEqual(['k-new', 'k-mid']);
    expect(fetchJsonApi).toHaveBeenCalledTimes(1);
    // The slow part never reaches the portal: the only condition is the ids.
    const { filter } = fetchJsonApi.mock.calls[0][1].query;
    expect(filter).toEqual({ status: 1, ids: { path: 'id', operator: 'IN', value: ['k-new', 'k-mid'] } });
  });

  it('pages through the matches with the offset it was given', async () => {
    const results = await searchInnovations({ countries: ['Kenya'] }, { limit: 2, offset: 2 });
    expect(results.map((r) => r.id)).toEqual(['k-old']);
  });

  it('counts the matches without asking the portal', async () => {
    expect(await countInnovations({ countries: ['Kenya'] })).toBe(3);
    expect(fetchJsonApi).not.toHaveBeenCalled();
    expect(countMatching).not.toHaveBeenCalled();
  });

  it('asks nothing of the portal when nothing matches', async () => {
    expect(await searchInnovations({ countries: ['Chile'] })).toEqual([]);
    expect(fetchJsonApi).not.toHaveBeenCalled();
  });

  it('asks the portal the whole question when there is no index to filter on', async () => {
    loadCatalogIndex.mockRejectedValue(new Error('offline, nothing stored'));
    fetchJsonApi.mockResolvedValue({ data: [record('a')] });

    await searchInnovations({ countries: ['Kenya'] }, { limit: 10 });

    const filter = JSON.stringify(fetchJsonApi.mock.calls[0][1].query.filter);
    expect(filter).toContain('field_countries_adoption');
  });
});
