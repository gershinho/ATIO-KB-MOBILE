/**
 * HTTP client for the backend. Every outbound call to our own server lives
 * here; nothing else in the app should call fetch directly.
 *
 * Configuration:
 *
 * Production: set EXPO_PUBLIC_API_URL to the deployed backend's https origin.
 * That value wins over everything below. It is a URL, not a secret — safe to
 * inline into the bundle, unlike the OpenAI key that used to live here.
 *
 * Development fallbacks, used only when EXPO_PUBLIC_API_URL is unset:
 * - Physical device (Expo Go): the same host as Metro (your Mac's LAN IP)
 * - iOS Simulator: localhost
 * - Android Emulator: 10.0.2.2
 *
 * The dev fallbacks are cleartext http:// on a LAN address. That is fine for a
 * dev server and unusable in production, which is exactly why a release build
 * must supply EXPO_PUBLIC_API_URL.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

function getApiHost() {
  // In Expo Go on a physical device, the app loads from your Mac; use that host for the API.
  // Constants.manifest was removed in SDK 49; expoConfig.hostUri is the only
  // source that can resolve on SDK 54, so the old fallback is gone.
  const debuggerHost = Constants.expoConfig?.hostUri?.replace(/^exp:\/\//, '');
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return host; // e.g. 192.168.4.182
    }
  }
  return Platform.select({
    android: '10.0.2.2',
    default: 'localhost',
  });
}

/** Strip any trailing slash so `${apiOrigin()}/api/x` never doubles up. */
function normalizeOrigin(url) {
  return url.replace(/\/+$/, '');
}

// Expo inlines EXPO_PUBLIC_* at build time, so this one genuinely is a
// constant of the bundle.
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

/** True when running against the dev-host fallback rather than a configured backend. */
export const IS_DEV_API_HOST = !configuredApiUrl;

const DEV_PORT = 3001;
let resolvedOrigin = null;

/**
 * The backend origin.
 *
 * Resolved on first use rather than at module load. The dev fallback reads the
 * Metro host out of Constants.expoConfig, which is populated during startup —
 * evaluating it at import time meant whichever module happened to be imported
 * first decided the value for the whole session, and if it ran before
 * expoConfig was ready the wrong fallback was baked in with no way to correct
 * it. Memoized after the first call, so the value stays stable once chosen.
 */
export function apiOrigin() {
  if (resolvedOrigin) return resolvedOrigin;
  resolvedOrigin = configuredApiUrl
    ? normalizeOrigin(configuredApiUrl)
    : `http://${getApiHost()}:${DEV_PORT}`;
  return resolvedOrigin;
}

/**
 * Optional bearer token for our own backend.
 *
 * Every /api route costs us an OpenAI call, and without this any client that
 * can reach the host can spend that budget. The server only requires it once
 * API_CLIENT_TOKEN is set there, so an unset value here is a working
 * configuration against a server that has not turned the gate on.
 *
 * Being an EXPO_PUBLIC_* value it is inlined into the shipped bundle and is
 * therefore extractable, exactly like the OpenAI key that used to live in this
 * file. The difference is what it unlocks: this one only reaches our own
 * rate-limited endpoints and can be rotated server-side without touching the
 * OpenAI account. It raises the cost of casual abuse; it does not authenticate
 * a user.
 */
const clientToken = process.env.EXPO_PUBLIC_API_CLIENT_TOKEN?.trim();

/**
 * Headers for a call to our backend, carrying the client token when configured.
 *
 * @param {object} [extra] - additional headers, e.g. Content-Type
 */
export function backendHeaders(extra = {}) {
  return clientToken ? { ...extra, Authorization: `Bearer ${clientToken}` } : { ...extra };
}

/**
 * Timeouts, per endpoint. They differ because the work behind them differs: a
 * transcription uploads a file before Whisper even starts, a comparison summary
 * reasons over two long descriptions, a search reranks candidates, and a bullet
 * summary is one short completion.
 */
const TIMEOUTS = {
  transcribe: 60000,
  search: 30000,
  summarizeBullets: 20000,
  compareSummary: 35000,
};

/**
 * The one place a request to our backend is made.
 *
 * Every call needs the same five things — the origin, the client token, an
 * AbortController with a timeout, a status check, and an AbortError translated
 * into a sentence a user can read. Written out per call site, those five drifted:
 * one copy cleared its timer twice instead of once in a `finally`, and one had no
 * timer at all.
 *
 * Errors carry the diagnostic detail on `cause`, not in `message`. `message` is
 * rendered to users verbatim by three call sites, so a status code and a raw
 * response body have no business being in it.
 *
 * @param {string} path - e.g. '/api/search'
 * @param {object} opts
 * @param {string} opts.label - noun used in the fallback message, e.g. 'Search'
 * @param {number} opts.timeoutMs
 * @param {string} opts.timeoutMessage - shown when the request is aborted
 * @param {string} opts.failureMessage - shown for any non-OK status
 * @param {object} [opts.json] - JSON body; sets Content-Type
 * @param {FormData} [opts.body] - raw body; no Content-Type, fetch sets the boundary
 * @param {(body: string, status: number) => string} [opts.messageFromBody] - lets a
 *   caller promote a server-supplied message when the server is the one that
 *   knows what to say (e.g. a 503 explaining the key is unset)
 * @returns {Promise<any>} the parsed JSON response
 */
