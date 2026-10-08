# Supabase web migration: handover

The web PWA reads its catalogue from Supabase instead of the FAO JSON:API, and
its four AI calls go to Supabase Edge Functions running Gemini. The native app
and its bundled SQLite catalogue are untouched; the Express backend the phone
uses is now on Gemini too. Built on branch `sprint3` against the **staging**
project; nothing has been deployed to production.

Measurements and every known behavioural difference are in
[SUPABASE-WEB-PLAN.md](SUPABASE-WEB-PLAN.md). The plan this follows is
`SUPABASE-IMPLEMENTATION.md`.

## How it fits together

```
FAO JSON:API ──► npm run import:supabase (your machine, weekly)
                   │  reuses the app's own client, vocabulary loader, mapper
                   ▼
           Supabase Postgres, private `catalog` schema
           (one complete snapshot per run; one active-run pointer)
                   │  read-only RPCs, publishable key
                   ▼
           PWA at /atiokb-webapp ──► IndexedDB (index, vocabularies, saved records)
                   │
                   └─► Edge Functions (search-terms, rank, summarize-bullets,
                       compare-summary) ──► Gemini
```

| Piece | Where |
|---|---|
| Schema, publish, RPCs | `supabase/migrations/` |
| Importer | `importer/run.js`, `importer/records.js`, `importer/validate.js` |
| Live checks | `importer/checks/browseParity.js`, `importer/checks/rpcContracts.js` |
| App adapter | `src/api/supabase/` (`config.js`, `client.js`, `reads.js`, `browseFilters.js`) |
| AI route logic (shared by Express and the functions) | `supabase/functions/_shared/ai/` |
| Edge Functions | `supabase/functions/{search-terms,rank,summarize-bullets,compare-summary}/` |
| Local subpath server | `scripts/serve-web.js` (`npm run serve:web`) |

## Environment variables

| Name | Where | Public? | What |
|---|---|---|---|
| `EXPO_PUBLIC_DATA_SOURCE` | build | yes | `supabase` or `jsonapi` (default; the rollback) |
| `EXPO_PUBLIC_SUPABASE_URL` | build | yes | `https://<ref>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | build | yes | reaches only the read RPCs |
| `EXPO_PUBLIC_API_CLIENT_TOKEN` | build | yes (in the bundle) | casual-traffic gate for the AI routes |
| `SUPABASE_DB_URL` | `.env.local`, importer only | **secret** | Postgres connection (session pooler) |
| `GEMINI_API_KEY` | Supabase secret; `backend/.env` | **secret** | Gemini |
| `GEMINI_MODEL` | Supabase secret; `backend/.env` | no | default `gemini-3.6-flash` |
| `API_CLIENT_TOKEN` | Supabase secret; `backend/.env` | matches the bundle's | checked by functions and Express |
| `ALLOWED_ORIGINS` | Supabase secret, optional | no | extra CORS origins for the functions |

`supabase/functions/.env` (git-ignored, mode 600) holds the function secrets
for `supabase secrets set --env-file`. `.env.local` is git-ignored.

## Staging setup (as built)

- Project `notkrrzjodfzcexmwalv` ("ATIOKB Webapp", eu-west-1, free plan).
- Migrations applied: catalog, browse, reads, search index.
- Snapshot: run 2 published (6,287 records, 616 terms, 15 sources). Runs 1, 3
  and 4 are failed runs kept as history (1 was a wrong known-record id, 3 and 4
  deliberate rehearsals).
- Functions deployed with `verify_jwt = false`; secrets `GEMINI_API_KEY`,
  `GEMINI_MODEL`, `API_CLIENT_TOKEN` set.

## Day to day

```sh
# Weekly refresh (about 20 min cold, ~1.5 min if the portal cache is warm)
npm run import:supabase
npm run import:supabase -- --fail-before-publish   # rehearse a failed run

# Check the snapshot against the app's own logic
npx tsx importer/checks/browseParity.js     # ~20 min, 84 filter bags
npx tsx importer/checks/rpcContracts.js     # ~1 min

