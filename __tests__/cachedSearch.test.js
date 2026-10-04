/**
 * Searching the device's own copies.
 *
 * This is what makes the prefetched hundred worth storing: until it existed
 * they were cached, evicted correctly, and unreachable, because every route to
 * a record was a live query. The matching has to agree with filterSpec.js — the
 * same keywords against the same term names — or the offline list is wrong in
 * a way nobody can see.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import { searchCached, matchesFilters } from '../src/storage/cachedSearch';
import { putManyContent, addPin, PINS } from '../src/storage/offlineStore';
import { resetIdbConnection } from '../src/storage/idb';
import { CHALLENGES, TYPES, COUNTRY_TO_REGION } from '../src/data/constants';

const CHALLENGE = CHALLENGES[0];
const TYPE = TYPES[0];
const KENYA = Object.keys(COUNTRY_TO_REGION)[0];

const innovation = (id, over = {}) => ({
  id,
  title: `Title ${id}`,
  shortDescription: 'x',
  longDescription: '',
  countries: [KENYA],
  useCases: [CHALLENGE.keywords[0]],
  types: [TYPE.keywords[0]],
  users: [],
  sdgs: [2],
  region: 'Africa',
  dataSource: 'WOCAT',
  readinessLevel: 7,
  adoptionLevel: 3,
  isGrassroots: false,
  ...over,
});

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  resetIdbConnection();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('matchesFilters', () => {
  it('keeps everything when nothing is asked', () => {
    expect(matchesFilters(innovation('a'), {})).toBe(true);
  });

  it('matches a challenge through its keywords, as the query builder does', () => {
    expect(matchesFilters(innovation('a'), { challenges: [CHALLENGE.id] })).toBe(true);
    expect(matchesFilters(innovation('a', { useCases: ['unrelated'] }), { challenges: [CHALLENGE.id] })).toBe(false);
  });

  it('expands a hub region to its countries', () => {
    const region = Object.values(COUNTRY_TO_REGION)[0];
    const hub = require('../src/data/innovationHubRegions').INNOVATION_HUB_REGIONS
      .find((r) => r.name === region);
    expect(matchesFilters(innovation('a'), { hubRegions: [hub.id] })).toBe(true);
  });

  it('treats a level filter as a minimum', () => {
    expect(matchesFilters(innovation('a'), { readinessMin: 7 })).toBe(true);
    expect(matchesFilters(innovation('a'), { readinessMin: 8 })).toBe(false);
  });

  it('matches an SDG by number, so 1 does not catch 15', () => {
    expect(matchesFilters(innovation('a', { sdgs: [15] }), { sdgs: [1] })).toBe(false);
    expect(matchesFilters(innovation('a', { sdgs: [1, 15] }), { sdgs: [1] })).toBe(true);
  });

  it('narrows on grassroots, country, region and source', () => {
    expect(matchesFilters(innovation('a'), { grassrootsOnly: true })).toBe(false);
    expect(matchesFilters(innovation('a'), { countries: ['Nowhere'] })).toBe(false);
    expect(matchesFilters(innovation('a'), { regions: ['Africa'] })).toBe(true);
    expect(matchesFilters(innovation('a'), { sources: ['WOCAT'] })).toBe(true);
  });
});

describe('searchCached', () => {
  it('finds the records the device holds', async () => {
    await putManyContent([innovation('a'), innovation('b', { useCases: ['unrelated'] })]);

    const { results, total } = await searchCached({ challenges: [CHALLENGE.id] });
    expect(results.map((r) => r.id)).toEqual(['a']);
    expect(total).toBe(1);
  });

  it('includes what was prefetched as well as what was pinned', async () => {
    // The whole point: a user who never bookmarked anything still has records.
    await putManyContent([innovation('prefetched')]);
    await addPin(PINS.bookmark, innovation('bookmarked'));

    const { results } = await searchCached({}, { limit: 10 });
    expect(results.map((r) => r.id).sort()).toEqual(['bookmarked', 'prefetched']);
  });

  it('marks every row as served from the device', async () => {
    // Which is what puts the "Available offline" badge on it.
    await putManyContent([innovation('a')]);
    const { results } = await searchCached({});
    expect(results[0].availableOffline).toBe(true);
  });

  it('pages', async () => {
    await putManyContent(Array.from({ length: 5 }, (_, i) => innovation(`r${i}`)));
    const page = await searchCached({}, { limit: 2, offset: 2 });
    expect(page.results).toHaveLength(2);
    expect(page.total).toBe(5);
  });

  it('returns nothing rather than throwing when the cache is empty', async () => {
    expect(await searchCached({ challenges: [CHALLENGE.id] })).toEqual({ results: [], total: 0 });
  });

  it('returns nothing where there is no IndexedDB at all', async () => {
    delete global.indexedDB;
    resetIdbConnection();
    expect(await searchCached({})).toEqual({ results: [], total: 0 });
  });
});
