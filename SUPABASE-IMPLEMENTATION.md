# Supabase web migration — implementation guide

This document is the execution contract for moving the web PWA's shared catalogue reads from FAO JSON:API to Supabase. Work in the order below. Each task names its inputs, intended changes and completion checks.

## Decisions

- **Web deployment:** `https://sti-portal.fao.org/atiokb-webapp`.
- **Catalogue source:** Supabase Postgres for web reads; native app and its bundled SQLite database remain unchanged.
- **Refresh cadence:** a Node importer is run manually from a developer's local machine, usually weekly. A GitHub Actions workflow is a later, separate task.
- **Snapshot safety:** import a complete new run, validate it, then move one active-run pointer atomically. Keep the previous complete run for rollback.
- **Search:** PostgreSQL `pg_trgm`, retaining the current case-insensitive substring behavior. Preserve the strict/loose candidate pipeline and expansion-term selection behavior.
- **Offline:** retain the complete `catalogIndex:v2` cache, existing IndexedDB stores, TTLs and stale behavior. Change the online source that fills the index.
- **AI:** port the four web-used routes to Supabase Edge Functions: `search-terms`, `rank`, `summarize-bullets`, and `compare-summary`.
- **Release target:** staging only. Write a production cutover checklist; do not apply production changes as part of this work.

## Working rules

1. Before editing, inspect `git status` and preserve existing work. Establish a safe checkpoint without staging unrelated changes.
2. Give Claude Code one task below per change set. Ask it to inspect the named files, summarize current behavior, implement only that task, run its listed checks and report changed files, test results and unresolved questions.
3. Keep existing exports and caller return shapes in `src/database/db.web.js` and `src/database/querySearch.web.js`. Change their web data-source implementations behind those contracts.
4. Treat the current implementation and tests as the behavior oracle. Port behavior; do not invent new filter or offline semantics during this migration.
5. Keep Supabase service credentials and OpenAI credentials in local/server secret stores. Browser bundles contain only the Supabase project URL and publishable key.

## Task 1 — establish the staging schema and local importer

### Inspect

- `src/api/jsonapi/mapInnovation.js`: mapper inputs, term resolution and complete mapped innovation shape.
- `src/api/jsonapi/taxonomies.js`: vocabulary endpoints, pagination, cache shape and lookup helpers.
- `src/api/jsonapi/catalogIndex.js`: page size/concurrency, index-row shape, source-title lookup, progress events, and `catalogIndex:v2` TTL/stale rules.
- `shared/deriveCostComplexity.js`: exact `deriveCost` and `deriveComplexity` inputs and behavior.
- `src/api/jsonapi/filterSpec.js`: filterable taxonomy names and field paths.
- `docs/JSON-API.md`: upstream API assumptions and pagination contract.
- `package.json` and `app.json`: Node/runtime configuration and current Expo web output settings.

### Implement

1. Initialize the Supabase project files and create a migration for a private catalogue schema. Include:
   - `import_runs` with start/finish, status, row count and error details.
   - `catalog_state` with one active-run pointer.
   - `innovations`, keyed by `(run_id, uuid)`, with the complete mapped payload plus typed columns needed for filtering, sorting and search.
   - `taxonomies`, keyed by `(run_id, vocabulary, term_id)`.
   - `cost_level` and `complexity_level`, computed during import with the shared derivation logic.
2. Keep raw snapshot tables outside the browser's directly exposed Data API surface. Provide narrowly scoped public read RPCs in later tasks. Fix each security-definer function's `search_path`, grant only the required execution permissions, and test access as `anon` and the importer role.
3. Add indexes only for implemented queries: snapshot/version plus changed/readiness ordering, GIN for array filters, and a trigram GIN index over the combined title/short-description search text.
4. Create a local Node importer, for example `importer/run.js`, and an npm script such as `npm run import:supabase`. Confirm the existing Node runtime can load the mapper/shared modules; add only the smallest compatibility adapter needed. The importer runs manually and reads its database connection secret from a local file verified as git-ignored or from the shell environment. It has no scheduler in this phase.
5. Fetch the nine vocabularies and innovation pages with the current page limit and controlled concurrency. Reuse the existing mapper and `shared/deriveCostComplexity.js`; avoid maintaining a second mapping implementation.
6. Batch writes under a new `run_id`. Validate a non-empty, unique UUID set, vocabulary completeness, record-count tolerance against the last good run, derived fields and selected known records.
7. Publish only after validation. Switch `catalog_state.active_run` and update run statuses in one transaction. Mark failures with diagnostics while leaving the previous pointer unchanged.

