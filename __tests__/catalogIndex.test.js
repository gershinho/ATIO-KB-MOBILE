/**
 * The single pass over the catalogue.
 *
 * It exists because Explore asks for averages, and no count endpoint produces
 * an average however many FAO add. The properties worth protecting are that it
 * reads every page, that it resolves names without asking the portal for them,
 * and that it is kept — a two to three minute pass repeated on every visit
 * would be worse than no grids at all.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import {
  loadCatalogIndex,
  resetCatalogIndex,
  peekCatalogIndex,
  CATALOG_TTL_MS,
} from '../src/api/jsonapi/catalogIndex';
import { resetIdbConnection } from '../src/storage/idb';
import { resetTaxonomies } from '../src/api/jsonapi/taxonomies';

const COUNTRY = 'taxonomy_term--countries';
const USE_CASE = 'taxonomy_term--use_cases';
const READINESS = 'taxonomy_term--readiness_levels';

/** One innovation as the portal sends it in the pass: relationships, no attributes. */
const innovation = (i) => ({
  type: 'node--innovation',
  id: `n${i}`,
  relationships: {
    field_readiness_level: { data: { type: READINESS, id: i % 3 === 0 ? 'none' : 'r9' } },
    field_adoption_level: { data: { type: 'taxonomy_term--adoption_levels', id: 'a3' } },
    field_countries_adoption: { data: [{ type: COUNTRY, id: 'kenya' }] },
    field_use_cases: { data: [{ type: USE_CASE, id: 'water' }] },
    field_innovation_type: { data: [{ type: 'taxonomy_term--type', id: 'digital' }] },
    field_data_source: { data: { type: 'node--digital_asset', id: i % 2 ? 'src-a' : 'src-b' } },
  },
});

jest.mock('../src/api/jsonapi/taxonomies', () => ({
  loadTaxonomies: jest.fn(async () => ({
    index: new Map([
      ['taxonomy_term--readiness_levels:r9', '9. Ready'],
      ['taxonomy_term--readiness_levels:none', 'NOT INDICATED'],
      ['taxonomy_term--adoption_levels:a3', '3. Early'],
      ['taxonomy_term--countries:kenya', 'Kenya'],
      ['taxonomy_term--use_cases:water', 'water scarcity'],
      ['taxonomy_term--type:digital', 'Digital tools'],
    ]),
    byType: { 'taxonomy_term--readiness_levels': [['r9', '9. Ready']] },
  })),
  resetTaxonomies: jest.fn(),
}));

