// Pin the key to empty BEFORE requiring the server: dotenv skips keys already
// present in process.env, so this stops backend/.env from enabling OpenAI and
// making these tests non-deterministic (and billable). With no key the server
// falls back to pure FTS, which is exactly the path we want to exercise.
process.env.OPENAI_API_KEY = '';

const request = require('supertest');
const { app, db } = require('../server');

afterAll(() => {
  db.close();
});

describe('GET /health', () => {
  it('reports healthy with a positive innovation count', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(typeof res.body.innovations).toBe('number');
    expect(res.body.innovations).toBeGreaterThan(0);
  });
});

describe('POST /api/search — request validation', () => {
  it('rejects a missing body', async () => {
    const res = await request(app).post('/api/search').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/query is required/i);
  });

  it('rejects an empty query', async () => {
    const res = await request(app).post('/api/search').send({ query: '' });
    expect(res.status).toBe(400);
  });

  it('rejects a whitespace-only query', async () => {
    const res = await request(app).post('/api/search').send({ query: '   \n\t ' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-string query', async () => {
    const res = await request(app).post('/api/search').send({ query: 12345 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/search — results', () => {
  it('returns a well-formed payload for a real query', async () => {
    const res = await request(app).post('/api/search').send({ query: 'irrigation' });
    expect(res.status).toBe(200);
    expect(res.body.query).toBe('irrigation');
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(typeof res.body.hasMore).toBe('boolean');
  });

  it('echoes the trimmed query back', async () => {
    const res = await request(app).post('/api/search').send({ query: '  irrigation  ' });
    expect(res.status).toBe(200);
    expect(res.body.query).toBe('irrigation');
  });

  it('gives every result a numeric matchScore', async () => {
    const res = await request(app).post('/api/search').send({ query: 'irrigation' });
    for (const r of res.body.results) {
      expect(typeof r.matchScore).toBe('number');
    }
  });

  it('returns results sorted by matchScore descending', async () => {
    const res = await request(app).post('/api/search').send({ query: 'water' });
    const scores = res.body.results.map((r) => r.matchScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('honours the limit parameter', async () => {
    const res = await request(app).post('/api/search').send({ query: 'water', limit: 2 });
    expect(res.body.results.length).toBeLessThanOrEqual(2);
  });

  it('returns a different page for a non-zero offset', async () => {
    const first = await request(app).post('/api/search').send({ query: 'water', limit: 2, offset: 0 });
    const second = await request(app).post('/api/search').send({ query: 'water', limit: 2, offset: 2 });
    if (first.body.results.length && second.body.results.length) {
      expect(first.body.results[0].id).not.toBe(second.body.results[0].id);
    }
  });

  it('sets hasMore false on the last page', async () => {
    const res = await request(app).post('/api/search').send({ query: 'water', limit: 1000 });
    expect(res.body.hasMore).toBe(false);
  });

  it('returns an empty result set for a query that matches nothing', async () => {
    const res = await request(app)
      .post('/api/search')
      .send({ query: 'zzzzqqqx nonexistentterm wibblewobble' });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.hasMore).toBe(false);
  });

  it('is stable across repeated identical queries (cache path)', async () => {
    const a = await request(app).post('/api/search').send({ query: 'soil health' });
    const b = await request(app).post('/api/search').send({ query: 'soil health' });
    expect(b.body.results.map((r) => r.id)).toEqual(a.body.results.map((r) => r.id));
  });

  it('does not crash on FTS special characters', async () => {
    for (const query of ['"unbalanced', 'a AND OR b', 'crop* (yield']) {
      const res = await request(app).post('/api/search').send({ query });
      expect(res.status).toBe(200);
    }
  });
});

describe('POST /api/summarize-bullets', () => {
  it('returns null bullets when text is missing', async () => {
    const res = await request(app).post('/api/summarize-bullets').send({});
    expect(res.status).toBe(200);
    expect(res.body.bullets).toBeNull();
  });

  it('returns null bullets for whitespace-only text', async () => {
    const res = await request(app).post('/api/summarize-bullets').send({ text: '   ' });
    expect(res.body.bullets).toBeNull();
  });

  it('returns null bullets when no OpenAI key is configured', async () => {
    const res = await request(app)
      .post('/api/summarize-bullets')
      .send({ text: 'A solar powered irrigation pump for smallholder farms.', innovationId: 1 });
    expect(res.status).toBe(200);
    expect(res.body.bullets).toBeNull();
  });
});

describe('POST /api/compare-summary', () => {
  const DESCS = {
    description1: 'A solar powered drip irrigation kit for smallholder plots.',
    description2: 'A manual treadle pump used for shallow well irrigation.',
  };

  it('short-circuits when both descriptions are missing', async () => {
    const res = await request(app).post('/api/compare-summary').send({});
    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('No descriptions available to compare.');
  });

  it('short-circuits when both descriptions are whitespace only', async () => {
    const res = await request(app)
      .post('/api/compare-summary')
      .send({ description1: '   ', description2: '\n\t' });
    expect(res.body.summary).toBe('No descriptions available to compare.');
  });

  it('short-circuits when descriptions are not strings', async () => {
    const res = await request(app)
      .post('/api/compare-summary')
      .send({ description1: 42, description2: { nope: true } });
    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('No descriptions available to compare.');
  });

  it('returns 503 when descriptions are present but no server key is configured', async () => {
    const res = await request(app).post('/api/compare-summary').send(DESCS);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not available/i);
  });

  it('reaches the key check when only one description is supplied', async () => {
    const res = await request(app)
      .post('/api/compare-summary')
      .send({ description1: DESCS.description1 });
    expect(res.status).toBe(503);
  });

  it('never responds with the raw server API key', async () => {
    const res = await request(app).post('/api/compare-summary').send(DESCS);
    expect(JSON.stringify(res.body)).not.toMatch(/sk-/);
  });
});

describe('POST /api/transcribe', () => {
  it('rejects a request with no audio file', async () => {
    const res = await request(app).post('/api/transcribe');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no audio file/i);
  });

  it('returns 503 when a file is supplied but transcription is unconfigured', async () => {
    const res = await request(app)
      .post('/api/transcribe')
      .attach('file', Buffer.from('not really audio'), 'clip.m4a');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not available/i);
  });
});
