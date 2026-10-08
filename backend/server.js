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
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Database = require('better-sqlite3');
const { deriveCost, deriveComplexity } = require('./deriveCostComplexity');
// The AI half of the server, shared with the Supabase Edge Functions: the same
// prompts, limits and fallbacks, calling Gemini. Plain ESM, loaded with Node's
// require() of ES modules.
const { createAi, audioTypeFor } = require('../supabase/functions/_shared/ai/gemini.js');
const {
  extractQueryTerms,
  translateIfNeeded,
  expandQueryForSearch,
  llmRerank,
  trimIncompleteEnding,
  compareSummaryRoute,
  summarizeBulletsRoute,
  searchTermsRoute,
  rankRoute,
  MIN_TERMS_TO_SKIP_EXPANSION,
  RERANK_CANDIDATE_LIMIT,
} = require('../supabase/functions/_shared/ai/routes.js');

const UPLOAD_DIR = path.join(os.tmpdir(), 'atio-uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Purge any leftover files from previous runs on startup
for (const f of fs.readdirSync(UPLOAD_DIR)) {
  fs.unlink(path.join(UPLOAD_DIR, f), () => {});
}

const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 10 * 1024 * 1024 } });

// Periodic sweep: delete any upload files older than 5 minutes (catches orphans)
// unref'd so it never holds the process open (matters when imported by tests)
const uploadSweep = setInterval(() => {
  try {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const f of fs.readdirSync(UPLOAD_DIR)) {
      const fp = path.join(UPLOAD_DIR, f);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) fs.unlink(fp, () => {});
    }
  } catch (_) {}
}, 60 * 1000);
uploadSweep.unref();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Client credential
//
// Every /api route below spends money on our Gemini account, and until now any
// client that could reach the host could spend it. This gate closes that.
//
// It is opt-in on purpose. Enforcing unconditionally would break every build
// already in users' hands the moment the server restarted, so the requirement
// only exists once API_CLIENT_TOKEN is set on the server. Set it, ship a client
// carrying the matching EXPO_PUBLIC_API_CLIENT_TOKEN, and the old builds stop
// being able to spend the budget.
//
// What this is not: the token ships inside the app bundle, so it is extractable
// by anyone willing to unpack an APK. It raises the cost of casual abuse of a
// public endpoint; it is not authentication of a user. A real fix is per-install
// credentials issued by an authenticated endpoint, which this app has no
// identity system for.
// ---------------------------------------------------------------------------
// Read per request rather than captured at load, so rotating the value only
// needs a restart of the process rather than a rebuild, and so a test can cover
// both modes without reloading the module.
const clientToken = () => process.env.API_CLIENT_TOKEN?.trim();

/** Constant-time compare so a wrong token cannot be recovered by timing. */
function tokensMatch(provided, expected) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

app.use('/api', (req, res, next) => {
  const expected = clientToken();
  if (!expected) return next();
  const header = req.get('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!provided || !tokensMatch(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
});

if (!clientToken()) {
  console.warn(
    '[ATIO] API_CLIENT_TOKEN is not set — /api routes are open to anyone who can reach this host.'
  );
}

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
  // Always copy fresh from the original on startup so the copy stays in sync.
  //
  // Copy to a private name first, then rename into place. A rename within one
  // directory is atomic, so anything opening COPY_DB sees either the whole
  // previous copy or the whole new one — never a half-written file. Copying
  // straight onto COPY_DB let Jest's parallel workers open a database that
  // another worker was still writing, which reached CI as an intermittent
  // `SqliteError: database disk image is malformed` on a suite that had done
  // nothing wrong. The suites fail randomly rather than together, because it
  // depends on which worker wins the race.
  const stagedCopy = `${COPY_DB}.${process.pid}.tmp`;
  fs.copyFileSync(ORIGINAL_DB, stagedCopy);
  fs.renameSync(stagedCopy, COPY_DB);
  console.log('[DB] Copied asset to', COPY_DB);

  db = new Database(COPY_DB, { readonly: true, fileMustExist: true });
  console.log('[DB] Opened (read-only copy)');
} catch (err) {
  // Throw rather than exit. `process.exit(1)` here killed whatever required the
  // module — including a Jest worker, which died with no assertable failure and
  // no stack attached to any test. Running directly still fails fast: the
  // require.main block at the bottom turns this into an exit.
  console.error('[DB] Failed to initialise database:', err.message);
  throw err;
}

