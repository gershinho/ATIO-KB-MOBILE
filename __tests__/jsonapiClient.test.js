/**
 * The client's contract is the one services/api.js already set: `message` is a
 * sentence a screen may render verbatim, and every diagnostic detail lives on
 * `cause`. The portal's own wording — "Failed to fetch", a 502 from Cloudflare,
 * a Drupal error about page size — must never reach a user's screen.
 *
 * fetch is injected rather than globally mocked so each case controls exactly
 * what it answers, and no test can accidentally reach the network.
 */
import {
  fetchJsonApi,
  jsonApiOrigin,
  JsonApiError,
  CATALOGUE_UNAVAILABLE_MESSAGE,
  CATALOGUE_TIMEOUT_MESSAGE,
  MAX_IN_FLIGHT,
  resetRequestGovernor,
} from '../src/api/jsonapi/client';

const ok = (payload) => ({ ok: true, status: 200, json: async () => payload });
const failure = (status, payload = { errors: [{ title: 'Bad Request', detail: 'nope' }] }) => ({
  ok: false,
  status,
  json: async () => payload,
});

/** A fetch that answers differently per call, in order. */
function fetchReturning(...responses) {
  const calls = [];
  const impl = jest.fn(async (url) => {
    calls.push(url);
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  });
  impl.urls = calls;
  return impl;
}

describe('jsonApiOrigin', () => {
  const original = process.env.EXPO_PUBLIC_JSONAPI_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_JSONAPI_URL;
    else process.env.EXPO_PUBLIC_JSONAPI_URL = original;
  });

  it('uses the configured origin when one is set', () => {
    process.env.EXPO_PUBLIC_JSONAPI_URL = 'https://example.org/jsonapi';
    expect(jsonApiOrigin()).toBe('https://example.org/jsonapi');
  });

  it('trims a trailing slash so paths do not double up', () => {
    process.env.EXPO_PUBLIC_JSONAPI_URL = 'https://example.org/jsonapi/';
    expect(jsonApiOrigin()).toBe('https://example.org/jsonapi');
  });

  it('falls back to the dev proxy, which is what a browser can reach', () => {
    // Direct calls to the portal are blocked by the browser until CORS is
    // enabled there, so the proxy is the only working default in development.
    delete process.env.EXPO_PUBLIC_JSONAPI_URL;
    global.__DEV__ = true;
    try {
      expect(jsonApiOrigin()).toBe('http://127.0.0.1:3002/jsonapi');
    } finally {
      delete global.__DEV__;
    }
  });

  it('falls back to the portal itself in a release build', () => {
    // Where CORS is expected to be enabled by the time anyone runs one.
    delete process.env.EXPO_PUBLIC_JSONAPI_URL;
    global.__DEV__ = false;
    try {
      expect(jsonApiOrigin()).toBe('https://sti-portal.fao.org/jsonapi');
    } finally {
      delete global.__DEV__;
    }
  });
});

/** Run a request to completion with fake timers, so retry backoff costs no real time. */
async function settled(promise) {
  const outcome = promise.then((value) => ({ value }), (error) => ({ error }));
  await jest.runAllTimersAsync();
  const { value, error } = await outcome;
  if (error) throw error;
  return value;
}

