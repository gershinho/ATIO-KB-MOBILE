/**
 * Filling the offline cache: the prefetch and the refresh.
 *
 * Between them they answer the two complaints the offline card makes about
 * keeping only what people pin — that someone who never bookmarks has nothing
 * offline, and that what they did bookmark goes stale where it sits.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import { prefetchRecent, refreshPinned, PREFETCH_COUNT } from '../src/storage/offlinePrefetch';
import {
  PINS,
  addPin,
  getContent,
  storageUsage,
  MAX_UNPINNED_RECORDS,
} from '../src/storage/offlineStore';
import { resetIdbConnection } from '../src/storage/idb';
import { searchInnovations, getInnovationById } from '../src/database/db.web';

jest.mock('../src/database/db.web', () => ({
  searchInnovations: jest.fn(),
  getInnovationById: jest.fn(),
}));

const innovation = (id, title = `Title ${id}`) => ({ id, title, shortDescription: 'x' });

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  resetIdbConnection();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('prefetchRecent', () => {
  it('caches the most recently updated records, unpinned', async () => {
    searchInnovations.mockResolvedValue([innovation('a'), innovation('b')]);

    expect(await prefetchRecent()).toBe(2);
    expect(await getContent('a')).not.toBeNull();
    expect((await storageUsage()).pinned).toBe(0);
  });

  it('pages to reach the hundred the card asks for', async () => {
    // The portal caps a page at 50 and returns 50 without complaint when asked
    // for more, so one call would prefetch half of what was intended — which
    // is exactly what the first run against the live portal did.
    searchInnovations.mockImplementation(async (_filters, { offset }) =>
      Array.from({ length: 50 }, (_, i) => innovation(`p${offset + i}`))
    );

    expect(await prefetchRecent()).toBe(PREFETCH_COUNT);
    expect(searchInnovations).toHaveBeenCalledTimes(2);
    expect(searchInnovations.mock.calls[1][1]).toEqual({ limit: 50, offset: 50 });
  });

  it('stops early when the catalogue has fewer than a hundred', async () => {
    searchInnovations.mockResolvedValue([innovation('a'), innovation('b')]);
    expect(await prefetchRecent()).toBe(2);
    expect(searchInnovations).toHaveBeenCalledTimes(1);
  });

  it('tidies up after itself', async () => {
    // The prefetch is the one thing that can push the cache over its cap, so
    // it is also the one place eviction has to run.
    searchInnovations.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => innovation(`p${i}`))
    );
    await prefetchRecent();
    expect((await storageUsage()).records).toBeLessThanOrEqual(MAX_UNPINNED_RECORDS);
  });

  it('leaves the cache alone when the portal cannot be reached', async () => {
    searchInnovations.mockRejectedValue(new Error('unreachable'));

    expect(await prefetchRecent()).toBe(0);
    expect((await storageUsage()).records).toBe(0);
  });
});

describe('refreshPinned', () => {
  it('fetches each pinned record again and keeps its pin', async () => {
    await addPin(PINS.bookmark, innovation('a', 'Old Title'));
    getInnovationById.mockResolvedValue(innovation('a', 'New Title'));

    expect(await refreshPinned()).toBe(1);
    expect((await getContent('a')).title).toBe('New Title');
    expect((await storageUsage()).pinned).toBe(1);
  });

  it('fetches a record in both lists once, not twice', async () => {
    await addPin(PINS.bookmark, innovation('a'));
    await addPin(PINS.download, innovation('a'));
    getInnovationById.mockResolvedValue(innovation('a'));

    await refreshPinned();
    expect(getInnovationById).toHaveBeenCalledTimes(1);
  });

  it('caps how many it refreshes per launch', async () => {
    // The card warns the cost grows with the number of pins. Someone with
    // three hundred bookmarks should not pay for all of them at startup.
    for (let i = 0; i < 10; i += 1) await addPin(PINS.bookmark, innovation(`b${i}`));
    getInnovationById.mockImplementation(async (id) => innovation(id));

    await refreshPinned({ limit: 3 });
    expect(getInnovationById).toHaveBeenCalledTimes(3);
  });

  it('keeps the records it did fetch when one of them fails', async () => {
    await addPin(PINS.bookmark, innovation('good'));
    await addPin(PINS.bookmark, innovation('bad'));
    getInnovationById.mockImplementation(async (id) => {
      if (id === 'bad') throw new Error('gone');
      return innovation(id, 'Refreshed');
    });

    expect(await refreshPinned()).toBe(1);
    expect((await getContent('good')).title).toBe('Refreshed');
    // The one that failed keeps the copy it had, rather than losing it.
    expect(await getContent('bad')).not.toBeNull();
  });

  it('does nothing when nothing is pinned', async () => {
    expect(await refreshPinned()).toBe(0);
    expect(getInnovationById).not.toHaveBeenCalled();
  });
});
