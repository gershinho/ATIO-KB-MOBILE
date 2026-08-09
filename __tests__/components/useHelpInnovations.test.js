import { renderHook, waitFor } from '@testing-library/react-native';
import useHelpInnovations from '../../src/hooks/useHelpInnovations';
import * as api from '../../src/services/api';
import * as db from '../../src/database/db';

/** The hook sweeps this many distinct queries before merging. */
const QUERY_COUNT = 4;

const item = (id, title, matchScore = 0.5) => ({ id, title, matchScore });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useHelpInnovations — when it runs at all', () => {
  it('does not fetch until something needs it', async () => {
    renderHook(() => useHelpInnovations(false));
    await waitFor(() => expect(api.aiSearch).not.toHaveBeenCalled());
  });

  it('fetches once needed', async () => {
    api.aiSearch.mockResolvedValue({ results: [], hasMore: false });
    const { result } = renderHook(() => useHelpInnovations(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.aiSearch).toHaveBeenCalled();
  });

  it('does not re-fetch when it is needed a second time', async () => {
    api.aiSearch.mockResolvedValue({ results: [], hasMore: false });
    const { result, rerender } = renderHook(({ needed }) => useHelpInnovations(needed), {
      initialProps: { needed: true },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsAfterFirst = api.aiSearch.mock.calls.length;

    rerender({ needed: false });
    rerender({ needed: true });
    await waitFor(() => expect(api.aiSearch).toHaveBeenCalledTimes(callsAfterFirst));
  });
});

describe('useHelpInnovations — paging', () => {
  it('terminates when the backend reports hasMore alongside an empty page', async () => {
    // The regression this guards: offset advances by page.length, so an empty
    // page makes the next request byte-identical to this one. The loop used to
    // spin forever and this test would time out rather than fail.
    api.aiSearch.mockResolvedValue({ results: [], hasMore: true });

    const { result } = renderHook(() => useHelpInnovations(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(api.aiSearch).toHaveBeenCalledTimes(QUERY_COUNT);
    expect(result.current.items).toEqual([]);
  });

  it('follows hasMore across pages and stops when it clears', async () => {
    api.aiSearch
      .mockResolvedValueOnce({ results: [item(1, 'Page one')], hasMore: true })
      .mockResolvedValueOnce({ results: [item(2, 'Page two')], hasMore: false })
      .mockResolvedValue({ results: [], hasMore: false });

    const { result } = renderHook(() => useHelpInnovations(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toHaveLength(2);
    // First query paged twice; the remaining three returned nothing.
    expect(api.aiSearch).toHaveBeenCalledTimes(QUERY_COUNT + 1);
  });

  it('advances the offset by the number of rows actually returned', async () => {
    api.aiSearch
      .mockResolvedValueOnce({ results: [item(1, 'a'), item(2, 'b')], hasMore: true })
      .mockResolvedValue({ results: [], hasMore: false });

    const { result } = renderHook(() => useHelpInnovations(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(api.aiSearch.mock.calls[0][1]).toMatchObject({ offset: 0 });
    expect(api.aiSearch.mock.calls[1][1]).toMatchObject({ offset: 2 });
  });
});

describe('useHelpInnovations — merging', () => {
  it('de-duplicates across queries, keeping the best score', async () => {
    api.aiSearch
      .mockResolvedValueOnce({ results: [item(1, 'Helpline', 0.2)], hasMore: false })
      .mockResolvedValueOnce({ results: [item(1, 'Helpline', 0.9)], hasMore: false })
      .mockResolvedValue({ results: [], hasMore: false });

    const { result } = renderHook(() => useHelpInnovations(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].matchScore).toBe(0.9);
  });

  it('puts a title that names a helpline above a better-scoring one that does not', async () => {
    api.aiSearch
      .mockResolvedValueOnce({
        results: [item(1, 'Crop Advisory Tool', 0.95), item(2, 'National Hotline', 0.3)],
        hasMore: false,
      })
      .mockResolvedValue({ results: [], hasMore: false });

    const { result } = renderHook(() => useHelpInnovations(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items.map((i) => i.id)).toEqual([2, 1]);
  });

  it('sorts by score within the same title-match group', async () => {
    api.aiSearch
      .mockResolvedValueOnce({
        results: [item(1, 'Hotline A', 0.4), item(2, 'Hotline B', 0.8)],
        hasMore: false,
      })
      .mockResolvedValue({ results: [], hasMore: false });

    const { result } = renderHook(() => useHelpInnovations(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items.map((i) => i.id)).toEqual([2, 1]);
  });
});

describe('useHelpInnovations — failure', () => {
  it('falls back to the local lookup when the backend is unreachable', async () => {
    api.aiSearch.mockRejectedValue(new Error('offline'));
    db.getHelpInnovations.mockResolvedValue([item(9, 'Local Hotline')]);

    const { result } = renderHook(() => useHelpInnovations(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual([item(9, 'Local Hotline')]);
  });

  it('ends up with an empty list, not a crash, when the fallback also fails', async () => {
    api.aiSearch.mockRejectedValue(new Error('offline'));
    db.getHelpInnovations.mockRejectedValue(new Error('db closed'));

    const { result } = renderHook(() => useHelpInnovations(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual([]);
  });

  it('always clears its loading flag', async () => {
    api.aiSearch.mockRejectedValue(new Error('offline'));
    db.getHelpInnovations.mockRejectedValue(new Error('db closed'));

    const { result } = renderHook(() => useHelpInnovations(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
