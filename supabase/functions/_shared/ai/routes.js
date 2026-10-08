/**
 * The AI half of search and the two summaries, shared by the Express backend
 * (backend/server.js) and the Supabase Edge Functions (supabase/functions/*).
 *
 * Moved out of backend/server.js with its prompts, limits, response shapes and
 * degradations unchanged; only the model call is new — Gemini through
 * gemini.js instead of the OpenAI SDK. Each route handler takes the parsed
 * request body and an `ai` client from createAi(), and returns
 * {status, body} for the host to send.
 *
 * Strict rule, as before: ranking sees only anonymised description text (see
 * sanitize.js). The comparison summary is the one deliberate exception — it
 * names the two innovations, because the product's summary refers to them by
 * name.
 */
import { buildSanitizedDocs } from './sanitize.js';

// ---------------------------------------------------------------------------
// Stopwords: English function words and generic terms that dilute FTS.
// We do NOT strip query-critical terms for ATIO innovations search:
//   Target users: farmer, farmers, smallholder, smallholders, producer, producers, women
//   Scale/context: small, rural, urban, community, communities
//   Actions/goals: reduce, improve, increase, prevent (and inflections)
//   Solution-seeking: solution, solutions; method, methods; practice, practices
//   Topics/outcomes: training, education, development, access
// These are kept so queries like "reduce losses", "solution for small farmers", "rural training" retain intent.
// ---------------------------------------------------------------------------
export const STOPWORDS = new Set([
  // English function words
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','up','about','into','through','during','before','after',
  'is','am','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','shall','should','may','might','must',
  'can','could','i','me','my','we','our','you','your','he','she','it',
  'they','them','their','this','that','these','those','what','which',
  'who','whom','how','when','where','why','not','no','so','if','then',
  'than','too','very','just','also','more','most','some','any','all',
  'each','every','both','few','many','much','own','same','other',
  'need','want','like','find','help','get','make','use','know',
  'such','well','only','over','under','between','out','there','here',
  'its','his','her','been','being','does','done','got','made','used',
  'using','based','new','way','ways','able','often','still','even',
  'while','since','because','although','though','however','therefore',
  'thus','hence','yet','already','really','actually','especially',
  'particularly','specifically','generally','usually','typically',
  'currently','recently','often','always','never','sometimes',
  // Common verbs (exclude reduce, improve, increase, prevent — user intent e.g. "reduce losses", "improve yield")
  'provide','provides','provided','providing','include','includes',
  'included','including','develop','develops','developed','developing',
  'support','supports','supported','supporting','promote','promotes','promoted','promoting',
  'ensure','ensures','ensured','ensuring','enable','enables','enabled','enabling',
  'allow','allows','allowed','allowing','create','creates','created','creating',
  'offer','offers','offered','offering','require','requires','required','requiring',
  'involve','involves','involved','involving','address','addresses',
  'addressed','addressing','contribute','contributes','contributed',
  'contributing','lead','leads','leading','result','results','resulting',
  'show','shows','showed','shown','showing','give','gives','given',
  'giving','take','takes','taken','taking','work','works','worked',
  'working','become','becomes','became','becoming','keep','keeps',
  'kept','keeping','begin','begins','began','beginning','start',
  'starts','started','starting','continue','continues','continued',
  'continuing','consider','considers','considered','considering',
  // Common nouns/adjectives (exclude target users, scale, context — see comment at top)
  'approach','approaches','system','systems',
  'process','processes','program','programme',
  'programs','programmes','project','projects','activity','activities',
  'area','areas','level','levels','type','types','form','forms',
  'part','parts','case','cases','example','examples','number','numbers',
  'group','groups','country','countries','region','regions','local',
  'national','international','global',
  'people','population','household','households',
  'large','high','low','good','best','better','important',
  'significant','major','key','main','different','various','several',
  'available','possible','potential','effective','efficient',
  'sustainable','traditional','modern','common','specific','particular',
  'general','overall','total','average','basic','simple','complex',
  'related','relevant','appropriate','suitable','necessary','essential',
  // Domain terms that appear in a huge fraction of innovations (>20%).
  // Exclude: solution, training, education, development, access, method, practice — query-critical for ATIO.
  'agriculture','agricultural','farming','food','production',
  'land','plant','plants','management','technology','technologies',
  'innovation','innovations','technique','techniques','knowledge','information','data','research',
  'study','studies','implementation','adoption','resource','resources',
  'service','services','product','products','material','materials',
  'equipment','tool','tools',
]);

