/**
 * The content cache and the three lists that point at it.
 *
 * Run against fake-indexeddb, so transactions, cursors and key ordering behave
 * the way a browser's would. The two properties worth protecting are the ones
 * the offline card states: content is stored once however many lists want it,
 * and a record is only let go when nobody has a reason to keep it.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import {
  PINS,
  addPin,
  removePin,
  listPinned,
  replacePinned,
  clearPinned,
  putContent,
  getContent,
  readLikes,
  writeLikes,
  storageUsage,
  readMeta,
  writeMeta,
  recordView,
  putManyContent,
  evictOverflow,
  clearUnpinned,
  clearAllOfflineContent,
  MAX_CACHE_BYTES,
} from '../src/storage/offlineStore';
import { STORES, idbGet, resetIdbConnection } from '../src/storage/idb';

const innovation = (id, title = `Title ${id}`) => ({
  id,
  title,
  shortDescription: 'A short description',
  countries: ['Kenya'],
  readinessLevel: 7,
});

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  resetIdbConnection();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('pins', () => {
  it('stores the content and the index entry in one go', async () => {
    expect(await addPin(PINS.bookmark, innovation('a'), { now: 1000 })).toBe(true);

    const record = await idbGet(STORES.innovations, 'a');
    expect(record.data.title).toBe('Title a');
    expect(record.pinnedBy).toEqual(['bookmark']);
    expect(await idbGet(STORES.bookmarks, 'a')).toEqual({ addedAt: 1000, title: 'Title a' });
  });

  it('keeps one copy of a record that is both bookmarked and downloaded', async () => {
    await addPin(PINS.bookmark, innovation('a'));
    await addPin(PINS.download, innovation('a'));

    const record = await idbGet(STORES.innovations, 'a');
    expect(record.pinnedBy).toEqual(['bookmark', 'download']);
    expect(await listPinned(PINS.bookmark)).toHaveLength(1);
    expect(await listPinned(PINS.download)).toHaveLength(1);
  });

  it('leaves the record alone while another pin still wants it', async () => {
    await addPin(PINS.bookmark, innovation('a'));
    await addPin(PINS.download, innovation('a'));

    await removePin(PINS.bookmark, 'a');

    // The whole point of pinnedBy: un-bookmarking must not delete the content
    // the Downloads screen is relying on.
    const record = await idbGet(STORES.innovations, 'a');
    expect(record.pinnedBy).toEqual(['download']);
    expect(await getContent('a')).not.toBeNull();
    expect(await listPinned(PINS.bookmark)).toHaveLength(0);
  });

  it('keeps the content after the last pin goes, for the cache to decide about', async () => {
    await addPin(PINS.bookmark, innovation('a'));
    await removePin(PINS.bookmark, 'a');

    const record = await idbGet(STORES.innovations, 'a');
    expect(record.pinnedBy).toEqual([]);
    expect(await getContent('a')).not.toBeNull();
  });

  it('does not pin the same reason twice', async () => {
    await addPin(PINS.bookmark, innovation('a'));
    await addPin(PINS.bookmark, innovation('a'));
    expect((await idbGet(STORES.innovations, 'a')).pinnedBy).toEqual(['bookmark']);
  });

  it('refuses a record with no id, and an unknown pin', async () => {
    expect(await addPin(PINS.bookmark, { title: 'no id' })).toBe(false);
    expect(await addPin('favourite', innovation('a'))).toBe(false);
  });
});

describe('listPinned', () => {
  it('returns the list newest first', async () => {
    await addPin(PINS.bookmark, innovation('old'), { now: 1000 });
    await addPin(PINS.bookmark, innovation('new'), { now: 3000 });
    await addPin(PINS.bookmark, innovation('middle'), { now: 2000 });

    expect((await listPinned(PINS.bookmark)).map((i) => i.id)).toEqual(['new', 'middle', 'old']);
  });

  it('stamps the timestamp under the key the screen expects', async () => {
    await addPin(PINS.download, innovation('a'), { now: 1000 });
    const [row] = await listPinned(PINS.download, { timestampKey: 'downloadedAt' });
    expect(row.downloadedAt).toBe(1000);
  });

  it('keeps the row when the content is gone, and says it is not available', async () => {
    // What the card asks for: the Bookmarks screen never silently loses a row.
    await addPin(PINS.bookmark, innovation('a', 'Evicted Thing'), { now: 1000 });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('atio-kb');
      request.onsuccess = () => {
        const tx = request.result.transaction(STORES.innovations, 'readwrite');
        tx.objectStore(STORES.innovations).delete('a');
        tx.oncomplete = resolve;
        tx.onerror = reject;
      };
    });

    const [row] = await listPinned(PINS.bookmark);
    expect(row).toMatchObject({ id: 'a', title: 'Evicted Thing', availableOffline: false });
  });

  it('marks a joined row as available', async () => {
    await addPin(PINS.bookmark, innovation('a'));
    const [row] = await listPinned(PINS.bookmark);
    expect(row).toMatchObject({ availableOffline: true, shortDescription: 'A short description' });
  });

  it('is empty before anything is pinned', async () => {
    expect(await listPinned(PINS.bookmark)).toEqual([]);
  });
});

describe('replacePinned', () => {
  it('adds what is new and removes what is gone', async () => {
    await addPin(PINS.bookmark, innovation('a'), { now: 1000 });
    await addPin(PINS.bookmark, innovation('b'), { now: 2000 });

    await replacePinned(PINS.bookmark, [innovation('b'), innovation('c')], { now: 3000 });

    expect((await listPinned(PINS.bookmark)).map((i) => i.id).sort()).toEqual(['b', 'c']);
  });

  it('leaves an untouched entry’s timestamp where it was', async () => {
    // The screens write the whole list back on every toggle. Re-stamping each
    // entry would reorder the list under the user every time they bookmarked
    // anything.
    await addPin(PINS.bookmark, innovation('a'), { now: 1000 });
    await replacePinned(PINS.bookmark, [innovation('a'), innovation('b')], { now: 5000 });

    const rows = await listPinned(PINS.bookmark, { timestampKey: 'bookmarkedAt' });
    expect(rows.find((r) => r.id === 'a').bookmarkedAt).toBe(1000);
    expect(rows.find((r) => r.id === 'b').bookmarkedAt).toBe(5000);
  });

  it('honours a timestamp the caller already stamped', async () => {
    await replacePinned(
      PINS.bookmark,
      [{ ...innovation('a'), bookmarkedAt: 777 }],
      { now: 5000, timestampKey: 'bookmarkedAt' }
    );
    const [row] = await listPinned(PINS.bookmark, { timestampKey: 'bookmarkedAt' });
    expect(row.bookmarkedAt).toBe(777);
  });

  it('empties the list when handed nothing', async () => {
    await addPin(PINS.bookmark, innovation('a'));
    await replacePinned(PINS.bookmark, []);
    expect(await listPinned(PINS.bookmark)).toEqual([]);
  });
});

describe('clearPinned', () => {
  it('drops the list but not another pin’s hold on the content', async () => {
    await addPin(PINS.bookmark, innovation('a'));
    await addPin(PINS.download, innovation('a'));

    await clearPinned(PINS.bookmark);

    expect(await listPinned(PINS.bookmark)).toEqual([]);
    expect(await listPinned(PINS.download)).toHaveLength(1);
    expect(await getContent('a')).not.toBeNull();
  });
});

describe('content', () => {
  it('refreshes a record without claiming anyone pinned it', async () => {
    await putContent(innovation('a'), { now: 1000 });
    const record = await idbGet(STORES.innovations, 'a');
    expect(record.pinnedBy).toEqual([]);
    expect(record.cachedAt).toBe(1000);
  });

  it('keeps the pins and the first-seen time when a record is written again', async () => {
    await addPin(PINS.bookmark, innovation('a'), { now: 1000 });
    await putContent({ ...innovation('a', 'Updated Title'), readinessLevel: 9 }, { now: 2000 });

    const record = await idbGet(STORES.innovations, 'a');
    expect(record.pinnedBy).toEqual(['bookmark']);
    expect(record.lastViewedAt).toBe(1000);
    expect(record.cachedAt).toBe(2000);
    expect(record.data.title).toBe('Updated Title');
  });

  it('returns null for a record it does not have', async () => {
    expect(await getContent('missing')).toBeNull();
  });
});

describe('likes', () => {
  it('round-trips a set of ids', async () => {
    await writeLikes(['a', 'b']);
    expect(await readLikes()).toEqual(new Set(['a', 'b']));
  });

  it('removes what is no longer liked', async () => {
    await writeLikes(['a', 'b']);
    await writeLikes(['b']);
    expect(await readLikes()).toEqual(new Set(['b']));
  });

  it('is an empty set before anything is liked', async () => {
    expect(await readLikes()).toEqual(new Set());
  });
});

describe('storageUsage', () => {
  it('counts the records, their size and how many are pinned', async () => {
    await addPin(PINS.bookmark, innovation('a'));
    await putContent(innovation('b'));

    const usage = await storageUsage();
    expect(usage.records).toBe(2);
    expect(usage.pinned).toBe(1);
    expect(usage.bytes).toBeGreaterThan(0);
  });
});

describe('meta', () => {
  it('round-trips a singleton', async () => {
    await writeMeta('anything', { at: 42 });
    expect(await readMeta('anything')).toEqual({ at: 42 });
  });
});

describe('recording a view', () => {
  it('caches a record that was only looked at', async () => {
    await recordView(innovation('a'), { now: 1000 });
    const record = await idbGet(STORES.innovations, 'a');

    expect(record.lastViewedAt).toBe(1000);
    expect(record.pinnedBy).toEqual([]);
  });

  it('moves a record to the front of the queue without touching its pins', async () => {
    await addPin(PINS.bookmark, innovation('a'), { now: 1000 });
    await recordView(innovation('a'), { now: 5000 });

    const record = await idbGet(STORES.innovations, 'a');
    expect(record.lastViewedAt).toBe(5000);
    expect(record.pinnedBy).toEqual(['bookmark']);
  });

  it('ignores a record with no id', async () => {
    expect(await recordView({ title: 'no id' })).toBe(false);
  });
});

describe('eviction', () => {
  /** n unpinned records, each viewed at a distinct time. */
  const seedUnpinned = async (n) => {
    for (let i = 0; i < n; i += 1) {
      await recordView(innovation(`u${i}`), { now: 1000 + i });
    }
  };

  it('keeps the cache under the record cap', async () => {
    await seedUnpinned(10);
    const result = await evictOverflow({ maxRecords: 4 });

    expect(result.evicted).toBe(6);
    expect((await storageUsage()).records).toBe(4);
  });

  it('drops the least recently viewed first', async () => {
    await seedUnpinned(5);
    await evictOverflow({ maxRecords: 2 });

    // u4 and u3 were the last two seen.
    expect(await getContent('u4')).not.toBeNull();
    expect(await getContent('u3')).not.toBeNull();
    expect(await getContent('u0')).toBeNull();
  });

  it('never evicts a pinned record, however old', async () => {
    await addPin(PINS.bookmark, innovation('kept'), { now: 1 });
    await seedUnpinned(5);

    await evictOverflow({ maxRecords: 1 });

    // The whole point: a bookmark is a promise that it will still be there.
    expect(await getContent('kept')).not.toBeNull();
    expect((await listPinned(PINS.bookmark))).toHaveLength(1);
  });

  it('evicts on the quota as well as the count', async () => {
    await seedUnpinned(5);
    const { bytes } = await storageUsage();

    const result = await evictOverflow({ maxRecords: 100, maxBytes: Math.floor(bytes / 2) });
    expect(result.evicted).toBeGreaterThan(0);
  });

  it('does nothing when the cache is inside its limits', async () => {
    await seedUnpinned(3);
    expect((await evictOverflow({ maxRecords: 10 })).evicted).toBe(0);
  });
});

