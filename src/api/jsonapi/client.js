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

/**
 * Long, because the portal's uncached responses are. Measured, not guessed.
 *
 * A query nobody has run before is computed from scratch and has been timed at
 * anything from three to twenty-five seconds, with filtered list queries
 * occasionally past forty. Thirty seconds was cutting off requests that would
 * have answered, and the retry then started again from nothing — so the user
 * waited through a timeout *and* a fresh attempt. The portal caches each
 * distinct query for an hour, so this is a first-use cost, not a per-use one.
 *
 * Note that the development proxy has a thirty-second limit of its own, so
 * until CORS is enabled this ceiling only applies in a release build.
 */
export const DEFAULT_TIMEOUT_MS = 45000;

/** One original attempt plus two retries. */
export const DEFAULT_ATTEMPTS = 3;

/**
 * Requests to the portal in flight at once, across the whole app.
 *
 * The catalogue pass, the Explore counts, the vocabularies and search each had
 * their own pool, and together a single cold tab kept around twenty requests
 * open against a server that serves other people too — enough, with a few
 * testers at once, to take it down. One cap here covers every caller, so no
 * feature can add load the others did not account for. The callers' own pools
 * still decide order; this decides how many reach the portal.
 */
export const MAX_IN_FLIGHT = 2;

/**
 * Waits between attempts: about two seconds, then about eight.
 *
 * Long enough that a struggling server gets a breather rather than a second
 * copy of the request it is already working on. Jittered so that every caller
 * which failed together does not retry together.
 */
const RETRY_BASE_DELAY_MS = 2000;
const RETRY_GROWTH = 4;

/** The most a `Retry-After` header is trusted to ask for. */
const MAX_RETRY_AFTER_MS = 60000;

/**
 * Consecutive overload answers (5xx, 429, timeout) before the client stops
 * asking for a while, and how long it stops for.
 *
 * Once the portal is failing, every further request makes it worse. Pausing
 * lets it recover, and the callers already fall back to what is cached.
 */
const COOL_OFF_AFTER_FAILURES = 4;
const COOL_OFF_MS = 60000;

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

let inFlight = 0;
const queue = [];
let consecutiveOverloads = 0;
let coolingOffUntil = 0;

/** Wait for one of the MAX_IN_FLIGHT slots. */
function acquireSlot() {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

/** Hand the slot to the next waiting request, or give it back. */
function releaseSlot() {
  const next = queue.shift();
  if (next) next();
  else inFlight -= 1;
}

/**
 * A failure that says the server is overloaded, rather than us being wrong or offline.
 *
 * A timeout counts only at the full timeout. Callers that set a short deadline
 * on purpose — search gives each suggested word's count two seconds — abort
 * slow answers as a matter of course, and counting those would pause the whole
 * app every time one search met a few slow words.
 */
function isOverload(error) {
  if (error?.cause?.reason === 'timeout') return error.cause.timeoutMs >= DEFAULT_TIMEOUT_MS;
  return error?.status === 429 || error?.status >= 500;
}

/** Record how an attempt went, and start a cool-off after a run of overloads. */
function noteOutcome(error) {
  if (!error) {
    consecutiveOverloads = 0;
    return;
  }
  if (!isOverload(error)) return;
  consecutiveOverloads += 1;
  if (consecutiveOverloads >= COOL_OFF_AFTER_FAILURES) {
    consecutiveOverloads = 0;
    coolingOffUntil = Date.now() + COOL_OFF_MS;
    log.degraded(`portal overloaded; pausing requests for ${COOL_OFF_MS / 1000}s`);
  }
}

/** Forget the cool-off and the queue. For tests. */
export function resetRequestGovernor() {
  inFlight = 0;
  queue.length = 0;
  consecutiveOverloads = 0;
  coolingOffUntil = 0;
}

/** Seconds or an HTTP date, as milliseconds from now; null when absent or unreadable. */
function parseRetryAfter(response) {
  const header = response?.headers?.get?.('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.min(ms, MAX_RETRY_AFTER_MS);
}

/** The wait before the next attempt: the server's own ask if it made one, else backoff with jitter. */
function retryDelay(attempt, error) {
  const asked = error?.cause?.retryAfterMs;
  if (typeof asked === 'number') return asked;
  const base = RETRY_BASE_DELAY_MS * RETRY_GROWTH ** (attempt - 1);
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

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
        cause: {
          url,
          status: response.status,
          errors: describeErrors(payload),
          retryAfterMs: parseRetryAfter(response),
        },
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
    // While cooling off, fail at once: the callers serve what is cached, and
    // the portal gets the quiet it needs to recover.
    if (Date.now() < coolingOffUntil) {
      lastError = new JsonApiError(CATALOGUE_UNAVAILABLE_MESSAGE, {
        cause: { url, reason: 'cooling-off', attempt },
      });
      break;
    }

    await acquireSlot();
    try {
      const document = await attemptFetch(url, { timeoutMs, fetchImpl });
      noteOutcome(null);
      return document;
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
      noteOutcome(lastError);
    } finally {
      releaseSlot();
    }

    // A timeout is not retried: the portal is still computing the answer we
    // gave up on, and asking again only gives it the same work twice.
    const timedOut = lastError?.cause?.reason === 'timeout';
    const retryable = !timedOut && isRetryable(lastError.status);
    if (!retryable || attempt === attempts) break;

    const delay = retryDelay(attempt, lastError);
    log.degraded(`${path} failed (attempt ${attempt}/${attempts}), retrying in ${delay}ms`);
    await wait(delay);
  }

  throw lastError;
}
