# Search Improvements Proposal

Plans for **semantic retrieval** and **typo robustness** in the ATIO KB search backend.

---

## Problem 1: Semantic Retrieval

**Current:** Stage 1 uses SQLite FTS (lexical match). Queries like "things that prevent crop loss" only match innovations that contain those exact words. Paraphrases ("reduce post-harvest waste", "minimize spoilage") may be missed.

**Goal:** Retrieve candidates by *meaning*, not just keywords.

---

### Plan A: Query expansion (minimal change) — **implemented**

**Idea:** Before FTS, use a small LLM call to expand the user query into synonyms and related phrases. Run FTS on the *original* query terms **plus** expanded terms (OR together).

**How it works (current implementation):**

1. **Translate (non-English only):** If the query looks non-English, we call the LLM once and ask for both the English translation and 5–8 comma-separated search keywords in English. So non-English queries get expansion in the same round-trip as translation — no extra call.
2. **Expand (English, short queries only):** If the query is already in English and has **fewer than 3 meaningful terms** (after stopword stripping), we call a small LLM to get 5–8 comma-separated keywords/phrases that capture the same intent. If the query already has 3+ meaningful terms (e.g. "drought resistant maize varieties"), we **skip expansion** so we don't add latency for keyword-rich queries.
3. **Merge and FTS:** We merge original terms with expanded terms (dedupe), then run FTS with **OR** over all terms. When expansion was used we skip the AND step so we don't over-narrow.

**Latency controls:**

- **No extra call for non-English:** Translation and expansion are combined in one LLM call when we translate.
- **Skip expansion when terms ≥ 3:** Only 1–2 term queries (e.g. "crop loss", "drought") trigger the expansion call; longer queries use FTS only.
- **Small expansion call:** `gpt-4o-mini`, `max_tokens: 80`, short prompt so the extra call is fast when it runs.

**Flow:**  
`query` → (optional) translate + expand in one call if non-English → (if English and terms < 3) expand → `extractQueryTerms(original + expanded)` → FTS OR (and skip AND when expanded).

**Pros:** No new infra (no vector DB, no embeddings). Reuses existing FTS. Latency impact minimized by skip-when-rich-terms and combined translate+expand.  
**Cons:** Still lexical; expansion quality depends on LLM.  
**Effort:** Low. One new async step + merge term lists.

---

### Plan B: Embeddings + vector search as Stage 1 (full semantic)

**Idea:** Precompute embeddings for each innovation (e.g. `short_description + long_description`), store vectors. At query time: embed query → k-NN → use those IDs as candidates → existing LLM rerank unchanged.

**Options for storage:**

- **sqlite-vec** (or similar): Add a vector column / separate table; k-NN in SQLite. Keeps one DB.
- **In-memory:** Load embeddings on startup from a JSON/DB table; use a small lib (e.g. cosine similarity) to get top-K. Fine for moderate corpus size.
- **External:** Pinecone, Weaviate, pgvector, etc. More setup, scales better.

**Flow:**  
`query` → translate if needed → **embed query** → **vector search** (top 100–200) → LLM rerank (unchanged).

**Pros:** True semantic retrieval; paraphrases and conceptual queries work.  
**Cons:** Need embedding pipeline (OpenAI or local model), storage, and (if large) an index.  
**Effort:** Medium–high. New script to generate/store embeddings; new Stage 1 path; env for API key if using OpenAI embeddings.

---

### Plan C: Hybrid FTS + embeddings (recommended balance)

**Idea:** Keep FTS for speed and to guarantee some lexical overlap. Add a semantic layer that *reranks* or *merges* with FTS.

**Variant C1 – Semantic rerank between FTS and LLM:**  
FTS → top N candidates (e.g. 100) → **embed query + each candidate** → rank by similarity → top K (e.g. 40) → existing LLM rerank.  
Adds one embedding step; no new DB if you embed on the fly (cost/latency tradeoff).

**Variant C2 – Two retrieval paths, then merge:**  
Run in parallel: (1) FTS top 80, (2) Vector search top 80. **Reciprocal rank fusion** (or similar) to merge and dedupe → top 100–200 → LLM rerank.  
Requires precomputed embeddings and vector search (as in Plan B).

**Pros:** Lexical + semantic; good recall and robustness.  
**Cons:** C1: more API cost if embedding on the fly. C2: need vector store.  
**Effort:** Medium.

---

