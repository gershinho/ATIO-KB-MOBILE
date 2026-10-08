/**
 * The web twin of localState, and the import that carries a real user's
 * existing bookmarks across.
 *
 * The contract being protected is that the screens cannot tell the difference:
 * the same function names, the same shapes, newest first, and a boolean from
 * every write meaning persisted rather than attempted.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  STORAGE_KEYS,
  readBookmarks,
  writeBookmarks,
  clearBookmarks,
  readDownloads,
  writeDownloads,
  clearDownloads,
  readLikedIds,
  writeLikedIds,
  toggleLikedId,
  readSetting,
  writeSetting,
  resetMigration,
} from '../src/storage/localState.web';
import { resetIdbConnection } from '../src/storage/idb';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __store: store,
    getItem: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItem: jest.fn(async (key, value) => { store.set(key, value); }),
    removeItem: jest.fn(async (key) => { store.delete(key); }),
  };
});

const innovation = (id, title = `Title ${id}`) => ({ id, title, shortDescription: 'x' });

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  resetIdbConnection();
  resetMigration();
  AsyncStorage.__store.clear();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('bookmarks and downloads', () => {
  it('round-trips a list, newest first', async () => {
    await writeBookmarks([
      { ...innovation('new'), bookmarkedAt: 3000 },
      { ...innovation('old'), bookmarkedAt: 1000 },
    ]);
    expect((await readBookmarks()).map((i) => i.id)).toEqual(['new', 'old']);
  });

  it('keeps the two lists apart', async () => {
    await writeBookmarks([innovation('a')]);
    await writeDownloads([innovation('b')]);

    expect((await readBookmarks()).map((i) => i.id)).toEqual(['a']);
    expect((await readDownloads()).map((i) => i.id)).toEqual(['b']);
  });

  it('stores one copy of a record that is in both lists', async () => {
    await writeBookmarks([innovation('a')]);
    await writeDownloads([innovation('a')]);

    const usage = await (await import('../src/storage/offlineStore')).storageUsage();
    expect(usage.records).toBe(1);
  });

  it('clears one list without emptying the other', async () => {
    await writeBookmarks([innovation('a')]);
    await writeDownloads([innovation('a')]);

    await clearBookmarks();

    expect(await readBookmarks()).toEqual([]);
    expect(await readDownloads()).toHaveLength(1);
  });

  it('empties downloads on clear', async () => {
    await writeDownloads([innovation('a')]);
    await clearDownloads();
    expect(await readDownloads()).toEqual([]);
  });

  it('returns an empty list rather than throwing when nothing is stored', async () => {
    expect(await readBookmarks()).toEqual([]);
    expect(await readDownloads()).toEqual([]);
  });
});

describe('likes', () => {
  it('reads back what was written, as a Set', async () => {
    await writeLikedIds(['a', 'b']);
    expect(await readLikedIds()).toEqual(new Set(['a', 'b']));
  });

  it('toggles on and reports that it was saved', async () => {
    expect(await toggleLikedId('a')).toEqual({ liked: true, saved: true });
    expect(await readLikedIds()).toEqual(new Set(['a']));
  });

  it('toggles back off', async () => {
    await toggleLikedId('a');
    expect(await toggleLikedId('a')).toEqual({ liked: false, saved: true });
    expect(await readLikedIds()).toEqual(new Set());
  });
});

describe('settings', () => {
  it('stay in AsyncStorage, where three short strings belong', async () => {
    await writeSetting(STORAGE_KEYS.textSize, 'large');
    expect(await readSetting(STORAGE_KEYS.textSize)).toBe('large');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.textSize, 'large');
  });

  it('fall back when absent', async () => {
    expect(await readSetting(STORAGE_KEYS.reduceMotion, 'false')).toBe('false');
  });

  it('report a failed write rather than swallowing it', async () => {
    AsyncStorage.setItem.mockRejectedValueOnce(new Error('quota exceeded'));
    expect(await writeSetting(STORAGE_KEYS.textSize, 'large')).toBe(false);
  });
});

describe('importing what the previous build stored', () => {
  /** Put data where the old localStorage-backed build would have left it. */
  const seedLegacy = async () => {
    AsyncStorage.__store.set(STORAGE_KEYS.bookmarks, JSON.stringify([
      { ...innovation('b1'), bookmarkedAt: 2000 },
      { ...innovation('b2'), bookmarkedAt: 1000 },
    ]));
    AsyncStorage.__store.set(STORAGE_KEYS.downloads, JSON.stringify([
      { ...innovation('d1'), downloadedAt: 5000 },
    ]));
    AsyncStorage.__store.set(STORAGE_KEYS.likes, JSON.stringify(['l1', 'l2']));
  };

  it('carries bookmarks, downloads and likes across on the first read', async () => {
    await seedLegacy();

    expect((await readBookmarks()).map((i) => i.id)).toEqual(['b1', 'b2']);
    expect((await readDownloads()).map((i) => i.id)).toEqual(['d1']);
    expect(await readLikedIds()).toEqual(new Set(['l1', 'l2']));
  });

  it('keeps the timestamps, so the lists stay in the order the user built', async () => {
    await seedLegacy();
    const rows = await readBookmarks();
    expect(rows[0].bookmarkedAt).toBe(2000);
    expect(rows[1].bookmarkedAt).toBe(1000);
  });

  it('leaves the old keys in place, so a rollback still has the data', async () => {
    await seedLegacy();
    await readBookmarks();
    expect(AsyncStorage.__store.get(STORAGE_KEYS.bookmarks)).toContain('b1');
  });

  it('does not run twice and resurrect something since removed', async () => {
    await seedLegacy();
    await readBookmarks();

    await writeBookmarks([]);          // the user clears their bookmarks
    resetMigration();                  // next page load

    expect(await readBookmarks()).toEqual([]);
  });

  it('survives a corrupted old value instead of failing to start', async () => {
    AsyncStorage.__store.set(STORAGE_KEYS.bookmarks, 'not json at all');
    AsyncStorage.__store.set(STORAGE_KEYS.downloads, JSON.stringify({ not: 'an array' }));

    expect(await readBookmarks()).toEqual([]);
    expect(await readDownloads()).toEqual([]);
  });

  it('skips an entry with no id rather than storing a row that points nowhere', async () => {
    AsyncStorage.__store.set(STORAGE_KEYS.bookmarks, JSON.stringify([
      { title: 'no id' },
      { ...innovation('ok'), bookmarkedAt: 1 },
    ]));
    expect((await readBookmarks()).map((i) => i.id)).toEqual(['ok']);
  });

  it('runs once when several screens ask at the same time', async () => {
    await seedLegacy();
    const [bookmarks, downloads] = await Promise.all([readBookmarks(), readDownloads()]);
    expect(bookmarks).toHaveLength(2);
    expect(downloads).toHaveLength(1);
  });
});
