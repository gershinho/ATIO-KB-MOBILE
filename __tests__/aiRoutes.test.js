/**
 * The AI routes shared by the Express backend and the Supabase Edge Functions
 * (supabase/functions/_shared/ai/). backend/__tests__/aiPaths.test.js drives
 * them through Express; these pin what both hosts depend on directly: the
 * request Gemini receives, what ranking may and may not show the model, and
 * each route's degradations.
 */
import { createAi, audioTypeFor, DEFAULT_GEMINI_MODEL } from '../supabase/functions/_shared/ai/gemini';
import {
  searchTermsRoute,
  rankRoute,
  summarizeBulletsRoute,
  compareSummaryRoute,
  RANK_MAX_CANDIDATES,
  RANK_MAX_TEXT_CHARS,
} from '../supabase/functions/_shared/ai/routes';

const geminiReply = (text, finishReason = 'STOP') => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason }] }),
});

/** A stand-in `ai` for the route tests: answers in turn, records what it was asked. */
function fakeAi(...answers) {
  const generate = jest.fn(async () => {
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next instanceof Error) throw next;
    return typeof next === 'string' ? { text: next, finishReason: 'stop' } : next;
  });
  return { available: true, generate };
}
const noKey = { available: false, generate: jest.fn() };

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('createAi (Gemini over REST)', () => {
  it('asks the configured model with thinking off, and reads the answer', async () => {
    const fetchImpl = jest.fn(async () => geminiReply('hello'));
    const ai = createAi({ apiKey: ' key ', fetchImpl });
    const result = await ai.generate({ system: 'sys', user: 'hi', temperature: 0.2, maxTokens: 80 });

    expect(result).toEqual({ text: 'hello', finishReason: 'stop' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    expect(init.headers['x-goog-api-key']).toBe('key');
    expect(JSON.parse(init.body)).toEqual({
      systemInstruction: { parts: [{ text: 'sys' }] },
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 80, thinkingConfig: { thinkingBudget: 0 } },
    });
  });

  it('reports a cut-off answer the way the routes expect', async () => {
    const ai = createAi({ apiKey: 'k', fetchImpl: async () => geminiReply('partial', 'MAX_TOKENS') });
    await expect(ai.generate({ user: 'x' })).resolves.toEqual({ text: 'partial', finishReason: 'length' });
  });

  it('reports a blocked answer as no text', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'SAFETY' }] }) });
    await expect(createAi({ apiKey: 'k', fetchImpl }).generate({ user: 'x' })).resolves.toEqual({ text: null, finishReason: 'safety' });
  });

  it('throws on an HTTP error, with Gemini’s reason on the message', async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'Resource exhausted' } }) });
    await expect(createAi({ apiKey: 'k', fetchImpl }).generate({ user: 'x' })).rejects.toThrow('Gemini 429: Resource exhausted');
  });

  it('is unavailable with no key, and never calls out', async () => {
    const fetchImpl = jest.fn();
    const ai = createAi({ apiKey: '  ', fetchImpl });
    expect(ai.available).toBe(false);
    await expect(ai.generate({ user: 'x' })).rejects.toThrow('GEMINI_API_KEY');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('honours GEMINI_MODEL', async () => {
    const fetchImpl = jest.fn(async () => geminiReply('x'));
    await createAi({ apiKey: 'k', model: 'gemini-2.5-flash', fetchImpl }).generate({ user: 'x' });
    expect(fetchImpl.mock.calls[0][0]).toContain('/models/gemini-2.5-flash:generateContent');
  });

  it('transcribes inline audio and trims the transcript', async () => {
    const fetchImpl = jest.fn(async () => geminiReply('  how do I dry maize \n'));
    const text = await createAi({ apiKey: 'k', fetchImpl }).transcribe({ data: 'AAAA', mimeType: audioTypeFor('.m4a') });
    expect(text).toBe('how do I dry maize');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).contents[0].parts[0]).toEqual({
      inlineData: { mimeType: 'audio/mp4', data: 'AAAA' },
    });
  });
});

