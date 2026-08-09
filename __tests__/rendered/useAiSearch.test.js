import { renderHook, act, waitFor } from '@testing-library/react-native';
import useAiSearch from '../../src/hooks/useAiSearch';
import * as api from '../../src/services/api';

const result = (id) => ({ id, title: `Result ${id}`, matchScore: 1 });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useAiSearch — overlapping requests', () => {
  /**
   * The lists call loadMore from onEndReached, so a page can always be in flight
   * when a new search starts. Both writes read the results array after their
   * await, so the late one used to append the previous query's rows to the new
   * query's list and set hasMore from the stale response.
   */
  it('discards a page that lands after a new search started', async () => {
    let releaseLoadMore;
    api.aiSearch
      // initial search
      .mockResolvedValueOnce({ results: [result(1)], hasMore: true })
      // loadMore — held open
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          releaseLoadMore = () => resolve({ results: [result(2)], hasMore: true });
        })
      )
      // the new search that overtakes it
      .mockResolvedValueOnce({ results: [result(9)], hasMore: false });

    const { result: hook } = renderHook(() => useAiSearch());

    act(() => { hook.current.updateQuery('first'); });
    await act(async () => { await hook.current.run(); });
    expect(hook.current.results.map((r) => r.id)).toEqual([1]);

    // Page two starts...
    let pending;
    act(() => { pending = hook.current.loadMore(); });

    // ...and a new search finishes before it does.
    act(() => { hook.current.updateQuery('second'); });
    await act(async () => { await hook.current.run(); });
    expect(hook.current.results.map((r) => r.id)).toEqual([9]);

    await act(async () => { releaseLoadMore(); await pending; });

    expect(hook.current.results.map((r) => r.id)).toEqual([9]);
    expect(hook.current.hasMore).toBe(false);
  });

  it('appends a page that lands while the same search is still current', async () => {
    api.aiSearch
      .mockResolvedValueOnce({ results: [result(1)], hasMore: true })
      .mockResolvedValueOnce({ results: [result(2)], hasMore: false });

    const { result: hook } = renderHook(() => useAiSearch());
    act(() => { hook.current.updateQuery('first'); });
    await act(async () => { await hook.current.run(); });
    await act(async () => { await hook.current.loadMore(); });

    expect(hook.current.results.map((r) => r.id)).toEqual([1, 2]);
    expect(hook.current.hasMore).toBe(false);
  });

  it('drops an in-flight search when reset clears the session', async () => {
    let release;
    api.aiSearch.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ results: [result(1)], hasMore: true }); })
    );

    const { result: hook } = renderHook(() => useAiSearch());
    act(() => { hook.current.updateQuery('first'); });

    let pending;
    act(() => { pending = hook.current.run(); });
    act(() => { hook.current.reset(); });
    await act(async () => { release(); await pending; });

    expect(hook.current.results).toEqual([]);
    expect(hook.current.hasSearched).toBe(false);
  });
});

describe('useAiSearch — boundary', () => {
  it('does not hand out its internal live-query ref', async () => {
    const { result: hook } = renderHook(() => useAiSearch());
    await waitFor(() => expect(hook.current).toBeTruthy());
    expect(hook.current.liveQueryRef).toBeUndefined();
  });
});
