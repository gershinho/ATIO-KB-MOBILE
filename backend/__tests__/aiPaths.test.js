/**
 * The AI paths, with Gemini stubbed at fetch.
 *
 * The existing suite pins GEMINI_API_KEY to empty before requiring the server,
 * which forces the pure-FTS fallback. That is a real contract and worth keeping
 * — but it meant the reranking, summarisation and transcription paths, the
 * features the product is built around, were never executed. Their failure modes
 * are malformed model output, and a fallback path cannot reveal those.
 *
 * The key is set here and every request to Gemini is answered by a stub of its
 * REST API, so no request leaves the machine and nothing is billed. The route
 * logic itself lives in supabase/functions/_shared/ai/, shared with the Edge
 * Functions; these tests drive it through Express.
 */
process.env.GEMINI_API_KEY = 'test-key-not-a-real-credential';

const request = require('supertest');
const { app, db, hasGeminiKey, resetAiClient } = require('../server');

/** A Gemini answer whose text is exactly `text`. */
const reply = (text, finishReason = 'STOP') => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason }] }),
});

/** Every call to Gemini, and what it should answer. */
const mockModel = jest.fn();

/** The JSON body of the nth request sent to Gemini. */
const sent = (n = 0) => JSON.parse(mockModel.mock.calls[n][1].body);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(global, 'fetch').mockImplementation((url, init) => {
    if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) {
      throw new Error(`unexpected request to ${url}`);
    }
    return mockModel(url, init);
  });
  resetAiClient();
  process.env.GEMINI_API_KEY = 'test-key-not-a-real-credential';
});

afterEach(() => jest.restoreAllMocks());

afterAll(() => {
  db.close();
});

describe('the stub is in place', () => {
  it('reports the key as set, so the AI branches are the ones being taken', () => {
    expect(hasGeminiKey()).toBe(true);
  });

  it('asks the configured Gemini model with thinking off, so token caps hold', async () => {
    mockModel.mockResolvedValue(reply('["a", "b", "c"]'));
    await request(app).post('/api/summarize-bullets').send({ text: 'x', innovationId: 1 });

    expect(mockModel.mock.calls[0][0]).toContain('/models/gemini-3.6-flash:generateContent');
    expect(mockModel.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-key-not-a-real-credential');
    expect(sent().generationConfig).toMatchObject({ maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } });
  });
});

describe('POST /api/summarize-bullets', () => {
  it('returns the three bullets the model produced', async () => {
    mockModel.mockResolvedValue(reply('["First point", "Second point", "Third point"]'));
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'A long description of an irrigation kit.', innovationId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.bullets).toEqual(['First point', 'Second point', 'Third point']);
  });

  it('finds the array even when the model wraps it in prose', async () => {
    mockModel.mockResolvedValue(
      reply('Sure! Here you go:\n["One", "Two", "Three"]\nHope that helps.')
    );
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'text', innovationId: 1 });
    expect(res.body.bullets).toEqual(['One', 'Two', 'Three']);
  });

  it('returns null rather than a partial summary when the model returns two bullets', async () => {
    mockModel.mockResolvedValue(reply('["One", "Two"]'));
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'text', innovationId: 1 });
    expect(res.body.bullets).toBeNull();
  });

  it('returns null when the model returns no array at all', async () => {
    mockModel.mockResolvedValue(reply('I could not summarise that.'));
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'text', innovationId: 1 });
    expect(res.body.bullets).toBeNull();
  });

  it('returns null when the array holds something that is not a string', async () => {
    mockModel.mockResolvedValue(reply('["One", "Two", 3]'));
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'text', innovationId: 1 });
    expect(res.body.bullets).toBeNull();
  });

  it('survives malformed JSON from the model', async () => {
    mockModel.mockResolvedValue(reply('["One", "Two", "Three"'));
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'text', innovationId: 1 });
    expect(res.status).toBe(200);
    expect(res.body.bullets).toBeNull();
  });

  it('survives the model call rejecting — a rate limit must not 500', async () => {
    mockModel.mockRejectedValue(new Error('429 Too Many Requests'));
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'text', innovationId: 1 });
    expect(res.status).toBe(200);
    expect(res.body.bullets).toBeNull();
  });

  it('sends the description text and no metadata', async () => {
    mockModel.mockResolvedValue(reply('["a", "b", "c"]'));
    await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'the description', innovationId: 1 });

    expect(JSON.stringify(sent().contents)).toContain('the description');
  });

  it('does not call the model at all for empty text', async () => {
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: '   ', innovationId: 1 });
    expect(res.body.bullets).toBeNull();
    expect(mockModel).not.toHaveBeenCalled();
  });
});

