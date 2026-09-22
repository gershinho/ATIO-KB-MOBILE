import { useCallback, useEffect, useRef, useState } from 'react';
import { aiSearch, IS_DEV_API_HOST } from '../services/api';
import useSpeechToText from './useSpeechToText';
import { createLogger } from '../utils/logger';

const log = createLogger('search');

const AI_PAGE_SIZE = 5;

const byScoreDescending = (a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0);

/**
 * The AI search state machine: the query being typed, the committed query, the
 * page of results, and dictation.
 *
 * Kept free of view concerns so it can be exercised without a rendered screen.
 * The caller passes `onRunStart` for the things that are view concerns —
 * dismissing the keyboard, collapsing the expanded search bar.
 *
 * @param {{onRunStart?: () => void}} [options]
 */
export default function useAiSearch({ onRunStart } = {}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);

  // The text input is uncontrolled between renders during dictation, so the
  // live value is mirrored here for handlers that fire before state settles.
  const liveQueryRef = useRef('');
  const committedQueryRef = useRef('');
  // Mirrors `results` so loadMore can read the current length without taking
  // `results` as a dependency. The previous version depended on results.length
  // alone while closing over the whole array, so a like registered between
  // pages was reverted by the next append.
  const resultsRef = useRef([]);

  // Every request that writes results captures this before its await and checks
  // it after. Without it, a page in flight from loadMore landed after a new
  // run() had already cleared the list, appending the previous query's results
  // to the new query's — and setting hasMore from the stale response. The lists
  // call loadMore from onEndReached, so overlapping was always reachable.
  const requestIdRef = useRef(0);

  const replaceResults = useCallback((next) => {
    resultsRef.current = next;
    setResults(next);
  }, []);

  const updateQuery = useCallback((text) => {
    liveQueryRef.current = text;
    setQuery(text);
  }, []);

  /**
   * Run the committed search.
   *
   * There is no re-run dedupe here. There used to be a `forceRun` parameter
   * guarding one — "a stray blur or re-focus does not re-bill the AI call" —
   * but no blur or focus handler ever called `run`, and both real callers
   * (the submit handler and the post-dictation effect) passed `true`, so the
   * guard could not fire. Both of them also want a re-run of an unchanged
   * query: submitting the same text again is how a user retries after a
   * failure, and dictation lands the same text it just replaced.
   *
   * @param {string} [overrideQuery] - search this instead of the live input
   */
  const run = useCallback(
    async (overrideQuery) => {
      onRunStart?.();
      const raw = overrideQuery ?? liveQueryRef.current;
      const trimmed = (typeof raw === 'string' ? raw : '').trim();
      if (!trimmed) return;
      if (overrideQuery) updateQuery(overrideQuery);

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setHasSearched(true);
      setError(null);
      replaceResults([]);
      setHasMore(false);
      committedQueryRef.current = trimmed;
      try {
        const data = await aiSearch(trimmed, { offset: 0, limit: AI_PAGE_SIZE });
        if (requestId !== requestIdRef.current) return;
        replaceResults([...(data.results || [])].sort(byScoreDescending));
        setHasMore(data.hasMore || false);
      } catch (e) {
        if (requestId !== requestIdRef.current) return;
        log.failed('AI search failed:', e);
        // aiSearch already produces specific, user-appropriate messages. The old
        // code regex-matched over e.message and replaced anything network-shaped
        // with a developer instruction ("cd backend && npm run start"), which
        // shipped to end users. Show the real message; the dev hint goes to the
        // console, and only when actually running against a dev host.
        if (IS_DEV_API_HOST) {
          log.note('Dev hint: is the backend running? cd backend && npm run start');
        }
        setError(e.message || 'Search failed. Please try again.');
        replaceResults([]);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [onRunStart, replaceResults, updateQuery]
  );

  /**
   * Append the next page.
   *
   * Safe to call at any time, including while a new search is starting: a page
   * that lands after the query has moved on is discarded rather than appended.
   */
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const requestId = ++requestIdRef.current;
    setLoadingMore(true);
    try {
      const data = await aiSearch(committedQueryRef.current, {
        offset: resultsRef.current.length,
        limit: AI_PAGE_SIZE,
      });
      if (requestId !== requestIdRef.current) return;
      replaceResults([...resultsRef.current, ...(data.results || [])].sort(byScoreDescending));
      setHasMore(data.hasMore || false);
    } catch (e) {
      log.degraded('Could not load the next page; keeping what is shown:', e);
    } finally {
      // Always cleared, unlike `loading`: this flag has exactly one writer, so a
      // superseded page that skipped this would latch it true for the life of
      // the hook — and `if (loadingMore) return` above would then kill every
      // later page while the list pinned its footer spinner. A superseding
      // run/fetch owns `loading` and clears it itself; nothing else owns this.
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, replaceResults]);

  /** Return to the pre-search hero, e.g. when the Home tab is re-tapped. */
  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setHasSearched(false);
    updateQuery('');
    replaceResults([]);
    setHasMore(false);
    setError(null);
    committedQueryRef.current = '';
  }, [replaceResults, updateQuery]);

  // —— dictation ——————————————————————————————————————————————————

  const searchAfterSpeechRef = useRef(false);
  const {
    isListening: isRecording,
    isTranscribing,
    toggle: toggleSpeech,
    error: speechError,
    // Only the web twin sets this; undefined on native, so the mic renders.
    unavailable: speechUnavailable,
  } = useSpeechToText(
    useCallback(
      (text, isFinal) => {
        updateQuery(text);
        if (isFinal && text.trim()) searchAfterSpeechRef.current = true;
      },
      [updateQuery]
    )
  );

  // Voice failures used to be console-only, so a dead mic looked like a dead
  // button. Surface them through the same banner the search errors use.
  useEffect(() => {
    if (speechError) setError(speechError);
  }, [speechError]);

  // Run the search once dictation has finished and its final text has landed.
  useEffect(() => {
    if (searchAfterSpeechRef.current && query.trim() && !isRecording) {
      searchAfterSpeechRef.current = false;
      run();
    }
  }, [isRecording, query, run]);

  return {
    query,
    updateQuery,
    results,
    loading,
    loadingMore,
    hasSearched,
    hasMore,
    error,
    run,
    loadMore,
    reset,
    isRecording,
    isTranscribing,
    toggleSpeech,
    speechUnavailable,
  };
}