export function extractQueryTerms(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// ---------------------------------------------------------------------------
// Query translation: detect non-English queries and translate to English
// so FTS (English-indexed) and the LLM ranking work correctly.
// When getExpansion is true and we call the API, also ask for 5-8 search
// keywords in English to avoid a second round-trip for query expansion.
// Returns { query, expanded } when getExpansion is true; otherwise returns
// the query string only (backward compatible).
// ---------------------------------------------------------------------------
export async function translateIfNeeded(ai, query, options = {}) {
  const asciiRatio = query.replace(/[^a-zA-Z]/g, '').length / Math.max(query.length, 1);
  const getExpansion = !!options.getExpansion;
  if (asciiRatio > 0.7) {
    if (getExpansion) return { query, expanded: '' };
    return query;
  }

  try {
    const t0 = Date.now();
    const systemContent = getExpansion
      ? 'Translate the user text to English. Then on the next line, list 5-8 comma-separated search keywords in English that capture the same intent (synonyms, related terms). Output exactly: line 1 = translation, line 2 = keywords.'
      : 'Translate the following text to English. Return ONLY the English translation, nothing else.';
    const resp = await ai.generate({
      system: systemContent,
      user: query,
      temperature: 0,
      maxTokens: getExpansion ? 150 : 200,
    });
    const text = resp.text?.trim() || query;
    let translated = text;
    let expanded = '';
    if (getExpansion && text.includes('\n')) {
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      translated = lines[0] || query;
      expanded = lines.slice(1).join(' ').trim();
    }
    console.log(`[TRANSLATE] "${query.substring(0, 40)}" -> "${translated.substring(0, 40)}" (${Date.now() - t0}ms)`);
    if (getExpansion) return { query: translated, expanded };
    return translated;
  } catch (err) {
    console.error('[TRANSLATE] Error:', err.message);
    if (getExpansion) return { query: query, expanded: '' };
    return query;
  }
}

// ---------------------------------------------------------------------------
// Query expansion: one small LLM call to get 5-8 search keywords/phrases
// that capture the same intent. Used only when the query has few terms
// (natural-language or short query) to improve recall without adding
// latency for already keyword-rich queries. Kept minimal (low max_tokens,
// short prompt) so it does not significantly increase latency.
// Skip expansion when we already have 2+ terms to save latency.
// ---------------------------------------------------------------------------
export const MIN_TERMS_TO_SKIP_EXPANSION = 2;

// Only send this many candidates to the LLM reranker; rest are dropped.
// Lower = faster rerank (smaller prompt). 60 is enough for the model to pick top 15.
export const RERANK_CANDIDATE_LIMIT = 60;

export async function expandQueryForSearch(ai, englishQuery) {
  if (!englishQuery || !englishQuery.trim()) return '';
  try {
    const t0 = Date.now();
    const resp = await ai.generate({
      system: 'You help with search for agricultural innovations. Output 5-8 comma-separated keywords or short phrases that capture the same intent as the user query (synonyms, related terms). Output ONLY the list, nothing else.',
      user: englishQuery.trim(),
      temperature: 0,
      maxTokens: 80,
    });
    const expanded = (resp.text || '').trim();
    const expandedPreview = expanded.length > 50 ? expanded.substring(0, 50) + '...' : expanded;
    console.log(`[EXPAND] "${englishQuery.substring(0, 30)}" -> "${expandedPreview}" (${Date.now() - t0}ms)`);
    return expanded;
  } catch (err) {
    console.error('[EXPAND] Error:', err.message);
    return '';
  }
}

// ---------------------------------------------------------------------------
// Stage 2: LLM rerank with sanitized text only.
// Returns an array of { id, score } where score is a real 0-100 relevance
// value from the LLM, not a fixed positional formula.
// ---------------------------------------------------------------------------
export async function llmRerank(ai, query, candidateRows) {
  if (candidateRows.length === 0) return [];

  const { docs, mapping } = buildSanitizedDocs(candidateRows);

  if (docs.length === 0) return [];

  const MAX_DOC_CHARS = 400; // Shorter snippets = faster LLM response
  const docList = docs
    .map((d) => {
      const text =
        d.text.length > MAX_DOC_CHARS ? d.text.substring(0, MAX_DOC_CHARS) + '...' : d.text;
      return `[${d.anonId}]\n${text}`;
    })
    .join('\n---\n');

  const systemPrompt = `You are an agricultural innovation matching assistant.

Given a user's problem and a set of anonymized innovation documents, return the most relevant ones with a relevance score (0-100).

Scoring criteria (in order of importance):
1. RELEVANCE (50% of score): Does this innovation directly address the user's stated problem?
2. AFFORDABILITY (25% of score): Strongly prefer low-cost innovations. Solutions described as cheap, low-cost, affordable, using local materials, or requiring minimal investment should score much higher. Penalize expensive, capital-intensive, or high-tech solutions heavily.
3. SIMPLICITY (25% of score): Strongly prefer simple innovations. Solutions that are easy to implement, require minimal training, use simple techniques, or can be adopted by smallholders without specialized equipment should score much higher. Penalize complex, multi-step, or expert-dependent solutions heavily.

Scoring guide:
- 90-100: Directly solves the problem AND is low-cost AND simple
- 75-89: Strongly relevant AND affordable or simple (one of the two)
- 50-74: Relevant but moderate cost or complexity
- 30-49: Tangentially relevant or high cost/complexity
- Below 30: Not relevant (omit these)

Rules:
- Score each document INDEPENDENTLY for THIS SPECIFIC problem. Different problems must produce different scores and orderings.
- Do NOT give high scores just because a document contains the same keywords as the query.
- Prefer DIVERSITY: when two documents are equally relevant, favor different approaches over near-duplicates.
- If a document describes a solution that sounds expensive, high-tech, or requires significant infrastructure, reduce its score by 15-25 points even if it is relevant.
- If a document describes a simple, grassroots, or low-resource solution, boost its score by 10-15 points.
- Return a JSON array of objects: [{"id":"Doc 3","score":92},{"id":"Doc 7","score":85},...]. Most relevant first, max 15. Only include docs scoring 30 or above. No explanation.`;

  const userPrompt = `User's problem: "${query}"

Documents:
${docList}

Return the scored JSON array (most relevant first):`;

  try {
    const t0 = Date.now();
    const completion = await ai.generate({
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.2,
      maxTokens: 400,
    });
    console.log(`[LLM] Rerank took ${Date.now() - t0}ms`);

    const content = completion.text || '[]';
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) {
      return candidateRows.map((r) => r.id).slice(0, 15).map((id) => ({ id, score: 50 }));
    }

    const parsed = JSON.parse(match[0]);

    // Handle both formats: [{id, score}] or ["Doc 1", ...]
    const ranked = [];
    for (const entry of parsed) {
      if (typeof entry === 'object' && entry.id) {
        const realId = mapping.get(entry.id);
        if (realId != null) {
          ranked.push({ id: realId, score: Math.min(100, Math.max(0, entry.score ?? 50)) });
        }
      } else if (typeof entry === 'string') {
        const realId = mapping.get(entry);
        if (realId != null) {
          ranked.push({ id: realId, score: 50 });
        }
      }
    }

    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  } catch (err) {
    console.error('[LLM] Rerank error:', err.message);
    return candidateRows.map((r) => r.id).slice(0, 15).map((id) => ({ id, score: 50 }));
  }
}