### Plan D: LLM-generated keywords only (no vector DB)

**Idea:** Replace FTS query with an LLM-generated query. Single call: "User problem: X. Output 5–10 exact search phrases or keywords we can use for a text search." Then run current FTS (AND/OR) on that string.

**Pros:** No embeddings, no new DB. Better intent capture than raw query.  
**Cons:** Still lexical; FTS can still miss if LLM omits a key phrase.  
**Effort:** Low.

---

## Problem 2: Mistyped words → broken output

**Current:** Typos (e.g. "harvst", "drough") produce zero or few FTS matches → AND fails → OR may still fail if the typo is in the index → fallback to LIKE with the typo, which also misses. Result: empty or poor candidates → bad or empty final list.

**Goal:** Correct or compensate for typos so retrieval is robust.

---

### Plan 1: Query correction step (recommended)

**Idea:** Before FTS, run a **spell-check / typo correction** on the query. Use the corrected query for FTS and LLM; optionally keep original for display.

**Options:**

- **LLM:** One short call: "Correct any typos in this search query. Return only the corrected query, nothing else." Same pattern as `translateIfNeeded`.  
- **Library:** e.g. `nspell` + `en_US` dictionary, or a lightweight spell-checker in Node. No API cost; may miss domain terms (e.g. "FTS", "SDG").

**Flow:**  
`query` → (optional) **correct typos** → translate → FTS → LLM rerank.  
If correction is LLM-based, you can combine with "translate to English" in one call: "Correct typos and, if not English, translate to English. Return only the final query."

**Pros:** Fixes mistyped words so FTS and LLM see valid terms.  
**Cons:** LLM adds latency/cost; library may over-correct technical/domain terms.  
**Effort:** Low.

---

### Plan 2: FTS prefix matching for last token

**Idea:** For multi-word queries, use **prefix** on the last term only (e.g. "crop harv*") so trailing typos or incomplete typing still match ("harvest", "harvesting").  
Implement by detecting single-term or last-term and appending `*` in FTS query where supported (FTS5 supports prefix).

**Pros:** No new service; helps suffix typos.  
**Cons:** Doesn't fix mid-word or full-word typos (e.g. "drough").  
**Effort:** Low.

---

### Plan 3: Typo-aware fallback chain

**Idea:** If FTS (AND then OR) returns very few results (e.g. < 3), **retry** with a corrected query (Plan 1), then FTS again. If still empty, fall back to `getCandidatesLike` with corrected terms.

**Pros:** Only triggers correction when needed; keeps fast path for correct queries.  
**Cons:** First result may be slower when correction runs.  
**Effort:** Low once correction exists.

---

### Plan 4: Fuzzy / edit-distance expansion (optional, advanced)

**Idea:** For each query term, generate variants within edit distance 1–2 (e.g. Levenshtein). Run FTS with OR over original + variants.  
Requires careful limits (e.g. only expand terms > 4 chars, max 3 variants per term) to avoid explosion.

**Pros:** Can recover from typos without an external corrector.  
**Cons:** More complex; risk of false matches; FTS may not support all variants.  
**Effort:** Medium.

---

## Recommended combination

1. **Typos (quick win):** Add **Plan 1 (query correction)** and **Plan 3 (fallback chain)**. Use one LLM call that can both "correct typos and translate if not English" to avoid two round-trips. Retry FTS with corrected query when candidate count is very low.
2. **Semantic (staged):**  
   - **Short term:** **Plan A (query expansion)** – one LLM expansion step before FTS; minimal code and no new infra.  
   - **Medium term:** **Plan C (hybrid)** – add embeddings for rerank (C1) or second retrieval path (C2) so semantic retrieval is first-class while keeping FTS.

---

## Implementation order

| Step | What | Problem addressed |
|------|------|-------------------|
| 1 | Add `correctQueryIfNeeded(query)` (LLM or library); call before translate + FTS. | Typos |
| 2 | If FTS candidate count < 3, retry FTS with corrected query; then fallback to LIKE. | Typos |
| 3 | Add `expandQueryForSearch(query)` (LLM); merge terms with `extractQueryTerms(query)`; FTS OR over combined list. | Semantic |
| 4 | (Later) Add embeddings + vector search or hybrid FTS+vector merge. | Semantic (full) |

This keeps the current two-stage design, improves robustness to typos and intent, and sets the stage for full semantic retrieval when you're ready to add embeddings.