# Schema and functions
supabase db push --linked
supabase functions deploy search-terms rank summarize-bullets compare-summary --use-api
supabase secrets set --env-file supabase/functions/.env

# Build and smoke-test the PWA under its real path
EXPO_PUBLIC_DATA_SOURCE=supabase npm run build:web
npm run serve:web      # http://localhost:8090/atiokb-webapp/
```

`npm run build:web` clears the bundler cache on purpose: without it a changed
`EXPO_PUBLIC_DATA_SOURCE` is silently ignored.

The importer always reads the portal (it pins the data source to `jsonapi`
whatever `.env.local` says), at two requests in flight. It validates before
publishing — unique non-empty ids, all nine vocabularies, record count within
±10% of the last published run, cost and complexity on every record, the two
fixture records present — and on any failure marks the run failed and leaves
the live snapshot alone.

**Rolling back the data:** `catalog_state.previous_run` is the last snapshot
the current one replaced. Pointing `active_run` back at it (SQL, one row) is
the rollback; it is null until a second run has been published.
**Rolling back the app:** rebuild with `EXPO_PUBLIC_DATA_SOURCE=jsonapi`.

## Known gaps

- **The portal rollback route is slow.** It works — the full catalogue and
  Explore load — but against the portal on 8 October, with the two-in-flight
  limiter, a cold pass took 377 s and filtered drilldowns and search timed out.
  It is a rollback, not an equal.
- **Free plan.** Free projects pause after a week without activity and cap the
  database at 500 MB (two snapshots use ~130 MB). Production needs a paid plan.
- **The anon role's 3 s statement timeout.** Every RPC is well under it now;
  `search_candidates` was not until the index migration. Keep new queries on
  indexes.
- **The client token is not authentication.** It ships in the bundle; it only
  stops casual traffic spending the Gemini budget.
- **CORS on the functions allows localhost** for local testing. Remove that for
  production (the `LOCAL_ORIGIN` rule in `supabase/functions/_shared/http.js`).
- **Credentials were exposed during the build session.** The staging database
  password and the Gemini key were printed into an assistant session transcript
  on 8 October. Rotate both.
- **The importer is manual.** A GitHub Actions schedule is the planned follow-up
  (see SUPABASE-IMPLEMENTATION.md, "Later").
- **Search ranking now depends on Gemini.** Worth a human look at a handful of
  real queries; see SUPABASE-WEB-PLAN.md for every known difference.

## Production cutover checklist

Separate, explicitly approved operation. In order:

1. **Project.** Decide: a new production Supabase project, or promote staging.
   Either way, a paid plan (no pausing).
2. **Credentials.** Rotate the database password and the Gemini key (both were
   exposed in a session transcript). Generate a new `API_CLIENT_TOKEN`.
3. **Schema.** `supabase link --project-ref <prod>`, `supabase db push`.
4. **Data.** `SUPABASE_DB_URL` for production in `.env.local`, then
   `npm run import:supabase`. Run both checks scripts against it.
5. **Functions.** Remove the localhost CORS rule, deploy the four functions,
   set `GEMINI_API_KEY`, `GEMINI_MODEL`, `API_CLIENT_TOKEN`.
6. **Build.** `EXPO_PUBLIC_DATA_SOURCE=supabase`, the production URL,
   publishable key and client token; `npm run build:web`.
7. **Host.** Publish `dist/` at `https://sti-portal.fao.org/atiokb-webapp/`.
   The server must serve `index.html` for any path under it without a file
   extension, 404 missing files, and send `sw.js` with `Cache-Control: no-cache`
   (as `scripts/serve-web.js` does).
8. **Smoke test** the deployed URL: cold load, Explore, drilldown, detail,
   search, bookmark and compare, offline reload; the network panel shows no
   requests to `/jsonapi`.
9. **Express backend** (the phone's): deploying this branch moves it to
   Gemini. Set `GEMINI_API_KEY` (and `API_CLIENT_TOKEN` if the gate is wanted)
   on its host before restarting it. Voice transcription goes through Gemini.
10. **Schedule** the weekly import, by hand at first.
11. **Rollback plan** ready: a `jsonapi` build kept to hand, and
    `previous_run` for data.
