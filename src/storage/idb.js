/**
 * The browser's own database, wrapped in promises.
 *
 * The web build has nowhere to keep a catalogue. AsyncStorage — which is
 * localStorage in a browser — holds about 5 MB of strings and makes every read
 * a JSON.parse of the whole value, which is why bookmarks and downloads
 * currently store a full copy of each innovation twice. IndexedDB holds objects,
 * holds far more of them, and can be read by key.
 *
 * Deliberately not the `idb` package. What we need is five operations, and the
 * app's one other dependency on a browser API (AsyncStorage) already arrives
 * through a wrapper this size. The subtlety the package exists to hide — that a
 * transaction closes as soon as the event loop turns — is handled here by never
 * awaiting anything inside one.
 *
 * This module is for the web build. Nothing native imports it, directly or
 * otherwise: React Native has no indexedDB, and isIndexedDbAvailable() is the
 * check every caller is expected to make before relying on a cache.
 */
import { createLogger } from '../utils/logger';

const log = createLogger('idb');

export const DB_NAME = 'atio-kb';

/**
 * Bumped whenever a store is added. Every version must create every store it
 * does not already have, because a browser can arrive at version N from any
 * earlier version — version 2 has to work for someone who last opened the app
 * at version 1 and for someone who has never opened it at all.
 */
export const DB_VERSION = 2;

/** Store names, so a typo is a missing import rather than a silent empty read. */
export const STORES = {
  taxonomies: 'taxonomies',
  /** The content cache: one mapped innovation per uuid, with its pins. */
  innovations: 'innovations',
  /** Index stores. Metadata only, so a row survives its content being evicted. */
  bookmarks: 'bookmarks',
  downloads: 'downloads',
  likes: 'likes',
  /** Small singletons: migration marks, counters, last-sync times. */
  meta: 'meta',
};

/** True when this platform can store anything at all. */
export function isIndexedDbAvailable() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

let databasePromise = null;

/**
 * Open the database, creating any store this version does not have yet.
 *
 * Memoized: every caller shares one connection, because a second open while an
 * upgrade is pending blocks until the first closes.
 */
function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB is not available on this platform'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of Object.values(STORES)) {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name);
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      // Another tab opening a newer version is blocked until this one lets go.
      // Closing costs this tab its cache, which beats hanging the other tab.
      database.onversionchange = () => {
        log.degraded('closing the connection so another tab can upgrade');
        database.close();
        databasePromise = null;
      };
      // The browser can close it too: "Clear site data" in DevTools, storage
      // pressure, a profile being wiped. Kept, a closed connection fails every
      // later transaction with "The database connection is closing", so every
      // bookmark, like and download failed until the page was reloaded.
      database.onclose = () => {
        log.degraded('the browser closed the database; reopening on next use');
        databasePromise = null;
      };
      resolve(database);
    };

    // Private browsing, blocked site data, a corrupted store: all surface here.
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  }).catch((err) => {
    // Not cached as a rejected promise: a later call should get to try again
    // rather than inherit one bad moment for the life of the page.
    databasePromise = null;
    throw err;
  });

  return databasePromise;
}

/**
 * Start a transaction, reopening the database once if the connection it was
 * handed has been closed under it.
 *
 * The close event above covers most of that, but it is delivered
 * asynchronously, and a write can arrive in between. A closed connection
 * throws InvalidStateError synchronously from transaction(); that one case is
 * retried on a fresh connection, once.
 */
async function openTransaction(storeNames, mode) {
  const database = await openDatabase();
  try {
    return database.transaction(storeNames, mode);
  } catch (err) {
    if (err?.name !== 'InvalidStateError') throw err;
    log.degraded('the database connection had closed; reopening:', err.message);
    databasePromise = null;
    return (await openDatabase()).transaction(storeNames, mode);
  }
}

/**
 * Run one operation in its own transaction.
 *
 * The callback is handed the store and must return the IDBRequest it makes,
 * synchronously. Awaiting inside a transaction ends it — the spec closes a
 * transaction once no request is pending and the event loop turns — and the
 * error that produces ("transaction is not active") names nothing useful.
 */
async function run(storeName, mode, operation) {
  const transaction = await openTransaction(storeName, mode);

  return new Promise((resolve, reject) => {
    const request = operation(transaction.objectStore(storeName));

    transaction.onabort = () => reject(transaction.error ?? new Error('transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('transaction failed'));
    // Resolving on the request rather than on the transaction is what makes a
    // read return its value; writes resolve with undefined, which is correct.
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('request failed'));
  });
}

/**
 * Run several operations as one transaction.
 *
 * This is what makes "a bookmark writes both the index entry and the content
 * record" a single fact rather than two writes that can half-succeed. The
 * offline card states that rule; this is where it is enforceable.
 *
 * `work` is handed an object of stores keyed by name, and must issue all of its
 * requests synchronously — the same constraint as run(), for the same reason.
 * It may return a plain value, or an IDBRequest whose result becomes the
 * resolved value. Resolution waits for the transaction to complete, not for the
 * last request, so a caller that is told a write succeeded knows it is durable.
 *
 * @param {string[]} storeNames
 * @param {'readonly'|'readwrite'} mode
 * @param {(stores: Record<string, IDBObjectStore>) => any} work
 */
export async function idbTransaction(storeNames, mode, work) {
  const transaction = await openTransaction(storeNames, mode);

  return new Promise((resolve, reject) => {
    const stores = Object.fromEntries(
      storeNames.map((name) => [name, transaction.objectStore(name)])
    );

    let outcome;
    try {
      outcome = work(stores);
    } catch (err) {
      // An exception in `work` leaves a transaction open that would otherwise
      // commit whatever it managed to issue before throwing.
      transaction.abort();
      reject(err);
      return;
    }

    transaction.oncomplete = () => {
      const isRequest = outcome && typeof outcome === 'object' && 'result' in outcome;
      resolve(isRequest ? outcome.result : outcome);
    };
    transaction.onabort = () => reject(transaction.error ?? new Error('transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('transaction failed'));
  });
}

/** Promisify one request made inside an idbTransaction callback. */
export function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('request failed'));
  });
}

/**
 * Read one value.
 *
 * @returns {Promise<any>} undefined when the key is absent, which is not an error
 */
export const idbGet = (store, key) => run(store, 'readonly', (s) => s.get(key));

/** Write one value, replacing whatever was there. */
export const idbPut = (store, key, value) => run(store, 'readwrite', (s) => s.put(value, key));

/** Remove one value. Absent keys are not an error. */
export const idbDelete = (store, key) => run(store, 'readwrite', (s) => s.delete(key));

/** Empty a store. */
export const idbClear = (store) => run(store, 'readwrite', (s) => s.clear());

/** Every value in a store, in key order. */
export const idbGetAll = (store) => run(store, 'readonly', (s) => s.getAll());

/**
 * Drop the memoized connection.
 *
 * For tests, which swap the IndexedDB implementation between cases, and for
 * the version-change path above.
 */
export function resetIdbConnection() {
  databasePromise = null;
}
