/**
 * The HTTP client, exercised for real against a stubbed fetch.
 *
 * api.js is the app's only network layer and had no test at all: every suite
 * replaced the whole module with a hand-written fake, so the recent move of the
 * client into src/services/ and the consolidation of four call shapes into one
 * request helper were both made with nothing able to detect a behavioural
 * change. It lives in the rendered project because it imports react-native and
 * expo-constants at module scope.
 */
jest.unmock('../../src/services/api');

const ORIGINAL_FETCH = global.fetch;

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function textResponse(body, { ok = false, status = 500 } = {}) {
  return { ok, status, json: async () => JSON.parse(body), text: async () => body };
}

let api;

beforeEach(() => {
  jest.resetModules();
  global.fetch = jest.fn();
  api = require('../../src/services/api');
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  jest.useRealTimers();
});

describe('apiOrigin', () => {
  it('has no trailing slash, so paths never double up', () => {
    expect(api.apiOrigin()).not.toMatch(/\/$/);
  });

  it('returns the same value on every call', () => {
    expect(api.apiOrigin()).toBe(api.apiOrigin());
  });

  it('builds an http origin with a port when falling back to the dev host', () => {
    // IS_DEV_API_HOST is true whenever EXPO_PUBLIC_API_URL is unset, which is
    // the configuration the test environment runs in.
    if (api.IS_DEV_API_HOST) {
      expect(api.apiOrigin()).toMatch(/^http:\/\/[^/]+:\d+$/);
    }
  });
});

describe('backendHeaders', () => {
  it('passes through the headers it is given', () => {
    expect(api.backendHeaders({ 'Content-Type': 'application/json' })).toMatchObject({
      'Content-Type': 'application/json',
    });
  });

  it('returns a new object rather than mutating the caller\'s', () => {
    const extra = { 'Content-Type': 'application/json' };
    expect(api.backendHeaders(extra)).not.toBe(extra);
  });

  it('omits Authorization when no client token is configured', () => {
    // The test environment has no EXPO_PUBLIC_API_CLIENT_TOKEN, which is the
    // working configuration against a server that has not turned the gate on.
    expect(api.backendHeaders()).not.toHaveProperty('Authorization');
  });
});

describe('aiSearch', () => {
  it('posts the query, offset and limit as JSON', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ query: 'x', results: [], hasMore: false }));
    await api.aiSearch('drought', { offset: 10, limit: 5 });

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(`${api.apiOrigin()}/api/search`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ query: 'drought', offset: 10, limit: 5 });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('defaults offset and limit when the caller omits them', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ results: [] }));
    await api.aiSearch('drought');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({ offset: 0 });
  });

  it('returns the parsed body', async () => {
    const body = { query: 'drought', results: [{ id: 1 }], hasMore: true, total: 9 };
    global.fetch.mockResolvedValue(jsonResponse(body));
    expect(await api.aiSearch('drought')).toEqual(body);
  });

  it('rejects with readable copy on a non-OK status, not the response body', async () => {
    global.fetch.mockResolvedValue(textResponse('Traceback: NullPointerException at line 42'));
    await expect(api.aiSearch('drought')).rejects.toThrow(/unavailable right now/i);
    await expect(api.aiSearch('drought')).rejects.not.toThrow(/Traceback/);
  });

  it('carries the status and body on cause for the log, not for the user', async () => {
    global.fetch.mockResolvedValue(textResponse('internal detail', { status: 503 }));
    const error = await api.aiSearch('drought').catch((e) => e);
    expect(error.cause).toMatchObject({ status: 503, body: 'internal detail' });
    expect(error.message).not.toContain('internal detail');
  });

  it('translates an abort into a timeout message', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch.mockRejectedValue(abortError);
    await expect(api.aiSearch('drought')).rejects.toThrow(/timed out/i);
  });

  it('passes an abort signal so the request is actually bounded', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ results: [] }));
    await api.aiSearch('drought');
    expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
  });
});

describe('summarizeBullets', () => {
  it('returns exactly three bullets when the backend supplies them', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ bullets: ['a', 'b', 'c'] }));
    expect(await api.summarizeBullets('text', 1)).toEqual(['a', 'b', 'c']);
  });

  it('returns null rather than a partial summary when the count is wrong', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ bullets: ['a', 'b'] }));
    expect(await api.summarizeBullets('text', 1)).toBeNull();
  });

  it('returns null when a bullet is not a string', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ bullets: ['a', 'b', 3] }));
    expect(await api.summarizeBullets('text', 1)).toBeNull();
  });

  it('returns null when the body carries no bullets at all', async () => {
    global.fetch.mockResolvedValue(jsonResponse({}));
    expect(await api.summarizeBullets('text', 1)).toBeNull();
  });

  it('sends description text and the id, and nothing else', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ bullets: ['a', 'b', 'c'] }));
    await api.summarizeBullets('the description', 7);
    // No metadata: never the title, cost, region or owner.
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      text: 'the description',
      innovationId: 7,
    });
  });

  it('rejects on a non-OK status', async () => {
    global.fetch.mockResolvedValue(textResponse('boom'));
    await expect(api.summarizeBullets('text', 1)).rejects.toThrow(/unavailable right now/i);
  });
});