describe('search-terms', () => {
  it('rejects a missing query', async () => {
    await expect(searchTermsRoute(noKey, {})).resolves.toMatchObject({ status: 400 });
  });

  it('extracts terms locally with no key', async () => {
    const { status, body } = await searchTermsRoute(noKey, { query: '  How can small farmers store grain? ' });
    expect(status).toBe(200);
    expect(body).toEqual({
      query: 'How can small farmers store grain?',
      englishQuery: 'How can small farmers store grain?',
      terms: ['small', 'farmers', 'store', 'grain'],
      expandedTerms: [],
    });
  });

  it('expands a short English query with the model', async () => {
    const ai = fakeAi('rabbit, pet care, rabbit health');
    const { body } = await searchTermsRoute(ai, { query: 'bunny' });
    expect(body.terms).toEqual(['bunny']);
    expect(body.expandedTerms).toEqual(['rabbit', 'pet', 'care', 'rabbit', 'health']);
    expect(ai.generate.mock.calls[0][0]).toMatchObject({ temperature: 0, maxTokens: 80 });
  });

  it('asks for related words on a longer query too', async () => {
    const ai = fakeAi('rabbit, crop damage, fencing, repellent');
    const { body } = await searchTermsRoute(ai, { query: 'bunnies eat my crops' });
    expect(body.terms).toEqual(['bunnies', 'eat', 'crops']);
    expect(body.expandedTerms).toEqual(['rabbit', 'crop', 'damage', 'fencing', 'repellent']);
    expect(ai.generate).toHaveBeenCalledTimes(1);
  });

  it('translates a non-English query, taking keywords from the same answer', async () => {
    const ai = fakeAi('How to dry maize\nmaize drying, grain storage, post-harvest');
    const { body } = await searchTermsRoute(ai, { query: 'Как сушить кукурузу' });
    expect(body.englishQuery).toBe('How to dry maize');
    expect(body.terms).toEqual(['dry', 'maize']);
    expect(body.expandedTerms).toEqual(expect.arrayContaining(['grain', 'storage', 'post', 'harvest']));
    expect(ai.generate).toHaveBeenCalledTimes(1);
  });

  it('keeps the query as typed when translation fails', async () => {
    const { status, body } = await searchTermsRoute(fakeAi(new Error('down')), { query: 'Как сушить кукурузу' });
    expect(status).toBe(200);
    expect(body.englishQuery).toBe('Как сушить кукурузу');
  });
});

describe('rank', () => {
  const candidates = [
    { id: 'u1', title: 'Secret Title', owner_text: 'Acme Ltd', short_description: 'A solar dryer', long_description: 'Dries maize cheaply.' },
    { id: 'u2', short_description: 'A drip kit' },
  ];

  it('validates the query and the candidates', async () => {
    await expect(rankRoute(noKey, { candidates })).resolves.toMatchObject({ status: 400 });
    await expect(rankRoute(noKey, { query: 'q', candidates: [] })).resolves.toMatchObject({ status: 400 });
    await expect(rankRoute(noKey, { query: 'q', candidates: 'x' })).resolves.toMatchObject({ status: 400 });
  });

  it('returns the caller’s order with no key', async () => {
    await expect(rankRoute(noKey, { query: 'q', candidates })).resolves.toEqual({
      status: 200,
      body: { ranked: [{ id: 'u1', score: 60 }, { id: 'u2', score: 59 }], ranker: 'caller' },
    });
  });

  it('shows the model anonymised description text only, and maps scores back to ids', async () => {
    const ai = fakeAi('[{"id":"Doc 2","score":88},{"id":"Doc 1","score":40}]');
    const { body } = await rankRoute(ai, { query: 'dry maize', candidates });

    expect(body).toEqual({ ranked: [{ id: 'u2', score: 88 }, { id: 'u1', score: 40 }], ranker: 'model' });
    const prompt = ai.generate.mock.calls[0][0].user;
    expect(prompt).toContain('[Doc 1]\nA solar dryer\n\nDries maize cheaply.');
    for (const hidden of ['Secret Title', 'Acme Ltd', 'u1', 'u2']) expect(prompt).not.toContain(hidden);
  });

  it('caps how many candidates, and how much of each, reach the model', async () => {
    const many = Array.from({ length: RANK_MAX_CANDIDATES + 20 }, (_, i) => ({ id: `id${i}`, short_description: 'x'.repeat(RANK_MAX_TEXT_CHARS + 500) }));
    const ai = fakeAi('[]');
    const { body } = await rankRoute(ai, { query: 'q', candidates: many });
    expect(body.ranked).toHaveLength(RANK_MAX_CANDIDATES);
    expect(body.ranker).toBe('caller');
  });

  it('falls back to positional scores when the model answer cannot be read', async () => {
    const { body } = await rankRoute(fakeAi('no json here'), { query: 'q', candidates });
    expect(body).toEqual({ ranked: [{ id: 'u1', score: 50 }, { id: 'u2', score: 50 }], ranker: 'model' });
  });

  it('uses the host’s cache, keyed on query and candidates', async () => {
    const store = new Map();
    const cache = {
      get: jest.fn((q, ids) => store.get(`${q}|${ids}`)),
      set: jest.fn((q, ids, r) => store.set(`${q}|${ids}`, r)),
    };
    const ai = fakeAi('[{"id":"Doc 1","score":90}]');
    await rankRoute(ai, { query: 'q', candidates }, { cache });
    await rankRoute(ai, { query: 'q', candidates }, { cache });
    expect(ai.generate).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith('q', ['u1', 'u2'], [{ id: 'u1', score: 90 }]);
  });
});

