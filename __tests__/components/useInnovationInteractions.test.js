import React from 'react';
import { Alert } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import useInnovationInteractions from '../../src/hooks/useInnovationInteractions';
import { BookmarkCountContext } from '../../src/context/BookmarkCountContext';
import { DownloadContext } from '../../src/context/DownloadContext';
import * as localState from '../../src/storage/localState';
import * as engagement from '../../src/database/engagement';

jest.mock('../../src/storage/localState', () => ({
  readBookmarks: jest.fn().mockResolvedValue([]),
  writeBookmarks: jest.fn().mockResolvedValue(true),
  readDownloads: jest.fn().mockResolvedValue([]),
  writeDownloads: jest.fn().mockResolvedValue(true),
  readLikedIds: jest.fn().mockResolvedValue(new Set()),
  writeLikedIds: jest.fn().mockResolvedValue(true),
}));

const refreshBookmarkCount = jest.fn();
const downloadContext = {
  downloadJustCompleted: false,
  triggerDownloadStart: jest.fn(),
  triggerDrainStart: jest.fn(),
  triggerDownloadComplete: jest.fn(),
};

function wrapper({ children }) {
  return (
    <BookmarkCountContext.Provider value={{ bookmarkCount: 0, refreshBookmarkCount }}>
      <DownloadContext.Provider value={downloadContext}>
        {children}
      </DownloadContext.Provider>
    </BookmarkCountContext.Provider>
  );
}

const innovation = (id, extra = {}) => ({
  id,
  title: `Innovation ${id}`,
  thumbsUpCount: 5,
  commentCount: 2,
  ...extra,
});

/** Render the hook and let its mount effects (bookmarks, likes) settle. */
async function renderInteractions() {
  const utils = renderHook(() => useInnovationInteractions(), { wrapper });
  await waitFor(() => expect(localState.readLikedIds).toHaveBeenCalled());
  return utils;
}

beforeEach(() => {
  jest.clearAllMocks();
  localState.readBookmarks.mockResolvedValue([]);
  localState.writeBookmarks.mockResolvedValue(true);
  localState.readLikedIds.mockResolvedValue(new Set());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('useInnovationInteractions — the count overlay', () => {
  it('leaves an innovation untouched when nothing has changed', async () => {
    const { result } = await renderInteractions();
    const original = innovation(1);
    // Same object back, not a copy: list rows can rely on identity.
    expect(result.current.withCounts(original)).toBe(original);
  });

  it('tolerates being handed null', async () => {
    const { result } = await renderInteractions();
    expect(result.current.withCounts(null)).toBeNull();
  });

  it('adds a like to the rendered count', async () => {
    const { result } = await renderInteractions();
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });
    expect(result.current.withCounts(innovation(1)).thumbsUpCount).toBe(6);
  });

  it('applies the same delta to every copy of that innovation', async () => {
    // The reason the delta is not written into the lists: the same innovation
    // can be sitting in results, in recents and in a drilldown at once.
    const { result } = await renderInteractions();
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });

    const inResults = result.current.withCounts(innovation(1));
    const inRecents = result.current.withCounts(innovation(1));
    expect(inResults.thumbsUpCount).toBe(inRecents.thumbsUpCount);
  });

  it('does not touch a different innovation', async () => {
    const { result } = await renderInteractions();
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });
    expect(result.current.withCounts(innovation(2)).thumbsUpCount).toBe(5);
  });

  it('returns to the original count when the like is taken back', async () => {
    const { result } = await renderInteractions();
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });
    expect(result.current.withCounts(innovation(1)).thumbsUpCount).toBe(5);
  });

  it('never renders a negative count', async () => {
    localState.readLikedIds.mockResolvedValue(new Set([1]));
    const { result } = await renderInteractions();
    await waitFor(() => expect(result.current.isLiked(1)).toBe(true));
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });
    expect(result.current.withCounts(innovation(1, { thumbsUpCount: 0 })).thumbsUpCount).toBe(0);
  });

  it('counts an added comment', async () => {
    const { result } = await renderInteractions();
    act(() => { result.current.handleCommentAdded(1); });
    expect(result.current.withCounts(innovation(1)).commentCount).toBe(3);
  });

  it('keeps like and comment deltas independent for one innovation', async () => {
    const { result } = await renderInteractions();
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });
    act(() => { result.current.handleCommentAdded(1); });

    const adjusted = result.current.withCounts(innovation(1));
    expect(adjusted.thumbsUpCount).toBe(6);
    expect(adjusted.commentCount).toBe(3);
  });
});

