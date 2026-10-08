/**
 * With the Supabase data source, the web app's four AI calls go to the Edge
 * Functions instead of the Express backend — same request, same response,
 * same client token — and the phone's two routes stay where they were. With
 * the portal data source nothing moves. In the rendered project for the same
 * reason as api.test.js: api.js imports react-native at module scope.
 */
jest.unmock('../../src/services/api');

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };
const SUPABASE = 'https://example-ref.supabase.co';

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

function load(env) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, ...env };
  global.fetch = jest.fn(async () => ok({ bullets: ['a', 'b', 'c'], summary: 's', ranked: [], terms: [] }));
  return require('../../src/services/api');
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
  global.fetch = ORIGINAL_FETCH;
});

const SUPABASE_ENV = {
  EXPO_PUBLIC_DATA_SOURCE: 'supabase',
  EXPO_PUBLIC_SUPABASE_URL: `${SUPABASE}/`,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

describe('the four web AI calls', () => {
  const calls = [
    ['searchTerms', (api) => api.searchTerms('dry maize'), 'search-terms', { query: 'dry maize' }],
    ['rankSearchCandidates', (api) => api.rankSearchCandidates('q', [{ id: 'a' }]), 'rank', { query: 'q', candidates: [{ id: 'a' }] }],
    ['summarizeBullets', (api) => api.summarizeBullets('text', 'id-1'), 'summarize-bullets', { text: 'text', innovationId: 'id-1' }],
    ['compareSummary', (api) => api.compareSummary({ title: 'A' }, { title: 'B' }, 'da', 'db'), 'compare-summary', { name1: 'A', name2: 'B', description1: 'da', description2: 'db' }],
  ];

  it.each(calls)('%s goes to its Edge Function with the same body', async (_, call, fn, body) => {
    const api = load(SUPABASE_ENV);
    await call(api);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(`${SUPABASE}/functions/v1/${fn}`);
    expect(JSON.parse(init.body)).toEqual(body);
    expect(init.method).toBe('POST');
  });

  it.each(calls)('%s stays on the Express backend with the portal data source', async (_, call, fn) => {
    const api = load({ EXPO_PUBLIC_DATA_SOURCE: 'jsonapi', EXPO_PUBLIC_SUPABASE_URL: SUPABASE, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' });
    await call(api);
    const [url] = global.fetch.mock.calls[0];
    expect(url).toBe(`${api.apiOrigin()}/api/${fn}`);
  });

  it('stays on Express when Supabase is asked for but not configured', async () => {
    const api = load({ EXPO_PUBLIC_DATA_SOURCE: 'supabase', EXPO_PUBLIC_SUPABASE_URL: '', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' });
    await api.searchTerms('dry maize');
    expect(global.fetch.mock.calls[0][0]).toBe(`${api.apiOrigin()}/api/search-terms`);
  });
});

describe('the phone’s routes', () => {
  it('keeps /api/search on the Express backend even with Supabase selected', async () => {
    const api = load(SUPABASE_ENV);
    await api.aiSearch('dry maize');
    expect(global.fetch.mock.calls[0][0]).toBe(`${api.apiOrigin()}/api/search`);
  });
});
