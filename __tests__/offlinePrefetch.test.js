/**
 * Keeping pinned records current.
 *
 * Answers the second of the two complaints the offline card makes about keeping
 * only what people pin: that what someone did bookmark goes stale where it
 * sits. The first complaint — that a user who never bookmarks has nothing — the
 * card raises and then declines to solve, striking out the preload that would
 * have. The tests for that preload went with it.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import { refreshPinned } from '../src/storage/offlinePrefetch';
import { PINS, addPin, getContent, storageUsage } from '../src/storage/offlineStore';
import { resetIdbConnection } from '../src/storage/idb';
import { getInnovationById } from '../src/database/db.web';

jest.mock('../src/database/db.web', () => ({
  getInnovationById: jest.fn(),
}));

const innovation = (id, title = `Title ${id}`) => ({ id, title, shortDescription: 'x' });

/** A portal id. Refreshing only applies to records the portal actually has. */
const uuid = (n) => `0ee8fd42-1111-2222-3333-${String(n).padStart(12, '0')}`;

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  resetIdbConnection();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('refreshPinned', () => {
  it('fetches each pinned record again and keeps its pin', async () => {
    await addPin(PINS.bookmark, innovation(uuid(1), 'Old Title'));
    getInnovationById.mockResolvedValue(innovation(uuid(1), 'New Title'));

    expect(await refreshPinned()).toBe(1);
    expect((await getContent(uuid(1))).title).toBe('New Title');
    expect((await storageUsage()).pinned).toBe(1);
  });

  it('fetches a record in both lists once, not twice', async () => {
    await addPin(PINS.bookmark, innovation(uuid(1)));
    await addPin(PINS.download, innovation(uuid(1)));
    getInnovationById.mockResolvedValue(innovation(uuid(1)));

    await refreshPinned();
    expect(getInnovationById).toHaveBeenCalledTimes(1);
  });

  it('caps how many it refreshes per launch', async () => {
    // The card warns the cost grows with the number of pins. Someone with
    // three hundred bookmarks should not pay for all of them at startup.
    for (let i = 0; i < 10; i += 1) await addPin(PINS.bookmark, innovation(uuid(i)));
    getInnovationById.mockImplementation(async (id) => innovation(id));

    await refreshPinned({ limit: 3 });
    expect(getInnovationById).toHaveBeenCalledTimes(3);
  });

  it('keeps the records it did fetch when one of them fails', async () => {
    const good = uuid(1);
    const bad = uuid(2);
    await addPin(PINS.bookmark, innovation(good));
    await addPin(PINS.bookmark, innovation(bad));
    getInnovationById.mockImplementation(async (id) => {
      if (id === bad) throw new Error('gone');
      return innovation(id, 'Refreshed');
    });

    expect(await refreshPinned()).toBe(1);
    expect((await getContent(good)).title).toBe('Refreshed');
    // The one that failed keeps the copy it had, rather than losing it.
    expect(await getContent(bad)).not.toBeNull();
  });

  it('leaves alone a record that did not come from the portal', async () => {
    // Search runs through our backend over the bundled SQLite, where an id is
    // the integer 40479. Asking the portal for /node/innovation/40479 is a 404,
    // which is what the first live run of this did.
    await addPin(PINS.bookmark, innovation(40479, 'From search'));
    await addPin(PINS.bookmark, innovation(uuid(7), 'From the portal'));
    getInnovationById.mockImplementation(async (id) => innovation(id, 'Refreshed'));

    expect(await refreshPinned()).toBe(1);
    expect(getInnovationById).toHaveBeenCalledTimes(1);
    expect((await getContent(40479)).title).toBe('From search');
  });

  it('does nothing when nothing is pinned', async () => {
    expect(await refreshPinned()).toBe(0);
    expect(getInnovationById).not.toHaveBeenCalled();
  });
});
