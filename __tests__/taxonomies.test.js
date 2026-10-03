/**
 * The preload is the low-bandwidth half of the offline card: fetch the
 * vocabularies once, keep them a day, and stop asking the portal to re-send
 * "Kenya" on every page of every list.
 *
 * Run against fake-indexeddb rather than a mock of our own wrapper, so the
 * transaction behaviour under test is the real one — a store mocked out would
 * prove only that the module calls the functions it calls.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import {
  loadTaxonomies,
  resetTaxonomies,
  buildIndex,
  termNames,
  VOCABULARIES,
  TAXONOMY_TTL_MS,
} from '../src/api/jsonapi/taxonomies';
import { resetIdbConnection, isIndexedDbAvailable } from '../src/storage/idb';
import { CATALOGUE_UNAVAILABLE_MESSAGE } from '../src/api/jsonapi/client';

/** A page of terms, shaped the way the portal shapes one. */
const page = (type, terms) => ({
  data: terms.map(([id, name]) => ({ type, id, attributes: { name } })),
  links: { next: { href: 'ignored' } },
});

/**
 * A fetch that answers any vocabulary request with two terms named after it,
 * and counts the requests so a cached second call can be told from a refetch.
 */
function stubPortal() {
  const impl = jest.fn(async (url) => {
    const vocabulary = VOCABULARIES.find((v) => url.includes(v.path));
    if (!vocabulary) throw new Error(`unexpected url ${url}`);
    const short = vocabulary.type.split('--')[1];
    return {
      ok: true,
      status: 200,
      json: async () => page(vocabulary.type, [
        [`${short}-1`, `${short} one`],
        [`${short}-2`, `${short} two`],
      ]),
    };
  });
  return impl;
}

