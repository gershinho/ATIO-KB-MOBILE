/**
 * The optional client credential on /api.
 *
 * Both modes matter: an unset token must leave every existing build working,
 * and a set token must actually reject callers that do not carry it. The gate
 * is read at module load, so each mode needs its own fresh require.
 */
const request = require('supertest');
const { app, db } = require('../server');

// Requiring the server opens the database and prepares statements. Without this
// close, better-sqlite3 finalizes them after Jest has torn the environment down,
// which trips a Node assertion (RemoveEnvironmentCleanupHook) and aborts the
// process — intermittently, and with no failing test to point at. The other two
// suites that require the server already do this.
afterAll(() => {
  db.close();
});

/**
 * The gate reads the token per request, so each mode is just an env change —
 * no module reloading, and nothing left set for whichever test file runs next.
 */
function loadApp(token) {
  if (token === undefined) delete process.env.API_CLIENT_TOKEN;
  else process.env.API_CLIENT_TOKEN = token;
  return app;
}

const originalToken = process.env.API_CLIENT_TOKEN;
afterEach(() => {
  if (originalToken === undefined) delete process.env.API_CLIENT_TOKEN;
  else process.env.API_CLIENT_TOKEN = originalToken;
});

// An empty body reaches the route's own validation and comes back 400. That is
// the cheap proof the gate let the request through: a real query would run the
// whole two-stage search just to observe a status code.
const PASSED_THE_GATE = 400;

describe('with no API_CLIENT_TOKEN set', () => {
  it('lets an unauthenticated call through, so shipped builds keep working', async () => {
    const app = loadApp(undefined);
    const res = await request(app).post('/api/search').send({});
    expect(res.status).toBe(PASSED_THE_GATE);
  });

  it('ignores an Authorization header it was not asked for', async () => {
    const app = loadApp(undefined);
    const res = await request(app)
      .post('/api/search')
      .set('Authorization', 'Bearer anything-at-all')
      .send({});
    expect(res.status).toBe(PASSED_THE_GATE);
  });
});

describe('with API_CLIENT_TOKEN set', () => {
  const TOKEN = 'test-client-token';

  it('rejects a call carrying no credential', async () => {
    const app = loadApp(TOKEN);
    const res = await request(app).post('/api/search').send({ query: 'maize' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects a wrong token', async () => {
    const app = loadApp(TOKEN);
    const res = await request(app)
      .post('/api/search')
      .set('Authorization', 'Bearer wrong-token-here')
      .send({ query: 'maize' });
    expect(res.status).toBe(401);
  });

  it('rejects a token of a different length', async () => {
    // The constant-time compare has to length-check first; this covers that path.
    const app = loadApp(TOKEN);
    const res = await request(app)
      .post('/api/search')
      .set('Authorization', 'Bearer short')
      .send({ query: 'maize' });
    expect(res.status).toBe(401);
  });

  it('rejects the raw token without the Bearer scheme', async () => {
    const app = loadApp(TOKEN);
    const res = await request(app)
      .post('/api/search')
      .set('Authorization', TOKEN)
      .send({ query: 'maize' });
    expect(res.status).toBe(401);
  });

  it('accepts the right token', async () => {
    const app = loadApp(TOKEN);
    const res = await request(app)
      .post('/api/search')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({});
    expect(res.status).toBe(PASSED_THE_GATE);
  });

  it('guards every /api route, not just search', async () => {
    const app = loadApp(TOKEN);
    for (const route of ['/api/search', '/api/compare-summary', '/api/summarize-bullets']) {
      const res = await request(app).post(route).send({});
      expect(res.status).toBe(401);
    }
  });

  it('leaves /health open, so a probe needs no credential', async () => {
    const app = loadApp(TOKEN);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
