/**
 * A database connection the browser has closed must not take every later
 * save down with it.
 *
 * "Clear site data" in Chrome's DevTools closes the page's open IndexedDB
 * connection. idb.js memoizes its connection, so it kept handing out the
 * closed one, and every bookmark, like and download failed with "The database
 * connection is closing" — shown as "Could not save" — until a reload.
 * Reproduced in Chrome on 8 October; these pin the recovery.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { idbGet, idbPut, idbTransaction, resetIdbConnection, STORES } from '../src/storage/idb';
import { addPin, listPinned } from '../src/storage/offlineStore';

let connections;

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  resetIdbConnection();
  connections = [];
  // Keep hold of every connection the module opens, so a test can close it
  // the way the browser does.
  const open = global.indexedDB.open.bind(global.indexedDB);
  global.indexedDB.open = (...args) => {
    const request = open(...args);
    request.addEventListener('success', () => connections.push(request.result));
    return request;
  };
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const closeUnderneath = () => connections.forEach((db) => db.close());

it('writes again after the connection is closed under it', async () => {
  await idbPut(STORES.meta, 'k', 1);
  closeUnderneath();

  await expect(idbPut(STORES.meta, 'k', 2)).resolves.toBe('k');
  await expect(idbGet(STORES.meta, 'k')).resolves.toBe(2);
  expect(connections).toHaveLength(2);
});

it('runs a multi-store transaction after the connection is closed under it', async () => {
  await idbPut(STORES.meta, 'k', 1);
  closeUnderneath();

  await idbTransaction([STORES.meta, STORES.likes], 'readwrite', (stores) => {
    stores[STORES.meta].put('x', 'a');
    stores[STORES.likes].put({ likedAt: 1 }, 'id-1');
  });
  await expect(idbGet(STORES.likes, 'id-1')).resolves.toEqual({ likedAt: 1 });
});

it('saves a bookmark after the connection is closed under it', async () => {
  await addPin('bookmark', { id: 'a', title: 'First' });
  closeUnderneath();

  await expect(addPin('bookmark', { id: 'b', title: 'Second' })).resolves.toBe(true);
  const pinned = await listPinned('bookmark');
  expect(pinned.map((r) => r.id).sort()).toEqual(['a', 'b']);
});
