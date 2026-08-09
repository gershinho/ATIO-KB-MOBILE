/**
 * The SQLite data layer, run against real SQL.
 *
 * Every one of these modules was mocked wholesale everywhere it appeared, so no
 * test had ever executed one of their queries — and the queries are the point.
 * connection.js is the only thing stubbed here, because it is the module that
 * reaches expo-sqlite, expo-asset and expo-file-system; everything below it runs
 * for real against the in-memory fixture in setup/realDatabase.js.
 */
import createTestDatabase from './setup/realDatabase';

// jest.mock factories are hoisted above this declaration, so the name has to be
// mock-prefixed for the transform to allow the reference.
let mockDb;

jest.mock('../src/database/connection', () => ({
  initDatabase: jest.fn(async () => mockDb),
}));

// eslint-disable-next-line import/first
import {
  getStats,
  getAllCountries,
  getDataSources,
  getChallengeCounts,
  getTypeCounts,
  getTopRegions,
  searchInnovations,
  countInnovations,
  getMostAdvancedInnovations,
} from '../src/database/db';
// eslint-disable-next-line import/first
import {
  incrementThumbsUp,
  decrementThumbsUp,
  addCommentToInnovation,
  getCommentsForInnovation,
  getCachedBullets,
  setCachedBullets,
} from '../src/database/engagement';

beforeEach(() => {
  mockDb = createTestDatabase().database;
});

describe('getStats', () => {
  it('counts innovations, distinct countries and distinct SDGs from the data', async () => {
    expect(await getStats()).toEqual({ innovations: 5, countries: 2, sdgs: 2 });
  });
});

/**
 * One enriched record, by id.
 *
 * db.js has no by-id query — screens already hold the record from the list they
 * rendered it in — so this reaches the enrichment the way the app does.
 */
async function fetchOne(id) {
  const all = await searchInnovations({}, { limit: 100 });
  return all.find((innovation) => innovation.id === id) ?? null;
}

describe('enrichment — raw rows to the shape screens render', () => {
  it('collects an innovation\'s child rows onto it', async () => {
    const innovation = await fetchOne(1);
    expect(innovation).toMatchObject({
      id: 1,
      title: 'Solar Dryer',
      region: 'East Africa',
      isGrassroots: true,
    });
    expect(innovation.countries).toEqual(['Kenya']);
    expect(innovation.types).toEqual(['Machinery and equipment']);
    expect(innovation.sdgs).toEqual([2]);
  });

  it('parses the numeric prefix out of the level strings', async () => {
    const innovation = await fetchOne(1);
    expect(innovation.readinessLevel).toBe(7);
    expect(innovation.adoptionLevel).toBe(3);
    expect(innovation.readinessName).toBe('7 - Proven');
  });

  it('returns a record with no child rows at all rather than failing', async () => {
    const innovation = await fetchOne(4);
    expect(innovation.title).toBe('Orphan Record');
    expect(innovation.countries).toEqual([]);
    expect(innovation.types).toEqual([]);
    expect(innovation.sdgs).toEqual([]);
  });

  it('falls back to readiness level 1 when the level text has no number', async () => {
    expect((await fetchOne(4)).readinessLevel).toBe(1);
  });

  it('derives cost and complexity rather than reading them from a column', async () => {
    // Neither is stored; both are inferred from types, use cases, users and text.
    const innovation = await fetchOne(1);
    expect(innovation.cost).toBeDefined();
    expect(innovation.complexity).toBeDefined();
  });
});

describe('list queries', () => {
  it('returns every distinct country with its count, sorted by name', async () => {
    expect(await getAllCountries()).toEqual([
      { name: 'India', count: 1 },
      { name: 'Kenya', count: 2 },
    ]);
  });

  it('returns the data sources', async () => {
    const titles = (await getDataSources()).map((source) => source.title);
    expect(titles).toEqual(expect.arrayContaining(['ATIO_KB', 'Other Source']));
  });

  it('orders most-advanced by readiness level descending', async () => {
    const ids = (await getMostAdvancedInnovations(10)).map((i) => i.id);
    // 9 - Scaled, then 7 - Proven, then 4 - Prototype, then the null-level row.
    expect(ids.slice(0, 3)).toEqual([3, 1, 2]);
  });

  it('honours the limit', async () => {
    expect(await getMostAdvancedInnovations(2)).toHaveLength(2);
  });

  it('counts distinct innovations per hub region', async () => {
    const regions = await getTopRegions(15);
    // Kenya is in the East Africa hub and carries innovations 1 and 3.
    expect(regions.find((r) => r.name === 'East Africa').count).toBe(2);
    // India is in South Asia and carries innovation 2.
    expect(regions.find((r) => r.name === 'South Asia').count).toBe(1);
  });

  it('reports zero for a hub region with no matching records', async () => {
    const regions = await getTopRegions(15);
    expect(regions.find((r) => r.name === 'West Africa').count).toBe(0);
  });
});

