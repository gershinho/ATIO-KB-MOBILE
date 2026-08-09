import { useEffect, useState } from 'react';
import { generateComparisonSummary } from '../services/aiSummary';
import { createLogger } from '../utils/logger';

const log = createLogger('compare');

/**
 * Fetch the AI comparison summary, with a retry.
 *
 * Deliberately holds no preconditions of its own. BookmarksScreen used to check
 * both "are there any descriptions" and "is EXPO_PUBLIC_OPENAI_API_KEY set"
 * before calling, duplicating the first check and its literal error string from
 * the service, and getting the second one wrong: the OpenAI credential moved to
 * the backend, so that variable is unset in every correctly configured build.
 * The screen was refusing to run a feature that would have worked.
 */
export default function useComparisonSummary(innovationA, innovationB) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError(null);
    setLoading(true);

    generateComparisonSummary(innovationA, innovationB)
      .then((result) => {
        if (cancelled) return;
        setSummary(result.summary);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        // Log before rendering: the message is now user-facing copy, so the
        // status and response body live on `cause` and this is the only place
        // they are recorded.
        log.failed('Comparison summary failed:', err, err?.cause);
        setError(err?.message || 'Could not generate summary');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [innovationA, innovationB, retryCount]);

  return { summary, loading, error, retry: () => setRetryCount((count) => count + 1) };
}

