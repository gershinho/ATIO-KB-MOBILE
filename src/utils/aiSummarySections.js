/**
 * Split a comparison summary into the sections the backend was asked to write.
 *
 * The prompt requests "use case(s)", "approach" and "complexity + cost", but a
 * language model spells those back inconsistently — numbered or not, singular
 * or plural, `+` or `/`. The header pattern absorbs that variation and
 * SECTION_DISPLAY_NAMES maps what survives onto one display spelling.
 */

const SECTION_DISPLAY_NAMES = {
  'use case': 'Use Case',
  'use cases': 'Use Case',
  approach: 'Approach',
  'complexity+cost': 'Complexity/Cost',
};

/**
 * The trailing separator is `:?[ \t]*` rather than `[:\s]*` deliberately. `\s`
 * matches newlines, so a greedy run consumed the line break that the *next*
 * header needs for its own `(?:^|\n)` anchor — meaning a header on the line
 * directly below another was never recognised, and its text was folded into the
 * section above it.
 */
const SECTION_HEADERS =
  /(?:^|\n)\s*(?:\d+\)\s*)?(USE CASE[S]?|APPROACH|COMPLEXITY\s*[+/]\s*COST)\s*:?[ \t]*/gi;

/**
 * Collapse a captured header to a lookup key. The `+`/`/` separator and the
 * spacing around it vary run to run, so both are normalised away rather than
 * enumerated: the display table previously listed `complexity + cost` spaced
 * and `complexity/cost` unspaced, so the two spellings it did not list fell
 * through and rendered as raw shouted capitals.
 */
function toLookupKey(rawTitle) {
  return rawTitle
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*[+/]\s*/g, '+')
    .trim();
}

/**
 * @param {string} summary
 * @returns {Array<{title: string, content: string}>} one entry per recognised
 *   section, or a single "Summary" entry holding the whole text when the
 *   response carried no headers at all. Empty for no usable input.
 */
export function parseAiSummarySections(summary) {
  if (!summary || typeof summary !== 'string') return [];
  const normalized = summary.trim();
  if (!normalized) return [];

  // String.split with a capturing group interleaves [before, capture, after, …],
  // so the headers land on odd indices and their bodies on the following even one.
  const parts = normalized.split(SECTION_HEADERS);
  const sections = [];
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const rawTitle = (parts[i] || '').trim();
    const content = (parts[i + 1] || '').trim();
    if (!rawTitle || !content) continue;
    const key = toLookupKey(rawTitle);
    sections.push({ title: SECTION_DISPLAY_NAMES[key] || rawTitle, content });
  }

  if (sections.length === 0) return [{ title: 'Summary', content: normalized }];
  return sections;
}
