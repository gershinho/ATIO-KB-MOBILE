import {
  hasDerivedFilters,
  filterByCostAndComplexity,
  collectFilteredPage,
  countFiltered,
} from '../src/database/paginate';

/**
 * Builds a fake SQL source of `total` rows where every Nth row survives the
 * derived filter. Records each (limit, offset) read so tests can assert the
 * access pattern, not just the output.
 */
function makeSource(total, keepEveryNth) {
  const reads = [];
  const rows = Array.from({ length: total }, (_, i) => ({
    id: i,
    cost: i % keepEveryNth === 0 ? 'low' : 'high',
  }));
  return {
    reads,
    fetchChunk: async (limit, offset) => {
      reads.push({ limit, offset });
      return rows.slice(offset, offset + limit);
    },
    keep: async (chunk) => chunk.filter((r) => r.cost === 'low'),
    survivors: rows.filter((r) => r.cost === 'low'),
  };
}

describe('hasDerivedFilters', () => {
  it('is false for empty, missing, or absent filters', () => {
    expect(hasDerivedFilters(undefined)).toBe(false);
    expect(hasDerivedFilters(null)).toBe(false);
    expect(hasDerivedFilters({})).toBe(false);
    expect(hasDerivedFilters({ cost: [], complexity: [] })).toBe(false);
  });

  it('is true when either derived key has entries', () => {
    expect(hasDerivedFilters({ cost: ['low'] })).toBe(true);
    expect(hasDerivedFilters({ complexity: ['simple'] })).toBe(true);
  });

  it('ignores non-derived filter keys', () => {
    expect(hasDerivedFilters({ regions: ['a'], sdgs: [1] })).toBe(false);
  });
});

describe('filterByCostAndComplexity', () => {
  const items = [
    { id: 1, cost: 'low', complexity: 'simple' },
    { id: 2, cost: 'high', complexity: 'simple' },
    { id: 3, cost: 'low', complexity: 'advanced' },
    { id: 4, cost: null, complexity: null },
  ];

  it('returns everything when no derived filters are set', () => {
    expect(filterByCostAndComplexity(items, {})).toHaveLength(4);
  });

  it('filters on cost alone', () => {
    expect(filterByCostAndComplexity(items, { cost: ['low'] }).map((i) => i.id)).toEqual([1, 3]);
  });

  it('filters on complexity alone', () => {
    expect(
      filterByCostAndComplexity(items, { complexity: ['simple'] }).map((i) => i.id)
    ).toEqual([1, 2]);
  });

  it('ANDs the two filters together', () => {
    expect(
      filterByCostAndComplexity(items, { cost: ['low'], complexity: ['advanced'] }).map((i) => i.id)
    ).toEqual([3]);
  });

  it('drops rows with a null derived value rather than treating it as a match', () => {
    expect(filterByCostAndComplexity(items, { cost: ['low'] }).some((i) => i.id === 4)).toBe(false);
  });

  it('does not mutate the input array', () => {
    const copy = [...items];
    filterByCostAndComplexity(items, { cost: ['low'] });
    expect(items).toEqual(copy);
  });
});

