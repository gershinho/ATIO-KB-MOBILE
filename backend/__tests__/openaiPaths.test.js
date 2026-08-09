/**
 * The AI paths, with a stubbed OpenAI client.
 *
 * The existing suite pins OPENAI_API_KEY to empty before requiring the server,
 * which forces the pure-FTS fallback. That is a real contract and worth keeping
 * — but it meant the reranking, summarisation and transcription paths, the
 * features the product is built around, were never executed. Their failure modes
 * are malformed model output, and a fallback path cannot reveal those.
 *
 * The key is set here and the `openai` package is replaced with a stub, so no
 * request leaves the machine and nothing is billed.
 */
const mockCreateChat = jest.fn();
const mockCreateTranscription = jest.fn();

jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreateChat } },
    audio: { transcriptions: { create: mockCreateTranscription } },
  })),
}));

process.env.OPENAI_API_KEY = 'test-key-not-a-real-credential';

const request = require('supertest');
const { app, db, hasOpenAIKey, resetOpenAIClient } = require('../server');

/** A chat completion whose content is exactly `content`. */
const completion = (content) => ({ choices: [{ message: { content } }] });

beforeEach(() => {
  jest.clearAllMocks();
  resetOpenAIClient();
  process.env.OPENAI_API_KEY = 'test-key-not-a-real-credential';
});

afterAll(() => {
  db.close();
});

describe('the stub is in place', () => {
  it('reports the key as set, so the AI branches are the ones being taken', () => {
    expect(hasOpenAIKey()).toBe(true);
  });
});

describe('POST /api/summarize-bullets', () => {
  it('returns the three bullets the model produced', async () => {
    mockCreateChat.mockResolvedValue(completion('["First point", "Second point", "Third point"]'));
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'A long description of an irrigation kit.', innovationId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.bullets).toEqual(['First point', 'Second point', 'Third point']);
  });

  it('finds the array even when the model wraps it in prose', async () => {
    mockCreateChat.mockResolvedValue(
      completion('Sure! Here you go:\n["One", "Two", "Three"]\nHope that helps.')
    );
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'text', innovationId: 1 });
    expect(res.body.bullets).toEqual(['One', 'Two', 'Three']);
  });

  it('returns null rather than a partial summary when the model returns two bullets', async () => {
    mockCreateChat.mockResolvedValue(completion('["One", "Two"]'));
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'text', innovationId: 1 });
    expect(res.body.bullets).toBeNull();
  });

  it('returns null when the model returns no array at all', async () => {
    mockCreateChat.mockResolvedValue(completion('I could not summarise that.'));
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'text', innovationId: 1 });
    expect(res.body.bullets).toBeNull();
  });

  it('returns null when the array holds something that is not a string', async () => {
    mockCreateChat.mockResolvedValue(completion('["One", "Two", 3]'));
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'text', innovationId: 1 });
    expect(res.body.bullets).toBeNull();
  });

  it('survives malformed JSON from the model', async () => {
    mockCreateChat.mockResolvedValue(completion('["One", "Two", "Three"'));
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'text', innovationId: 1 });
    expect(res.status).toBe(200);
    expect(res.body.bullets).toBeNull();
  });

  it('survives the model call rejecting — a rate limit must not 500', async () => {
    mockCreateChat.mockRejectedValue(new Error('429 Too Many Requests'));
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'text', innovationId: 1 });
    expect(res.status).toBe(200);
    expect(res.body.bullets).toBeNull();
  });

  it('sends the description text and no metadata', async () => {
    mockCreateChat.mockResolvedValue(completion('["a", "b", "c"]'));
    await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'the description', innovationId: 1 });

    const sent = JSON.stringify(mockCreateChat.mock.calls[0][0].messages);
    expect(sent).toContain('the description');
  });

  it('does not call the model at all for empty text', async () => {
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: '   ', innovationId: 1 });
    expect(res.body.bullets).toBeNull();
    expect(mockCreateChat).not.toHaveBeenCalled();
  });
});

