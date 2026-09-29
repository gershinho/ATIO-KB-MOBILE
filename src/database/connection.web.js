/**
 * Web twin of connection.js.
 *
 * The native file opens the bundled 37MB SQLite catalogue, copying it out of
 * assets on first run. Neither half of that works in a browser:
 *
 * - expo-file-system has no web implementation. Every method, documentDirectory
 *   included, warns "expo-file-system is not supported on web".
 * - Shipping the 37MB database to a browser is ruled out by the Phase 1 scope
 *   decision (D9): the service worker caches the app shell only, never the DB.
 *
 * So the web build has no catalogue, and every query module rejects the same
 * way. This is the whole reason the split exists: because this file is the only
 * one that imports expo-sqlite, expo-asset and expo-file-system, replacing it
 * keeps all three out of the web bundle entirely, rather than letting them fail
 * at import time and white-screen the app.
 *
 * Search still works on web. It goes through the backend (services/api.js),
 * which runs the same catalogue server-side and returns finished records.
 */
import { WebDataUnavailableError } from './webDataUnavailable';

/**
 * Matches the native signature — callers always `await initDatabase()` — and
 * always rejects.
 *
 * Not memoized like the native one: there is no expensive work to share, and a
 * fresh error per call keeps stack traces pointing at the actual caller.
 *
 * @returns {Promise<never>}
 */
export function initDatabase() {
  return Promise.reject(new WebDataUnavailableError());
}
