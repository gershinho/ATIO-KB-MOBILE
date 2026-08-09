/**
 * Comparison summaries for the bookmarks compare view.
 *
 * The prompt, model choice and OpenAI credential all live on the backend
 * (POST /api/compare-summary). This module previously called api.openai.com
 * directly using EXPO_PUBLIC_OPENAI_API_KEY; Expo inlines EXPO_PUBLIC_* values
 * into the shipped JS bundle, so that key was readable from any build.
 */
import { SEARCH_API_URL } from './api';

const TIMEOUT_MS = 35000; // matches the backend's comparison budget

function getDescription(item) {
  const text = item?.longDescription || item?.shortDescription || '';
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * Generates a comparison summary from long descriptions only: use case(s),
 * approach, then complexity + cost (all inferred from text).
 *
 * @param {Object} item1 - Innovation with longDescription (and optionally shortDescription)
 * @param {Object} item2 - Innovation with longDescription (and optionally shortDescription)
 * @returns {Promise<{ summary: string }>}
 */
export async function generateComparisonSummary(item1, item2) {
  const description1 = getDescription(item1);
  const description2 = getDescription(item2);

  if (!description1 && !description2) {
    return { summary: 'No descriptions available to compare.' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${SEARCH_API_URL}/api/compare-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name1: item1?.title,
        name2: item2?.title,
        description1,
        description2,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text();
      let message = `Summary request failed: ${res.status} ${errBody.slice(0, 100)}`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed?.error) message = parsed.error;
      } catch {
        // non-JSON error body; keep the status-based message
      }
      throw new Error(message);
    }

    const data = await res.json();
    if (typeof data?.summary !== 'string') {
      throw new Error('Invalid response from API');
    }

    return { summary: data.summary };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
