/**
 * Comparison summaries for the bookmarks compare view.
 *
 * The prompt, model choice and OpenAI credential all live on the backend
 * (POST /api/compare-summary). This module previously called api.openai.com
 * directly using EXPO_PUBLIC_OPENAI_API_KEY; Expo inlines EXPO_PUBLIC_* values
 * into the shipped JS bundle, so that key was readable from any build.
 *
 * The request itself moved to services/api.js, which is where every outbound
 * call belongs — this module hand-rolled its own fetch, timeout and error
 * translation while api.js's header claimed to be the only place that calls
 * fetch. What is left here is the part that is actually about comparisons:
 * which text to compare, and what to do when there is none.
 */
import { compareSummary } from './api';

function getDescription(item) {
  const text = item?.longDescription || item?.shortDescription || '';
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * Generates a comparison summary from long descriptions only: use case(s),
 * approach, then complexity + cost (all inferred from text).
 *
 * @param {Object} innovationA - Innovation with longDescription (and optionally shortDescription)
 * @param {Object} innovationB - Innovation with longDescription (and optionally shortDescription)
 * @returns {Promise<{ summary: string }>}
 */
export async function generateComparisonSummary(innovationA, innovationB) {
  const descriptionA = getDescription(innovationA);
  const descriptionB = getDescription(innovationB);

  if (!descriptionA && !descriptionB) {
    return { summary: 'No descriptions available to compare.' };
  }

  return compareSummary(innovationA, innovationB, descriptionA, descriptionB);
}
