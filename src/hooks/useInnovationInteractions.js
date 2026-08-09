import { useCallback, useContext, useEffect, useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import {
  readBookmarks, writeBookmarks,
  readLikedIds, toggleLikedId,
} from '../storage/localState';
import { incrementThumbsUp, decrementThumbsUp } from '../database/engagement';
import { BookmarkCountContext } from '../context/BookmarkCountContext';
import useDownloadPipeline from './useDownloadPipeline';
import { createLogger } from '../utils/logger';

const log = createLogger('interactions');

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
  // The download pipeline is its own state machine and shares nothing with the
  // state below; it is called here only so screens keep one interactions object.
  const { addDownload } = useDownloadPipeline();

  const [bookmarkedIds, setBookmarkedIds] = useState(() => new Set());
  const [likedIds, setLikedIds] = useState(() => new Set());
  const [countDeltas, setCountDeltas] = useState({});

  const [selectedInnovation, setSelectedInnovation] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerStartExpanded, setDrawerStartExpanded] = useState(false);
  const [commentsInnovation, setCommentsInnovation] = useState(null);

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
        log.degraded('Could not record the like on the server:', e);
      }

      // Persist first, then render. toggleLikedId is localState's own
      // read-modify-write for this key and reports whether it stuck; the write
      // used to be fire-and-forget, so a failed save left the heart filled for
      // the session and silently reverted on the next launch.
      const { saved } = await toggleLikedId(id);
      if (!saved) {
        Alert.alert('Could not save that', 'Your like was not stored. Please try again.');
        return;
      }

      bumpCount(id, 'thumbsUpCount', hasLiked ? -1 : 1);
      const nextLiked = new Set(likedIds);
      if (hasLiked) nextLiked.delete(id);
      else nextLiked.add(id);
      setLikedIds(nextLiked);
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

  // bookmarkedIds and likedIds stay internal: isBookmarked/isLiked are the
  // questions callers actually ask, and returning the raw sets alongside them
  // implied some screen rendered one, which none did.
  return {
    // state
    selectedInnovation: withCounts(selectedInnovation),
    drawerVisible,
    drawerStartExpanded,
    commentsInnovation: withCounts(commentsInnovation),
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
