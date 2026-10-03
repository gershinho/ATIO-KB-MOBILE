/**
 * The one place a request to the FAO JSON:API is made.
 *
 * Follows the same contract as services/api.js: `message` is a sentence we
 * wrote and a screen may render verbatim, every diagnostic detail lives on
 * `cause`, and a marker flag tells a catch block the message is already ours.
 *
 * What differs is retries. Our own backend either answers or is down; this one
 * is a public Drupal site behind a cache, and the spike that produced the dev
 * proxy measured cold responses of ~22 seconds and occasional gateway errors.
 * Retrying there is the difference between an empty Explore page and a slow one.
 *
 * Where it points:
 *
 *   EXPO_PUBLIC_JSONAPI_URL set   → that origin
 *   development, unset            → the dev proxy on 127.0.0.1:3002
 *   production, unset             → sti-portal.fao.org directly
 *
 * The proxy default is not a convenience: a browser cannot call the portal
 * directly until CORS is enabled there, so in a browser the direct URL fails
 * before our code sees a byte. Native builds have no origin and no such rule,
 * which is why this is a default rather than a hard switch — a device on the
 * same network can be pointed straight at the portal with the env var.
 */
import { buildQuery, withQuery } from './query';
import { createLogger } from '../../utils/logger';

const log = createLogger('jsonapi');

const DEV_PROXY_ORIGIN = 'http://127.0.0.1:3002/jsonapi';
const PORTAL_ORIGIN = 'https://sti-portal.fao.org/jsonapi';

/** Long, because the portal's uncached responses are. Measured, not guessed. */
export const DEFAULT_TIMEOUT_MS = 30000;

/** One original attempt plus two retries. */
export const DEFAULT_ATTEMPTS = 3;

const RETRY_BASE_DELAY_MS = 500;

/** Shown when the catalogue cannot be reached at all. */
export const CATALOGUE_UNAVAILABLE_MESSAGE =
  'The innovation catalogue is unavailable right now. Please try again.';

/** Shown when it answered too slowly to wait for. */
export const CATALOGUE_TIMEOUT_MESSAGE =
  'The innovation catalogue is taking too long to respond. Please try again.';

/**
 * Where requests go, without a trailing slash.
 *
 * Both inputs are read on every call rather than captured at module load. The
 * env var because a build can be configured after this module is first
 * imported, and `__DEV__` because it is a runtime global: captured at load it
 * would freeze whatever value existed when the first importer ran.
 */
export function jsonApiOrigin() {
  const configured = process.env.EXPO_PUBLIC_JSONAPI_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;
  return isDevelopment ? DEV_PROXY_ORIGIN : PORTAL_ORIGIN;
}

/**
 * A failure that already carries a message fit to show someone.
 *
 * Carries `status` separately from `cause` so a caller can distinguish "the
 * record is gone" (404, show an empty state) from "the server is unwell"
 * (502, offer a retry) without unpacking the cause.
 */
export class JsonApiError extends Error {
  constructor(message, { status = null, cause } = {}) {
    super(message, { cause });
    this.name = 'JsonApiError';
    this.status = status;
    /** Marks the message as one we wrote. Mirrors isBackendResponse. */
    this.isJsonApiResponse = true;
  }
}

/**
 * Worth trying again?
 *
 * 5xx and 429 are the server asking for patience. A 4xx is our query being
 * wrong, and sending it twice more only wastes the user's time. No status at
 * all means the request never arrived — the proxy is not running, the network
 * dropped — which a second attempt sometimes fixes.
 */
function isRetryable(status) {
  if (status == null) return true;
  return status === 429 || status >= 500;
}

/**
 * JSON:API reports failures as an `errors` array. Pull out something a log
 * reader can act on, without letting it reach a user's screen.
 */
function describeErrors(payload) {
  const errors = payload?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return errors
    .map((e) => [e.title, e.detail].filter(Boolean).join(': '))
    .join(' | ')
    .slice(0, 500);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One attempt. Resolves with the parsed body, or throws something the caller
 * can decide to retry.
 */
async function attemptFetch(url, { timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/vnd.api+json' },
      signal: controller.signal,
    });

    // A body is read even on a failure: the portal explains rejected queries in
    // it, and "The page size needs to be a positive integer" in a log beats a
    // bare 400 every time.
    let payload = null;
    try {
      payload = await response.json();
    } catch (parseError) {
      if (response.ok) {
        throw new JsonApiError(CATALOGUE_UNAVAILABLE_MESSAGE, {
          status: response.status,
          cause: { url, reason: 'unparseable', original: parseError?.message },
        });
      }
    }

    if (!response.ok) {
      throw new JsonApiError(CATALOGUE_UNAVAILABLE_MESSAGE, {
        status: response.status,
        cause: { url, status: response.status, errors: describeErrors(payload) },
      });
    }

    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch one JSON:API resource.
 *
 * @param {string} path - below the origin, e.g. '/node/innovation'
 * @param {object} [options]
 * @param {object} [options.query] - passed to buildQuery; a string is used as-is
 * @param {number} [options.timeoutMs]
 * @param {number} [options.attempts] - total tries, including the first
 * @param {typeof fetch} [options.fetchImpl] - injected by the tests
 * @returns {Promise<object>} the parsed JSON:API document
 * @throws {JsonApiError} with a message fit to render
 */
export async function fetchJsonApi(path, {
  query,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  attempts = DEFAULT_ATTEMPTS,
  fetchImpl = fetch,
} = {}) {
  const queryString = typeof query === 'string' ? query : buildQuery(query);
  const url = withQuery(`${jsonApiOrigin()}${path}`, queryString);

  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await attemptFetch(url, { timeoutMs, fetchImpl });
    } catch (err) {
      lastError = err;

      // Our own abort, not the caller's: the request outlived its timeout.
      if (err?.name === 'AbortError') {
        lastError = new JsonApiError(CATALOGUE_TIMEOUT_MESSAGE, {
          cause: { url, reason: 'timeout', timeoutMs, attempt },
        });
      } else if (!err?.isJsonApiResponse) {
        // fetch rejected before any response: no network, no proxy, bad origin.
        // Its own wording is written for a developer, so it stays on `cause`.
        lastError = new JsonApiError(CATALOGUE_UNAVAILABLE_MESSAGE, {
          cause: { url, reason: 'network', original: err?.message, attempt },
        });
      }

      const retryable = isRetryable(lastError.status);
      if (!retryable || attempt === attempts) break;

      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      log.degraded(`${path} failed (attempt ${attempt}/${attempts}), retrying in ${delay}ms`);
      await wait(delay);
    }
  }

  throw lastError;
}