### Completion checks

- Migration applies to staging and raw tables are not readable through the anonymous Data API.
- A manual local run populates a complete staging snapshot and reports its run ID and counts.
- A second run is safe to retry. A simulated failure before publish leaves the prior active run readable.
- Stored mapped payload, cost and complexity match the current mapper and derivation module for representative records.
- No secret value is committed or included in the web build.

## Task 2 — implement the browse contract

### Inspect

- `src/database/db.web.js`: exports `searchInnovations`, `countInnovations`, `getMostAdvancedInnovations`, and `getHelpInnovations`.
- `src/api/jsonapi/filterSpec.js`: `PATHS`, taxonomy resolution and filter construction.
- `src/api/jsonapi/localFilter.js`: evaluation of JSON:API filter groups against catalogue-index rows.
- `src/database/paginate.js`: derived-filter paging and count behavior.
- `__tests__/filterContract.test.js`, `__tests__/jsonapiFilterSpec.test.js`, `__tests__/jsonapiCount.test.js`, and `__tests__/dbWeb.test.js`.

### Implement

Create a read RPC, `browse_innovations(filters, limit, offset, sort)`, over the active snapshot. Validate inputs, allowlist sort modes, cap page size and return the existing mapped payload shape. Standardize the RPC response as:

```json
{
  "results": [],
  "count": 0,
  "exact": true,
  "snapshotVersion": "active-run-id"
}
```

Reproduce these filter rules:

- Different filter categories combine with **AND**; multiple selected values within one category combine with **OR**.
- Challenge/type keywords resolve through the same taxonomy terms as `filterSpec.js`.
- Hub regions expand to their mapped countries using `src/data/innovationHubRegions.js`.
- Readiness/adoption minimums exclude records with no indicated level.
- SDGs match the colon-delimited label so `Goal 1:` cannot match `Goal 10:`.
- Source filters preserve case-insensitive substring matching.
- Cost and complexity use values stored by the importer, so filtering, paging and counts agree.
- Sort values are allowlisted and use UUID as a deterministic tie-breaker.

Keep a client-side fallback path behind the source flag. If filter parity is not complete by the agreed timebox, the RPC may return a page from the active snapshot while existing `localFilter.js` applies filters against the full local index. Label this fallback accurately in the handover.

### Completion checks

- Port or adapt the relevant fixtures so every filter category is tested alone and in combinations.
- Verify AND/OR semantics, hub expansion, missing readiness/adoption, SDG 1 versus 10, cost and complexity, sort order, page boundaries and stable tie-breaks.
- Verify `countInnovations` reports an exact count for server-filtered queries.
- Verify the fallback returns the same user-visible filtered results as the existing implementation.

## Task 3 — detail, taxonomy, search and full-index reads

### Inspect

- `src/database/db.web.js`: `getInnovationById`, `getInnovationsByIds`, `getChangedTimes`, `getStats`, `getAllCountries`, `getDataSources`, `getChallengeCounts`, `getTypeCounts`, and `getTopRegions`.
- `src/api/jsonapi/catalogIndex.js`: exact row shape, `catalogIndex:v2` cache contract and progress subscription.
- `src/api/jsonapi/textSearch.js`: strict/loose searches, expanded-term discrimination, candidate cap and returned `{id, title, summary}` shape.
- `src/database/querySearch.web.js`: four-stage search/ranking flow and paging sessions.
- `src/database/heatmapGrids.js`, `__tests__/heatmapGrids.test.js`, and `__tests__/heatmapsWeb.test.js`.

### Implement

Add active-snapshot RPCs for:

