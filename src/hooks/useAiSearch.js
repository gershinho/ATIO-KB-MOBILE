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

  const replaceResults = useCallback((next) => {
    resultsRef.current = next;
    setResults(next);
  }, []);

  const updateQuery = useCallback((text) => {
    liveQueryRef.current = text;
    setQuery(text);
  }, []);

  const run = useCallback(
    async (overrideQuery, forceRun = false) => {
      onRunStart?.();
      const raw = overrideQuery ?? liveQueryRef.current;
      const trimmed = (typeof raw === 'string' ? raw : '').trim();
      if (!trimmed) return;
      // Re-running the committed query is a no-op unless explicitly forced, so
      // a stray blur or re-focus does not re-bill the AI call.
      if (!forceRun && trimmed === committedQueryRef.current) return;
      if (overrideQuery) updateQuery(overrideQuery);

      setLoading(true);
      setHasSearched(true);
      setError(null);
      replaceResults([]);
      setHasMore(false);
      committedQueryRef.current = trimmed;
      try {
        const data = await aiSearch(trimmed, { offset: 0, limit: AI_PAGE_SIZE });
        replaceResults([...(data.results || [])].sort(byScoreDescending));
        setHasMore(data.hasMore || false);
      } catch (e) {
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
        setLoading(false);
      }
    },
    [onRunStart, replaceResults, updateQuery]
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await aiSearch(committedQueryRef.current, {
        offset: resultsRef.current.length,
        limit: AI_PAGE_SIZE,
      });
      replaceResults([...resultsRef.current, ...(data.results || [])].sort(byScoreDescending));
      setHasMore(data.hasMore || false);
    } catch (e) {
      log.degraded('Could not load the next page; keeping what is shown:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, replaceResults]);

  /** Return to the pre-search hero, e.g. when the Home tab is re-tapped. */
  const reset = useCallback(() => {
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
      run(undefined, true);
    }
  }, [isRecording, query, run]);

  return {
    query,
    updateQuery,
    liveQueryRef,
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
  };
}
