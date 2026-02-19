/**
 * ATIO KB AI Search Backend
 *
 * Two-stage search:
 *   Stage 1 – Candidate retrieval via SQLite FTS (fast, local)
 *   Stage 2 – LLM rerank using ONLY sanitized long-text fields
 *
 * Strict rule: AI never sees owner, partner, data_source, URL, or title.
 * Default preference: low affordability + simple complexity when user
 * does not specify.
 */

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Database = require('better-sqlite3');
const { OpenAI } = require('openai');
const { buildSanitizedDocs } = require('./sanitize');
const { deriveCost, deriveComplexity } = require('./deriveCostComplexity');

const UPLOAD_DIR = path.join(os.tmpdir(), 'atio-uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Purge any leftover files from previous runs on startup
for (const f of fs.readdirSync(UPLOAD_DIR)) {
  fs.unlink(path.join(UPLOAD_DIR, f), () => {});
}

const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 10 * 1024 * 1024 } });

// Periodic sweep: delete any upload files older than 5 minutes (catches orphans)
setInterval(() => {
  try {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const f of fs.readdirSync(UPLOAD_DIR)) {
      const fp = path.join(UPLOAD_DIR, f);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) fs.unlink(fp, () => {});
    }
  } catch (_) {}
}, 60 * 1000);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Database – NEVER modify the original asset.
// We copy atiokb.db to a temp directory and open the copy read-only.
// This guarantees the bundled assets/db/atiokb.db is never touched.
// ---------------------------------------------------------------------------
const ORIGINAL_DB = path.resolve(__dirname, '..', 'assets', 'db', 'atiokb.db');
const COPY_DIR = path.join(os.tmpdir(), 'atio-kb-backend');
const COPY_DB = path.join(COPY_DIR, 'atiokb.db');