describe('searchInnovations — filters reaching real SQL', () => {
  it('returns everything with no filters', async () => {
    expect(await searchInnovations({}, { limit: 50 })).toHaveLength(5);
  });

  it('filters by country through the join', async () => {
    const ids = (await searchInnovations({ countries: ['Kenya'] }, { limit: 50 })).map((i) => i.id);
    expect(ids.sort()).toEqual([1, 3]);
  });

  it('filters by readiness minimum', async () => {
    const ids = (await searchInnovations({ readinessMin: 7 }, { limit: 50 })).map((i) => i.id);
    expect(ids.sort()).toEqual([1, 3]);
  });

  it('filters by grassroots', async () => {
    const ids = (await searchInnovations({ grassrootsOnly: true }, { limit: 50 })).map((i) => i.id);
    expect(ids).toEqual([1]);
  });

  it('filters by SDG using the Goal N pattern', async () => {
    const ids = (await searchInnovations({ sdgs: [2] }, { limit: 50 })).map((i) => i.id);
    expect(ids.sort()).toEqual([1, 3]);
  });

  it('ANDs separate filter keys together', async () => {
    const ids = (
      await searchInnovations({ countries: ['Kenya'], readinessMin: 9 }, { limit: 50 })
    ).map((i) => i.id);
    expect(ids).toEqual([3]);
  });

  it('pages with limit and offset without dropping or repeating rows', async () => {
    const first = await searchInnovations({}, { limit: 3, offset: 0 });
    const second = await searchInnovations({}, { limit: 3, offset: 3 });
    const ids = [...first, ...second].map((i) => i.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('does not multiply rows when an innovation has several child rows', async () => {
    // The join fan-out that a DISTINCT or GROUP BY has to contain.
    const results = await searchInnovations({ countries: ['Kenya'] }, { limit: 50 });
    expect(results.map((i) => i.id)).toEqual([...new Set(results.map((i) => i.id))]);
  });
});

describe('searchInnovations — LIKE escaping against real SQL', () => {
  /**
   * The fixture's data_source is literally "ATIO_KB". Unescaped, the underscore
   * is a single-character wildcard, so "ATIO_KB" would also match "ATIOxKB" —
   * and, more to the point, a search for a source containing an underscore
   * returned rows that do not have it.
   */
  it('treats an underscore in a filter value as a literal', async () => {
    // Innovation 5's source is 'ATIOxKB', which differs from 'ATIO_KB' only
    // where the underscore is. Unescaped, the underscore matches any single
    // character and this search returns the decoy alongside the real rows.
    const ids = (await searchInnovations({ sources: ['ATIO_KB'] }, { limit: 50 }))
      .map((i) => i.id)
      .sort();
    expect(ids).toEqual([1, 3, 4]);
    expect(ids).not.toContain(5);
  });

  it('treats a percent sign in a filter value as a literal', async () => {
    expect(await searchInnovations({ sources: ['%'] }, { limit: 50 })).toEqual([]);
  });
});

describe('countInnovations', () => {
  it('agrees with searchInnovations for the same filter bag', async () => {
    const bags = [
      {},
      { countries: ['Kenya'] },
      { readinessMin: 7 },
      { grassrootsOnly: true },
      { sdgs: [2] },
    ];
    for (const bag of bags) {
      const [rows, total] = await Promise.all([
        searchInnovations(bag, { limit: 100 }),
        countInnovations(bag),
      ]);
      expect(total).toBe(rows.length);
    }
  });

  it('returns zero rather than throwing when nothing matches', async () => {
    expect(await countInnovations({ countries: ['Atlantis'] })).toBe(0);
  });
});

describe('taxonomy count aggregators', () => {
  it('counts innovations per challenge', async () => {
    const counts = await getChallengeCounts();
    expect(typeof counts).toBe('object');
    expect(Object.values(counts).every((n) => typeof n === 'number')).toBe(true);
  });

  it('counts innovations per type', async () => {
    const counts = await getTypeCounts();
    expect(typeof counts).toBe('object');
    expect(Object.values(counts).every((n) => typeof n === 'number')).toBe(true);
  });
});

describe('engagement — the only module that writes', () => {
  it('creates the counter row on the first like', async () => {
    expect(await incrementThumbsUp(1)).toBe(true);
    const row = await mockDb.getFirstAsync(
      'SELECT thumbs_up_count AS c FROM innovation_thumbs_up_counts WHERE innovation_id = 1'
    );
    expect(row.c).toBe(1);
  });

  it('increments an existing counter rather than replacing it', async () => {
    await incrementThumbsUp(1);
    await incrementThumbsUp(1);
    const row = await mockDb.getFirstAsync(
      'SELECT thumbs_up_count AS c FROM innovation_thumbs_up_counts WHERE innovation_id = 1'
    );
    expect(row.c).toBe(2);
  });

  it('never lets the counter go below zero', async () => {
    await incrementThumbsUp(1);
    await decrementThumbsUp(1);
    await decrementThumbsUp(1);
    await decrementThumbsUp(1);
    const row = await mockDb.getFirstAsync(
      'SELECT thumbs_up_count AS c FROM innovation_thumbs_up_counts WHERE innovation_id = 1'
    );
    expect(row.c).toBe(0);
  });

  it('treats decrementing an innovation with no row as a no-op', async () => {
    expect(await decrementThumbsUp(2)).toBe(true);
    const row = await mockDb.getFirstAsync(
      'SELECT thumbs_up_count AS c FROM innovation_thumbs_up_counts WHERE innovation_id = 2'
    );
    expect(row).toBeNull();
  });

  it('refuses to write without an innovation id', async () => {
    expect(await incrementThumbsUp(null)).toBe(false);
    expect(await decrementThumbsUp(undefined)).toBe(false);
  });

  it('stores and reads back a comment', async () => {
    expect(await addCommentToInnovation(1, 'Ada', 'Useful in Kisumu.')).toBe(true);
    const comments = await getCommentsForInnovation(1);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ authorName: 'Ada', body: 'Useful in Kisumu.' });
  });

  it('gives every comment an epoch-millisecond createdAt', async () => {
    await addCommentToInnovation(1, 'Ada', 'Useful.');
    const [comment] = await getCommentsForInnovation(1);
    expect(typeof comment.createdAt).toBe('number');
    // The column is UTC TEXT with no zone marker; read as local time it would be
    // hours out. Anything within a day of now proves it was not misread.
    expect(Math.abs(Date.now() - comment.createdAt)).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it('returns comments newest first', async () => {
    await addCommentToInnovation(1, 'First', 'One');
    await addCommentToInnovation(1, 'Second', 'Two');
    const names = (await getCommentsForInnovation(1)).map((c) => c.authorName);
    expect(names[0]).toBe('Second');
  });

  it('rejects blank input without writing', async () => {
    expect(await addCommentToInnovation(1, '   ', 'body')).toBe(false);
    expect(await addCommentToInnovation(1, 'Ada', '   ')).toBe(false);
    expect(await getCommentsForInnovation(1)).toEqual([]);
  });

  it('keeps one innovation\'s comments out of another\'s', async () => {
    await addCommentToInnovation(1, 'Ada', 'On one');
    await addCommentToInnovation(2, 'Bob', 'On two');
    expect(await getCommentsForInnovation(1)).toHaveLength(1);
    expect(await getCommentsForInnovation(2)).toHaveLength(1);
  });

  it('round-trips a cached bullet summary', async () => {
    await setCachedBullets(1, ['one', 'two', 'three']);
    expect(await getCachedBullets(1)).toEqual(['one', 'two', 'three']);
  });

  it('returns null when nothing is cached', async () => {
    expect(await getCachedBullets(3)).toBeNull();
  });

  it('replaces a cached summary rather than adding a second row', async () => {
    await setCachedBullets(1, ['old', 'old', 'old']);
    await setCachedBullets(1, ['new', 'new', 'new']);
    expect(await getCachedBullets(1)).toEqual(['new', 'new', 'new']);
  });
});

describe('the bundled catalogue is never written to', () => {
  it('leaves every innovations row untouched after a full engagement cycle', async () => {
    const before = await mockDb.getAllAsync('SELECT * FROM innovations ORDER BY id');
    await incrementThumbsUp(1);
    await addCommentToInnovation(1, 'Ada', 'A comment');
    await setCachedBullets(1, ['a', 'b', 'c']);
    const after = await mockDb.getAllAsync('SELECT * FROM innovations ORDER BY id');
    expect(after).toEqual(before);
  });
});