beforeEach(() => {
  // A fresh database per test: IndexedDB survives between cases otherwise, and
  // a cache written by one test would silently satisfy the next.
  global.indexedDB = new IDBFactory();
  resetIdbConnection();
  resetTaxonomies();
  process.env.EXPO_PUBLIC_JSONAPI_URL = 'https://example.org/jsonapi';
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('loadTaxonomies', () => {
  it('fetches every vocabulary and indexes it by type and id', async () => {
    const fetchImpl = stubPortal();
    const { index, stale } = await loadTaxonomies({ fetchImpl });

    expect(stale).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(VOCABULARIES.length);
    expect(index.get('taxonomy_term--countries:countries-1')).toBe('countries one');
    expect(index.get('taxonomy_term--readiness_levels:readiness_levels-2')).toBe('readiness_levels two');
  });

  it('asks for names only, one page at a time', async () => {
    const fetchImpl = stubPortal();
    await loadTaxonomies({ fetchImpl });

    const url = fetchImpl.mock.calls.find(([u]) => u.includes('/countries'))[0];
    expect(url).toContain('fields%5Btaxonomy_term--countries%5D=name');
    expect(url).toContain('page%5Blimit%5D=50');
  });

  it('keeps paging while the pages come back full', async () => {
    // 248 countries arrive in five requests; a loop that stopped at the first
    // page would leave the app unable to name three quarters of the world.
    const full = Array.from({ length: 50 }, (_, i) => [`c-${i}`, `Country ${i}`]);
    let countryCalls = 0;
    const fetchImpl = jest.fn(async (url) => {
      const vocabulary = VOCABULARIES.find((v) => url.includes(v.path));
      if (vocabulary.type !== 'taxonomy_term--countries') {
        return { ok: true, status: 200, json: async () => page(vocabulary.type, []) };
      }
      countryCalls += 1;
      const terms = countryCalls < 3 ? full : [['c-last', 'Zimbabwe']];
      return { ok: true, status: 200, json: async () => page(vocabulary.type, terms) };
    });

    const { byType } = await loadTaxonomies({ fetchImpl });
    expect(countryCalls).toBe(3);
    expect(byType['taxonomy_term--countries']).toHaveLength(101);
  });

  it('serves the second call from cache without touching the network', async () => {
    const first = stubPortal();
    await loadTaxonomies({ fetchImpl: first });

    resetTaxonomies(); // a new page load, same browser
    const second = stubPortal();
    const { index } = await loadTaxonomies({ fetchImpl: second });

    expect(second).not.toHaveBeenCalled();
    expect(index.get('taxonomy_term--countries:countries-1')).toBe('countries one');
  });

  it('refetches once the cache is a day old', async () => {
    const start = 1_000_000;
    await loadTaxonomies({ fetchImpl: stubPortal(), now: start });

    resetTaxonomies();
    const later = stubPortal();
    await loadTaxonomies({ fetchImpl: later, now: start + TAXONOMY_TTL_MS + 1 });

    expect(later).toHaveBeenCalledTimes(VOCABULARIES.length);
  });

  it('refetches on force even when the cache is fresh', async () => {
    await loadTaxonomies({ fetchImpl: stubPortal() });
    const forced = stubPortal();
    await loadTaxonomies({ fetchImpl: forced, force: true });
    expect(forced).toHaveBeenCalledTimes(VOCABULARIES.length);
  });

  it('falls back to a stale cache when the portal is unreachable', async () => {
    const start = 1_000_000;
    await loadTaxonomies({ fetchImpl: stubPortal(), now: start });

    resetTaxonomies();
    const down = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
    const { index, stale } = await loadTaxonomies({
      fetchImpl: down,
      now: start + TAXONOMY_TTL_MS + 1,
      attempts: 1,
    });

    // Month-old term names are overwhelmingly still right; an empty Explore
    // page is never right.
    expect(stale).toBe(true);
    expect(index.get('taxonomy_term--countries:countries-1')).toBe('countries one');
  });

  it('fails with a readable message when there is nothing cached to fall back on', async () => {
    const down = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(loadTaxonomies({ fetchImpl: down, attempts: 1 }))
      .rejects.toThrow(CATALOGUE_UNAVAILABLE_MESSAGE);
  });

  it('does not remember a failure once the portal comes back', async () => {
    const down = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(loadTaxonomies({ fetchImpl: down, attempts: 1 })).rejects.toThrow();

    const up = stubPortal();
    const { index } = await loadTaxonomies({ fetchImpl: up });
    expect(index.size).toBeGreaterThan(0);
  });

  it('still works where IndexedDB is unavailable, just without the cache', async () => {
    // Private browsing, or blocked site data. Slower, not broken.
    delete global.indexedDB;
    resetIdbConnection();
    expect(isIndexedDbAvailable()).toBe(false);

    const fetchImpl = stubPortal();
    const { index } = await loadTaxonomies({ fetchImpl });
    expect(index.size).toBe(VOCABULARIES.length * 2);

    resetTaxonomies();
    const second = stubPortal();
    await loadTaxonomies({ fetchImpl: second });
    expect(second).toHaveBeenCalledTimes(VOCABULARIES.length);
  });

  it('shares one in-flight load between concurrent callers', async () => {
    const fetchImpl = stubPortal();
    const [a, b] = await Promise.all([loadTaxonomies({ fetchImpl }), loadTaxonomies({ fetchImpl })]);
    expect(fetchImpl).toHaveBeenCalledTimes(VOCABULARIES.length);
    expect(a.index).toBe(b.index);
  });
});

describe('buildIndex and termNames', () => {
  const byType = {
    'taxonomy_term--countries': [['k', 'Kenya'], ['i', 'India'], ['a', 'Angola']],
  };

  it('keys the index by resource type and id', () => {
    expect(buildIndex(byType).get('taxonomy_term--countries:k')).toBe('Kenya');
  });

  it('tolerates nothing at all', () => {
    expect(buildIndex().size).toBe(0);
    expect(buildIndex({}).size).toBe(0);
  });

  it('lists a vocabulary’s names sorted, for the filter panel', () => {
    expect(termNames(byType, 'taxonomy_term--countries')).toEqual(['Angola', 'India', 'Kenya']);
  });

  it('returns nothing for a vocabulary it does not have', () => {
    expect(termNames(byType, 'taxonomy_term--type')).toEqual([]);
  });
});