// ---------------------------------------------------------------------------
// Gemini client – only used when GEMINI_API_KEY is set
// ---------------------------------------------------------------------------
const hasGeminiKey = () =>
  Boolean(process.env.GEMINI_API_KEY && String(process.env.GEMINI_API_KEY).trim());

// Resolved lazily, from the same source and at the same moment as the guard that
// decides whether to use it — matching the clientToken() pattern above. A
// client built at import would keep a key that has since changed, or keep
// reporting none after one arrived.
let aiClient = null;
function ai() {
  if (!aiClient) {
    aiClient = createAi({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL });
  }
  return aiClient;
}

/** Drop the memoized client so a changed key or model is picked up. Test-facing. */
function resetAiClient() {
  aiClient = null;
}

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

// Stopwords and extractQueryTerms live in supabase/functions/_shared/ai/routes.js,
// shared with the Edge Functions' search-terms.

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

// Translation, query expansion and the LLM rerank live in
// supabase/functions/_shared/ai/routes.js, shared with the Edge Functions.

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
// Transcription endpoint – accepts an audio file, sends it to Gemini as inline
// audio, returns { text: "..." }. Used by the mobile app's speech-to-text feature.
// ---------------------------------------------------------------------------
app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    if (!hasGeminiKey()) {
      fs.unlink(req.file.path, () => {});
      return res.status(503).json({
        error: 'Transcription not available. Set GEMINI_API_KEY on the server.',
      });
    }

    const t0 = Date.now();

    // Multer saves without extension; the original name says what the audio is.
    const ext = req.file.originalname?.match(/\.\w+$/)?.[0] || '.m4a';
    const data = fs.readFileSync(req.file.path).toString('base64');
    fs.unlink(req.file.path, () => {});

    const transcription = await ai().transcribe({ data, mimeType: audioTypeFor(ext) });

    console.log(`[TRANSCRIBE] "${String(transcription).substring(0, 60)}" (${Date.now() - t0}ms)`);
    res.json({ text: String(transcription).trim() });
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
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
      const trimmedQuery = query.trim();
      let englishQuery = trimmedQuery;
      let expanded = '';

      if (hasGeminiKey()) {
        // Translate non-English queries to English; optionally get expansion in same call to avoid extra latency
        const translateResult = await translateIfNeeded(ai(), trimmedQuery, { getExpansion: true });
        englishQuery = typeof translateResult === 'string' ? translateResult : translateResult.query;
        expanded = typeof translateResult === 'string' ? '' : (translateResult.expanded || '');

        // Query expansion only when query has few terms (natural-language or short) to improve recall
        if (extractQueryTerms(englishQuery).length < MIN_TERMS_TO_SKIP_EXPANSION && !expanded) {
          expanded = await expandQueryForSearch(ai(), englishQuery);
        }
      }

      // Stage 1: Get candidates via FTS (original + expanded terms, stopwords stripped)
      const t0 = Date.now();
      const candidateLimit = 200; // fetch enough to cover broad queries like "hotlines and helplines"
      const candidates = getCandidatesFTS(englishQuery, candidateLimit, expanded);
      console.log(`[FTS] ${candidates.length} candidates in ${Date.now() - t0}ms`);

      if (candidates.length === 0) {
        return res.json({ query: trimmedQuery, results: [], hasMore: false });
      }

      // Stage 2: LLM rerank only when API key is set; otherwise use FTS order (no token usage).
      // Send only top N candidates to reduce prompt size and latency (LLM returns max 15 anyway).
      if (hasGeminiKey()) {
        const toRerank = candidates.slice(0, RERANK_CANDIDATE_LIMIT);
        ranked = await llmRerank(ai(), englishQuery, toRerank);
        setCache(key, ranked);
      } else {
        ranked = candidates.map((r) => ({ id: r.id, score: 50 }));
      }
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
// Comparison summary for the BookmarksScreen compare view, and the three-bullet
// summary for the DetailDrawer. Both live in
// supabase/functions/_shared/ai/routes.js with their prompts and limits; the
// comparison is the one deliberate exception to the sanitize.js rule, and the
// reason is recorded there.
// ---------------------------------------------------------------------------
app.post('/api/compare-summary', async (req, res) => {
  const { status, body } = await compareSummaryRoute(ai(), req.body);
  res.status(status).json(body);
});

