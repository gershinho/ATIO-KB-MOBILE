/**
 * The one place a request to Gemini is made, for both the Express backend and
 * the Supabase Edge Functions.
 *
 * Plain ESM over `fetch` and the REST API, no SDK and no runtime globals, so
 * Node 24 (`require` of ESM) and Deno load the same file.
 *
 * Model: GEMINI_MODEL, defaulting to gemini-3.6-flash — the newest stable
 * Flash that reliably honours `thinkingBudget: 0`. Thinking is turned off
 * because these prompts were written for gpt-4o-mini with tight token caps
 * (80 for search expansion, 220 for a comparison): a thinking model spends the
 * cap on thoughts and returns a fragment. Measured 8 October: gemini-3.8-flash
 * ignores the setting and thinks anyway; gemini-3.7-flash honours it about one
 * call in three; 3.6 honoured it six times out of six, median 1.1 s.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Gemini's finish reasons, in the vocabulary the callers were written for. */
function finishReason(reason) {
  if (reason === 'STOP') return 'stop';
  if (reason === 'MAX_TOKENS') return 'length';
  return reason ? String(reason).toLowerCase() : null;
}

/** Audio types by file extension, for transcription. The phone records m4a. */
const AUDIO_TYPES = {
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mp3',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aiff': 'audio/aiff',
  '.webm': 'audio/webm',
};

export function audioTypeFor(extension) {
  return AUDIO_TYPES[String(extension || '').toLowerCase()] || 'audio/mp4';
}

const TRANSCRIBE_SYSTEM =
  'Transcribe the speech in this audio recording verbatim, in the language spoken. ' +
  'Return only the transcript text, with no commentary, labels or quotation marks. ' +
  'If there is no intelligible speech, return nothing.';

/**
 * A Gemini client, or one that reports itself unavailable.
 *
 * @param {object} options
 * @param {string} [options.apiKey] - GEMINI_API_KEY; blank means unavailable
 * @param {string} [options.model]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {{
 *   available: boolean,
 *   model: string,
 *   generate: (req: {system?: string, user: string, temperature?: number, maxTokens?: number})
 *     => Promise<{text: string|null, finishReason: string|null}>,
 *   transcribe: (req: {data: string, mimeType: string}) => Promise<string>,
 * }}
 */
export function createAi({ apiKey, model, fetchImpl } = {}) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  const chosen = (typeof model === 'string' && model.trim()) || DEFAULT_GEMINI_MODEL;
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args));

  async function call(body) {
    if (!key) throw new Error('GEMINI_API_KEY is not set');
    const response = await doFetch(`${API}/${encodeURIComponent(chosen)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      /* not JSON */
    }
    if (!response.ok) {
      const detail = payload?.error?.message || `HTTP ${response.status}`;
      const error = new Error(`Gemini ${response.status}: ${detail}`);
      error.status = response.status;
      throw error;
    }
    const candidate = payload?.candidates?.[0];
    const parts = candidate?.content?.parts;
    // A blocked or empty answer has no text parts. Reported as null, the way an
    // OpenAI choice with no content was, so callers keep their own handling.
    const text = Array.isArray(parts)
      ? parts.filter((p) => typeof p?.text === 'string' && !p.thought).map((p) => p.text).join('')
      : null;
    return { text: Array.isArray(parts) ? text : null, finishReason: finishReason(candidate?.finishReason) };
  }

  const generationConfig = ({ temperature, maxTokens }) => ({
    ...(temperature != null ? { temperature } : {}),
    ...(maxTokens != null ? { maxOutputTokens: maxTokens } : {}),
    thinkingConfig: { thinkingBudget: 0 },
  });

  return {
    available: Boolean(key),
    model: chosen,

    generate({ system, user, temperature, maxTokens }) {
      return call({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: generationConfig({ temperature, maxTokens }),
      });
    },

    async transcribe({ data, mimeType }) {
      const { text } = await call({
        systemInstruction: { parts: [{ text: TRANSCRIBE_SYSTEM }] },
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data } }] }],
        generationConfig: generationConfig({ temperature: 0, maxTokens: 1000 }),
      });
      return (text || '').trim();
    },
  };
}