async function requestBackend(path, {
  label,
  timeoutMs,
  timeoutMessage,
  failureMessage,
  json,
  body,
  messageFromBody,
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiOrigin()}${path}`, {
      method: 'POST',
      headers: json ? backendHeaders({ 'Content-Type': 'application/json' }) : backendHeaders(),
      body: json ? JSON.stringify(json) : body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      const message = messageFromBody?.(errBody, response.status) || failureMessage;
      throw new Error(message, {
        cause: { label, path, status: response.status, body: errBody.slice(0, 500) },
      });
    }

    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(timeoutMessage, { cause: { label, path, reason: 'timeout', timeoutMs } });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Upload a recorded audio file to the backend for Whisper transcription.
 *
 * @param {string} fileUri - Local file URI from expo-audio recorder
 * @returns {Promise<{ text: string }>}
 */
export async function transcribeAudio(fileUri) {
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  });

  return requestBackend('/api/transcribe', {
    label: 'Transcription',
    timeoutMs: TIMEOUTS.transcribe,
    timeoutMessage: 'Transcription timed out. Please try again.',
    failureMessage: 'Transcription is unavailable right now. Please try again.',
    body: formData,
    // A 503 here is the server saying its key is unset — it knows the right
    // words and the user needs them, so that one message is promoted.
    messageFromBody: (errBody, status) => {
      if (status !== 503) return null;
      let parsed = null;
      try {
        parsed = JSON.parse(errBody);
      } catch {
        /* body was not JSON */
      }
      return parsed?.error || 'Transcription not available. Set OPENAI_API_KEY on the server.';
    },
  });
}

/**
 * Summarize an innovation description into exactly 3 bullets.
 *
 * Send description text only; never metadata (title, cost, region, owner).
 *
 * @param {string} text - short + long description, already joined
 * @param {number|string} innovationId - used for server-side logging only
 * @returns {Promise<string[]|null>} exactly 3 bullets, or null when the backend
 *   has no summary to offer. Rejects on transport failure or a non-OK status.
 */
export async function summarizeBullets(text, innovationId) {
  const data = await requestBackend('/api/summarize-bullets', {
    label: 'Summary',
    timeoutMs: TIMEOUTS.summarizeBullets,
    timeoutMessage: 'Summary timed out. Please try again.',
    failureMessage: 'Summary is unavailable right now. Please try again.',
    json: { text, innovationId },
  });

  const bullets = data?.bullets;
  if (Array.isArray(bullets) && bullets.length === 3 && bullets.every((b) => typeof b === 'string')) {
    return bullets;
  }
  return null;
}

/**
 * Call the AI search backend.
 *
 * @param {string} query - The user's natural language problem description
 * @param {{offset?: number, limit?: number}} [options]
 * @returns {Promise<{ query: string, results: Array, hasMore: boolean, total?: number }>}
 *   `total` is present only when the backend had candidates to rank; a query
 *   that matches nothing returns just `{ query, results: [], hasMore: false }`.
 */
export async function aiSearch(query, options = {}) {
  const { offset = 0, limit = 5 } = options;
  return requestBackend('/api/search', {
    label: 'Search',
    timeoutMs: TIMEOUTS.search,
    timeoutMessage: 'Search timed out. Please try again.',
    failureMessage: 'Search is unavailable right now. Please try again.',
    json: { query, offset, limit },
  });
}

/**
 * Compare two innovations from their descriptions alone.
 *
 * Lived in services/aiSummary.js, which hand-rolled its own fetch with its own
 * timeout and error handling while this module's header claimed every outbound
 * call lived here. aiSummary.js now owns only the description extraction and the
 * empty-input case.
 *
 * @param {{title?: string}} innovationA
 * @param {{title?: string}} innovationB
 * @param {string} descriptionA
 * @param {string} descriptionB
 * @returns {Promise<{summary: string}>}
 */
export async function compareSummary(innovationA, innovationB, descriptionA, descriptionB) {
  const data = await requestBackend('/api/compare-summary', {
    label: 'Comparison',
    timeoutMs: TIMEOUTS.compareSummary,
    timeoutMessage: 'Comparison timed out. Please try again.',
    failureMessage: 'The comparison is unavailable right now. Please try again.',
    json: {
      // The wire keys stay 1/2 — that is the backend's contract, not ours.
      name1: innovationA?.title,
      name2: innovationB?.title,
      description1: descriptionA,
      description2: descriptionB,
    },
    messageFromBody: (errBody) => {
      let parsed = null;
      try {
        parsed = JSON.parse(errBody);
      } catch {
        /* body was not JSON */
      }
      return parsed?.error || null;
    },
  });

  if (typeof data?.summary !== 'string') {
    throw new Error('The comparison came back in a form we could not read.', {
      cause: { label: 'Comparison', received: typeof data?.summary },
    });
  }
  return { summary: data.summary };
}
