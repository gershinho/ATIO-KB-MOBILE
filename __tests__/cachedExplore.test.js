/**
 * The Explore page, answered from the device.
 *
 * Offline, two of that page's five figures used to throw and replace the whole
 * screen with "Could not load database" — on a platform with no database, over
 * three grids that were perfectly capable of rendering from the cached
 * catalogue underneath it.
 */
import 'fake-indexeddb/auto';
import { jest } from '@jest/globals';

const mockPeekCatalogIndex = jest.fn();
const mockLoadTaxonomies = jest.fn();

jest.mock('../src/api/jsonapi/catalogIndex', () => ({ peekCatalogIndex: mockPeekCatalogIndex }));
jest.mock('../src/api/jsonapi/taxonomies', () => ({
  loadTaxonomies: mockLoadTaxonomies,
  termNames: (byType, type) => (byType?.[type] ?? []).map((t) => t.name),
}));

const { exploreFromCache } = require('../src/storage/cachedExplore');
const { STORES, idbPut, resetIdbConnection } = require('../src/storage/idb');

const index = (n) => ({ rows: Array.from({ length: n }, (_, i) => ({ id: `uuid-${i}` })), builtAt: 1 });

async function cache(records) {
  for (const record of records) {
    await idbPut(STORES.innovations, record.id, { id: record.id, data: record, cachedAt: 1 });
  }
}

beforeEach(async () => {
  jest.clearAllMocks();
  resetIdbConnection();
  await new Promise((resolve) => { const r = indexedDB.deleteDatabase('atio-kb'); r.onsuccess = resolve; r.onerror = resolve; r.onblocked = resolve; });
  mockPeekCatalogIndex.mockResolvedValue(index(6287));
  mockLoadTaxonomies.mockResolvedValue({
    byType: { 'taxonomy_term--countries': [{ name: 'Kenya' }, { name: 'Mali' }] },
  });
});

describe('exploreFromCache', () => {
  it('counts the innovations from the cached catalogue, not from zero', async () => {
    const out = await exploreFromCache();
    expect(out.stats.innovations).toBe(6287);
    expect(out.stats.countries).toBe(2);
    expect(out.stats.sdgs).toBe(17);
  });

  it('gives up rather than showing a page of zeroes', async () => {
    // Zeroes would read as "there are no innovations", which is a worse lie
    // than the error the caller falls back to.
    mockPeekCatalogIndex.mockResolvedValue(null);
    expect(await exploreFromCache()).toBeNull();
  });

  it('gives up when the catalogue pass never finished', async () => {
    mockPeekCatalogIndex.mockResolvedValue({ rows: [], builtAt: 1 });
    expect(await exploreFromCache()).toBeNull();
  });

  it('orders the most advanced of what is saved', async () => {
    await cache([
      { id: 'a', title: 'Idea', readinessLevel: 1 },
      { id: 'b', title: 'Ready', readinessLevel: 9 },
      { id: 'c', title: 'Piloted', readinessLevel: 5 },
    ]);

    const out = await exploreFromCache({ advancedLimit: 2 });
    expect(out.mostAdvanced.map((r) => r.title)).toEqual(['Ready', 'Piloted']);
  });

  it('marks what it returns as held on the device', async () => {
    await cache([{ id: 'a', title: 'Ready', readinessLevel: 9 }]);
    const out = await exploreFromCache();
    expect(out.mostAdvanced[0].availableOffline).toBe(true);
  });

  it('leaves out records with no readiness level, which cannot be ranked', async () => {
    await cache([
      { id: 'a', title: 'Unlevelled', readinessLevel: null },
      { id: 'b', title: 'Ready', readinessLevel: 9 },
    ]);
    const out = await exploreFromCache();
    expect(out.mostAdvanced.map((r) => r.title)).toEqual(['Ready']);
  });

  it('still reports the headline figures when nothing is cached to list', async () => {
    const out = await exploreFromCache();
    expect(out.stats.innovations).toBe(6287);
    expect(out.mostAdvanced).toEqual([]);
  });

  it('omits the country figure rather than failing when the vocabularies are gone', async () => {
    mockLoadTaxonomies.mockRejectedValue(new Error('nothing cached'));
    const out = await exploreFromCache();
    expect(out.stats.innovations).toBe(6287);
    expect(out.stats.countries).toBe(0);
  });
});
