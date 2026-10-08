/**
 * The Supabase client for the web build's catalogue reads.
 *
 * Which source is in use is config.js's question, re-exported here for the
 * data layer. The flag switches the catalogue source and nothing else:
 * bookmarks, downloads, likes and every IndexedDB cache stay where they are.
 *
 * The publishable key reaches only the read RPCs; the catalogue tables behind
 * them are not exposed at all.
 */
import { createClient } from '@supabase/supabase-js';
import { JsonApiError, CATALOGUE_UNAVAILABLE_MESSAGE, CATALOGUE_TIMEOUT_MESSAGE } from '../jsonapi/client';
import { supabaseSettings, dataSource, usingSupabase } from './config';

export { dataSource, usingSupabase };

/**
 * Long enough for a cold index page, short enough that a dead connection
 * falls back to the cache while the user is still looking.
 */
const RPC_TIMEOUT_MS = 30000;

let client = null;
let clientFor = null;

function supabase() {
  const { url, key } = supabaseSettings();
  if (!client || clientFor !== `${url}|${key}`) {
    client = createClient(url, key, {
      // Nobody signs in to read the catalogue; keep the auth client inert.
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    clientFor = `${url}|${key}`;
  }
  return client;
}

/**
 * Call a read RPC. Resolves with its JSON.
 *
 * Failures are thrown as the same JsonApiError the portal path throws — a
 * message fit to show, the details on `cause` — so every caller's catch and
 * offline fallback works unchanged. The Postgres error code rides along on
 * `code`; get_catalog_index's "snapshot changed" is one the caller acts on.
 *
 * @param {string} name
 * @param {object} [args]
 */
export async function rpc(name, args = {}) {
  let response;
  try {
    response = await supabase().rpc(name, args).abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw Object.assign(
      new JsonApiError(timedOut ? CATALOGUE_TIMEOUT_MESSAGE : CATALOGUE_UNAVAILABLE_MESSAGE, {
        cause: { rpc: name, reason: timedOut ? 'timeout' : 'network', original: err?.message },
      }),
      { code: null }
    );
  }

  const { data, error, status } = response;
  if (error) {
    const timedOut = /abort|timeout/i.test(error.message ?? '');
    throw Object.assign(
      new JsonApiError(timedOut ? CATALOGUE_TIMEOUT_MESSAGE : CATALOGUE_UNAVAILABLE_MESSAGE, {
        status: status || null,
        cause: { rpc: name, code: error.code, message: error.message, details: error.details },
      }),
      { code: error.code ?? null }
    );
  }
  return data;
}

/** Forget the client. For tests. */
export function resetSupabaseClient() {
  client = null;
  clientFor = null;
}