- **Details by UUID:** batch lookup that preserves input order at the PWA adapter and returns the mapped payload.
- **Changed stamps:** one batch lookup returning UUID and changed timestamp pairs for pinned-record refresh.
- **Taxonomy terms:** one response for the cached taxonomy index and all vocabularies needed by the client.
- **Full catalogue index:** bounded, stable paging that returns the exact compact index-row shape currently stored under `catalogIndex:v2`, plus snapshot version and total count. Use a tested page limit that stays within the Data API response budget.
- **Search candidates:** one RPC that preserves strict/loose matching, strict-first deduplication, the candidate cap, and the current expansion-word selection rules. Return title and plain-text summary for the existing JS ranking code. Use `pg_trgm` for substring matching; keep AI term generation and ranking response contracts unchanged.

The index adapter should fetch every page, assemble `{rows, sources, builtAt}`, and use the existing IndexedDB key and freshness policy. The client continues computing heatmap grids with `buildOpportunityGrid` and `buildReadyToUseGrid` over that full index. A precomputed `explore_summary` RPC is optional follow-up work, not a prerequisite for preserving the present behavior.

### Completion checks

- Details, changed stamps, taxonomies and index rows match the current caller shapes and order.
- Paging to the end yields a unique UUID set whose count matches the active snapshot.
- The updated catalogue cache retains the existing 6-hour fresh TTL and 7-day stale allowance.
- Existing heatmap grid tests pass without rewriting grouping logic.
- Search fixtures verify strict/loose ordering, deduplication, expansion selection, candidate cap and returned summaries.

## Task 4 — switch the PWA data adapter

### Inspect

- `src/database/db.web.js`, `src/database/querySearch.web.js`, `src/database/warmup.web.js`, and `src/database/heatmaps.web.js`.
- `src/api/jsonapi/catalogIndex.js` and `src/api/jsonapi/taxonomies.js`.
- `src/storage/idb.js`, `src/storage/offlineStore.js`, `src/storage/offlinePrefetch.js`, and `src/database/offlineFallback.web.js`.
- `.env.example` and `workbox-config.js`.
- `app.json` and the Expo web-export settings that control the deployed base path.

### Implement

1. Add `@supabase/supabase-js` and a web Supabase client configured by `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. Add `EXPO_PUBLIC_DATA_SOURCE=supabase|jsonapi`. Default to the current JSON:API path when the flag or Supabase settings are absent. Keep this switch limited to the catalogue data source.
3. Add Supabase branches behind existing `db.web.js` exports. Translate existing filter bags to the RPC input while leaving screen and hook call sites unchanged.
4. Switch `catalogIndex.js` and `taxonomies.js` to their Supabase read paths when selected. Keep the same IndexedDB keys, TTLs, row contracts and stale/failure fallback behavior.
5. Switch the web search candidate lookup to `search_candidates`; keep the existing term-generation and ranking stages until Task 5 switches their backend origin.
6. Keep bookmarks, downloads, likes, cached records, cached search/explore, heatmap cache invalidation, and pinned-record refresh in their existing IndexedDB modules.
7. Keep the Workbox `/jsonapi` rule during this release because the JSON:API adapter remains the rollback route. Do not add a second Supabase service-worker cache while IndexedDB owns catalogue caching. Update `docs/SERVICE-WORKER.md` and `docs/OFFLINE-STORAGE.md` to document verified behavior.
8. Configure and verify the PWA for its subpath deployment at `/atiokb-webapp`: generated JS/CSS/assets, navigation fallback, manifest start URL/scope and service-worker registration must all resolve under that path. Preserve this base path in local production-build smoke tests.

### Completion checks

- `__tests__/dbWeb.test.js`, `__tests__/querySearchWeb.test.js`, `__tests__/catalogIndex.test.js`, `__tests__/taxonomies.test.js`, `__tests__/offlineStore.test.js`, `__tests__/heatmapsWeb.test.js`, `__tests__/cachedExplore.test.js`, and `__tests__/cachedSearch.test.js` pass.
- The built app loads at `https://sti-portal.fao.org/atiokb-webapp`; refresh/deep-link navigation, assets, manifest and service worker all work under the subpath.
- Both `supabase` and `jsonapi` flag paths work in a built web bundle.
- With the Supabase flag, Explore, drilldown, detail and search make no browser requests to FAO JSON:API.
- With the JSON:API flag, the rollback route and current offline cache behavior still work.
- Native data access remains unchanged.

