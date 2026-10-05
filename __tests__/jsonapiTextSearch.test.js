/**
 * Asking the portal which records contain a set of words.
 *
 * Two things are worth pinning. The query shape, because the portal rejects a
 * filter on a text field's bare name and the error says only "incomplete, it
 * must end with one of the following specifiers" — a mistake that is cheap to
 * make and expensive to diagnose. And the widening, because the whole argument
 * for searching the portal at all is that it narrows hard first.
 */
import { buildTextQuery, findCandidates } from '../src/api/jsonapi/textSearch';
import { buildQuery } from '../src/api/jsonapi/query';
import { countMatching } from '../src/api/jsonapi/count';

jest.mock('../src/api/jsonapi/count', () => ({ countMatching: jest.fn() }));

/** A portal document holding `n` rows, numbered from `from`. */
const page = (n, from = 0) => ({
  data: Array.from({ length: n }, (_, i) => ({
    id: `uuid-${from + i}`,
    attributes: {
      title: `Record ${from + i}`,
      field_shorter_description: { processed: `<p>About record ${from + i}</p>` },
    },
  })),
});

/** Records the urls asked for and answers each with whatever `answer` says. */
function recordingFetch(answer) {
  const urls = [];
  const impl = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => answer(url, urls.length - 1) };
  };
  return { impl, urls };
}

describe('buildTextQuery', () => {
  it('addresses the description through its value, which the portal demands', () => {
    const query = buildQuery(buildTextQuery(['solar']));

    expect(query).toContain('filter%5Bc0_1%5D%5Bcondition%5D%5Bpath%5D=field_shorter_description.value');
    expect(query).not.toContain('%5Bpath%5D=field_shorter_description&');
  });

  it('nests an OR of fields inside an AND of words', () => {
    const query = decodeURIComponent(buildQuery(buildTextQuery(['solar', 'pump'])));

    // One outer group with the caller's conjunction...
    expect(query).toContain('filter[match][group][conjunction]=AND');
    // ...one inner group per word, belonging to it...
    expect(query).toContain('filter[w0][group][conjunction]=OR');
    expect(query).toContain('filter[w0][group][memberOf]=match');
    expect(query).toContain('filter[w1][group][conjunction]=OR');
    // ...and each word's conditions belonging to that word's group, so a word
    // may be matched in either field without every word needing the same one.
    expect(query).toContain('filter[c0_0][condition][memberOf]=w0');
    expect(query).toContain('filter[c1_1][condition][memberOf]=w1');
  });

  it('searches published records only', () => {
    expect(decodeURIComponent(buildQuery(buildTextQuery(['solar'])))).toContain('filter[status]=1');
  });

  it('asks for only the two fields ranking needs', () => {
    const query = decodeURIComponent(buildQuery(buildTextQuery(['solar'])));
    expect(query).toContain('fields[node--innovation]=title,field_shorter_description');
  });

  it('takes OR when asked', () => {
    const query = decodeURIComponent(buildQuery(buildTextQuery(['solar'], { conjunction: 'OR' })));
    expect(query).toContain('filter[match][group][conjunction]=OR');
  });
});

