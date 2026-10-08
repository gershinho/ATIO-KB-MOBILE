/**
 * What every AI Edge Function does around its route: CORS, the client token,
 * reading the body, and a Gemini client from the function's secrets. Deno only
 * (Deno.serve, Deno.env); the route logic it wraps is shared with Express.
 *
 * Gateway: these functions are deployed with verify_jwt = false (see
 * supabase/config.toml). The Supabase gateway would otherwise demand a Supabase
 * JWT in Authorization, which is where the app already sends its client token.
 * In its place the function checks that token itself, exactly as Express does:
 * when API_CLIENT_TOKEN is set as a secret, a request must carry
 * `Authorization: Bearer <that value>`; when it is not set, the route is open.
 * The token is inlined into the web bundle, so it is a gate against casual
 * traffic spending the Gemini budget, not authentication of a user.
 *
 * CORS: the deployed app's origin is https://sti-portal.fao.org — an origin has
 * no path, so /atiokb-webapp plays no part — plus localhost for testing a local
 * build. ALLOWED_ORIGINS (comma-separated) adds more without a redeploy.
 */
import { createAi } from './ai/gemini.js';

const DEFAULT_ORIGINS = ['https://sti-portal.fao.org'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function allowedOrigin(origin) {
  if (!origin) return null;
  const extra = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (DEFAULT_ORIGINS.includes(origin) || extra.includes(origin) || LOCAL_ORIGIN.test(origin)) {
    return origin;
  }
  return null;
}

function corsHeaders(origin) {
  const allowed = allowedOrigin(origin);
  return {
    ...(allowed ? { 'Access-Control-Allow-Origin': allowed } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** Constant-time compare, so a wrong token cannot be recovered by timing. */
function tokensMatch(provided, expected) {
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

const json = (status, body, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

/**
 * Serve one route.
 *
 * @param {(ai: object, body: object) => Promise<{status: number, body: object}>} route
 */
export function serveRoute(route) {
  Deno.serve(async (req) => {
    const cors = corsHeaders(req.headers.get('origin'));

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed' }, cors);

    const expected = Deno.env.get('API_CLIENT_TOKEN')?.trim();
    if (expected) {
      const header = req.headers.get('authorization') || '';
      const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      if (!provided || !tokensMatch(provided, expected)) {
        return json(401, { error: 'Unauthorized' }, cors);
      }
    }

    // A body that is not JSON reads as an empty one, which every route already
    // answers: a 400 for a missing query, null bullets for missing text.
    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const ai = createAi({ apiKey: Deno.env.get('GEMINI_API_KEY'), model: Deno.env.get('GEMINI_MODEL') });
    const result = await route(ai, body);
    return json(result.status, result.body, cors);
  });
}

/**
 * A small in-memory cache for rank results, per function instance — the same
 * five minutes and 200 entries Express keeps. Instances are recycled, so this
 * saves repeat calls within a session rather than promising anything.
 */
export function memoryRankCache({ ttlMs = 5 * 60 * 1000, max = 200 } = {}) {
  const entries = new Map();
  const key = (query, ids) => `${query.trim().toLowerCase()}|${[...ids].sort().join(',')}`;
  return {
    get(query, ids) {
      const entry = entries.get(key(query, ids));
      if (!entry) return null;
      if (Date.now() - entry.at > ttlMs) {
        entries.delete(key(query, ids));
        return null;
      }
      return entry.ranked;
    },
    set(query, ids, ranked) {
      entries.set(key(query, ids), { ranked, at: Date.now() });
      if (entries.size > max) entries.delete(entries.keys().next().value);
    },
  };
}
