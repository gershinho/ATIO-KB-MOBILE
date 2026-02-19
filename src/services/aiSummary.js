const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 15000;
const MAX_DESCRIPTION_CHARS = 1500;
const COMPARISON_MAX_CHARS = 800;
const SINGLE_SUMMARY_MAX_CHARS = 280;
const MAX_RESPONSE_TOKENS = 220;
const SINGLE_SUMMARY_MAX_TOKENS = 80;

function getDescription(item) {
  const text = item.longDescription || item.shortDescription || '';
  return typeof text === 'string' ? text.trim() : '';
}

function truncateForPrompt(text, maxChars = MAX_DESCRIPTION_CHARS) {
  if (!text || text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '…';
}

const COMPARISON_SYSTEM = `You write concise, mobile-friendly comparison summaries. We strongly recommend keeping your entire response under ${COMPARISON_MAX_CHARS} characters (including spaces). Aim to stay under this; going a few words over is acceptable, but try to be concise.

You may ONLY use the long description text provided. Do not use or assume any metadata (e.g. cost, adoption, readiness, region, owner). Infer everything from the descriptions only.

Structure your reply in three clearly separated sections. Use short section labels and line breaks so the information is easy to scan. Use bullet points with "•" only (do not use "-" for bullets). Be concise. Plain text only; no markdown or code blocks. No filler, no hype.`;

/**
 * Generates a comparison summary from long descriptions only: use case(s), approach, then complexity + cost (all inferred from text). Output capped at 800 characters.
 * @param {Object} item1 - Innovation with longDescription (and optionally shortDescription)
 * @param {Object} item2 - Innovation with longDescription (and optionally shortDescription)
 * @returns {Promise<{ summary: string }>}
 */
export async function generateComparisonSummary(item1, item2) {
  const desc1 = getDescription(item1);
  const desc2 = getDescription(item2);

  if (!desc1 && !desc2) {
    return { summary: 'No descriptions available to compare.' };
  }

  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Missing API key. Set EXPO_PUBLIC_OPENAI_API_KEY in .env');
  }

  const text1 = truncateForPrompt(desc1);
  const text2 = truncateForPrompt(desc2);
  const name1 = (item1.title || 'First solution').trim() || 'First solution';
  const name2 = (item2.title || 'Second solution').trim() || 'Second solution';

  const userContent = `Compare these two innovations using ONLY the description text below. We strongly recommend keeping your reply under ${COMPARISON_MAX_CHARS} characters (including spaces). Aim for that; a few words over is fine. Do not use any metadata; infer everything from the descriptions only. Use bullet points with "•" only (not "-").

IMPORTANT: Always refer to the innovations by their actual names: "${name1}" and "${name2}". Do not use "Innovation A", "Innovation B", "A", or "B" in your response.

Output three sections, clearly separated. Use exactly these section labels (with this capitalization): "Use Case", "Approach", "Complexity/Cost".

1) Use Case
   Infer from the descriptions: what use case(s) do these innovations address? One or two short lines. Use "•" for any bullets. Use the innovation names "${name1}" and "${name2}".

2) Approach
   How does "${name1}" approach solving it? How does "${name2}"? One or two short • bullets per innovation, from the descriptions only. Use these names.

3) Complexity/Cost
   Infer from the description text only: complexity and cost implications for each innovation. Keep it short. Use "•" for bullets. Use the names "${name1}" and "${name2}".

--- "${name1}" description ---
${text1 || '(No description)'}

--- "${name2}" description ---
${text2 || '(No description)'}

Reply with the three sections only. Plain text, no markdown. Use "•" for all bullet points. Always use "${name1}" and "${name2}" instead of A/B.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: COMPARISON_SYSTEM },
          { role: 'user', content: userContent },
        ],
        // Note: gpt-5-mini with chat/completions does not allow max_tokens,
        // so we rely on the strong character limits in the prompt instead.
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(res.status === 401 ? 'Invalid API key' : `Summary request failed: ${res.status} ${errBody.slice(0, 100)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content == null || typeof content !== 'string') {
      throw new Error('Invalid response from API');
    }

    return { summary: content.trim() };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Try again.');
    }
    throw err;
  }
}

const SINGLE_SYSTEM = `You write ultra-concise, mobile-friendly summaries. We strongly recommend keeping your entire response under ${SINGLE_SUMMARY_MAX_CHARS} characters (including spaces). Aim to stay under this; going a few words over is acceptable, but try to be concise.

CONTENT: Base your answer ONLY on the long text description provided. Do NOT assume or mention cost, adoption, readiness, region, owner, scale, or performance. No paragraphs, no long sentences. Plain language only. No filler, no hype. Output plain text only; no markdown. Use "•" or "-" for bullets and be consistent.

FORMAT (aim for under ${SINGLE_SUMMARY_MAX_CHARS} chars total):
1. One-line verdict (≤60 chars).
2. Up to 3 short bullet points (≤7 words each).
3. One short "Next step:" hint (≤40 chars).`;

/**
 * Generates a single-innovation summary from long description only. Output capped at 280 characters.
 * @param {Object} item - Innovation with longDescription (and optionally shortDescription)
 * @returns {Promise<{ summary: string }>}
 */
export async function generateSingleSummary(item) {
  const desc = getDescription(item);
  if (!desc) return { summary: 'No description available.' };

  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Missing API key. Set EXPO_PUBLIC_OPENAI_API_KEY in .env');
  }

  const text = truncateForPrompt(desc);
  const userContent = `Summarize this innovation using ONLY the description below. We strongly recommend keeping your reply under ${SINGLE_SUMMARY_MAX_CHARS} characters (including spaces). Aim for that; a few words over is fine.

--- Description ---
${text}

Reply with: 1) One-line verdict (≤60 chars). 2) Up to 3 bullets (≤7 words each). 3) "Next step:" hint (≤40 chars). Plain text only.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: SINGLE_SYSTEM },
          { role: 'user', content: userContent },
        ],
        // max_tokens not supported for gpt-5-mini on chat/completions;
        // prompt already enforces a tight character budget.
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(res.status === 401 ? 'Invalid API key' : `Summary request failed: ${res.status} ${errBody.slice(0, 100)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content == null || typeof content !== 'string') {
      throw new Error('Invalid response from API');
    }

    return { summary: content.trim() };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Try again.');
    }
    throw err;
  }
}
