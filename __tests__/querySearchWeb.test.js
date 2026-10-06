/**
 * The web search pipeline: our backend for words, the portal for candidates,
 * our ranking, our backend for the model's ordering.
 *
 * Most of these are about what happens when one stage fails. Search is four
 * network calls deep and three of the four have something useful to fall back
 * on, so "the backend is down" and "the portal is down" should degrade to
 * different, still-working searches rather than to the same error page.
 */
import { jest } from '@jest/globals';

const mockSearchTerms = jest.fn();
const mockRankSearchCandidates = jest.fn();
const mockFindCandidates = jest.fn();
const mockGetInnovationsByIds = jest.fn();
const mockSearchCachedInnovations = jest.fn();

jest.mock('../src/services/api', () => ({ searchTerms: mockSearchTerms, rankSearchCandidates: mockRankSearchCandidates }));
jest.mock('../src/api/jsonapi/textSearch', () => ({ findCandidates: mockFindCandidates }));
jest.mock('../src/database/db', () => ({ getInnovationsByIds: mockGetInnovationsByIds }));
jest.mock('../src/database/offlineFallback', () => ({ searchCachedInnovations: mockSearchCachedInnovations }));

const { searchByQuery, resetSearchSessions } = require('../src/database/querySearch.web');

const candidate = (id, title, summary = '') => ({ id, title, summary });
const record = (id, title) => ({ id, title, shortDescription: `About ${title}` });

beforeEach(() => {
  jest.clearAllMocks();
  resetSearchSessions();
  mockSearchTerms.mockResolvedValue({ englishQuery: 'solar pump', terms: ['solar', 'pump'], expandedTerms: [] });
  mockFindCandidates.mockResolvedValue({
    candidates: [candidate('a', 'Solar pump'), candidate('b', 'Composting')],
    conjunction: 'AND',
  });
  mockRankSearchCandidates.mockResolvedValue({ ranked: [{ id: 'a', score: 91 }], ranker: 'model' });
  mockGetInnovationsByIds.mockImplementation(async (ids) => ids.map((id) => record(id, id.toUpperCase())));
  mockSearchCachedInnovations.mockResolvedValue({ results: [], total: 0 });
});

