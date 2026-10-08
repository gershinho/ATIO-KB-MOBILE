// The two routes that let the web build search FAO's catalogue instead of this
// server's copy of it. Pinned with no Gemini key, like api.test.js, so these
// exercise the degraded paths deterministically and without billing anyone.
process.env.GEMINI_API_KEY = '';

const request = require('supertest');
const { app, db } = require('../server');

afterAll(() => {
  db.close();
});

describe('POST /api/search-terms', () => {
  it('rejects a missing query', async () => {
    const res = await request(app).post('/api/search-terms').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/query is required/i);
  });

  it('rejects a query of whitespace', async () => {
    const res = await request(app).post('/api/search-terms').send({ query: '   ' });
    expect(res.status).toBe(400);
  });

  it('extracts the meaningful words and drops the rest', async () => {
    const res = await request(app)
      .post('/api/search-terms')
      .send({ query: 'How do I store water for the dry season?' });

    expect(res.status).toBe(200);
    expect(res.body.terms).toContain('store');
    expect(res.body.terms).toContain('water');
    expect(res.body.terms).toContain('season');
    // Stopwords and words of two characters or fewer carry no signal in a
    // substring search over six thousand descriptions.
    expect(res.body.terms).not.toContain('the');
    expect(res.body.terms).not.toContain('do');
  });

  it('passes the query through untranslated with no API key', async () => {
    const res = await request(app).post('/api/search-terms').send({ query: 'stockage eau' });

    expect(res.status).toBe(200);
    expect(res.body.englishQuery).toBe('stockage eau');
    expect(res.body.expandedTerms).toEqual([]);
  });

  it('returns the query as the caller typed it', async () => {
    const res = await request(app).post('/api/search-terms').send({ query: '  Solar pumps  ' });
    expect(res.body.query).toBe('Solar pumps');
  });
});

describe('POST /api/rank', () => {
  const candidates = [
    { id: 'uuid-a', short_description: 'A solar powered irrigation pump for smallholders' },
    { id: 'uuid-b', short_description: 'A guide to making jam' },
  ];

  it('rejects a missing query', async () => {
    const res = await request(app).post('/api/rank').send({ candidates });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/query is required/i);
  });

  it('rejects an empty candidate list', async () => {
    const res = await request(app).post('/api/rank').send({ query: 'solar pump', candidates: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/candidates are required/i);
  });

  it('rejects candidates that are not a list', async () => {
    const res = await request(app)
      .post('/api/rank')
      .send({ query: 'solar pump', candidates: 'uuid-a' });
    expect(res.status).toBe(400);
  });

  it('returns the caller’s order with no API key, rather than failing', async () => {
    const res = await request(app).post('/api/rank').send({ query: 'solar pump', candidates });

    expect(res.status).toBe(200);
    expect(res.body.ranker).toBe('caller');
    expect(res.body.ranked.map((r) => r.id)).toEqual(['uuid-a', 'uuid-b']);
    expect(res.body.ranked[0].score).toBeGreaterThan(res.body.ranked[1].score);
  });

  it('keeps uuids intact, never reinterpreting them as the local integer ids', async () => {
    const res = await request(app)
      .post('/api/rank')
      .send({ query: 'solar', candidates: [{ id: '0ee8fd42-1234-4000-8000-abcdef123456', short_description: 'x' }] });

    expect(res.body.ranked[0].id).toBe('0ee8fd42-1234-4000-8000-abcdef123456');
  });

  it('caps how many candidates one request can submit', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      id: `uuid-${i}`,
      short_description: 'something about water',
    }));
    const res = await request(app).post('/api/rank').send({ query: 'water', candidates: many });

    expect(res.status).toBe(200);
    expect(res.body.ranked.length).toBeLessThanOrEqual(80);
  });

  it('tolerates a candidate with no description at all', async () => {
    const res = await request(app)
      .post('/api/rank')
      .send({ query: 'solar', candidates: [{ id: 'uuid-a' }] });

    expect(res.status).toBe(200);
    expect(res.body.ranked.map((r) => r.id)).toEqual(['uuid-a']);
  });

  it('touches no database, so it answers for ids this server has never seen', async () => {
    const res = await request(app)
      .post('/api/rank')
      .send({ query: 'solar', candidates: [{ id: 'not-in-any-catalogue', short_description: 'solar' }] });

    expect(res.status).toBe(200);
    expect(res.body.ranked[0].id).toBe('not-in-any-catalogue');
  });
});
