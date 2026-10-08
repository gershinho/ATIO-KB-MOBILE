/**
 * Which source the web build reads its catalogue from, and the Supabase
 * client for when it is Supabase.
 *
 *   EXPO_PUBLIC_DATA_SOURCE=supabase   the published snapshot, via RPCs
 *   EXPO_PUBLIC_DATA_SOURCE=jsonapi    the FAO portal directly (the default)
 *
 * Supabase is chosen only when the flag says so *and* both
 * EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set,
 * so a build missing either quietly keeps the portal path, which is also the
 * rollback route. The flag switches the catalogue source and nothing else:
 * bookmarks, downloads, likes and every IndexedDB cache stay where they are.
 *
 * Both values are public by design. The publishable key reaches only the read
 * RPCs; the catalogue tables behind them are not exposed at all.
 */
import { createClient } from '@supabase/supabase-js';
import { JsonApiError, CATALOGUE_UNAVAILABLE_MESSAGE, CATALOGUE_TIMEOUT_MESSAGE } from '../jsonapi/client';

/**
 * Long enough for a cold index page, short enough that a dead connection
 * falls back to the cache while the user is still looking.
 */
const RPC_TIMEOUT_MS = 30000;

/** Read on every call, like jsonApiOrigin, so a test or late config can set them. */
function settings() {
  return {
    flag: process.env.EXPO_PUBLIC_DATA_SOURCE,
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

/** 'supabase' or 'jsonapi'. */
export function dataSource() {
  const { flag, url, key } = settings();
  return flag === 'supabase' && url && key ? 'supabase' : 'jsonapi';
}

export const usingSupabase = () => dataSource() === 'supabase';

let client = null;
let clientFor = null;

function supabase() {
  const { url, key } = settings();
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
