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

const { searchByQuery } = require('../src/database/querySearch.web');

const candidate = (id, title, summary = '') => ({ id, title, summary });
const record = (id, title) => ({ id, title, shortDescription: `About ${title}` });

beforeEach(() => {
  jest.clearAllMocks();
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
  it('runs the four stages and returns the model’s order', async () => {
    const out = await searchByQuery('solar pump', { limit: 5 });

    expect(mockSearchTerms).toHaveBeenCalledWith('solar pump');
    expect(mockFindCandidates).toHaveBeenCalledWith(['solar', 'pump']);
    expect(out.results.map((r) => r.id)).toEqual(['a']);
    expect(out.results[0].matchScore).toBe(91);
  });

  it('sends the model summaries and ids, never titles', async () => {
    await searchByQuery('solar pump');

    const [, sent] = mockRankSearchCandidates.mock.calls[0];
    expect(sent.every((c) => 'id' in c && 'short_description' in c)).toBe(true);
    expect(sent.some((c) => 'title' in c)).toBe(false);
  });

  it('asks the portal for full records only for the page being shown', async () => {
    mockFindCandidates.mockResolvedValue({
      candidates: Array.from({ length: 40 }, (_, i) => candidate(`id-${i}`, `Solar ${i}`)),
      conjunction: 'AND',
    });
    mockRankSearchCandidates.mockResolvedValue({
      ranked: Array.from({ length: 40 }, (_, i) => ({ id: `id-${i}`, score: 90 - i })),
      ranker: 'model',
    });

    await searchByQuery('solar', { offset: 0, limit: 5 });

    expect(mockGetInnovationsByIds).toHaveBeenCalledTimes(1);
    expect(mockGetInnovationsByIds.mock.calls[0][0]).toHaveLength(5);
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
    expect(mockFindCandidates).toHaveBeenCalledWith(['solar', 'pump', 'for', 'smallholders']);
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