describe('useInnovationInteractions — likes', () => {
  it('increments on the way in and decrements on the way out', async () => {
    const { result } = await renderInteractions();
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });
    expect(engagement.incrementThumbsUp).toHaveBeenCalledWith(1);

    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });
    expect(engagement.decrementThumbsUp).toHaveBeenCalledWith(1);
  });

  it('never increments twice for the same device', async () => {
    // The invariant the database layer documents, and which one screen used to
    // break by incrementing on every tap.
    const { result } = await renderInteractions();
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });

    expect(engagement.incrementThumbsUp).toHaveBeenCalledTimes(2);
    expect(engagement.decrementThumbsUp).toHaveBeenCalledTimes(1);
  });

  it('persists the liked set once per toggle', async () => {
    const { result } = await renderInteractions();
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });
    expect(localState.writeLikedIds).toHaveBeenCalledTimes(1);
    expect(localState.writeLikedIds).toHaveBeenCalledWith(new Set([1]));
  });

  it('survives the database write failing', async () => {
    engagement.incrementThumbsUp.mockRejectedValueOnce(new Error('locked'));
    const { result } = await renderInteractions();
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });
    expect(result.current.isLiked(1)).toBe(true);
  });

  it('ignores a missing innovation', async () => {
    const { result } = await renderInteractions();
    await act(async () => { await result.current.handleThumbsUp(null); });
    expect(engagement.incrementThumbsUp).not.toHaveBeenCalled();
  });
});

describe('useInnovationInteractions — bookmarks', () => {
  it('saves a bookmark and refreshes the tab badge', async () => {
    const { result } = await renderInteractions();
    await act(async () => { await result.current.toggleBookmark(innovation(1)); });

    expect(localState.writeBookmarks).toHaveBeenCalledWith([
      expect.objectContaining({ id: 1, bookmarkedAt: expect.any(Number) }),
    ]);
    expect(result.current.isBookmarked(1)).toBe(true);
    expect(refreshBookmarkCount).toHaveBeenCalled();
  });

  it('removes a bookmark that is already saved', async () => {
    localState.readBookmarks.mockResolvedValue([innovation(1)]);
    const { result } = await renderInteractions();
    await waitFor(() => expect(result.current.isBookmarked(1)).toBe(true));

    await act(async () => { await result.current.toggleBookmark(innovation(1)); });
    expect(localState.writeBookmarks).toHaveBeenCalledWith([]);
    expect(result.current.isBookmarked(1)).toBe(false);
  });

  it('does not show a bookmark that failed to save', async () => {
    localState.writeBookmarks.mockResolvedValue(false);
    const { result } = await renderInteractions();
    await act(async () => { await result.current.toggleBookmark(innovation(1)); });

    expect(result.current.isBookmarked(1)).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('Could not save bookmark', expect.any(String));
  });
});

describe('useInnovationInteractions — drawer and comments', () => {
  it('opens the drawer on the innovation it was given', async () => {
    const { result } = await renderInteractions();
    act(() => { result.current.openDrawer(innovation(1)); });

    expect(result.current.drawerVisible).toBe(true);
    expect(result.current.selectedInnovation.id).toBe(1);
    expect(result.current.drawerStartExpanded).toBe(false);
  });

  it('can open the drawer already expanded', async () => {
    const { result } = await renderInteractions();
    act(() => { result.current.openDrawer(innovation(1), true); });
    expect(result.current.drawerStartExpanded).toBe(true);
  });

  it('shows the drawer the adjusted count, not the stale one', async () => {
    const { result } = await renderInteractions();
    act(() => { result.current.openDrawer(innovation(1)); });
    await act(async () => { await result.current.handleThumbsUp(innovation(1)); });
    expect(result.current.selectedInnovation.thumbsUpCount).toBe(6);
  });

  it('closes the drawer before showing comments', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useInnovationInteractions(), { wrapper });
    act(() => { result.current.openDrawer(innovation(1)); });
    act(() => { result.current.openComments(innovation(1)); });

    expect(result.current.drawerVisible).toBe(false);
    expect(result.current.commentsInnovation).toBeNull();

    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current.commentsInnovation.id).toBe(1);
    jest.useRealTimers();
  });
});

describe('useInnovationInteractions — downloads', () => {
  it('announces the start of a download', async () => {
    const { result } = await renderInteractions();
    act(() => { result.current.addDownload(innovation(1)); });

    expect(downloadContext.triggerDownloadStart).toHaveBeenCalledWith(1);
    expect(result.current.downloadToast).toMatchObject({ id: 1, progress: 0 });
  });

  it('refuses to start a second download while one is running', async () => {
    const { result } = await renderInteractions();
    act(() => { result.current.addDownload(innovation(1)); });
    act(() => { result.current.addDownload(innovation(2)); });

    expect(downloadContext.triggerDownloadStart).toHaveBeenCalledTimes(1);
    expect(result.current.downloadToast.id).toBe(1);
  });

  it('ignores a missing innovation', async () => {
    const { result } = await renderInteractions();
    act(() => { result.current.addDownload(null); });
    expect(result.current.downloadToast).toBeNull();
  });
});