let db;
try {
  if (!fs.existsSync(COPY_DIR)) {
    fs.mkdirSync(COPY_DIR, { recursive: true });
  }
  // Always copy fresh from the original on startup so the copy stays in sync
  fs.copyFileSync(ORIGINAL_DB, COPY_DB);
  console.log('[DB] Copied asset to', COPY_DB);

  db = new Database(COPY_DB, { readonly: true, fileMustExist: true });
  console.log('[DB] Opened (read-only copy)');
} catch (err) {
  console.error('[DB] Failed to initialise database:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// OpenAI client
// ---------------------------------------------------------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------------------------------------------------------------------------
// In-memory query cache  (queryKey -> ordered innovation IDs)
// Avoids re-running the LLM for pagination on the same query.
// ---------------------------------------------------------------------------
const queryCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(query) {
  return query.trim().toLowerCase();
}

function getCached(key) {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    queryCache.delete(key);
    return null;
  }
  return entry.ranked;
}

function setCache(key, ranked) {
  queryCache.set(key, { ranked, ts: Date.now() });
  // Evict old entries if cache grows large
  if (queryCache.size > 200) {
    const oldest = [...queryCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 50; i++) queryCache.delete(oldest[i][0]);
  }
}

// ---------------------------------------------------------------------------
// Helpers: enrich a raw innovation row with related data
// ---------------------------------------------------------------------------
const stmtCountries = db.prepare(
  'SELECT country_name FROM innovation_countries WHERE innovation_id = ?'
);
const stmtTypes = db.prepare(
  'SELECT term_name FROM innovation_types WHERE innovation_id = ?'
);
const stmtSdgs = db.prepare(
  'SELECT sdg_name FROM innovation_sdgs WHERE innovation_id = ?'
);
const stmtUseCases = db.prepare(
  'SELECT term_name FROM innovation_use_cases WHERE innovation_id = ?'
);
const stmtUsers = db.prepare(
  'SELECT user_name FROM innovation_prospective_users WHERE innovation_id = ?'
);

function enrichRow(row) {
  const countries = stmtCountries.all(row.id).map((r) => r.country_name);
  const types = stmtTypes.all(row.id).map((r) => r.term_name);
  const sdgs = stmtSdgs
    .all(row.id)
    .map((r) => {
      const m = r.sdg_name.match(/Goal (\d+)/);
      return m ? parseInt(m[1]) : null;
    })
    .filter(Boolean);
  const useCases = stmtUseCases.all(row.id).map((r) => r.term_name);
  const users = stmtUsers
    .all(row.id)
    .map((r) => r.user_name.replace(/&#039;/g, "'"));

  const readinessMatch = row.readiness_level
    ? row.readiness_level.match(/^(\d+)/)
    : null;
  const readinessNum = readinessMatch ? parseInt(readinessMatch[1]) : 1;
  const adoptionMatch = row.adoption_level
    ? row.adoption_level.match(/^(\d+)/)
    : null;
  const adoptionNum = adoptionMatch ? parseInt(adoptionMatch[1]) : 1;

  const signals = {
    types,
    useCases,
    users,
    shortDescription: row.short_description || '',
    longDescription: row.long_description || '',
    isGrassroots: row.is_grassroots === 1,
  };

  return {
    id: row.id,
    title: row.title,
    shortDescription: row.short_description || '',
    longDescription: row.long_description || '',
    readinessLevel: readinessNum,
    readinessName: row.readiness_level || '',
    adoptionLevel: adoptionNum,
    adoptionName: row.adoption_level || '',
    region: row.region || '',
    isGrassroots: row.is_grassroots === 1,
    owner: row.owner_text || '',
    partner: row.partner_text || '',
    dataSource: row.data_source || '',
    countries,
    types,
    sdgs,
    useCases,
    users,
    cost: deriveCost(signals),
    complexity: deriveComplexity(signals),
    thumbsUpCount: 0,
  };
}

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
const STOPWORDS = new Set([
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

function extractQueryTerms(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// ---------------------------------------------------------------------------
// Stage 1: Candidate retrieval via FTS
// Uses AND for specificity (all meaningful terms must appear), falling back
// to OR if AND returns too few candidates. This ensures "post-harvest losses"
// and "drought-tolerant crops" produce distinct candidate sets.
// When expandedQuery is provided (query expansion), terms are merged and
// only OR is used so we don't over-narrow with AND on many terms.
// ---------------------------------------------------------------------------
function getCandidatesFTS(query, limit = 30, expandedQuery = '') {
  let terms = extractQueryTerms(query);
  if (expandedQuery && expandedQuery.trim()) {
    const expandedTerms = extractQueryTerms(expandedQuery);
    terms = [...new Set([...terms, ...expandedTerms])];
  }

  if (terms.length === 0) return [];

  console.log(`[FTS] Meaningful terms: [${terms.join(', ')}]`);

  const useOrOnly = expandedQuery && expandedQuery.trim();

  // Try AND first for maximum specificity (skip when using expanded terms)
  if (!useOrOnly && terms.length > 1) {
    const andQuery = terms.join(' AND ');
    try {
      const rows = db
        .prepare(
          `SELECT i.id, i.title, i.short_description, i.long_description,
                i.readiness_level, i.adoption_level, i.region, i.is_grassroots,
                i.owner_text, i.partner_text, i.data_source
         FROM innovations i
         JOIN innovations_fts fts ON fts.rowid = i.id
         WHERE innovations_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
        )
        .all(andQuery, limit);
      if (rows.length >= 5) {
        console.log(`[FTS] AND query returned ${rows.length} candidates`);
        return rows;
      }
      console.log(`[FTS] AND query returned only ${rows.length}, falling back to OR`);
    } catch (err) {
      console.log(`[FTS] AND query failed: ${err.message}, trying OR`);
    }
  }

  // Fall back to OR
  const orQuery = terms.join(' OR ');
  try {
    const rows = db
      .prepare(
        `SELECT i.id, i.title, i.short_description, i.long_description,
              i.readiness_level, i.adoption_level, i.region, i.is_grassroots,
              i.owner_text, i.partner_text, i.data_source
       FROM innovations i
       JOIN innovations_fts fts ON fts.rowid = i.id
       WHERE innovations_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
      )
      .all(orQuery, limit);
    console.log(`[FTS] OR query returned ${rows.length} candidates`);
    return rows;
  } catch (err) {
    console.error('[FTS] Error:', err.message);
    return getCandidatesLike(query, limit);
  }
}

function getCandidatesLike(query, limit = 40) {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return [];

  const conditions = words.map(() =>
    `(i.short_description LIKE ? OR i.long_description LIKE ? OR i.title LIKE ?)`
  );
  const params = [];
  words.forEach((w) => {
    const p = `%${w}%`;
    params.push(p, p, p);
  });

  const sql = `
    SELECT i.id, i.title, i.short_description, i.long_description,
           i.readiness_level, i.adoption_level, i.region, i.is_grassroots,
           i.owner_text, i.partner_text, i.data_source
    FROM innovations i
    WHERE ${conditions.join(' OR ')}
    LIMIT ?
  `;
  params.push(limit);

  try {
    return db.prepare(sql).all(...params);
  } catch (err) {
    console.error('[LIKE] Error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Query translation: detect non-English queries and translate to English
// so FTS (English-indexed) and the LLM ranking work correctly.
// When getExpansion is true and we call the API, also ask for 5-8 search
// keywords in English to avoid a second round-trip for query expansion.
// Returns { query, expanded } when getExpansion is true; otherwise returns
// the query string only (backward compatible).
// ---------------------------------------------------------------------------
async function translateIfNeeded(query, options = {}) {
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
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: query },
      ],
      temperature: 0,
      max_tokens: getExpansion ? 150 : 200,
    });
    const text = resp.choices[0]?.message?.content?.trim() || query;
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
// ---------------------------------------------------------------------------
const MIN_TERMS_TO_SKIP_EXPANSION = 3;

async function expandQueryForSearch(englishQuery) {
  if (!englishQuery || !englishQuery.trim()) return '';
  try {
    const t0 = Date.now();
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You help with search for agricultural innovations. Output 5-8 comma-separated keywords or short phrases that capture the same intent as the user query (synonyms, related terms). Output ONLY the list, nothing else.',
        },
        { role: 'user', content: englishQuery.trim() },
      ],
      temperature: 0,
      max_tokens: 80,
    });
    const expanded = (resp.choices[0]?.message?.content || '').trim();
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
async function llmRerank(query, candidateRows) {
  if (candidateRows.length === 0) return [];

  const { docs, mapping } = buildSanitizedDocs(candidateRows);

  if (docs.length === 0) return [];

  const docList = docs
    .map((d) => {
      const text =
        d.text.length > 600 ? d.text.substring(0, 600) + '...' : d.text;
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
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 400,
    });
    console.log(`[LLM] Rerank took ${Date.now() - t0}ms`);

    const content = completion.choices[0]?.message?.content || '[]';
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
// Fetch full enriched innovations by ordered IDs
// ---------------------------------------------------------------------------
const stmtById = db.prepare(
  `SELECT i.id, i.title, i.short_description, i.long_description,
          i.readiness_level, i.adoption_level, i.region, i.is_grassroots,
          i.owner_text, i.partner_text, i.data_source
   FROM innovations i WHERE i.id = ?`
);

function getEnrichedByIds(ids) {
  const results = [];
  for (const id of ids) {
    const row = stmtById.get(id);
    if (row) {
      results.push(enrichRow(row));
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Transcription endpoint – accepts an audio file, sends to OpenAI Whisper,
// returns { text: "..." }. Used by the mobile app's speech-to-text feature.
// ---------------------------------------------------------------------------
app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const t0 = Date.now();

    // Multer saves without extension; rename so OpenAI can detect the format
    const ext = req.file.originalname?.match(/\.\w+$/)?.[0] || '.m4a';
    const namedPath = req.file.path + ext;
    fs.renameSync(req.file.path, namedPath);

    const audioStream = fs.createReadStream(namedPath);

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioStream,
      response_format: 'text',
    });

    fs.unlink(namedPath, () => {});

    console.log(`[TRANSCRIBE] "${String(transcription).substring(0, 60)}" (${Date.now() - t0}ms)`);
    res.json({ text: String(transcription).trim() });
  } catch (err) {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
      fs.unlink(req.file.path + (req.file.originalname?.match(/\.\w+$/)?.[0] || '.m4a'), () => {});
    }
    console.error('[TRANSCRIBE] Error:', err.message);
    res.status(500).json({ error: 'Transcription failed' });
  }
});

// ---------------------------------------------------------------------------
// API endpoint
// ---------------------------------------------------------------------------
app.post('/api/search', async (req, res) => {
  const reqStart = Date.now();
  try {
    const { query, offset = 0, limit = 5 } = req.body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const key = cacheKey(query);
    let ranked = getCached(key);
    if (ranked) console.log(`[CACHE] Hit for "${query.trim().substring(0, 40)}"`);

    if (!ranked) {
      // Translate non-English queries to English; optionally get expansion in same call to avoid extra latency
      const translateResult = await translateIfNeeded(query.trim(), { getExpansion: true });
      const englishQuery = typeof translateResult === 'string' ? translateResult : translateResult.query;
      let expanded = typeof translateResult === 'string' ? '' : (translateResult.expanded || '');

      // Query expansion only when query has few terms (natural-language or short) to improve recall
      // without adding latency for already keyword-rich queries
      if (extractQueryTerms(englishQuery).length < MIN_TERMS_TO_SKIP_EXPANSION && !expanded) {
        expanded = await expandQueryForSearch(englishQuery);
      }

      // Stage 1: Get candidates via FTS (original + expanded terms, stopwords stripped)
      const t0 = Date.now();
      const candidateLimit = 200; // fetch enough to cover broad queries like "hotlines and helplines"
      const candidates = getCandidatesFTS(englishQuery, candidateLimit, expanded);
      console.log(`[FTS] ${candidates.length} candidates in ${Date.now() - t0}ms`);

      if (candidates.length === 0) {
        return res.json({ query: query.trim(), results: [], hasMore: false });
      }

      // Stage 2: LLM rerank with per-doc relevance scores
      ranked = await llmRerank(englishQuery, candidates);

      setCache(key, ranked);
    }

    // Build a score lookup from the ranked array
    const scoreMap = new Map(ranked.map((r) => [r.id, r.score]));

    const page = ranked.slice(offset, offset + limit);
    const pageIds = page.map((r) => r.id);
    const rawResults = getEnrichedByIds(pageIds);
    const results = rawResults
      .map((r) => ({
        ...r,
        matchScore: scoreMap.get(r.id) ?? 50,
      }))
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

    const hasMore = offset + limit < ranked.length;

    console.log(`[API] Total ${Date.now() - reqStart}ms (offset=${offset}, returned=${results.length}, hasMore=${hasMore})`);
    res.json({
      query: query.trim(),
      results,
      hasMore,
      total: ranked.length,
    });
  } catch (err) {
    console.error('[API] Search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Summarize description into 3 bullets for DetailDrawer preview. Client caches.
// Only description text is sent (short + long); no metadata (title, cost, region, etc.).
// ---------------------------------------------------------------------------
const BULLETS_SYSTEM = `Summarize the following agricultural innovation description into exactly 3 bullet points. Each bullet must be one concise sentence, max 15 words. Focus on: (1) what the innovation is, (2) who it helps and how, (3) key impact or differentiator. Return only a JSON array of 3 strings, no numbering or markdown.`;

app.post('/api/summarize-bullets', async (req, res) => {
  try {
    const { text, innovationId } = req.body || {};
    // text must be description-only content; client sends short + long, no metadata
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.json({ bullets: null });
    }
    const t0 = Date.now();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: BULLETS_SYSTEM },
        { role: 'user', content: text.trim() },
      ],
      max_tokens: 200,
    });
    const content = completion.choices[0]?.message?.content?.trim() || '';
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) {
      console.log(`[BULLETS] innovation ${innovationId} invalid response, no array`);
      return res.json({ bullets: null });
    }
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr) || arr.length !== 3 || !arr.every((x) => typeof x === 'string')) {
      console.log(`[BULLETS] innovation ${innovationId} invalid array shape`);
      return res.json({ bullets: null });
    }
    console.log(`[BULLETS] innovation ${innovationId} ${Date.now() - t0}ms`);
    res.json({ bullets: arr });
  } catch (err) {
    console.error('[BULLETS] Error:', err.message);
    res.json({ bullets: null });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', innovations: db.prepare('SELECT COUNT(*) as count FROM innovations').get().count });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  const count = db
    .prepare('SELECT COUNT(*) as count FROM innovations')
    .get().count;
  console.log(`[ATIO Search] Server running on port ${PORT}`);
  console.log(`[ATIO Search] ${count} innovations loaded`);
});
