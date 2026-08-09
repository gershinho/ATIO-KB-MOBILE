/**
 * The storage module is the only thing standing between a corrupted write and a
 * crash on next launch, so the failure paths matter more than the happy ones.
 */
// jest.mock factories are hoisted above these declarations, so the names must
// be mock-prefixed for the transform to allow the reference.
const mockStore = new Map();
let mockFailNextGet = null;
let mockFailNextSet = null;

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k) => {
    if (mockFailNextGet) { const e = mockFailNextGet; mockFailNextGet = null; throw e; }
    return mockStore.has(k) ? mockStore.get(k) : null;
  }),
  setItem: jest.fn(async (k, v) => {
    if (mockFailNextSet) { const e = mockFailNextSet; mockFailNextSet = null; throw e; }
    mockStore.set(k, v);
  }),
  removeItem: jest.fn(async (k) => { mockStore.delete(k); }),
}));

// The mock state above must be declared before this import: babel hoists
// jest.mock() above it, and the factory dereferences mockStore when the
// imported module first loads.
// eslint-disable-next-line import/first
import {
  STORAGE_KEYS,
  readBookmarks, writeBookmarks, clearBookmarks,
  readDownloads, writeDownloads, clearDownloads,
  readLikedIds, writeLikedIds, toggleLikedId,
} from '../src/storage/localState';

beforeEach(() => {
  mockStore.clear();
  mockFailNextGet = null;
  mockFailNextSet = null;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('storage keys', () => {
  it('keeps the exact key strings the app already has on disk', () => {
    // Changing any of these silently orphans every existing user's data. The
    // three settings keys moved here from AccessibilityContext, which wrote
    // these exact strings, so an upgrading user keeps their preferences.
    expect(STORAGE_KEYS).toEqual({
      bookmarks: 'bookmarkedInnovations',
      downloads: 'completedDownloads',
      likes: 'likedInnovations',
      reduceMotion: 'settingsReduceMotion',
      textSize: 'settingsTextSize',
      colorBlindMode: 'settingsColorBlindMode',
    });
  });
});

describe('reading lists', () => {
  it('returns an empty array when nothing is stored', async () => {
    expect(await readBookmarks()).toEqual([]);
    expect(await readDownloads()).toEqual([]);
  });

  it('round-trips a saved list', async () => {
    const list = [{ id: 1, title: 'Solar pump', bookmarkedAt: 123 }];
    await writeBookmarks(list);
    expect(await readBookmarks()).toEqual(list);
  });

  it('returns an empty array for corrupt JSON instead of throwing', async () => {
    mockStore.set(STORAGE_KEYS.bookmarks, '{not valid json');
    await expect(readBookmarks()).resolves.toEqual([]);
  });

  it('returns an empty array when the stored value is not an array', async () => {
    mockStore.set(STORAGE_KEYS.downloads, '{"id":1}');
    expect(await readDownloads()).toEqual([]);
    mockStore.set(STORAGE_KEYS.downloads, '"a string"');
    expect(await readDownloads()).toEqual([]);
    mockStore.set(STORAGE_KEYS.downloads, 'null');
    expect(await readDownloads()).toEqual([]);
  });

  it('returns an empty array when the storage layer itself throws', async () => {
    mockFailNextGet = new Error('storage unavailable');
    await expect(readBookmarks()).resolves.toEqual([]);
  });

  it('keeps bookmarks and downloads in separate keys', async () => {
    await writeBookmarks([{ id: 1 }]);
    await writeDownloads([{ id: 2 }]);
    expect(await readBookmarks()).toEqual([{ id: 1 }]);
    expect(await readDownloads()).toEqual([{ id: 2 }]);
  });
});

describe('writing lists', () => {
  it('reports success', async () => {
    expect(await writeBookmarks([{ id: 1 }])).toBe(true);
  });

  it('reports failure rather than throwing, so the caller can warn the user', async () => {
    mockFailNextSet = new Error('disk full');
    expect(await writeBookmarks([{ id: 1 }])).toBe(false);
  });

  it('persists an empty list as a real value, not an absent key', async () => {
    await writeDownloads([]);
    expect(mockStore.get(STORAGE_KEYS.downloads)).toBe('[]');
    expect(await readDownloads()).toEqual([]);
  });
});

describe('clearing', () => {
  it('removes bookmarks', async () => {
    await writeBookmarks([{ id: 1 }]);
    await clearBookmarks();
    expect(await readBookmarks()).toEqual([]);
  });

  it('removes downloads without touching bookmarks', async () => {
    await writeBookmarks([{ id: 1 }]);
    await writeDownloads([{ id: 2 }]);
    await clearDownloads();
    expect(await readDownloads()).toEqual([]);
    expect(await readBookmarks()).toEqual([{ id: 1 }]);
  });
});

describe('likes', () => {
  it('reads an empty Set when nothing is stored', async () => {
    const ids = await readLikedIds();
    expect(ids).toBeInstanceOf(Set);
    expect(ids.size).toBe(0);
  });

  it('round-trips a Set through array storage', async () => {
    await writeLikedIds(new Set([3, 7]));
    const ids = await readLikedIds();
    expect(ids).toBeInstanceOf(Set);
    expect([...ids].sort()).toEqual([3, 7]);
  });

  it('accepts an array as well as a Set', async () => {
    await writeLikedIds([1, 2]);
    expect([...(await readLikedIds())].sort()).toEqual([1, 2]);
  });

  it('treats null or undefined as empty', async () => {
    expect(await writeLikedIds(undefined)).toBe(true);
    expect((await readLikedIds()).size).toBe(0);
  });

  it('stores an array, not a serialised Set', async () => {
    await writeLikedIds(new Set([5]));
    // JSON.stringify(new Set([5])) is "{}" — this asserts we convert first.
    expect(mockStore.get(STORAGE_KEYS.likes)).toBe('[5]');
  });
});

describe('toggleLikedId', () => {
  it('adds an id that is not present', async () => {
    expect(await toggleLikedId(4)).toEqual({ liked: true, saved: true });
    expect([...(await readLikedIds())]).toEqual([4]);
  });

  it('removes an id that is present', async () => {
    await writeLikedIds([4]);
    expect(await toggleLikedId(4)).toEqual({ liked: false, saved: true });
    expect((await readLikedIds()).size).toBe(0);
  });

  it('leaves other ids untouched', async () => {
    await writeLikedIds([1, 2, 3]);
    await toggleLikedId(2);
    expect([...(await readLikedIds())].sort()).toEqual([1, 3]);
  });

  it('reports the intended state even when the write fails', async () => {
    mockFailNextSet = new Error('disk full');
    expect(await toggleLikedId(9)).toEqual({ liked: true, saved: false });
  });
});