describe('findCandidates', () => {
  it('runs the strict and the loose search at once, not one after the other', async () => {
    const { impl, urls } = recordingFetch(() => page(50));
    const { candidates, requests } = await findCandidates(['solar', 'pump'], { fetchImpl: impl });

    // Two searches of three pages. Sequential staging cost eleven seconds on a
    // five-word query because the stages added up; these overlap.
    expect(requests).toBe(6);
    expect(urls).toHaveLength(6);
    const decoded = urls.map(decodeURIComponent);
    expect(decoded.filter((u) => u.includes('[match][group][conjunction]=AND'))).toHaveLength(3);
    expect(decoded.filter((u) => u.includes('[match][group][conjunction]=OR'))).toHaveLength(3);
    expect(candidates).toHaveLength(50);
  });

  it('keeps the every-word matches the loose search missed', async () => {
    // The loose search matches hundreds and we read the first 150, in the
    // portal's order; the records containing every word need not be among them.
    const { impl } = recordingFetch((url) =>
      decodeURIComponent(url).includes('conjunction]=AND') ? page(2, 900) : page(50)
    );
    const { candidates, strictCount } = await findCandidates(['solar', 'pump'], { fetchImpl: impl });

    expect(strictCount).toBe(6);
    // The strict hits are in the pool, and ahead of the loose ones, which is
    // what breaks ranking ties in their favour.
    expect(candidates.slice(0, 2).map((c) => c.id)).toEqual(['uuid-900', 'uuid-901']);
    expect(candidates.length).toBeGreaterThan(50);
  });

  it('calls the pool narrow when the strict search carried it', async () => {
    const { impl } = recordingFetch((url) =>
      decodeURIComponent(url).includes('conjunction]=AND') ? page(50) : page(50, 500)
    );
    expect((await findCandidates(['solar', 'pump'], { fetchImpl: impl })).conjunction).toBe('AND');
  });

  it('calls the pool wide when the strict search found almost nothing', async () => {
    const { impl } = recordingFetch((url) =>
      decodeURIComponent(url).includes('conjunction]=AND') ? page(1) : page(50, 500)
    );
    expect((await findCandidates(['solar', 'pump'], { fetchImpl: impl })).conjunction).toBe('OR');
  });

  it('runs one search for one word, strict and loose being the same thing', async () => {
    const { impl, urls } = recordingFetch(() => page(2));
    const { requests } = await findCandidates(['solar'], { fetchImpl: impl });

    expect(urls).toHaveLength(3);
    expect(requests).toBe(3);
  });

  it('counts a record once however many searches return it', async () => {
    const { impl } = recordingFetch(() => page(2));
    const { candidates } = await findCandidates(['solar', 'pump'], { fetchImpl: impl });

    expect(candidates.map((c) => c.id)).toEqual(['uuid-0', 'uuid-1']);
  });

  it('strips the markup the portal publishes descriptions in', async () => {
    const { impl } = recordingFetch(() => page(1));
    const { candidates } = await findCandidates(['solar'], { fetchImpl: impl });

    expect(candidates[0].summary).toBe('About record 0');
    expect(candidates[0].title).toBe('Record 0');
  });

  it('reports an unreachable portal rather than an empty catalogue', async () => {
    // These have to be different things to the caller: one means "no solutions
    // found", the other means "fall back to what is on the device". Reported
    // alike, search with the network off claimed there were no matches and
    // never offered the cache.
    const impl = async () => {
      throw new Error('network down');
    };

    await expect(findCandidates(['solar'], { fetchImpl: impl, attempts: 1 })).rejects.toThrow();
  });

  it('reports no matches, without throwing, when the portal answers with none', async () => {
    const { impl } = recordingFetch(() => page(0));
    const { candidates } = await findCandidates(['xyzzy'], { fetchImpl: impl });

    expect(candidates).toEqual([]);
  });

  it('keeps the pages that answered when one fails', async () => {
    let n = 0;
    const impl = async () => {
      n += 1;
      if (n === 2) throw new Error('gateway');
      return { ok: true, status: 200, json: async () => page(50) };
    };
    const { candidates } = await findCandidates(['solar'], { fetchImpl: impl, attempts: 1 });

    expect(candidates.length).toBe(50);
  });

  it('asks nothing when there is nothing to ask', async () => {
    const { impl, urls } = recordingFetch(() => page(0));
    expect(await findCandidates([], { fetchImpl: impl })).toEqual({
      candidates: [],
      conjunction: null,
      requests: 0,
    });
    expect(urls).toHaveLength(0);
  });

  it('ignores words too short to mean anything, as the backend does', async () => {
    const { impl, urls } = recordingFetch(() => page(0));
    await findCandidates(['a', 'of'], { fetchImpl: impl });
    expect(urls).toHaveLength(0);
  });
});

describe('widening with the backend\u2019s suggested words', () => {
  /** Counts measured against the live portal for "help with bunny". */
  const REAL = {
    rabbit: 4, tips: 17, behavior: 55, care: 88, pet: 132,
    advice: 185, training: 299, nutrition: 330, animal: 360,
    health: 589, small: 1072,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    countMatching.mockImplementation(async (_path, query) => {
      const word = decodeURIComponent(
        // The spec is an object here, not a string: read the condition's value.
        JSON.stringify(query)
      ).match(/"value":"([^"]+)"/)?.[1];
      return { count: REAL[word] ?? 0, requests: 1, fromMeta: true };
    });
  });

  it('searches for the rare suggestions and drops the generic ones', async () => {
    const { impl, urls } = recordingFetch(() => page(10));
    await findCandidates(['bunny'], {
      expandedTerms: Object.keys(REAL),
      fetchImpl: impl,
    });

    const loose = urls.map(decodeURIComponent).filter((u) => u.includes('conjunction]=OR'));
    const searched = loose.join(' ');
    // Rarest first, while they fit: rabbit 4 + tips 17 + behavior 55 = 76.
    expect(searched).toContain('=rabbit');
    expect(searched).toContain('=tips');
    // Generic words would drown the pool — 1,072 records for "small" alone.
    expect(searched).not.toContain('=small');
    expect(searched).not.toContain('=health');
  });

  it('keeps the typed word out of the strict search\u2019s way', async () => {
    const { impl, urls } = recordingFetch(() => page(10));
    await findCandidates(['bunny'], { expandedTerms: ['rabbit'], fetchImpl: impl });

    // The strict search is the user's own words only; suggestions never narrow.
    const strict = urls.map(decodeURIComponent).filter((u) => u.includes('conjunction]=AND'));
    expect(strict.join(' ')).toContain('=bunny');
    expect(strict.join(' ')).not.toContain('=rabbit');
  });

  it('ignores a suggestion that matches nothing', async () => {
    const { impl, urls } = recordingFetch(() => page(10));
    await findCandidates(['bunny'], { expandedTerms: ['rabbit', 'nonsense'], fetchImpl: impl });

    expect(urls.map(decodeURIComponent).join(' ')).not.toContain('=nonsense');
  });

  it('asks nothing extra when there is nothing to widen with', async () => {
    const { impl } = recordingFetch(() => page(10));
    await findCandidates(['solar', 'pump'], { fetchImpl: impl });

    expect(countMatching).not.toHaveBeenCalled();
  });

  it('carries on without widening when the counts cannot be had', async () => {
    countMatching.mockRejectedValue(new Error('portal down'));
    const { impl, urls } = recordingFetch(() => page(10));

    const { candidates } = await findCandidates(['bunny'], {
      expandedTerms: ['rabbit'],
      fetchImpl: impl,
    });

    // An uncounted word is treated as too expensive, so the search is the
    // typed word alone rather than nothing at all.
    expect(candidates.length).toBeGreaterThan(0);
    expect(urls.map(decodeURIComponent).join(' ')).not.toContain('=rabbit');
  });
});