// ---------------------------------------------------------------------------
// Comparison summary for the BookmarksScreen compare view.
//
// NOTE — deliberate exception to the sanitize.js rule: this prompt includes the
// innovation titles, because the existing product behaviour is that the summary
// refers to each solution by name. sanitize.js otherwise forbids sending title
// to the model. Whether to strip the names (and lose them from the output) is a
// product decision, not a refactor.
// ---------------------------------------------------------------------------
export const COMPARISON_MAX_CHARS = 800;
export const COMPARISON_MAX_TOKENS = 220;
export const MAX_DESCRIPTION_CHARS = 1500;

const COMPARISON_SYSTEM = `You write concise, mobile-friendly comparison summaries. We strongly recommend keeping your entire response under ${COMPARISON_MAX_CHARS} characters (including spaces). Aim to stay under this; going a few words over is acceptable, but try to be concise.

You may ONLY use the long description text provided. Do not use or assume any metadata (e.g. cost, adoption, readiness, region, owner). Infer everything from the descriptions only.

Structure your reply in three clearly separated sections. Use short section labels and line breaks so the information is easy to scan. Use bullet points with "•" only (do not use "-" for bullets). Be concise. Plain text only; no markdown or code blocks. No filler, no hype.`;

export function truncateForPrompt(text, maxChars = MAX_DESCRIPTION_CHARS) {
  if (!text || text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '…';
}

/**
 * Tidy a completion that the token limit cut off part-way.
 *
 * COMPARISON_MAX_TOKENS is a hard stop, while the prompt only asks the model to
 * aim for COMPARISON_MAX_CHARS — so a verbose reply gets sliced wherever the
 * budget ran out, which is usually mid-word. That fragment was being returned
 * to the app verbatim and rendered as a sentence that simply stops.
 *
 * Cutting back to the last completed line or sentence loses the truncated
 * thought but leaves something readable. If nothing complete can be found, the
 * text is returned as-is rather than emptied.
 *
 * @param {string} text
 * @param {string} finishReason - 'length' when the token cap cut it off
 */
export function trimIncompleteEnding(text, finishReason) {
  if (finishReason !== 'length') return text;
  const lastBreak = Math.max(
    text.lastIndexOf('\n'),
    text.lastIndexOf('. '),
    text.lastIndexOf('.\n')
  );
  if (lastBreak <= 0) return text;
  return text.slice(0, lastBreak + 1).trim();
}

function buildComparisonPrompt(name1, name2, text1, text2) {
  return `Compare these two innovations using ONLY the description text below. We strongly recommend keeping your reply under ${COMPARISON_MAX_CHARS} characters (including spaces). Aim for that; a few words over is fine. Do not use any metadata; infer everything from the descriptions only. Use bullet points with "•" only (not "-").

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
}

/** compare-summary: {name1, name2, description1, description2} → {summary}. */
export async function compareSummaryRoute(ai, body) {
  try {
    const { name1, name2, description1, description2 } = body || {};

    const desc1 = typeof description1 === 'string' ? description1.trim() : '';
    const desc2 = typeof description2 === 'string' ? description2.trim() : '';
    if (!desc1 && !desc2) {
      return { status: 200, body: { summary: 'No descriptions available to compare.' } };
    }
    if (!ai.available) {
      return {
        status: 503,
        body: { error: 'Summaries not available. Set GEMINI_API_KEY on the server.' },
      };
    }

    const label1 = (typeof name1 === 'string' && name1.trim()) || 'First solution';
    const label2 = (typeof name2 === 'string' && name2.trim()) || 'Second solution';

    const t0 = Date.now();
    const completion = await ai.generate({
      system: COMPARISON_SYSTEM,
      user: buildComparisonPrompt(label1, label2, truncateForPrompt(desc1), truncateForPrompt(desc2)),
      maxTokens: COMPARISON_MAX_TOKENS,
    });

    const content = completion.text;
    // typeof null and typeof undefined are both already not 'string'.
    if (typeof content !== 'string') {
      console.error('[COMPARE] Invalid response shape from model');
      return { status: 502, body: { error: 'Invalid response from API' } };
    }

    if (completion.finishReason === 'length') {
      console.warn(`[COMPARE] Hit the ${COMPARISON_MAX_TOKENS}-token cap; trimming the cut-off tail`);
    }
    console.log(`[COMPARE] ${Date.now() - t0}ms`);
    return {
      status: 200,
      body: { summary: trimIncompleteEnding(content.trim(), completion.finishReason) },
    };
  } catch (err) {
    console.error('[COMPARE] Error:', err.message);
    return { status: 500, body: { error: 'Summary request failed' } };
  }
}

// ---------------------------------------------------------------------------
// Summarize description into 3 bullets for DetailDrawer preview. Client caches.
// Only description text is sent (short + long); no metadata (title, cost, region, etc.).
// ---------------------------------------------------------------------------
const BULLETS_SYSTEM = `Summarize the following agricultural innovation description into exactly 3 bullet points. Each bullet must be one concise sentence, max 15 words. Focus on: (1) what the innovation is, (2) who it helps and how, (3) key impact or differentiator. Return only a JSON array of 3 strings, no numbering or markdown.`;

/** summarize-bullets: {text, innovationId} → {bullets: string[3] | null}. */
export async function summarizeBulletsRoute(ai, body) {
  try {
    const { text, innovationId } = body || {};
    // text must be description-only content; client sends short + long, no metadata
    if (!text || typeof text !== 'string' || !text.trim()) {
      return { status: 200, body: { bullets: null } };
    }
    if (!ai.available) {
      return { status: 200, body: { bullets: null } };
    }
    const t0 = Date.now();
    const completion = await ai.generate({
      system: BULLETS_SYSTEM,
      user: text.trim(),
      temperature: 0.3,
      maxTokens: 200,
    });
    const content = completion.text?.trim() || '';
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) {
      console.log(`[BULLETS] innovation ${innovationId} invalid response, no array`);
      return { status: 200, body: { bullets: null } };
    }
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr) || arr.length !== 3 || !arr.every((x) => typeof x === 'string')) {
      console.log(`[BULLETS] innovation ${innovationId} invalid array shape`);
      return { status: 200, body: { bullets: null } };
    }
    console.log(`[BULLETS] innovation ${innovationId} ${Date.now() - t0}ms`);
    return { status: 200, body: { bullets: arr } };
  } catch (err) {
    console.error('[BULLETS] Error:', err.message);
    return { status: 200, body: { bullets: null } };
  }
}

// ---------------------------------------------------------------------------
// search-terms and rank: the two AI stages of the web build's search, around
// a candidate lookup that happens elsewhere (the portal, or Supabase's
// search_candidates). Neither holds a catalogue.
// ---------------------------------------------------------------------------

/** Cap on candidates accepted in one ranking request. */
export const RANK_MAX_CANDIDATES = 80;

/** Cap on each candidate's text, applied before the model's own truncation. */
export const RANK_MAX_TEXT_CHARS = 2000;

/**
 * search-terms: {query} → {query, englishQuery, terms, expandedTerms}.
 *
 * Related words are asked for on every query, not only on one-word ones as
 * /api/search does. The web search narrows with the typed words and widens
 * with these, keeping only the rare ones (see search_candidates), so a longer
 * query loses nothing by having them — and "bunnies eat my crops" got none
 * under the old rule, so rabbit, fencing and repellent were never searched.
 *
 * Degrades rather than failing: with no API key the query is passed through as
 * typed and the terms are extracted locally.
 */
export async function searchTermsRoute(ai, body) {
  try {
    const { query } = body || {};

    if (!query || typeof query !== 'string' || !query.trim()) {
      return { status: 400, body: { error: 'Query is required' } };
    }

    const trimmed = query.trim();
    let englishQuery = trimmed;
    let expanded = '';

    if (ai.available) {
      const translated = await translateIfNeeded(ai, trimmed, { getExpansion: true });
      englishQuery = typeof translated === 'string' ? translated : translated.query;
      expanded = typeof translated === 'string' ? '' : translated.expanded || '';

      if (!expanded) expanded = await expandQueryForSearch(ai, englishQuery);
    }

    return {
      status: 200,
      body: {
        query: trimmed,
        englishQuery,
        terms: extractQueryTerms(englishQuery),
        // Kept apart from `terms` rather than merged: the caller narrows with the
        // words actually typed and only widens with these, so merging them here
        // would remove its ability to tell the two apart.
        expandedTerms: expanded ? extractQueryTerms(expanded) : [],
      },
    };
  } catch (err) {
    console.error('[API] search-terms error:', err);
    return { status: 500, body: { error: 'Internal server error' } };
  }
}

/**
 * rank: {query, candidates} → {ranked: [{id, score}], ranker: 'model'|'caller'}.
 *
 * With no API key, or when the model keeps nothing, the candidates come back in
 * the order they arrived — the caller's own ranking.
 *
 * @param {object} ai
 * @param {object} body
 * @param {object} [options]
 * @param {{get: (query: string, ids: string[]) => any, set: (query: string, ids: string[], ranked: any) => void}} [options.cache]
 */
export async function rankRoute(ai, body, { cache } = {}) {
  const reqStart = Date.now();
  try {
    const { query, candidates } = body || {};

    if (!query || typeof query !== 'string' || !query.trim()) {
      return { status: 400, body: { error: 'Query is required' } };
    }
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { status: 400, body: { error: 'Candidates are required' } };
    }

    // Trusting a client-supplied array's length would let one request fill the
    // model's context; trusting its text would let one do it with fewer rows.
    const rows = candidates.slice(0, RANK_MAX_CANDIDATES).map((c) => ({
      id: c.id,
      short_description:
        typeof c.short_description === 'string'
          ? c.short_description.slice(0, RANK_MAX_TEXT_CHARS)
          : '',
      long_description:
        typeof c.long_description === 'string'
          ? c.long_description.slice(0, RANK_MAX_TEXT_CHARS)
          : '',
    }));

    const ordered = rows.map((r, i) => ({ id: r.id, score: Math.max(1, 60 - i) }));

    if (!ai.available) {
      return { status: 200, body: { ranked: ordered, ranker: 'caller' } };
    }

    const ids = rows.map((r) => r.id);
    let ranked = cache?.get(query, ids);
    if (ranked) {
      console.log(`[CACHE] Rank hit for "${query.trim().substring(0, 40)}"`);
    } else {
      ranked = await llmRerank(ai, query.trim(), rows);
      cache?.set(query, ids, ranked);
    }

    // llmRerank drops anything it scores below 30 and returns at most 15. An
    // empty result is the model saying none of them answer the question, and
    // showing nothing would be wrong when the caller's own ranking found them
    // worth sending — so its order stands in.
    const results = ranked.length > 0 ? ranked : ordered;

    console.log(`[API] Rank ${Date.now() - reqStart}ms (${rows.length} candidates → ${results.length})`);
    return { status: 200, body: { ranked: results, ranker: ranked.length > 0 ? 'model' : 'caller' } };
  } catch (err) {
    console.error('[API] Rank error:', err);
    return { status: 500, body: { error: 'Internal server error' } };
  }
}