/** A portal holding `total` records, paged 50 at a time. */
function portalWith(total, { sources = ['Source A', 'Source B'] } = {}) {
  return jest.fn(async (url) => {
    const params = new URL(url).searchParams;
    if (url.includes('/node/digital_asset')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: sources.map((title, i) => ({ type: 'node--digital_asset', id: `src-${i}`, attributes: { title } })),
        }),
      };
    }
    const offset = Number(params.get('page[offset]') ?? 0);
    const limit = Number(params.get('page[limit]') ?? 50);
    const data = [];
    for (let i = offset; i < Math.min(offset + limit, total); i += 1) data.push(innovation(i));
    return { ok: true, status: 200, json: async () => ({ data }) };
  });
}

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  resetIdbConnection();
  resetCatalogIndex();
  resetTaxonomies();
  process.env.EXPO_PUBLIC_JSONAPI_URL = 'https://example.org/jsonapi';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('the pass', () => {
  it('reads every page, not just the first', async () => {
    const fetchImpl = portalWith(137);
    const { rows } = await loadCatalogIndex({ fetchImpl });
    expect(rows).toHaveLength(137);
  });

  it('stops on a short page rather than on links.next', async () => {
    // The portal sends `next` even on a last full page, so a loop that trusted
    // it would ask forever.
    const fetchImpl = portalWith(100);
    await loadCatalogIndex({ fetchImpl });
    const pageRequests = fetchImpl.mock.calls.filter(([url]) => url.includes('/node/innovation'));
    // Three pages: two full, one empty that ends it — plus whatever the
    // workers claimed in parallel before that answer arrived.
    expect(pageRequests.length).toBeLessThanOrEqual(8);
  });

  it('asks for ids only, and never for a title or a description', async () => {
    // What makes a pass over 6,287 records about 3 MB rather than 30.
    const fetchImpl = portalWith(10);
    await loadCatalogIndex({ fetchImpl });

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toContain('fields%5Bnode--innovation%5D=');
    expect(url).not.toContain('title');
    expect(url).not.toContain('body');
    expect(url).not.toContain('include=');
  });

  it('resolves names from the vocabularies instead of including them', async () => {
    const fetchImpl = portalWith(3);
    const { rows } = await loadCatalogIndex({ fetchImpl });

    // n0 is the one deliberately left without a level; n1 is an ordinary record.
    expect(rows.find((r) => r.id === 'n1')).toMatchObject({
      countries: ['Kenya'],
      useCases: ['water scarcity'],
      types: ['Digital tools'],
      readiness: 9,
      adoption: 3,
    });
  });

  it('keeps both readings of a missing level', async () => {
    // The opportunity grid counts an unlevelled record at the bundled build's
    // fallback of 1; the ready-to-use grid skips it. Storing both means
    // neither grid has to settle for the other's reading.
    const fetchImpl = portalWith(3);
    const { rows } = await loadCatalogIndex({ fetchImpl });
    const unlevelled = rows.find((r) => r.id === 'n0');

    expect(unlevelled.readiness).toBe(1);
    expect(unlevelled.readinessExact).toBeNull();
  });

  it('names only the data sources the catalogue actually cites', async () => {
    const fetchImpl = portalWith(10);
    const { sources } = await loadCatalogIndex({ fetchImpl });

    expect(sources).toEqual(['Source A', 'Source B']);
    const sourceCall = fetchImpl.mock.calls.find(([url]) => url.includes('digital_asset'));
    expect(sourceCall[0]).toContain('%5Boperator%5D=IN');
  });

  it('reports progress as it goes', async () => {
    const onProgress = jest.fn();
    await loadCatalogIndex({ fetchImpl: portalWith(120), onProgress });

    expect(onProgress).toHaveBeenCalled();
    const last = onProgress.mock.calls.at(-1)[0];
    expect(last.rows).toBe(120);
  });

  it('runs several pages at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const portal = portalWith(300);
    const fetchImpl = jest.fn(async (url) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return portal(url);
    });

    await loadCatalogIndex({ fetchImpl });
    expect(peak).toBeGreaterThan(1);
  });
});

describe('keeping it', () => {
  it('serves a second session from storage without crawling again', async () => {
    const first = portalWith(60);
    await loadCatalogIndex({ fetchImpl: first });

    resetCatalogIndex();
    const second = portalWith(60);
    const { rows, fromCache } = await loadCatalogIndex({ fetchImpl: second });

    expect(fromCache).toBe(true);
    expect(rows).toHaveLength(60);
    expect(second).not.toHaveBeenCalled();
  });

  it('crawls again once the stored copy is too old', async () => {
    const start = 1_000_000;
    await loadCatalogIndex({ fetchImpl: portalWith(60), now: start });

    resetCatalogIndex();
    const later = portalWith(60);
    await loadCatalogIndex({ fetchImpl: later, now: start + CATALOG_TTL_MS + 1 });

    expect(later).toHaveBeenCalled();
  });

  it('crawls again on force', async () => {
    await loadCatalogIndex({ fetchImpl: portalWith(60) });
    const forced = portalWith(60);
    await loadCatalogIndex({ fetchImpl: forced, force: true });
    expect(forced).toHaveBeenCalled();
  });

  it('falls back to a stored copy when a pass fails partway', async () => {
    const start = 1_000_000;
    await loadCatalogIndex({ fetchImpl: portalWith(60), now: start });

    resetCatalogIndex();
    const broken = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
    const result = await loadCatalogIndex({
      fetchImpl: broken,
      now: start + CATALOG_TTL_MS + 1,
      attempts: 1,
    });

    // Grids built from hours-old rows beat an Explore page with none.
    expect(result.stale).toBe(true);
    expect(result.rows).toHaveLength(60);
  });

  it('fails when a pass fails and nothing is stored', async () => {
    const broken = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(loadCatalogIndex({ fetchImpl: broken, attempts: 1 })).rejects.toThrow();
  });

  it('shares one pass between callers who ask at once', async () => {
    const fetchImpl = portalWith(100);
    const [a, b] = await Promise.all([loadCatalogIndex({ fetchImpl }), loadCatalogIndex({ fetchImpl })]);
    expect(a.rows).toBe(b.rows);
  });

  it('can be looked at without starting a pass', async () => {
    expect(await peekCatalogIndex()).toBeNull();
    await loadCatalogIndex({ fetchImpl: portalWith(10) });
    expect((await peekCatalogIndex()).rows).toHaveLength(10);
  });
});