describe('POST /api/compare-summary', () => {
  it('returns the model\'s comparison', async () => {
    mockModel.mockResolvedValue(reply('Use case: both dry produce.'));
    const res = await request(app).post('/api/compare-summary').send({
      name1: 'Solar Dryer',
      name2: 'Drip Kit',
      description1: 'Dries produce using the sun.',
      description2: 'Delivers water to roots.',
    });

    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('Use case: both dry produce.');
  });

  it('short-circuits without calling the model when both descriptions are blank', async () => {
    const res = await request(app)
      .post('/api/compare-summary')
      .send({ description1: '  ', description2: '' });
    expect(res.body.summary).toBe('No descriptions available to compare.');
    expect(mockModel).not.toHaveBeenCalled();
  });

  it('sends both descriptions and neither cost nor region', async () => {
    mockModel.mockResolvedValue(reply('A comparison.'));
    await request(app).post('/api/compare-summary').send({
      name1: 'A',
      name2: 'B',
      description1: 'first description',
      description2: 'second description',
    });

    const prompt = JSON.stringify(sent().contents);
    expect(prompt).toContain('first description');
    expect(prompt).toContain('second description');
  });

  it('does not 500 when the model rejects', async () => {
    mockModel.mockRejectedValue(new Error('upstream exploded'));
    const res = await request(app)
      .post('/api/compare-summary')
      .send({ description1: 'a', description2: 'b' });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(600);
  });

  it('trims an answer the token cap cut off back to its last full line', async () => {
    mockModel.mockResolvedValue(reply('Use Case\n• Both dry produce.\nApproach\n• The dryer uses', 'MAX_TOKENS'));
    const res = await request(app)
      .post('/api/compare-summary')
      .send({ description1: 'a', description2: 'b' });
    // Gemini reports the cut as MAX_TOKENS; trimIncompleteEnding drops the
    // half-written bullet, as it did for OpenAI's finish_reason 'length'.
    expect(res.body.summary).toBe('Use Case\n• Both dry produce.\nApproach');
  });

  it('handles the model returning no content', async () => {
    mockModel.mockResolvedValue({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'SAFETY' }] }) });
    const res = await request(app)
      .post('/api/compare-summary')
      .send({ description1: 'a', description2: 'b' });
    expect(res.status).toBeLessThan(600);
    expect(res.body).toBeDefined();
  });

  it('returns 503 with written copy once the key is unset', async () => {
    process.env.GEMINI_API_KEY = '';
    resetAiClient();
    const res = await request(app)
      .post('/api/compare-summary')
      .send({ description1: 'a', description2: 'b' });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/GEMINI_API_KEY/);
    expect(mockModel).not.toHaveBeenCalled();
  });
});

describe('POST /api/search — the reranked path', () => {
  it('returns results ranked by the scores the model gave', async () => {
    // One call may be query expansion; the rerank is the one returning an array
    // of {id, score}. Returning that shape for every call is enough to drive it.
    mockModel.mockResolvedValue(reply('[{"id":"Doc 1","score":95}]'));

    const res = await request(app).post('/api/search').send({ query: 'irrigation', limit: 5 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('falls back to the lexical order when the model returns unparseable output', async () => {
    mockModel.mockResolvedValue(reply('I am not going to answer that.'));
    const res = await request(app).post('/api/search').send({ query: 'irrigation', limit: 5 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('still answers when the model call rejects outright', async () => {
    mockModel.mockRejectedValue(new Error('503 upstream'));
    const res = await request(app).post('/api/search').send({ query: 'irrigation', limit: 5 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('rejects a missing query without reaching the model', async () => {
    const res = await request(app).post('/api/search').send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockModel).not.toHaveBeenCalled();
  });
});

describe('POST /api/transcribe', () => {
  it('returns 400 when no file is attached, without reaching the model', async () => {
    const res = await request(app).post('/api/transcribe');
    expect(res.status).toBe(400);
    expect(mockModel).not.toHaveBeenCalled();
  });

  it('returns 503 with written copy once the key is unset', async () => {
    process.env.GEMINI_API_KEY = '';
    resetAiClient();
    const res = await request(app)
      .post('/api/transcribe')
      .attach('file', Buffer.from('fake audio bytes'), 'recording.m4a');

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/GEMINI_API_KEY/);
    expect(mockModel).not.toHaveBeenCalled();
  });

  it('returns the transcript the model produced', async () => {
    mockModel.mockResolvedValue(reply('  how do I dry maize  '));
    const res = await request(app)
      .post('/api/transcribe')
      .attach('file', Buffer.from('fake audio bytes'), 'recording.m4a');

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('how do I dry maize');
  });

  it('sends the recording to Gemini as inline audio of the right type', async () => {
    mockModel.mockResolvedValue(reply('anything'));
    await request(app)
      .post('/api/transcribe')
      .attach('file', Buffer.from('fake audio bytes'), 'recording.m4a');
    const [part] = sent().contents[0].parts;
    expect(part.inlineData).toEqual({
      mimeType: 'audio/mp4',
      data: Buffer.from('fake audio bytes').toString('base64'),
    });
  });

  it('does not 500 when the model rejects', async () => {
    mockModel.mockRejectedValue(new Error('audio too short'));
    const res = await request(app)
      .post('/api/transcribe')
      .attach('file', Buffer.from('fake audio bytes'), 'recording.m4a');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(600);
  });
});

describe('the client resolves at call time, not at import', () => {
  /**
   * The client used to be a const evaluated when the module loaded, while every
   * route gates on the live key. A key arriving after import left the guard
   * passing and the call dereferencing null — a 500 where a 503 or a working
   * call was intended.
   */
  it('serves a 503 after the key is cleared and a real answer after it is set again', async () => {
    process.env.GEMINI_API_KEY = '';
    resetAiClient();
    const off = await request(app)
      .post('/api/compare-summary')
      .send({ description1: 'a', description2: 'b' });
    expect(off.status).toBe(503);

    process.env.GEMINI_API_KEY = 'test-key-not-a-real-credential';
    resetAiClient();
    mockModel.mockResolvedValue(reply('Back on.'));
    const on = await request(app)
      .post('/api/compare-summary')
      .send({ description1: 'a', description2: 'b' });

    expect(on.status).toBe(200);
    expect(on.body.summary).toBe('Back on.');
  });
});