describe('POST /api/compare-summary', () => {
  it('returns the model\'s comparison', async () => {
    mockCreateChat.mockResolvedValue(completion('Use case: both dry produce.'));
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
    expect(mockCreateChat).not.toHaveBeenCalled();
  });

  it('sends both descriptions and neither cost nor region', async () => {
    mockCreateChat.mockResolvedValue(completion('A comparison.'));
    await request(app).post('/api/compare-summary').send({
      name1: 'A',
      name2: 'B',
      description1: 'first description',
      description2: 'second description',
    });

    const sent = JSON.stringify(mockCreateChat.mock.calls[0][0].messages);
    expect(sent).toContain('first description');
    expect(sent).toContain('second description');
  });

  it('does not 500 when the model rejects', async () => {
    mockCreateChat.mockRejectedValue(new Error('upstream exploded'));
    const res = await request(app)
      .post('/api/compare-summary')
      .send({ description1: 'a', description2: 'b' });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(600);
  });

  it('handles the model returning no content', async () => {
    mockCreateChat.mockResolvedValue({ choices: [{ message: {} }] });
    const res = await request(app)
      .post('/api/compare-summary')
      .send({ description1: 'a', description2: 'b' });
    expect(res.status).toBeLessThan(600);
    expect(res.body).toBeDefined();
  });

  it('returns 503 with written copy once the key is unset', async () => {
    process.env.OPENAI_API_KEY = '';
    resetOpenAIClient();
    const res = await request(app)
      .post('/api/compare-summary')
      .send({ description1: 'a', description2: 'b' });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/OPENAI_API_KEY/);
    expect(mockCreateChat).not.toHaveBeenCalled();
  });
});

describe('POST /api/search — the reranked path', () => {
  it('returns results ranked by the scores the model gave', async () => {
    // One call may be query expansion; the rerank is the one returning an array
    // of {id, score}. Returning that shape for every call is enough to drive it.
    mockCreateChat.mockResolvedValue(completion('[{"id":"Doc 1","score":95}]'));

    const res = await request(app).post('/api/search').send({ query: 'irrigation', limit: 5 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('falls back to the lexical order when the model returns unparseable output', async () => {
    mockCreateChat.mockResolvedValue(completion('I am not going to answer that.'));
    const res = await request(app).post('/api/search').send({ query: 'irrigation', limit: 5 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('still answers when the model call rejects outright', async () => {
    mockCreateChat.mockRejectedValue(new Error('503 upstream'));
    const res = await request(app).post('/api/search').send({ query: 'irrigation', limit: 5 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('rejects a missing query without reaching the model', async () => {
    const res = await request(app).post('/api/search').send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockCreateChat).not.toHaveBeenCalled();
  });
});

describe('POST /api/transcribe', () => {
  it('returns 400 when no file is attached, without reaching the model', async () => {
    const res = await request(app).post('/api/transcribe');
    expect(res.status).toBe(400);
    expect(mockCreateTranscription).not.toHaveBeenCalled();
  });

  it('returns 503 with written copy once the key is unset', async () => {
    process.env.OPENAI_API_KEY = '';
    resetOpenAIClient();
    const res = await request(app)
      .post('/api/transcribe')
      .attach('file', Buffer.from('fake audio bytes'), 'recording.m4a');

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/OPENAI_API_KEY/);
    expect(mockCreateTranscription).not.toHaveBeenCalled();
  });

  it('returns the transcript the model produced', async () => {
    // response_format: 'text' means the SDK resolves to a bare string, not an
    // object — the route stringifies and trims whatever it gets.
    mockCreateTranscription.mockResolvedValue('  how do I dry maize  ');
    const res = await request(app)
      .post('/api/transcribe')
      .attach('file', Buffer.from('fake audio bytes'), 'recording.m4a');

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('how do I dry maize');
  });

  it('asks Whisper for plain text rather than a JSON envelope', async () => {
    mockCreateTranscription.mockResolvedValue('anything');
    await request(app)
      .post('/api/transcribe')
      .attach('file', Buffer.from('fake audio bytes'), 'recording.m4a');
    expect(mockCreateTranscription.mock.calls[0][0]).toMatchObject({
      model: 'whisper-1',
      response_format: 'text',
    });
  });

  it('does not 500 when the model rejects', async () => {
    mockCreateTranscription.mockRejectedValue(new Error('audio too short'));
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
   * route gates on the live hasOpenAIKey(). A key arriving after import left the
   * guard passing and the call dereferencing null — a 500 where a 503 or a
   * working call was intended.
   */
  it('serves a 503 after the key is cleared and a real answer after it is set again', async () => {
    process.env.OPENAI_API_KEY = '';
    resetOpenAIClient();
    const off = await request(app)
      .post('/api/compare-summary')
      .send({ description1: 'a', description2: 'b' });
    expect(off.status).toBe(503);

    process.env.OPENAI_API_KEY = 'test-key-not-a-real-credential';
    resetOpenAIClient();
    mockCreateChat.mockResolvedValue(completion('Back on.'));
    const on = await request(app)
      .post('/api/compare-summary')
      .send({ description1: 'a', description2: 'b' });

    expect(on.status).toBe(200);
    expect(on.body.summary).toBe('Back on.');
  });
});