describe('summarize-bullets', () => {
  it('returns exactly three bullets, or null', async () => {
    await expect(summarizeBulletsRoute(fakeAi('["a","b","c"]'), { text: 't' })).resolves.toEqual({ status: 200, body: { bullets: ['a', 'b', 'c'] } });
    await expect(summarizeBulletsRoute(fakeAi('["a","b"]'), { text: 't' })).resolves.toEqual({ status: 200, body: { bullets: null } });
    await expect(summarizeBulletsRoute(fakeAi(new Error('429')), { text: 't' })).resolves.toEqual({ status: 200, body: { bullets: null } });
    await expect(summarizeBulletsRoute(noKey, { text: 't' })).resolves.toEqual({ status: 200, body: { bullets: null } });
    expect(noKey.generate).not.toHaveBeenCalled();
  });
});

describe('compare-summary', () => {
  it('names both innovations, caps each description at 1,500 characters, and trims a cut-off tail', async () => {
    const ai = fakeAi({ text: 'Use Case\n• Both dry.\nApproach\n• The dry', finishReason: 'length' });
    const { status, body } = await compareSummaryRoute(ai, {
      name1: 'Solar Dryer',
      name2: '',
      description1: 'x'.repeat(2000),
      description2: 'second',
    });
    expect(status).toBe(200);
    expect(body.summary).toBe('Use Case\n• Both dry.\nApproach');
    const { user, maxTokens } = ai.generate.mock.calls[0][0];
    expect(maxTokens).toBe(220);
    expect(user).toContain('"Solar Dryer"');
    expect(user).toContain('"Second solution"');
    expect(user).toContain(`${'x'.repeat(1500)}…`);
    expect(user).not.toContain('x'.repeat(1501));
  });

  it('short-circuits blank descriptions, and reports the failure modes as before', async () => {
    await expect(compareSummaryRoute(noKey, { description1: ' ', description2: '' })).resolves.toEqual({ status: 200, body: { summary: 'No descriptions available to compare.' } });
    await expect(compareSummaryRoute(noKey, { description1: 'a' })).resolves.toMatchObject({ status: 503 });
    await expect(compareSummaryRoute(fakeAi({ text: null, finishReason: 'safety' }), { description1: 'a' })).resolves.toEqual({ status: 502, body: { error: 'Invalid response from API' } });
    await expect(compareSummaryRoute(fakeAi(new Error('down')), { description1: 'a' })).resolves.toEqual({ status: 500, body: { error: 'Summary request failed' } });
  });
});