describe('fetchJsonApi', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_JSONAPI_URL = 'https://example.org/jsonapi';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    resetRequestGovernor();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('builds the url from the origin, path and query', async () => {
    const impl = fetchReturning(ok({ data: [] }));
    await fetchJsonApi('/node/innovation', {
      query: { filter: { status: 1 }, page: { limit: 50 } },
      fetchImpl: impl,
    });
    expect(impl.urls[0]).toBe(
      'https://example.org/jsonapi/node/innovation?filter%5Bstatus%5D=1&page%5Blimit%5D=50'
    );
  });

  it('accepts a query string that was built elsewhere', async () => {
    const impl = fetchReturning(ok({ data: [] }));
    await fetchJsonApi('/node/innovation', { query: 'sort=-changed', fetchImpl: impl });
    expect(impl.urls[0]).toBe('https://example.org/jsonapi/node/innovation?sort=-changed');
  });

  it('asks for the JSON:API content type', async () => {
    const impl = fetchReturning(ok({ data: [] }));
    await fetchJsonApi('/node/innovation', { fetchImpl: impl });
    expect(impl.mock.calls[0][1].headers.Accept).toBe('application/vnd.api+json');
  });

  it('returns the parsed document', async () => {
    const impl = fetchReturning(ok({ data: [{ id: 'a' }] }));
    await expect(fetchJsonApi('/node/innovation', { fetchImpl: impl })).resolves.toEqual({
      data: [{ id: 'a' }],
    });
  });

  it('retries a 503 and succeeds on the second try', async () => {
    jest.useFakeTimers();
    const impl = fetchReturning(failure(503), ok({ data: [] }));
    await expect(settled(fetchJsonApi('/x', { fetchImpl: impl }))).resolves.toEqual({ data: [] });
    expect(impl).toHaveBeenCalledTimes(2);
  });

  it('retries when the request never arrived', async () => {
    // No proxy running, no network, wrong origin: fetch rejects outright.
    jest.useFakeTimers();
    const impl = fetchReturning(new TypeError('Failed to fetch'), ok({ data: [] }));
    await expect(settled(fetchJsonApi('/x', { fetchImpl: impl }))).resolves.toEqual({ data: [] });
    expect(impl).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 400, because the query is what is wrong', async () => {
    const impl = fetchReturning(failure(400));
    await expect(fetchJsonApi('/x', { fetchImpl: impl, attempts: 3 })).rejects.toThrow(
      CATALOGUE_UNAVAILABLE_MESSAGE
    );
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it('gives up after the allowed number of attempts', async () => {
    jest.useFakeTimers();
    const impl = fetchReturning(failure(502));
    await expect(settled(fetchJsonApi('/x', { fetchImpl: impl, attempts: 2 }))).rejects.toThrow(JsonApiError);
    expect(impl).toHaveBeenCalledTimes(2);
  });

  it('keeps the portal’s own wording off the screen and on the cause', async () => {
    const impl = fetchReturning(
      failure(400, { errors: [{ title: 'Bad Request', detail: 'The page size needs to be a positive integer.' }] })
    );
    const error = await fetchJsonApi('/x', { fetchImpl: impl }).catch((e) => e);

    expect(error.message).toBe(CATALOGUE_UNAVAILABLE_MESSAGE);
    expect(error.status).toBe(400);
    expect(error.isJsonApiResponse).toBe(true);
    expect(error.cause.errors).toContain('The page size needs to be a positive integer.');
  });

  it('reports a timeout as a timeout, with its own sentence', async () => {
    const impl = jest.fn((url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          const abort = new Error('aborted');
          abort.name = 'AbortError';
          reject(abort);
        });
      })
    );
    const error = await fetchJsonApi('/x', { fetchImpl: impl, timeoutMs: 5, attempts: 1 })
      .catch((e) => e);

    expect(error.message).toBe(CATALOGUE_TIMEOUT_MESSAGE);
    expect(error.cause).toMatchObject({ reason: 'timeout', timeoutMs: 5 });
  });

  it('treats an unparseable success as a failure rather than returning null', async () => {
    // Cloudflare's HTML error pages arrive with a 200 often enough to matter.
    const impl = fetchReturning({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    });
    const error = await fetchJsonApi('/x', { fetchImpl: impl, attempts: 1 }).catch((e) => e);
    expect(error.message).toBe(CATALOGUE_UNAVAILABLE_MESSAGE);
    expect(error.cause.reason).toBe('unparseable');
  });

  // The portal is a public site, and a few testers' tabs at full speed took it
  // down. These pin the limits that keep the app from doing that again.
  describe('load on the portal', () => {
    it(`keeps at most ${MAX_IN_FLIGHT} requests open at once, across callers`, async () => {
      let open = 0;
      let peak = 0;
      const pending = [];
      const impl = jest.fn(() => {
        open += 1;
        peak = Math.max(peak, open);
        return new Promise((resolve) => {
          pending.push(() => {
            open -= 1;
            resolve(ok({ data: [] }));
          });
        });
      });

      const requests = Array.from({ length: 6 }, (_, i) =>
        fetchJsonApi(`/x${i}`, { fetchImpl: impl })
      );
      while (impl.mock.calls.length < 6 || pending.length > 0) {
        await new Promise((r) => setImmediate(r));
        pending.shift()?.();
      }
      await Promise.all(requests);

      expect(impl).toHaveBeenCalledTimes(6);
      expect(peak).toBe(MAX_IN_FLIGHT);
    });

    it('does not retry a timeout, because the portal is still working on it', async () => {
      const impl = jest.fn((url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            const abort = new Error('aborted');
            abort.name = 'AbortError';
            reject(abort);
          });
        })
      );
      const error = await fetchJsonApi('/x', { fetchImpl: impl, timeoutMs: 5, attempts: 3 })
        .catch((e) => e);

      expect(error.message).toBe(CATALOGUE_TIMEOUT_MESSAGE);
      expect(impl).toHaveBeenCalledTimes(1);
    });

    it('waits seconds, not milliseconds, before retrying', async () => {
      jest.useFakeTimers();
      const impl = fetchReturning(failure(503), ok({ data: [] }));
      const request = fetchJsonApi('/x', { fetchImpl: impl });

      await jest.advanceTimersByTimeAsync(1000);
      expect(impl).toHaveBeenCalledTimes(1);

      await settled(request);
      expect(impl).toHaveBeenCalledTimes(2);
    });

    it('waits as long as Retry-After asks', async () => {
      jest.useFakeTimers();
      const throttled = {
        ...failure(429),
        headers: { get: (name) => (name === 'retry-after' ? '30' : null) },
      };
      const impl = fetchReturning(throttled, ok({ data: [] }));
      const request = fetchJsonApi('/x', { fetchImpl: impl });

      await jest.advanceTimersByTimeAsync(29000);
      expect(impl).toHaveBeenCalledTimes(1);

      await settled(request);
      expect(impl).toHaveBeenCalledTimes(2);
    });

    it('stops asking for a while after repeated overloads, then asks again', async () => {
      jest.useFakeTimers();
      const down = fetchReturning(failure(503));
      for (let i = 0; i < 4; i += 1) {
        await fetchJsonApi(`/x${i}`, { fetchImpl: down, attempts: 1 }).catch(() => {});
      }
      expect(down).toHaveBeenCalledTimes(4);

      const later = fetchReturning(ok({ data: [] }));
      const error = await fetchJsonApi('/y', { fetchImpl: later }).catch((e) => e);
      expect(error.message).toBe(CATALOGUE_UNAVAILABLE_MESSAGE);
      expect(error.cause.reason).toBe('cooling-off');
      expect(later).not.toHaveBeenCalled();

      jest.advanceTimersByTime(60000);
      await expect(fetchJsonApi('/y', { fetchImpl: later })).resolves.toEqual({ data: [] });
    });

    it('does not count a deliberately short deadline as overload', async () => {
      // Search cuts each suggested word's count off at two seconds. Slow words
      // are routine there, and must not pause every other request in the app.
      const hangs = jest.fn((url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            const abort = new Error('aborted');
            abort.name = 'AbortError';
            reject(abort);
          });
        })
      );
      for (let i = 0; i < 4; i += 1) {
        await fetchJsonApi('/count', { fetchImpl: hangs, timeoutMs: 5, attempts: 1 }).catch(() => {});
      }

      const impl = fetchReturning(ok({ data: [] }));
      await expect(fetchJsonApi('/y', { fetchImpl: impl })).resolves.toEqual({ data: [] });
    });

    it('does not count a 400 or a dropped network as overload', async () => {
      const bad = fetchReturning(failure(400));
      const offline = fetchReturning(new TypeError('Failed to fetch'));
      for (let i = 0; i < 4; i += 1) {
        await fetchJsonApi('/x', { fetchImpl: bad, attempts: 1 }).catch(() => {});
        await fetchJsonApi('/x', { fetchImpl: offline, attempts: 1 }).catch(() => {});
      }

      const impl = fetchReturning(ok({ data: [] }));
      await expect(fetchJsonApi('/y', { fetchImpl: impl })).resolves.toEqual({ data: [] });
    });
  });
});