describe('transcribeAudio', () => {
  it('uploads multipart without setting Content-Type, so fetch adds the boundary', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ text: 'hello' }));
    await api.transcribeAudio('file:///tmp/recording.m4a');

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(`${api.apiOrigin()}/api/transcribe`);
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('returns the transcript', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ text: 'hello there' }));
    expect(await api.transcribeAudio('file:///tmp/r.m4a')).toEqual({ text: 'hello there' });
  });

  it('promotes the server\'s own 503 message, which the user needs', async () => {
    global.fetch.mockResolvedValue(
      textResponse(JSON.stringify({ error: 'Set OPENAI_API_KEY on the server.' }), { status: 503 })
    );
    await expect(api.transcribeAudio('file:///tmp/r.m4a')).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it('falls back to written copy when a 503 body is not JSON', async () => {
    global.fetch.mockResolvedValue(textResponse('<html>502 Bad Gateway</html>', { status: 503 }));
    await expect(api.transcribeAudio('file:///tmp/r.m4a')).rejects.toThrow(
      /Transcription not available/
    );
  });

  it('is bounded, so a hung upload cannot leave the mic transcribing forever', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch.mockRejectedValue(abortError);
    await expect(api.transcribeAudio('file:///tmp/r.m4a')).rejects.toThrow(/timed out/i);
  });

  it('passes an abort signal', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ text: '' }));
    await api.transcribeAudio('file:///tmp/r.m4a');
    expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
  });
});

describe('compareSummary', () => {
  it('sends both titles and both descriptions under the backend\'s wire keys', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ summary: 'They differ.' }));
    await api.compareSummary({ title: 'A' }, { title: 'B' }, 'first', 'second');

    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      name1: 'A',
      name2: 'B',
      description1: 'first',
      description2: 'second',
    });
  });

  it('returns the summary', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ summary: 'They differ.' }));
    expect(await api.compareSummary({}, {}, 'a', 'b')).toEqual({ summary: 'They differ.' });
  });

  it('rejects when the body has no summary string', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ summary: 42 }));
    await expect(api.compareSummary({}, {}, 'a', 'b')).rejects.toThrow(/could not read/i);
  });

  it('promotes a server-supplied error message', async () => {
    global.fetch.mockResolvedValue(
      textResponse(JSON.stringify({ error: 'Summaries are switched off.' }), { status: 503 })
    );
    await expect(api.compareSummary({}, {}, 'a', 'b')).rejects.toThrow(/switched off/);
  });
});

describe('the request harness is shared, not repeated', () => {
  /**
   * The four calls used to each own their own AbortController, status check and
   * AbortError translation, and the copies had drifted — one cleared its timer
   * twice, one had no timer at all. These assert the properties that drift broke,
   * across every endpoint at once.
   */
  const calls = [
    ['aiSearch', () => api.aiSearch('q')],
    ['summarizeBullets', () => api.summarizeBullets('t', 1)],
    ['transcribeAudio', () => api.transcribeAudio('file:///tmp/r.m4a')],
    ['compareSummary', () => api.compareSummary({}, {}, 'a', 'b')],
  ];

  it.each(calls)('%s bounds its request with an abort signal', async (_name, call) => {
    global.fetch.mockResolvedValue(jsonResponse({ bullets: ['a', 'b', 'c'], summary: 's', text: '' }));
    await call();
    expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
  });

  it.each(calls)('%s turns an abort into readable copy', async (_name, call) => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch.mockRejectedValue(abortError);
    await expect(call()).rejects.toThrow(/timed out/i);
  });

  it.each(calls)('%s clears its timer, so a resolved call leaves nothing pending', async (_name, call) => {
    jest.useFakeTimers();
    // The RN environment keeps its own timers running, so the assertion is on
    // the delta rather than on an absolute count.
    const before = jest.getTimerCount();
    global.fetch.mockResolvedValue(jsonResponse({ bullets: ['a', 'b', 'c'], summary: 's', text: '' }));
    await call();
    expect(jest.getTimerCount()).toBe(before);
  });

  it.each(calls)('%s clears its timer after a rejection too', async (_name, call) => {
    jest.useFakeTimers();
    const before = jest.getTimerCount();
    global.fetch.mockRejectedValue(new Error('network down'));
    await call().catch(() => {});
    expect(jest.getTimerCount()).toBe(before);
  });
});
