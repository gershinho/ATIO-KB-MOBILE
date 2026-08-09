import { useCallback, useContext, useEffect, useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import {
  readBookmarks, writeBookmarks,
  readDownloads, writeDownloads,
  readLikedIds, writeLikedIds,
} from '../storage/localState';
import { incrementThumbsUp, decrementThumbsUp } from '../database/db';
import { downloadInnovationToFile } from '../utils/downloadInnovation';
import { BookmarkCountContext } from '../context/BookmarkCountContext';
import { DownloadContext } from '../context/DownloadContext';

/**
 * Everything a screen needs to act on an innovation: bookmark it, like it,
 * download it, open its detail drawer, open its comments.
 *
 * ## Why the counts are an overlay
 *
 * Liking an innovation changes a number that is rendered in up to five places
 * at once — the card in the results list, the same card in "recent", the same
 * card in a drilldown, the detail drawer, and the comments modal header. Each
 * screen used to fan the delta out by hand:
 *
 *     setResults(adjust); setRecentInnovations(adjust); setDrilldownResults(adjust);
 *     setSelectedInnovation(...); setCommentsInnovation(...);
 *
 * Four screens each had their own version of that fan-out, and they disagreed:
 * one screen incremented on every tap instead of toggling, which broke the
 * one-like-per-device invariant the database layer documents.
 *
 * So the delta is not written into the lists at all. It is held here, keyed by
 * innovation id, and applied on the way out by `withCounts`. Lists stay exactly
 * as the data layer returned them, a screen can hold an innovation in as many
 * collections as it likes, and there is one place that decides what a like
 * means.
 *
 * @returns {object} interaction state and handlers
 */
export default function useInnovationInteractions() {
  const { refreshBookmarkCount } = useContext(BookmarkCountContext);
  const { triggerDownloadStart, triggerDrainStart, triggerDownloadComplete } =
    useContext(DownloadContext);

  const [bookmarkedIds, setBookmarkedIds] = useState(() => new Set());
  const [likedIds, setLikedIds] = useState(() => new Set());
  const [countDeltas, setCountDeltas] = useState({});

  const [selectedInnovation, setSelectedInnovation] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerStartExpanded, setDrawerStartExpanded] = useState(false);
  const [commentsInnovation, setCommentsInnovation] = useState(null);
  const [downloadToast, setDownloadToast] = useState(null);

  // —— persistence ————————————————————————————————————————————————

  const loadBookmarks = useCallback(async () => {
    const saved = await readBookmarks();
    setBookmarkedIds(new Set(saved.map((i) => i.id)));
  }, []);

  const loadLikes = useCallback(async () => {
    setLikedIds(await readLikedIds());
  }, []);

  useEffect(() => {
    loadBookmarks();
    loadLikes();
  }, [loadBookmarks, loadLikes]);

  // —— count overlay ——————————————————————————————————————————————

  const bumpCount = useCallback((id, field, delta) => {
    setCountDeltas((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: (prev[id]?.[field] ?? 0) + delta },
    }));
  }, []);

  /**
   * Apply any pending count deltas to an innovation before it is rendered.
   * Safe to call on null, and returns the original object unchanged when there
   * is nothing to apply, so it does not defeat memoized list rows.
   */
  const withCounts = useCallback(
    (innovation) => {
      if (!innovation) return innovation;
      const delta = countDeltas[innovation.id];
      if (!delta) return innovation;
      const adjusted = { ...innovation };
      if (delta.thumbsUpCount) {
        adjusted.thumbsUpCount = Math.max((innovation.thumbsUpCount ?? 0) + delta.thumbsUpCount, 0);
      }
      if (delta.commentCount) {
        adjusted.commentCount = Math.max((innovation.commentCount ?? 0) + delta.commentCount, 0);
      }
      return adjusted;
    },
    [countDeltas]
  );

  // —— actions ————————————————————————————————————————————————————

  const isBookmarked = useCallback((id) => bookmarkedIds.has(id), [bookmarkedIds]);
  const isLiked = useCallback((id) => likedIds.has(id), [likedIds]);

  const toggleBookmark = useCallback(
    async (innovation) => {
      if (!innovation) return;
      const id = innovation.id;
      const currentList = await readBookmarks();
      const alreadySaved = currentList.some((i) => i.id === id);
      const nextList = alreadySaved
        ? currentList.filter((i) => i.id !== id)
        : [{ ...innovation, bookmarkedAt: Date.now() }, ...currentList];

      // Only update UI state once the write is confirmed, so a storage failure
      // cannot leave the screen showing a bookmark that was never saved.
      if (!(await writeBookmarks(nextList))) {
        Alert.alert('Could not save bookmark', 'Please try again.');
        return;
      }
      setBookmarkedIds(new Set(nextList.map((i) => i.id)));
      refreshBookmarkCount();
    },
    [refreshBookmarkCount]
  );

  const handleThumbsUp = useCallback(
    async (innovation) => {
      if (!innovation) return;
      const id = innovation.id;
      const hasLiked = likedIds.has(id);
      try {
        if (hasLiked) await decrementThumbsUp(id);
        else await incrementThumbsUp(id);
      } catch (e) {
        console.log('[interactions] Thumbs up failed:', e);
      }

      bumpCount(id, 'thumbsUpCount', hasLiked ? -1 : 1);

      // Compute the next set once, persist it, then set state. Writing inside
      // the updater made it impure — React may call an updater more than once,
      // which would fire duplicate writes.
      const nextLiked = new Set(likedIds);
      if (hasLiked) nextLiked.delete(id);
      else nextLiked.add(id);
      setLikedIds(nextLiked);
      writeLikedIds(nextLiked);
    },
    [likedIds, bumpCount]
  );

  const handleCommentAdded = useCallback(
    (innovationId) => bumpCount(innovationId, 'commentCount', 1),
    [bumpCount]
  );

  const openDrawer = useCallback((innovation, startExpanded = false) => {
    setSelectedInnovation(innovation);
    setDrawerStartExpanded(startExpanded);
    setDrawerVisible(true);
  }, []);

  const closeDrawer = useCallback(() => setDrawerVisible(false), []);

  /** Hand off from the drawer to the comments modal, letting the drawer finish closing first. */
  const openComments = useCallback((innovation) => {
    Keyboard.dismiss();
    setDrawerVisible(false);
    setTimeout(() => setCommentsInnovation(innovation), 300);
  }, []);

  const closeComments = useCallback(() => setCommentsInnovation(null), []);

  // —— download pipeline ——————————————————————————————————————————

  const addDownload = useCallback(
    (innovation) => {
      if (!innovation) return;
      if (downloadToast) return; // one at a time
      triggerDownloadStart(innovation.id);
      setDownloadToast({ id: innovation.id, title: innovation.title, progress: 0, innovation });
    },
    [downloadToast, triggerDownloadStart]
  );

  // The toast's fields are read out here so the two effects below can depend on
  // exactly what they use. Depending on the whole object would restart both on
  // every progress tick; depending on `downloadToast?.id` while *referencing*
  // `downloadToast` is what the exhaustive-deps warning was pointing at.
  const toastId = downloadToast?.id;
  const toastProgress = downloadToast?.progress;
  const toastInnovation = downloadToast?.innovation;

  // Advance the fake progress bar. Keyed on id so restarting a download for a
  // different innovation restarts the timer rather than inheriting it.
  useEffect(() => {
    if (toastId == null) return;
    const interval = setInterval(() => {
      setDownloadToast((prev) => {
        if (!prev || prev.progress >= 100) return prev;
        const next = prev.progress + 4;
        return { ...prev, progress: next >= 100 ? 100 : next };
      });
    }, 80);
    return () => clearInterval(interval);
  }, [toastId]);

  useEffect(() => {
    if (!toastInnovation || toastProgress < 100) return;
    const innovation = toastInnovation;
    let cancelled = false;
    triggerDrainStart(innovation.id);
    (async () => {
      try {
        // Persist and drain (1.5s) in parallel so drain starts immediately
        await Promise.all([
          (async () => {
            const saved = await readDownloads();
            if (!saved.some((i) => i.id === innovation.id)) {
              await writeDownloads([{ ...innovation, downloadedAt: Date.now() }, ...saved]);
            }
          })(),
          new Promise((r) => setTimeout(r, 1500)),
        ]);
        if (cancelled) return;
        triggerDownloadComplete(innovation.id);

        await new Promise((r) => setTimeout(r, 500));
        // Best-effort export to a shareable file (PDF/text). If this fails, the
        // innovation remains available in the Downloads tab for offline viewing.
        if (cancelled) return;
        const result = await downloadInnovationToFile(innovation);
        if (!cancelled && !result.success) {
          Alert.alert(
            'Export failed',
            result.error || 'Saved in the Downloads tab, but the file could not be exported.'
          );
        }
      } catch (e) {
        if (!cancelled) {
          Alert.alert(
            'Export failed',
            e?.message || 'Solution is saved in the Downloads tab, but the file export failed.'
          );
        }
      } finally {
        if (!cancelled) setDownloadToast(null);
      }
    })();
    return () => { cancelled = true; };
  }, [toastId, toastProgress, toastInnovation, triggerDrainStart, triggerDownloadComplete]);

  return {
    // state
    bookmarkedIds,
    likedIds,
    selectedInnovation: withCounts(selectedInnovation),
    drawerVisible,
    drawerStartExpanded,
    commentsInnovation: withCounts(commentsInnovation),
    downloadToast,
    // derived
    isBookmarked,
    isLiked,
    withCounts,
    // actions
    reloadBookmarks: loadBookmarks,
    toggleBookmark,
    handleThumbsUp,
    handleCommentAdded,
    addDownload,
    openDrawer,
    closeDrawer,
    openComments,
    closeComments,
  };
}
