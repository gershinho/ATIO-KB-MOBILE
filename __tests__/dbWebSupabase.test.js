/**
 * db.web.js with EXPO_PUBLIC_DATA_SOURCE=supabase: every export answers from
 * the published snapshot, returns what it returned from the portal, and never
 * touches the portal — the point of the migration is that browsers stop
 * reading it. dbWeb.test.js keeps covering the portal path, which is the
 * default and the rollback route.
 */
import { fetchJsonApi } from '../src/api/jsonapi/client';
import { countMatching } from '../src/api/jsonapi/count';
import { loadCatalogIndex } from '../src/api/jsonapi/catalogIndex';
import { rpc } from '../src/api/supabase/client';
import {
  searchInnovations,
  countInnovations,
  getMostAdvancedInnovations,
  getInnovationById,
  getInnovationsByIds,
  getChangedTimes,
  getHelpInnovations,
  getStats,
  getChallengeCounts,
  getTopRegions,
} from '../src/database/db.web';
import { CHALLENGES } from '../src/data/constants';
import { INNOVATION_HUB_REGIONS } from '../src/data/innovationHubRegions';

jest.mock('../src/api/jsonapi/client', () => ({
  ...jest.requireActual('../src/api/jsonapi/client'),
  fetchJsonApi: jest.fn(async () => {
    throw new Error('the portal must not be called on the Supabase path');
  }),
}));
jest.mock('../src/api/jsonapi/count', () => ({
  countMatching: jest.fn(async () => {
    throw new Error('the portal must not be counted on the Supabase path');
  }),
}));
jest.mock('../src/api/jsonapi/catalogIndex', () => ({ loadCatalogIndex: jest.fn() }));
jest.mock('../src/api/supabase/client', () => ({
  usingSupabase: () => true,
  rpc: jest.fn(),
}));
jest.mock('../src/api/jsonapi/taxonomies', () => ({
  loadTaxonomies: jest.fn(async () => ({
    index: new Map(),
    byType: {
      'taxonomy_term--use_cases': [['u1', 'Crop production']],
      'taxonomy_term--countries': [['c1', 'Kenya'], ['c2', 'Angola']],
    },
  })),
  termNames: jest.requireActual('../src/api/jsonapi/taxonomies').termNames,
}));

const innovation = (id) => ({ id, title: `Innovation ${id}`, cost: 'low', thumbsUpCount: 0 });

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name, args) => {
    switch (name) {
      case 'browse_innovations':
        return {
          results: Array.from({ length: Math.min(args.lim, 3) }, (_, i) => innovation(`b${args.off + i}`)),
          count: 42,
          exact: true,
          snapshotVersion: '2',
        };
      case 'get_innovations':
        return args.ids.filter((id) => id !== 'gone').reverse().map(innovation);
      case 'get_changed':
        return args.ids.map((id) => ({ id, changed: '2026-10-06T06:50:55+00:00' }));
      default:
        throw new Error(`unexpected rpc ${name}`);
    }
  });
});

afterEach(() => {
  expect(fetchJsonApi).not.toHaveBeenCalled();
  expect(countMatching).not.toHaveBeenCalled();
});

describe('db.web.js on the Supabase snapshot', () => {
  it('pages a filtered list with one browse call, filters resolved to terms', async () => {
    const page = await searchInnovations({ challengeKeywords: ['crop production'], cost: ['low'] }, { limit: 10, offset: 20 });
    expect(page.map((r) => r.id)).toEqual(['b20', 'b21', 'b22']);
    const [, args] = rpc.mock.calls[0];
    expect(args).toMatchObject({ lim: 10, off: 20, sort: 'recent' });
    expect(args.filters).toEqual({
      all: [[{ field: 'useCase', op: 'in', values: ['Crop production'] }]],
      cost: ['low'],
    });
  });

  it('counts exactly, derived filters included, without fetching rows', async () => {
    await expect(countInnovations({ complexity: ['simple'] })).resolves.toBe(42);
    expect(rpc.mock.calls[0][1]).toMatchObject({ lim: 0, filters: { all: [], complexity: ['simple'] } });
  });

  it('lists the most advanced among records that have a level', async () => {
    await getMostAdvancedInnovations(10);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      sort: 'advanced',
      lim: 10,
      filters: { all: [[{ field: 'readiness', op: 'present' }]] },
    });
  });

  it('finds help innovations by any of the title keywords', async () => {
    await getHelpInnovations(30);
    const { filters, lim } = rpc.mock.calls[0][1];
    expect(lim).toBe(30);
    expect(filters.all).toHaveLength(1);
    expect(filters.all[0].map((c) => c.value)).toEqual(['hotline', 'helpline', 'help line', 'support']);
  });

  it('opens one record, and returns null for one the snapshot lacks', async () => {
    await expect(getInnovationById('a')).resolves.toMatchObject({ id: 'a' });
    await expect(getInnovationById('gone')).resolves.toBeNull();
  });

  it('returns records by id in the order asked', async () => {
    const records = await getInnovationsByIds(['c', 'gone', 'a', 'b']);
    expect(records.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('returns changed stamps as the map the offline refresh reads', async () => {
    await expect(getChangedTimes(['a'])).resolves.toEqual(new Map([['a', '2026-10-06T06:50:55+00:00']]));
  });

  it('counts the headline total and the countries vocabulary', async () => {
    await expect(getStats()).resolves.toEqual({ innovations: 42, countries: 2, sdgs: 17 });
  });

  it('counts each Explore tile with its own filter, reporting each as it lands', async () => {
    const heard = [];
    const counts = await getChallengeCounts((id, n) => heard.push([id, n]));
    expect(Object.keys(counts)).toEqual(CHALLENGES.map((c) => c.id));
    expect(heard).toHaveLength(CHALLENGES.length);
    expect(rpc.mock.calls.every(([name, args]) => name === 'browse_innovations' && args.lim === 0)).toBe(true);
  });

  it('falls back to the catalogue index when the tile counts cannot be fetched', async () => {
    rpc.mockRejectedValue(new Error('offline'));
    loadCatalogIndex.mockResolvedValue({ rows: [{ countries: [INNOVATION_HUB_REGIONS[0].countries[0]] }] });
    const regions = await getTopRegions(3);
    expect(regions[0]).toMatchObject({ id: INNOVATION_HUB_REGIONS[0].id, count: 1 });
  });

  it('reports an unreachable snapshot as the catalogue being unavailable', async () => {
    rpc.mockRejectedValue(new Error('offline'));
    loadCatalogIndex.mockRejectedValue(new Error('offline'));
    await expect(searchInnovations({})).rejects.toThrow();
  });
});