describe('batched writes', () => {
  it('caches many records at once, unpinned', async () => {
    const written = await putManyContent([innovation('a'), innovation('b')], { now: 1000 });

    expect(written).toBe(2);
    expect((await idbGet(STORES.innovations, 'a')).pinnedBy).toEqual([]);
  });

  it('keeps the pins of a record it is refreshing', async () => {
    // What makes refreshing a bookmark safe: the fresh copy must not unpin it.
    await addPin(PINS.bookmark, innovation('a'), { now: 1000 });
    await putManyContent([innovation('a', 'Fresher Title')], { now: 2000 });

    const record = await idbGet(STORES.innovations, 'a');
    expect(record.pinnedBy).toEqual(['bookmark']);
    expect(record.data.title).toBe('Fresher Title');
  });

  it('skips records with no id, and an empty batch', async () => {
    expect(await putManyContent([{ title: 'no id' }])).toBe(0);
    expect(await putManyContent([])).toBe(0);
  });
});

describe('clearing', () => {
  it('clears the unpinned and keeps the pinned', async () => {
    await addPin(PINS.bookmark, innovation('pinned'));
    await recordView(innovation('seen'));

    expect(await clearUnpinned()).toBe(1);
    expect(await getContent('pinned')).not.toBeNull();
    expect(await getContent('seen')).toBeNull();
  });

  it('clears everything, lists included', async () => {
    await addPin(PINS.bookmark, innovation('a'));
    await addPin(PINS.download, innovation('b'));
    await writeLikes(['c']);

    expect(await clearAllOfflineContent()).toBe(true);
    expect(await listPinned(PINS.bookmark)).toEqual([]);
    expect(await listPinned(PINS.download)).toEqual([]);
    expect(await readLikes()).toEqual(new Set());
    expect((await storageUsage()).records).toBe(0);
  });
});

describe('what Settings reports', () => {
  it('counts records, bytes, pins and the quota', async () => {
    await addPin(PINS.bookmark, innovation('a'));
    await recordView(innovation('b'));

    const usage = await storageUsage();
    expect(usage).toMatchObject({ records: 2, pinned: 1, quota: MAX_CACHE_BYTES });
    expect(usage.bytes).toBeGreaterThan(0);
  });
});
