/**
 * Counting, with and without the portal's help.
 *
 * Both paths matter: the search is what works today, and meta.count is what
 * FAO are adding. The function has to switch over on its own the day it
 * appears, because nothing else is going to be changed when it does.
 */
import { countMatching, resetCountCache } from '../src/api/jsonapi/count';

/** A portal holding `total` matching records, counting the requests. */
function portalWith(total, { meta = false } = {}) {
  const impl = jest.fn(async (url) => {
    const offset = Number(new URL(url).searchParams.get('page[offset]') ?? 0);
    const body = { data: offset < total ? [{ id: `r${offset}` }] : [] };
    if (meta) body.meta = { count: total };
    return { ok: true, status: 200, json: async () => body };
  });
  return impl;
}

beforeEach(() => {
  resetCountCache();
  process.env.EXPO_PUBLIC_JSONAPI_URL = 'https://example.org/jsonapi';
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('when the portal reports a count', () => {
  it('reads it, in one request', async () => {
    const fetchImpl = portalWith(6287, { meta: true });
    const result = await countMatching('/node/innovation', {}, { fetchImpl });

    expect(result).toEqual({ count: 6287, requests: 1, fromMeta: true });
  });

  it('believes a reported zero', async () => {
    const fetchImpl = portalWith(0, { meta: true });
    expect(await countMatching('/node/innovation', {}, { fetchImpl })).toMatchObject({
      count: 0,
      fromMeta: true,
    });
  });
});

describe('when it does not', () => {
  it.each([0, 1, 2, 15, 16, 17, 50, 6287])('finds exactly %i records', async (total) => {
    const fetchImpl = portalWith(total);
    const { count, fromMeta } = await countMatching('/node/innovation', {}, { fetchImpl });

    expect(count).toBe(total);
    expect(fromMeta).toBe(false);
  });

  it('costs about a dozen requests rather than a hundred and twenty', async () => {
    // Walking 6,287 records 50 at a time is 126 requests. Bracketing and then
    // halving is what makes counting usable at all.
    const fetchImpl = portalWith(6287);
    const { requests } = await countMatching('/node/innovation', {}, { fetchImpl });

    expect(requests).toBeLessThan(25);
  });

  it('sends its first probes together rather than one after another', async () => {
    // Against a cold portal a round trip is seconds, so nine sequential
    // doublings cost most of a minute before the halving even begins.
    const order = [];
    const fetchImpl = jest.fn(async (url) => {
      const offset = Number(new URL(url).searchParams.get('page[offset]') ?? 0);
      order.push(offset);
      await new Promise((r) => setTimeout(r, 1));
      return { ok: true, status: 200, json: async () => ({ data: offset < 6287 ? [{ id: 'x' }] : [] }) };
    });

    await countMatching('/node/innovation', {}, { fetchImpl });
    // The bracketing probes are issued before any of them has answered.
    expect(order.slice(1, 7)).toEqual([16, 64, 256, 1024, 4096, 16384]);
  });

  it('answers an empty collection without searching', async () => {
    const fetchImpl = portalWith(0);
    const { requests } = await countMatching('/node/innovation', {}, { fetchImpl });
    expect(requests).toBe(1);
  });
});

describe('remembering an answer', () => {
  it('does not ask twice for the same question', async () => {
    // Twenty-odd requests and the best part of a minute against a cold portal,
    // for a question a reopened drilldown asks again immediately.
    const fetchImpl = portalWith(100);
    const first = await countMatching('/node/innovation', { filter: { a: 1 } }, { fetchImpl });
    const callsAfterFirst = fetchImpl.mock.calls.length;

    const second = await countMatching('/node/innovation', { filter: { a: 1 } }, { fetchImpl });

    expect(second.count).toBe(first.count);
    expect(second.cached).toBe(true);
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst);
  });

  it('tells a different question apart', async () => {
    const fetchImpl = portalWith(100);
    await countMatching('/node/innovation', { filter: { a: 1 } }, { fetchImpl });
    const other = await countMatching('/node/innovation', { filter: { a: 2 } }, { fetchImpl });
    expect(other.cached).toBeUndefined();
  });
});

describe('the query it sends', () => {
  it('carries the caller’s filters', async () => {
    const fetchImpl = portalWith(1, { meta: true });
    await countMatching('/node/innovation', { filter: { status: 1 } }, { fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toContain('filter%5Bstatus%5D=1');
  });

  it('asks for one small field, since the rows are never read', async () => {
    const fetchImpl = portalWith(1, { meta: true });
    await countMatching('/node/innovation', {}, { fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toContain('fields%5Bnode--innovation%5D=drupal_internal__nid');
  });

  it('overrides a page the caller passed, which would otherwise break the search', async () => {
    const fetchImpl = portalWith(3);
    const { count } = await countMatching(
      '/node/innovation',
      { page: { limit: 50, offset: 100 } },
      { fetchImpl }
    );
    expect(count).toBe(3);
  });
});
