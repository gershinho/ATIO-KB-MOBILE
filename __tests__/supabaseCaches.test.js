/**
 * With the Supabase data source, the catalogue index and the vocabularies come
 * from RPCs instead of the portal — and everything around the fetch must stay
 * as it was: the same IndexedDB keys, the same TTLs, a stale copy served while
 * a fresh one is built, the stored copy served when the source cannot be
 * reached, and the progress the drilldown shows. That is what keeps offline
 * behaviour identical across the switch.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import {
  loadCatalogIndex,
  resetCatalogIndex,
  subscribeCatalogProgress,
  CATALOG_TTL_MS,
  CATALOG_MAX_STALE_MS,
} from '../src/api/jsonapi/catalogIndex';
import { loadTaxonomies, resetTaxonomies, TAXONOMY_TTL_MS } from '../src/api/jsonapi/taxonomies';
import { resetIdbConnection, idbGet, STORES } from '../src/storage/idb';
import { rpc } from '../src/api/supabase/client';

jest.mock('../src/api/supabase/client', () => ({
  usingSupabase: () => true,
  rpc: jest.fn(),
}));

const row = (i) => ({ id: `r${i}`, readiness: 9, countries: ['Kenya'], useCases: [], types: [], changed: i });
const byType = { 'taxonomy_term--countries': [['c1', 'Kenya']] };

/** A snapshot of `total` index rows behind get_catalog_index, plus get_taxonomies. */
function snapshot(total) {
  const rows = Array.from({ length: total }, (_, i) => row(i));
  rpc.mockImplementation(async (name, { after, lim } = {}) => {
    if (name === 'get_taxonomies') return { byType, snapshotVersion: '2' };
    const start = after ? rows.findIndex((r) => r.id === after) + 1 : 0;
    const page = rows.slice(start, start + lim);
    return {
      rows: page,
      sources: ['FAO', 'CGIAR'],
      total,
      snapshotVersion: '2',
      next: page.length === lim ? page[page.length - 1].id : null,
    };
  });
}

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  resetIdbConnection();
  resetCatalogIndex();
  resetTaxonomies();
  rpc.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('catalogue index from Supabase', () => {
  it('stores the snapshot under catalogIndex:v2 in the crawl’s shape', async () => {
    snapshot(2500);
    const index = await loadCatalogIndex({ now: 1000 });
    expect(index).toMatchObject({ builtAt: 1000, fromCache: false, sources: ['CGIAR', 'FAO'] });
    expect(index.rows).toHaveLength(2500);

    const stored = await idbGet(STORES.meta, 'catalogIndex:v2');
    expect(stored).toEqual({ rows: index.rows, sources: ['CGIAR', 'FAO'], builtAt: 1000 });
  });

  it('serves the stored copy within the TTL, asking nothing', async () => {
    snapshot(10);
    await loadCatalogIndex({ now: 0 });
    resetCatalogIndex();
    rpc.mockClear();

    await expect(loadCatalogIndex({ now: CATALOG_TTL_MS - 1 })).resolves.toMatchObject({ fromCache: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('serves a stale copy at once and refreshes it behind', async () => {
    snapshot(10);
    await loadCatalogIndex({ now: 0 });
    resetCatalogIndex();
    rpc.mockClear();

    const served = await loadCatalogIndex({ now: CATALOG_TTL_MS + 1 });
    expect(served).toMatchObject({ fromCache: true, stale: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(rpc).toHaveBeenCalledWith('get_catalog_index', expect.anything());
  });

  it('serves the stored copy when Supabase cannot be reached', async () => {
    snapshot(10);
    await loadCatalogIndex({ now: 0 });
    resetCatalogIndex();
    rpc.mockRejectedValue(new Error('offline'));

    const served = await loadCatalogIndex({ now: CATALOG_MAX_STALE_MS + 1 });
    expect(served).toMatchObject({ fromCache: true, stale: true });
    expect(served.rows).toHaveLength(10);
  });

  it('reports progress while someone is waiting on the first load', async () => {
    snapshot(2500);
    const seen = [];
    const unsubscribe = subscribeCatalogProgress((p) => seen.push(p));
    await loadCatalogIndex({ now: 0 });
    unsubscribe();
    expect(seen.some((p) => p.loading && p.rows === 1000 && p.total === 2500)).toBe(true);
    expect(seen.at(-1)).toMatchObject({ loading: false });
  });
});

describe('vocabularies from Supabase', () => {
  it('stores them under the same key, in the same shape, for the same day', async () => {
    snapshot(0);
    const loaded = await loadTaxonomies({ now: 0 });
    expect(loaded.byType).toEqual(byType);
    expect(loaded.index.get('taxonomy_term--countries:c1')).toBe('Kenya');
    expect(await idbGet(STORES.taxonomies, 'vocabularies')).toEqual({ byType, fetchedAt: 0 });

    resetTaxonomies();
    rpc.mockClear();
    await loadTaxonomies({ now: TAXONOMY_TTL_MS - 1 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('serves stale vocabularies when Supabase cannot be reached', async () => {
    snapshot(0);
    await loadTaxonomies({ now: 0 });
    resetTaxonomies();
    rpc.mockRejectedValue(new Error('offline'));
    await expect(loadTaxonomies({ now: TAXONOMY_TTL_MS + 1 })).resolves.toMatchObject({ stale: true, byType });
  });
});
