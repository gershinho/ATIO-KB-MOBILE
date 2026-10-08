# Supabase web migration: measurements and parity

What the switch from the FAO JSON:API to Supabase changed, measured, and every
place the new path knowingly behaves differently from the old one. The plan
itself is `SUPABASE-IMPLEMENTATION.md`; how to run and ship it is
[SUPABASE-HANDOVER.md](SUPABASE-HANDOVER.md).

## Before and after

Both builds were run through the same scripted journey in headless Chrome
(Playwright driving system Chrome), 8 October 2026, against staging snapshot 2
(6,287 records). A new browser profile each run, so "cold" means no IndexedDB,
no service worker and no HTTP cache.

| Step | FAO JSON:API (baseline) | Supabase | 
|---|---|---|
| Cold load until the full catalogue index is stored | **377 s**, 150 requests | **5.8 s**, 8 requests (1 vocabularies + 7 index pages) |
| Open Explore (headline counts, challenge and type tiles) | 10.4 s, 2 requests | 3.3 s, 39 count calls |
| Filtered drilldown (Crops & Production, 10 cards) | **timed out** after 30 s | 0.5 s, 1 call |
| Detail with AI bullets | timed out (drilldown never loaded) | 6 s step, 1 call + `summarize-bullets` |
| Search ("low cost grain storage for smallholders") | **timed out** after 40 s; one portal 504 | 3.7 s, 5 calls (`search-terms` → `search_candidates` → `rank` → records) |
| Reload with pinned records | 0 requests in the window | 1 call (`get_changed`) |
| Offline reload | shell and index served | shell, index and both bookmarks served, offline notice shown |
| Requests to sti-portal.fao.org | every catalogue read | **none** |

Transfer for the Supabase cold load: **1.8 MB** on the wire (compressed),
about 8 MB uncompressed. The baseline's 49.8 MB is not comparable: in a browser
the portal path has to go through the dev proxy (`npm run proxy`) — the portal
sends no CORS header — and the proxy forwards responses uncompressed.

Read the baseline with two things in mind:

- It includes the request limiter added on 8 October (`c5954c3`, two requests
  to the portal at a time), which was what stopped testers overloading the ATIO
  server. Before it, the cold pass was measured at 12 s warm and minutes cold
  (`docs/JSON-API.md`); with it, a cold pass is minutes.
- The portal was slow on the day — a filtered drilldown answered in 13–54 s on
  6 October and did not answer in 30 s here — and returned a 504 during the run.

### Server-side timings (staging, warm)

| RPC | Time |
|---|---|
| `browse_innovations`, one page | 0.2–0.6 s round trip |
| `get_catalog_index`, 1,000 rows | 0.5–1.5 s round trip, ~1.3 MB uncompressed |
| `search_candidates`, four words | 98 ms in the database (was 455 ms; see below) |
| `search_candidates`, one word + seven suggestions | 102 ms in the database |
| Edge Functions (Gemini, thinking off) | 1–2 s each |

`search_candidates` first shipped matching each row against an `unnest()` of
the words, which forced a full scan: 455 ms warm, and intermittently past the
anon role's 3 s statement timeout on a cold instance — seen once in the browser
journey as a 500, which the app correctly answered from its cache. Migration
`20261008150000_search_index.sql` writes the words out as explicit `ILIKE`
conditions so the trigram index is used. Results are unchanged (all nine
contract queries still match `findCandidates` exactly).

## Parity: how it was checked

| Area | Check | Result |
|---|---|---|
| Mapped records, cost, complexity | `__tests__/importer.test.js` against a captured portal page | identical |
| Filtered browsing | `importer/checks/browseParity.js`: 84 filter bags against `localFilter.matchIndex` over the snapshot's own index — counts, order, page boundaries | 84/84 |
| Details, changed stamps, vocabularies, index | `importer/checks/rpcContracts.js` | all match stored rows |
| Search candidates | same script: the real `findCandidates` over a stand-in portal serving the snapshot | 9/9 identical |
| Caches and offline | `__tests__/supabaseCaches.test.js`, browser offline reload | same keys, TTLs, stale serving |
| AI routes | `__tests__/aiRoutes.test.js`, `backend/__tests__/aiPaths.test.js`, live calls | same contracts |

## Known differences from the portal path

1. **Search order inside a stage.** The portal returned matches in an
   unspecified order and the app read the first 150; `search_candidates` reads
   the 150 most recently changed. Strict-first, de-duplication, the cap and the
   expansion-word choice are unchanged.
2. **Search matches plain text.** The portal's `CONTAINS` ran over the stored
   HTML of the short description; the snapshot stores it as text
   (`htmlToText`), so a word that only appeared inside markup no longer matches.
3. **Ties in browse order break on uuid.** The browser index sorted equal
   `changed` stamps in crawl order; the RPC breaks them on uuid, so pages are
   stable. The parity check compares against that documented order.
4. **The AI model is Gemini** (`gemini-3.6-flash`, thinking off) instead of
   gpt-4o-mini, on both the Edge Functions and Express. Prompts, limits and
   response handling are unchanged; the answers themselves will differ.
5. **Translation still only covers non-Latin scripts.** Unchanged from before:
   `translateIfNeeded` skips any query that is over 70% Latin letters, so French
   or Spanish queries are searched as typed.
6. **Explore tile counts are 39 small calls** (one per tile and the headline)
   rather than the portal's `meta.count` requests. They fall back to the stored
   index offline, as before.
7. **A record whose title ends in a newline** keeps it (e.g. "SatSure
   Sparta\n") — the portal data says so, and the mapper has always passed it
   through.