## Task 5 — port the four AI routes

### Inspect

- `backend/server.js`: route handlers for `/api/search-terms`, `/api/rank`, `/api/summarize-bullets`, and `/api/compare-summary`.
- `backend/sanitize.js` and `backend/__tests__/sanitize.test.js`.
- `backend/__tests__/api.test.js` and `backend/__tests__/clientToken.test.js`.
- `src/services/api.js`: `apiOrigin`, bearer header, timeouts, request serialization and response/error handling.

### Implement

Create one Supabase Edge Function per route. Port each route's validation, prompt, model options, response fields, status codes, degradation behavior, text limits, and sanitization. Keep the existing Express endpoints as the JSON:API/rollback origin until staging verification is complete.

- `search-terms`: `{query}` → `{query, englishQuery, terms, expandedTerms}`; retain local-term fallback when the OpenAI key is unavailable.
- `rank`: `{query, candidates}` → `{ranked, ranker}`; retain candidate/text limits and anonymized description-only ranking inputs from `buildSanitizedDocs`.
- `summarize-bullets`: `{text, innovationId}` → `{bullets}`; retain the 3-bullet or `null` behavior.
- `compare-summary`: names and descriptions → `{summary}`; retain empty-description short circuit, 1500-character description cap, defaults and truncated-response handling. Preserve its intentional title/name use.

Route the four calls in `src/services/api.js` to the staging Functions URL when the Supabase data-source flag is active. The deployed PWA origin is `https://sti-portal.fao.org`; configure CORS for that origin (the `/atiokb-webapp` path is not part of an origin). Configure the function gateway and bearer-token check deliberately. The public client token is visible in the bundle and remains a casual-traffic gate, not user authentication.

### Completion checks

- Deploy all four functions to staging and set `OPENAI_API_KEY` only as a server-side Supabase secret.
- Port contract tests for success, validation, no-key degradation, response shape, sanitization, and failure status behavior.
- Verify wrong/missing bearer token behavior matches the chosen gateway configuration.
- Verify requests from the deployed staging PWA path pass CORS and all four calls use the expected function URLs.
- Verify the production OpenAI key and production function configuration remain untouched.

## Task 6 — staging verification and handover

### Run

1. `npm test` (app Jest suite and backend suite).
2. `npm run build:web`.
3. Serve the built PWA in a browser using staging configuration. Test cold Explore, filtered drilldown, detail, search, pinned refresh and AI actions.
4. Check the network panel: Supabase RPCs and Functions serve migrated flows; no FAO JSON:API requests occur while the Supabase flag is selected.
5. Test offline after a successful online load: cached full index and taxonomies remain available, saved records remain available, and stale/partial states remain clear.
6. Deliberately fail a staging import before publish and verify the previous snapshot remains active.
7. Switch back to `EXPO_PUBLIC_DATA_SOURCE=jsonapi` and verify rollback behavior.
8. Record request counts, transferred bytes and cold/warm timings against the baseline in `docs/SUPABASE-WEB-PLAN.md`.
9. Update `docs/SERVICE-WORKER.md`, `docs/OFFLINE-STORAGE.md`, and the implementation handover with the tested behavior, importer command, environment variable names, staging project setup, known gaps and production cutover checklist.

### Completion criteria

- App tests, backend tests and web build pass.
- Staging web journeys work through Supabase; offline behavior and rollback are demonstrated.
- Failed import leaves the previous snapshot active.
- Performance measurements and any deviations from parity are documented.
- Production cutover remains a separate, explicitly approved operation.

## Later: move the manual importer to GitHub Actions

Treat automation as a follow-up after repeated local imports succeed. Add a workflow with both scheduled and manual triggers, store the database connection secret in GitHub Actions secrets, run the same importer entry point, and report the run ID/count/status. Keep import and publish logic in the script so the workflow is only a scheduler/runner wrapper. Test a manual workflow run before enabling the weekly schedule.