describe('collectFilteredPage', () => {
  it('returns the first page', async () => {
    const s = makeSource(1000, 5);
    const page = await collectFilteredPage({ ...s, offset: 0, limit: 10, chunkSize: 100 });
    expect(page.map((r) => r.id)).toEqual(s.survivors.slice(0, 10).map((r) => r.id));
  });

  it('returns a deep page that the old fetch-once-then-slice approach dropped', async () => {
    // 1000 rows, 1 in 5 survives => 200 survivors. Page at offset 120 exists,
    // but a single window of max(limit*5, offset+limit)=600 rows yields only
    // 120 survivors, so slice(120,140) came back empty.
    const s = makeSource(1000, 5);
    const page = await collectFilteredPage({ ...s, offset: 120, limit: 20, chunkSize: 100 });
    expect(page).toHaveLength(20);
    expect(page.map((r) => r.id)).toEqual(s.survivors.slice(120, 140).map((r) => r.id));
  });

  it('keeps pages contiguous and non-overlapping across the whole set', async () => {
    const s = makeSource(600, 3);
    const seen = [];
    for (let offset = 0; offset < 200; offset += 20) {
      const page = await collectFilteredPage({ ...s, offset, limit: 20, chunkSize: 50 });
      seen.push(...page.map((r) => r.id));
    }
    expect(seen).toEqual(s.survivors.map((r) => r.id));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('returns a short final page rather than padding it', async () => {
    const s = makeSource(100, 10); // 10 survivors
    const page = await collectFilteredPage({ ...s, offset: 5, limit: 20, chunkSize: 25 });
    expect(page).toHaveLength(5);
  });

  it('returns empty past the end of the survivor set', async () => {
    const s = makeSource(100, 10);
    expect(await collectFilteredPage({ ...s, offset: 50, limit: 10, chunkSize: 25 })).toEqual([]);
  });

  it('stops reading as soon as the page is satisfied', async () => {
    const s = makeSource(10000, 2);
    await collectFilteredPage({ ...s, offset: 0, limit: 10, chunkSize: 100 });
    // 1 chunk of 100 yields 50 survivors — more than the 10 needed.
    expect(s.reads).toHaveLength(1);
  });

  it('reads further only when survivors are sparse', async () => {
    const s = makeSource(10000, 100); // 1 survivor per 100 rows
    const page = await collectFilteredPage({ ...s, offset: 0, limit: 10, chunkSize: 100 });
    expect(page).toHaveLength(10);
    expect(s.reads.length).toBeGreaterThan(1);
  });

  it('advances the source offset by rows actually read', async () => {
    const s = makeSource(1000, 50);
    await collectFilteredPage({ ...s, offset: 0, limit: 10, chunkSize: 100 });
    expect(s.reads.map((r) => r.offset)).toEqual([0, 100, 200, 300, 400]);
  });

  it('handles an empty source', async () => {
    const s = makeSource(0, 1);
    expect(await collectFilteredPage({ ...s, offset: 0, limit: 10 })).toEqual([]);
  });

  it('returns empty for a non-positive limit without reading', async () => {
    const s = makeSource(100, 2);
    expect(await collectFilteredPage({ ...s, offset: 0, limit: 0 })).toEqual([]);
    expect(s.reads).toHaveLength(0);
  });

  it('terminates when every row is filtered out', async () => {
    const s = makeSource(300, 1);
    const page = await collectFilteredPage({
      ...s,
      keep: async () => [],
      offset: 0,
      limit: 10,
      chunkSize: 100,
    });
    expect(page).toEqual([]);
  });
});

describe('countFiltered', () => {
  it('counts every survivor exactly', async () => {
    const s = makeSource(1000, 5);
    expect(await countFiltered({ ...s, chunkSize: 100 })).toEqual({ count: 200, exact: true });
  });

  it('is not capped by the old 2000-row ceiling', async () => {
    const s = makeSource(6000, 2); // 3000 survivors, all beyond the old cap
    const { count, exact } = await countFiltered({ ...s, chunkSize: 500 });
    expect(count).toBe(3000);
    expect(exact).toBe(true);
  });

  it('reports exact: false when maxScan truncates the scan', async () => {
    const s = makeSource(10000, 2);
    const { count, exact } = await countFiltered({ ...s, chunkSize: 100, maxScan: 500 });
    expect(exact).toBe(false);
    expect(count).toBe(250);
  });

  it('never reads beyond maxScan', async () => {
    const s = makeSource(10000, 2);
    await countFiltered({ ...s, chunkSize: 300, maxScan: 500 });
    const totalRequested = s.reads.reduce((n, r) => n + r.limit, 0);
    expect(totalRequested).toBeLessThanOrEqual(500);
  });

  it('counts zero on an empty source and stays exact', async () => {
    const s = makeSource(0, 1);
    expect(await countFiltered({ ...s })).toEqual({ count: 0, exact: true });
  });

  it('counts zero when nothing survives', async () => {
    const s = makeSource(300, 1);
    expect(await countFiltered({ ...s, keep: async () => [], chunkSize: 100 })).toEqual({
      count: 0,
      exact: true,
    });
  });
});

