/**
 * The Supabase reads must hand their callers the shapes the portal reads did,
 * so catalogIndex.js, taxonomies.js, db.web.js and querySearch.web.js can
 * switch source without changing what they store or return. The RPCs are faked
 * here; importer/checks/rpcContracts.js runs the real ones against staging.
 */
import {
  fetchCatalogIndex,
  fetchTaxonomies,
  fetchInnovationsByIds,
  fetchChangedTimes,
  fetchSearchCandidates,
  INDEX_PAGE,
} from '../src/api/supabase/reads';

const indexRow = (id) => ({ id, readiness: 1, countries: [], useCases: [], types: [], changed: 0 });

/** A fake get_catalog_index over `total` rows, optionally republished once. */
function indexRpc(total, { republishAfterPage } = {}) {
  const ids = Array.from({ length: total }, (_, i) => `id-${String(i).padStart(5, '0')}`);
  let version = 'run-1';
  let served = 0;
  const calls = [];
  const rpc = jest.fn(async (name, { after, lim, snapshot }) => {
    calls.push({ after, snapshot });
    if (snapshot && snapshot !== version) {
      const err = new Error('snapshot changed');
      err.code = 'P0002';
      throw err;
    }
    const start = after ? ids.indexOf(after) + 1 : 0;
    const rows = ids.slice(start, start + lim).map(indexRow);
    const page = {
      rows,
      sources: ['Zeta', 'alpha', 'Beta', 'alpha'],
      total,
      snapshotVersion: version,
      next: rows.length === lim ? rows[rows.length - 1].id : null,
    };
    // A publish lands just after this page is served.
    served += 1;
    if (served === republishAfterPage) version = 'run-2';
    return page;
  });
  rpc.calls = calls;
  return rpc;
}

describe('fetchCatalogIndex', () => {
  it('pages to the end and assembles what the crawl stores', async () => {
    const rpc = indexRpc(INDEX_PAGE * 2 + 5);
    const progress = [];
    const index = await fetchCatalogIndex({ rpc, now: 123, onProgress: (p) => progress.push(p) });

    expect(index.rows).toHaveLength(INDEX_PAGE * 2 + 5);
    expect(new Set(index.rows.map((r) => r.id)).size).toBe(index.rows.length);
    expect(index.builtAt).toBe(123);
    expect(index.sources).toEqual(['alpha', 'Beta', 'Zeta']);
    expect(progress.at(-1)).toEqual({ pages: 3, rows: INDEX_PAGE * 2 + 5, total: INDEX_PAGE * 2 + 5 });
  });

  it('pins every later page to the first page’s snapshot', async () => {
    const rpc = indexRpc(INDEX_PAGE + 1);
    await fetchCatalogIndex({ rpc });
    expect(rpc.calls[0].snapshot).toBeNull();
    expect(rpc.calls[1].snapshot).toBe('run-1');
  });

  it('starts again once when a publish lands mid-walk', async () => {
    const rpc = indexRpc(INDEX_PAGE * 2 + 5, { republishAfterPage: 1 });
    const index = await fetchCatalogIndex({ rpc });
    expect(index.rows).toHaveLength(INDEX_PAGE * 2 + 5);
    expect(rpc.calls.filter((c) => c.after === null)).toHaveLength(2);
  });

  it('lets any other failure through, for the caller’s stale fallback', async () => {
    const rpc = jest.fn(async () => { throw new Error('offline'); });
    await expect(fetchCatalogIndex({ rpc })).rejects.toThrow('offline');
  });
});

describe('the other reads', () => {
  it('returns the vocabularies in the cache shape', async () => {
    const byType = { 'taxonomy_term--type': [['t1', 'Digital']] };
    await expect(fetchTaxonomies({ rpc: async () => ({ byType, snapshotVersion: '2' }) })).resolves.toEqual(byType);
  });

  it('returns records in the order asked, skipping unknown ids, batching by 100', async () => {
    const rpc = jest.fn(async (name, { ids }) => ids.filter((id) => id !== 'gone').map((id) => ({ id })));
    const ids = ['c', 'gone', 'a', ...Array.from({ length: 120 }, (_, i) => `x${i}`), 'b'];
    const records = await fetchInnovationsByIds(ids, { rpc });
    expect(records.map((r) => r.id)).toEqual(ids.filter((id) => id !== 'gone'));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('returns changed stamps as an id → string map', async () => {
    const rpc = async () => [{ id: 'a', changed: '2026-10-06T06:50:55+00:00' }, { id: 'b', changed: null }];
    const changed = await fetchChangedTimes(['a', 'b'], { rpc });
    expect(changed).toEqual(new Map([['a', '2026-10-06T06:50:55+00:00'], ['b', null]]));
  });

  it('returns search candidates in findCandidates’ shape', async () => {
    const rpc = jest.fn(async () => ({
      candidates: [{ id: 'a', title: 'Solar pump', summary: 'Pumps water' }],
      conjunction: 'OR',
      strictCount: 1,
      requests: 1,
      expandedKept: [],
    }));
    const result = await fetchSearchCandidates(['solar', 'to', 'pump'], { expandedTerms: ['irrigation'], rpc });
    expect(rpc).toHaveBeenCalledWith('search_candidates', { terms: ['solar', 'pump'], expanded: ['irrigation'] });
    expect(result).toEqual({
      candidates: [{ id: 'a', title: 'Solar pump', summary: 'Pumps water' }],
      conjunction: 'OR',
      strictCount: 1,
      requests: 1,
    });
  });

  it('asks nothing for a query with no usable words', async () => {
    const rpc = jest.fn();
    await expect(fetchSearchCandidates(['to', 'of'], { rpc })).resolves.toEqual({ candidates: [], conjunction: null, requests: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