app.post('/api/summarize-bullets', async (req, res) => {
  const { status, body } = await summarizeBulletsRoute(ai(), req.body);
  res.status(status).json(body);
});

// ---------------------------------------------------------------------------
// Searching a catalogue this server does not hold.
//
// /api/search answers from the bundled SQLite file, which is a year-old copy of
// 3,075 innovations keyed by integer. The web build's Explore reads FAO's
// JSON:API, where the same catalogue is 6,287 innovations keyed by uuid, so the
// two surfaces disagreed about what an innovation is: bookmarking one record
// from each stored it twice, and a record saved from search could not be
// refreshed from the portal at all.
//
// The fix is to stop being a source of data and stay a source of intelligence.
// The two routes below hold no database handle. The client asks the portal who
// matches, ranks the candidates itself, and sends them here to be ordered by
// the same model /api/search uses. One catalogue, one set of ids, and nothing
// to keep in sync.
//
// /api/search stays exactly as it is: the phone reads the bundled file for both
// search and Explore, so on the phone the two already agree.
// ---------------------------------------------------------------------------

/**
 * Turn a typed question into words to search a catalogue with.
 *
 * Has to be a round trip of its own, because this is the one stage that must
 * happen before the catalogue is asked anything: a query typed in French
 * matches nothing in an English catalogue. Degrades rather than failing: with
 * no API key the query is passed through as typed and the terms are extracted
 * locally. See searchTermsRoute.
 */
app.post('/api/search-terms', async (req, res) => {
  const { status, body } = await searchTermsRoute(ai(), req.body);
  res.status(status).json(body);
});

/**
 * Order candidates the caller found, by relevance, affordability and simplicity.
 *
 * The same llmRerank that /api/search stage 2 uses, over rows supplied in the
 * request. Results are cached here keyed on the query and the candidate set:
 * the same question over a different pool is a different ranking, and the pool
 * changes whenever the catalogue is republished. See rankRoute.
 */
const rankCache = {
  key: (query, ids) =>
    `rank:${cacheKey(query)}:${crypto.createHash('sha1').update([...ids].sort().join(',')).digest('hex')}`,
  get(query, ids) {
    return getCached(this.key(query, ids));
  },
  set(query, ids, ranked) {
    setCache(this.key(query, ids), ranked);
  },
};

app.post('/api/rank', async (req, res) => {
  const { status, body } = await rankRoute(ai(), req.body, { cache: rankCache });
  res.status(status).json(body);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', innovations: db.prepare('SELECT COUNT(*) as count FROM innovations').get().count });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
// Only bind a port when run directly (`node server.js`); importing the module
// for tests must not start a listener.
if (require.main === module) {
  process.on('uncaughtException', (err) => {
    console.error('[ATIO Search] Fatal:', err);
    process.exit(1);
  });
  app.listen(PORT, () => {
    const count = db
      .prepare('SELECT COUNT(*) as count FROM innovations')
      .get().count;
    console.log(`[ATIO Search] Server running on port ${PORT}`);
    // The bundled snapshot, not the live catalogue: only the phone's /api/search
    // reads it. The web build finds its records on the FAO portal and only asks
    // this server to translate and rank them, so its counts differ from this one.
    console.log(
      `[ATIO Search] ${count} innovations in the bundled snapshot (phone search only; the web app reads the live FAO catalogue)`
    );
  });
}

module.exports = { app, db, hasGeminiKey, resetAiClient, cacheKey, getCached, setCache, queryCache, extractQueryTerms, getCandidatesFTS, trimIncompleteEnding };