describe('searchByQuery on the web', () => {
  it('runs the four stages and returns the model’s picks first, then the rest unscored', async () => {
    const out = await searchByQuery('solar pump', { limit: 5 });

    expect(mockSearchTerms).toHaveBeenCalledWith('solar pump');
    expect(mockFindCandidates).toHaveBeenCalledWith(['solar', 'pump'], { expandedTerms: [] });
    // "b" was not picked by the model, so it follows the picks, with no score:
    // a made-up one could sort it above them.
    expect(out.results.map((r) => r.id)).toEqual(['a', 'b']);
    expect(out.results.map((r) => r.matchScore)).toEqual([91, null]);
  });

  it('sends the model summaries and ids, never titles', async () => {
    await searchByQuery('solar pump');

    const [, sent] = mockRankSearchCandidates.mock.calls[0];
    expect(sent.every((c) => 'id' in c && 'short_description' in c)).toBe(true);
    expect(sent.some((c) => 'title' in c)).toBe(false);
  });

  it('fetches the first fifteen with the first page, and the rest behind it', async () => {
    mockFindCandidates.mockResolvedValue({
      candidates: Array.from({ length: 40 }, (_, i) => candidate(`id-${i}`, `Solar ${i}`)),
      conjunction: 'AND',
    });
    mockRankSearchCandidates.mockResolvedValue({
      ranked: Array.from({ length: 15 }, (_, i) => ({ id: `id-${i}`, score: 90 - i })),
      ranker: 'model',
    });

    await searchByQuery('solar', { offset: 0, limit: 5 });

    // Fifteen for the model's picks, so paging through them asks for nothing;
    // then the other twenty-five, fetched while the first page is read.
    expect(mockGetInnovationsByIds.mock.calls.map(([ids]) => ids.length)).toEqual([15, 25]);
  });

  it('reports more to come while the ranking has more', async () => {
    mockFindCandidates.mockResolvedValue({
      candidates: Array.from({ length: 20 }, (_, i) => candidate(`id-${i}`, `Solar ${i}`)),
      conjunction: 'AND',
    });
    mockRankSearchCandidates.mockResolvedValue({
      ranked: Array.from({ length: 20 }, (_, i) => ({ id: `id-${i}`, score: 90 })),
      ranker: 'model',
    });

    expect((await searchByQuery('solar', { offset: 0, limit: 5 })).hasMore).toBe(true);
    expect((await searchByQuery('solar', { offset: 15, limit: 5 })).hasMore).toBe(false);
  });

  it('keeps our own ranking when the model cannot be reached', async () => {
    mockRankSearchCandidates.mockRejectedValue(new Error('backend down'));

    const out = await searchByQuery('solar pump');

    // "Solar pump" matches both words in its title; "Composting" matches
    // neither, so our ranking alone is enough to order them.
    expect(out.results.map((r) => r.id)).toEqual(['a', 'b']);
    expect(out.results[0].matchScore).toBeGreaterThan(0);
  });

  it('keeps our own ranking when the model scores nothing', async () => {
    mockRankSearchCandidates.mockResolvedValue({ ranked: [], ranker: 'caller' });

    const out = await searchByQuery('solar pump');
    expect(out.results.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('searches with the words as typed when the backend cannot prepare them', async () => {
    mockSearchTerms.mockRejectedValue(new Error('backend down'));

    await searchByQuery('solar pump for smallholders');

    // Stopwords survive local extraction, which is why textSearch has its own
    // length guard; what matters is that the search still happened.
    expect(mockFindCandidates).toHaveBeenCalledWith(
      ['solar', 'pump', 'for', 'smallholders'],
      { expandedTerms: [] }
    );
  });

  it('sends the backend\u2019s suggestions to the search, not only to the ranking', async () => {
    // Ranking can only reorder what was fetched, so a suggestion the search
    // never used cannot surface the record it was suggested for.
    mockSearchTerms.mockResolvedValue({
      englishQuery: 'bunny',
      terms: ['bunny'],
      expandedTerms: ['rabbit', 'care'],
    });

    await searchByQuery('help with bunny');

    expect(mockFindCandidates).toHaveBeenCalledWith(['bunny'], {
      expandedTerms: ['rabbit', 'care'],
    });
  });

  it('falls back to the cache when the portal cannot be reached', async () => {
    mockFindCandidates.mockRejectedValue(new Error('offline'));
    mockSearchCachedInnovations.mockResolvedValue({
      results: [record('cached-1', 'Solar pump'), record('cached-2', 'Beekeeping')],
      total: 2,
    });

    const out = await searchByQuery('solar pump', { limit: 5 });

    expect(out.fromCache).toBe(true);
    // Matching, not merely everything that happens to be saved.
    expect(out.results.map((r) => r.id)).toEqual(['cached-1']);
    expect(out.total).toBe(1);
  });

  it('fails rather than pretending when nothing is cached either', async () => {
    mockFindCandidates.mockRejectedValue(new Error('offline'));

    await expect(searchByQuery('solar pump')).rejects.toThrow('offline');
  });

  it('shows everything saved, and says nothing matched, when nothing saved matches', async () => {
    // Explore offers what is on the device offline; search ended in an error.
    mockFindCandidates.mockRejectedValue(new Error('offline'));
    mockSearchCachedInnovations.mockResolvedValue({
      results: [record('cached-1', 'Beekeeping'), record('cached-2', 'Composting')],
      total: 2,
    });

    const out = await searchByQuery('solar pump', { limit: 5 });

    expect(out).toMatchObject({ fromCache: true, cacheNoMatch: true, total: 2 });
    expect(out.results.map((r) => r.id)).toEqual(['cached-1', 'cached-2']);
  });

  it('goes straight to what is saved when the browser is offline, even for a query with no searchable words', async () => {
    // "hi" is too short to search for, so nothing ever failed and the cache was
    // never asked: offline, the user got the online "nothing found" page.
    mockSearchCachedInnovations.mockResolvedValue({
      results: [record('cached-1', 'Beekeeping')],
      total: 1,
    });
    const real = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    try {
      const out = await searchByQuery('hi');
      expect(out).toMatchObject({ fromCache: true, cacheNoMatch: true });
      expect(out.results.map((r) => r.id)).toEqual(['cached-1']);
      // No time spent on requests that cannot succeed.
      expect(mockSearchTerms).not.toHaveBeenCalled();
      expect(mockFindCandidates).not.toHaveBeenCalled();
    } finally {
      if (real) Object.defineProperty(globalThis, 'navigator', real);
      else delete globalThis.navigator;
    }
  });

  it('says how to have something offline when the browser is offline and nothing is saved', async () => {
    mockFindCandidates.mockRejectedValue(new Error('The innovation catalogue is unavailable right now.'));
    const real = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    try {
      await expect(searchByQuery('solar pump')).rejects.toThrow(/nothing is saved on this device/);
    } finally {
      if (real) Object.defineProperty(globalThis, 'navigator', real);
      else delete globalThis.navigator;
    }
  });

  it('returns nothing for a blank query without asking anyone', async () => {
    const out = await searchByQuery('   ');

    expect(out).toEqual({ query: '', results: [], hasMore: false, total: 0 });
    expect(mockSearchTerms).not.toHaveBeenCalled();
  });

  it('returns nothing when the portal matches nothing, without ranking it', async () => {
    mockFindCandidates.mockResolvedValue({ candidates: [], conjunction: 'OR' });

    const out = await searchByQuery('xyzzy');

    expect(out.results).toEqual([]);
    expect(mockRankSearchCandidates).not.toHaveBeenCalled();
  });

  it('drops a ranked id the portal no longer serves', async () => {
    // Published, ranked, then unpublished between the two requests.
    mockGetInnovationsByIds.mockResolvedValue([]);

    const out = await searchByQuery('solar pump');
    expect(out.results).toEqual([]);
  });
});

describe('paging through a search', () => {
  const many = (n) => {
    mockFindCandidates.mockResolvedValue({
      candidates: Array.from({ length: n }, (_, i) => candidate(`id-${i}`, `Solar ${i}`)),
      conjunction: 'AND',
    });
    mockRankSearchCandidates.mockResolvedValue({
      ranked: Array.from({ length: Math.min(n, 15) }, (_, i) => ({ id: `id-${i}`, score: 90 - i })),
      ranker: 'model',
    });
  };

  it('runs the four stages once, however many pages are read', async () => {
    many(40);
    await searchByQuery('solar', { offset: 0, limit: 5 });
    await searchByQuery('solar', { offset: 5, limit: 5 });
    await searchByQuery('solar', { offset: 10, limit: 5 });
    await searchByQuery('solar', { offset: 15, limit: 5 });

    expect(mockSearchTerms).toHaveBeenCalledTimes(1);
    expect(mockFindCandidates).toHaveBeenCalledTimes(1);
    expect(mockRankSearchCandidates).toHaveBeenCalledTimes(1);
  });

  it('pages through the model’s picks and then on into the rest of the shortlist', async () => {
    many(40);
    const pages = [];
    for (let offset = 0; offset < 40; offset += 5) {
      pages.push(await searchByQuery('solar', { offset, limit: 5 }));
    }

    const ids = pages.flatMap((p) => p.results.map((r) => r.id));
    expect(ids).toHaveLength(40);
    expect(new Set(ids).size).toBe(40);
    expect(pages[2].results.every((r) => typeof r.matchScore === 'number')).toBe(true);
    expect(pages[3].results.every((r) => r.matchScore === null)).toBe(true);
    expect(pages[6].hasMore).toBe(true);
    expect(pages[7].hasMore).toBe(false);
  });

  it('fetches each record once', async () => {
    many(40);
    for (let offset = 0; offset < 40; offset += 5) await searchByQuery('solar', { offset, limit: 5 });

    const asked = mockGetInnovationsByIds.mock.calls.flatMap(([ids]) => ids);
    expect(asked).toHaveLength(40);
  });

  it('never repeats a record across pages when one has been unpublished', async () => {
    many(12);
    // id-2 is ranked, then gone by the time records are fetched.
    mockGetInnovationsByIds.mockImplementation(async (ids) =>
      ids.filter((id) => id !== 'id-2').map((id) => record(id, id))
    );

    const first = await searchByQuery('solar', { offset: 0, limit: 5 });
    const second = await searchByQuery('solar', { offset: first.results.length, limit: 5 });
    const third = await searchByQuery('solar', { offset: first.results.length + second.results.length, limit: 5 });
    const ids = [first, second, third].flatMap((p) => p.results.map((r) => r.id));

    expect(ids).toHaveLength(11);
    expect(new Set(ids).size).toBe(11);
    expect(ids).not.toContain('id-2');
  });

  it('runs the stages again for a different query', async () => {
    await searchByQuery('solar');
    await searchByQuery('compost');
    expect(mockRankSearchCandidates).toHaveBeenCalledTimes(2);
  });

  it('runs the stages again once the kept search is ten minutes old', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await searchByQuery('solar');
    now.mockReturnValue(1_000_000 + 10 * 60 * 1000 + 1);
    await searchByQuery('solar');
    now.mockRestore();

    expect(mockRankSearchCandidates).toHaveBeenCalledTimes(2);
  });

  it('does not keep a search that failed, so asking again tries again', async () => {
    mockFindCandidates.mockRejectedValueOnce(new Error('portal down'));
    mockSearchCachedInnovations.mockResolvedValue({ results: [], total: 0 });

    await expect(searchByQuery('solar')).rejects.toThrow('portal down');
    await searchByQuery('solar');

    expect(mockFindCandidates).toHaveBeenCalledTimes(2);
  });

  it('retries a batch of records that failed to load', async () => {
    many(10);
    mockGetInnovationsByIds.mockRejectedValueOnce(new Error('timeout'));

    await expect(searchByQuery('solar')).rejects.toThrow();
    const out = await searchByQuery('solar');
    expect(out.results).toHaveLength(5);
  });
});
