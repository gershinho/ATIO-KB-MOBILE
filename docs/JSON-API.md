# Talking to the FAO JSON:API

The web build gets its innovation data from `https://sti-portal.fao.org/jsonapi`
rather than from the bundled SQLite catalogue, which the phone keeps using. This
is the layer underneath that: how requests are made, and what the portal's shape
becomes once it reaches the app.

Everything here is Sprint 2, step 1. Nothing calls it from a screen yet.

## Running it locally

```
npm run proxy      # terminal 1 — the dev proxy on 127.0.0.1:3002
npm run web        # terminal 2 — the app
```

The proxy is required in a browser, and it is not about access. The portal
serves the JSON:API to anyone — `curl` it and you get data, no key, no login —
but it sends no `Access-Control-Allow-Origin` header, so a **browser** throws
the response away before our code sees it. The proxy asks on the browser's
behalf, server to server, where that rule does not apply, and re-serves the
answer with the header attached.

`proxy/proxy.js` is Diego's file, kept verbatim apart from its header comment.
It is development-only: it binds to localhost and allows every origin, which is
safe on a laptop and would not be on a public host. Production depends on CORS
being enabled on the portal.

Native builds have no page origin and therefore no CORS rule, so a device can
be pointed straight at the portal with `EXPO_PUBLIC_JSONAPI_URL`.

## The three modules

| File | Job |
|---|---|
| `src/api/jsonapi/query.js` | Builds the bracketed query strings |
| `src/api/jsonapi/client.js` | Makes the request: timeout, retries, errors |
| `src/api/jsonapi/mapInnovation.js` | Portal record → the app's `Innovation` |
| `src/api/jsonapi/taxonomies.js` | Preloads the vocabularies, caches them a day |
| `src/api/jsonapi/filterSpec.js` | The app's filter bag → JSON:API conditions |
| `src/api/jsonapi/count.js` | How many match, with or without `meta.count` |
| `src/api/jsonapi/catalogIndex.js` | One pass over the catalogue, kept for hours |
| `src/database/db.web.js` | The web twin of `db.js` |
| `src/database/heatmaps.web.js` | The web twin of `heatmaps.js` |
| `src/database/heatmapGrids.js` | The grid arithmetic both platforms share |
| `src/storage/idb.js` | IndexedDB, wrapped in promises |

### query.js

JSON:API asks for everything through brackets — `page[limit]`,
`fields[node--innovation]`, `filter[title][condition][operator]` — and every
bracket must be percent-encoded. An unencoded one is not an error upstream; the
parameter is simply ignored, so `filter[status]=1` quietly stops filtering.
That silence is why the tests assert on exact strings.

Two things worth knowing:

- **Page size caps at 50.** Asking for 200 returns 50 without complaint, which
  reads as "the collection ended" to a pager that believed the number. The
  builder clamps it.
- **Sparse fieldsets are not optional.** A full innovation record is about 5 KB
  and a request for whole records has been measured timing out at 40 seconds.
  Ask for the fields you need.

### client.js

Follows the contract `services/api.js` already set: `message` is a sentence a
screen may render verbatim, and every diagnostic detail lives on `cause`. The
portal's own wording — "Failed to fetch", a Cloudflare 502, a Drupal complaint
about page size — never reaches a user.

It retries, which our backend client does not, because this is a public Drupal
site behind a cache: cold responses of ~22 seconds and occasional gateway
errors are normal. 5xx, 429, timeouts and failures to connect are retried with
a growing delay; a 4xx is not, because a second identical bad query is still bad.

### mapInnovation.js

The hinge. Every screen consumes the shape documented in `database/enrich.js`,
so as long as the mapper's output matches field for field, nothing downstream
changes. Three deliberate departures:

- **`id` is a uuid string**, not a number. The mapping card lists this as a
  constraint ("IDs migrate to UUID").
- **An unknown readiness or adoption level is `null`**, where `enrich.js`
  defaults to 1. The portal has a real `NOT INDICATED` term, and reading it as
  level 1 would state something the record does not.
- **`useCases` comes from `field_use_cases` alone**, though the mapping card
  also names `field_challenges_addressed`. They are different vocabularies:
  the bundled `innovation_use_cases` table holds the first one's terms
  ("climate change adaptation", "Natural resources management & sustainable
  practices"), while the second holds "Drought / water scarcity", "Poverty".
  Merging would move innovations between heatmap columns on web only, and the
  two platforms would stop agreeing.

Descriptions arrive as HTML and leave as plain text, because every screen
renders them into a React Native `<Text>`, which would print the tags.

### taxonomies.js

The portal does not put "Kenya" or "9. Ready" on an innovation — it puts a uuid,
and the name lives elsewhere. Either every page of results drags the terms along
with `include=`, re-sending the same few hundred names on every page, or we
fetch the vocabularies once and translate ids ourselves. The second is the
low-bandwidth half of the offline card, and it is cheap: **nine vocabularies,
616 terms, 18 requests, 3.8 seconds in parallel, cached for a day.** A cached
reload is a single-digit number of milliseconds.

| Vocabulary | Terms |
|---|---|
| countries | 248 |
| type | 179 |
| use_cases | 107 |
| geographic_regions | 20 |
| actors | 19 |
| impact_sdgs | 17 |
| readiness_levels | 10 |
| adoption_levels | 9 |
| afs_challenges | 7 |

`node--digital_asset` is **not** preloaded. It is what `field_data_source`
points at, but it holds 544+ records where the app's data-source filter offers
7, so preloading would cost more than the `include=` it saves. Data sources,
owners and partners stay per-record lookups — which is what the mapping card
reserves `include=` for.

When the portal cannot be reached, a stale cache is used and flagged as stale:
month-old term names are overwhelmingly still correct, and an empty Explore page
never is. With nothing cached there is nothing to fall back to, and the error
carries a message fit to show someone.

### idb.js

Five operations — get, put, delete, clear, getAll — against one database,
`atio-kb`. `DB_VERSION` is bumped whenever a store is added, and every version
creates every store it is missing, because a browser can arrive at version N
from any earlier one.

IndexedDB can be absent or refuse to open: private browsing, blocked site data,
a corrupted store. `isIndexedDbAvailable()` is the check callers make, and the
taxonomy preload treats a missing cache as a slower start rather than a failure.

### filterSpec.js and db.web.js

`db.web.js` exports what `db.js` exports, name for name, so no screen knows
which platform it is on. Three things behave differently, and all three were
measured against the live portal rather than assumed.

**Keywords are resolved to term names here, not searched for there.** The app's
challenges and types are keyword lists, which the SQL builder matches with
`LIKE '%keyword%'`. Asking the portal the same way — a group of `CONTAINS`
conditions on a related field — takes **40 seconds or more** once any sort is
added. Since the vocabularies are already preloaded, the keywords are matched
against the term names locally and the query names the terms outright with `IN`:
**under 12 seconds** for the same question, and warm repeats in under one.

A keyword that matches no term produces a condition that matches nothing, not a
condition that is left out. An omitted filter would widen the query to the whole
catalogue — a filter that found nothing returning everything.

**Lists are ordered most recently updated, not most advanced.** The bundled
build sorts by readiness. Reproducing that here would mean putting the levelled
records ahead of the unlevelled ones, because the portal sorts an empty
relationship before every value and **1,123 of the 6,287** published records
have no readiness level. The split needs `IS NOT NULL`, which **times out past
50 seconds** when combined with a filter on a related field, where sorting by
`changed` answers in about 12. `getMostAdvancedInnovations` is the exception: it
carries no other filter, so it can afford `IS NOT NULL` and sorts by term id
ascending — ascending, because those ids run opposite to the levels.

**Counts do not block a list.** A drilldown asks for its rows and its total at
once; the rows are awaited and the total is not, and the header shows an
ellipsis until it arrives. That ellipsis mattered more before 5 October: a total
then took about 20 requests of bracketing, 53 seconds cold. With `meta.count` it
is one request, and `countMatching` reads it without being asked to.

### catalogIndex.js

Explore asks questions the portal cannot answer. "How many innovations address
water scarcity in East Africa, and what is their average readiness?" is not a
count — it is an average, and `meta.count` will not produce one when it arrives.
A challenge is not a field on a record either: it is a dozen keywords matched
against use-case terms, so no filter can count one.

So the catalogue is walked once: every published record, 50 at a time, six
requests in flight, asking for **ids only** and resolving each one to a name
from the vocabularies already in hand. Out of that single pass come the Explore
challenge, type and region counts, the data source list, and both heat maps.

Measured against the live portal: **6,287 records in 12 seconds warm**, around
five minutes fully cold, about 3 MB over the wire. Kept in IndexedDB for six
hours, and started at app launch rather than when Explore is opened.

The rows are stored, not only the grids they feed. They are the raw material: a
release that changes the challenge keywords rebuilds every grid from what is
already on the device instead of crawling again.

### heatmapGrids.js

The grid maths was lifted out of `heatmaps.js` so the phone's SQL rows and the
web build's portal rows go through the same code. The extraction was checked
against the bundled catalogue — 3,075 records, both grids byte-identical before
and after — which caught one real difference on the way: a record with no
readiness level is read as level 1 by the opportunity grid, not 0.

The two grids treat an unlevelled record differently, on purpose. The
opportunity grid counts it and averages it in at 1, as the bundled build always
has. The ready-to-use grid skips it, because that grid is *about* readiness and
a record that does not state one has nothing to say. The pass stores both
readings so neither grid has to settle for the other's.

### Costs, measured

| | Cold | Warm |
|---|---|---|
| A page of 10 filtered records | 5–25 s | under 1 s |
| A filtered count, via `meta.count` | ~2 s | instant (memo) |
| A filtered count, by bracketing (pre-5 Oct) | ~53 s | ~7 s |
| All nine vocabularies | 3.8 s | 1 ms (IndexedDB) |
| The whole catalogue pass | ~5 min | 12 s, then free for 6 h |

The portal caches each distinct query URL for an hour, so the second person to
ask the same question pays the warm price. Keeping the number of distinct query
shapes small is therefore worth as much as keeping each one cheap.

## Searching by a typed question

The mapping card strikes out "implement full-text search", and for the portal on
its own that is right: it has no relevance score and cannot sort by one. What it
is good at is answering, quickly, *which* records contain a set of words.

So search asks it only that, and does the ranking elsewhere. Four stages, in
`src/database/querySearch.web.js`:

| | what | where |
|---|---|---|
| 1 | the question becomes search words, translated first | `POST /api/search-terms` |
| 2 | which records contain them | `api/jsonapi/textSearch.js` |
| 3 | which of those is the best match | `search/rankCandidates.js` |
| 4 | which of those is the best *answer* | `POST /api/rank` |

### Why stage 2 narrows and widens at once

Two searches run together: **strict**, where every word must appear in the title
or the description, and **loose**, where any word may. Measured through the dev
proxy:

| query | strict | loose | time |
|---|---|---|---|
| `solar irrigation pump` | 16 records | 600+ | 1.1s |
| `water storage` | 42 records | 600+ | 1.9s |
| `cassava disease resistant variety` | 3 records | 300+ | 1.2s |

The strict matches are a subset of the loose ones in principle but not in
practice: the loose search can match six hundred records and we read the first
hundred and fifty, in the portal's order rather than any relevance order, so the
records containing *every* word are quite capable of not being among them.
Running both puts them in the pool.

They were sequential at first — strict, then loose only if strict found too
little, which is the obvious reading of "narrow first". It cost **eleven
seconds** on a five-word query, because the stages added up where they could
have overlapped. Together they cost one stage's wall time. Measured in a browser
against the live portal: **~2s warm, ~9s cold**, against ~3s for the old search
over the bundled file, which was local and so had no portal to wait for.

### Why the ranking is ours

Stage 3 is BM25's shape rather than BM25 itself. The parts that matter over a
few hundred candidates are kept — a rare word counts for more than a common one,
a long document is not rewarded for being long, repetition saturates — and the
parts needing corpus-wide statistics are dropped, because we have the pool and
not the catalogue. Two things BM25 has no notion of are added: a word in the
title counts for three in the description, and the typed phrase surviving intact
counts for more than its words scattered.

This is what the bundled catalogue's FTS5 index used to do, and did better,
having the whole catalogue to do it with. Narrowing hard in stage 2 is what pays
for losing it.

### What the model is given

Stage 4 is the `llmRerank` that `/api/search` has always used, over rows supplied
in the request rather than read from a database. It was already written against
whatever it is handed — it anonymises each row and maps scores back by `id`,
never interpreting the value — so uuids pass through untouched, and `/api/rank`
opens no database handle at all.

It is sent ids and summaries, never titles, which is `sanitize.js`'s rule and
not a new one.

### What happens when a stage fails

Three of the four have something to fall back on, and they fall back to
different, still-working searches rather than to one error page:

| stage down | what happens |
|---|---|
| 1, words | the words are extracted locally; translation and expansion are lost |
| 2, portal | the cache answers instead — see [OFFLINE-STORAGE.md](OFFLINE-STORAGE.md) |
| 4, model | our own ranking stands, which is a real order rather than an arbitrary one |

Stage 2 distinguishes "the portal matched nothing" from "the portal could not be
reached", which it did not at first: a failed page returned an empty list like
any other, so with the network off search reported *no solutions found* over a
cache holding sixteen that matched.

### The phone does none of this

`src/database/querySearch.js` — the native half of the pair — calls the backend
exactly as it always has. The phone reads the bundled SQLite catalogue for
Explore and the backend reads the same file for search, so the two already agree,
and FTS5 ranks better than anything we could do over a few hundred candidates.

## Tests

`__tests__/fixtures/jsonapi/innovations.json` is a real response, trimmed to two
records and the terms they reference. Captured rather than written by hand: a
handcrafted fixture only proves the mapper agrees with its author, while this
one fails if the portal's shape and our reading of it ever part ways.

No test touches the network — `fetch` is injected.

## `meta.count` landed on 5 October

Diego said Monday and it arrived on Monday: a collection now carries
`meta: {count: 6287}`. `countMatching` had always read it first and bracketed
only as a fallback, so every total in the app became one request with no change
from us.

What it changed that *did* need a change: the Explore tiles. Twelve challenges,
ten types and fifteen hub regions are thirty-seven numbers, and at ~20 requests
each that was some seven hundred — so they were tallied from the catalogue pass
instead, and waited the length of it. One request each is cheaper by every
measure, so they now ask the portal directly and fall back to the pass only when
it cannot be reached, which is what keeps them on screen offline.

Measured in a browser, the numbers came back identical. The timing is more
nuanced than it first looked: the portal caches each distinct query for an hour,
so a second run of the same counts is half a second and a first run is not. Cold
against cold it is roughly 40 seconds of counting against 51 of walking — an
improvement, but a smaller one than a warm measurement suggests.

What makes it feel different is that each tile now shows its number as that
number arrives, rather than all twenty-two flipping when the slowest returns.
With 1.5 s of latency per request standing in for a cold portal, the first
number lands at 13.3 s and sixteen of twenty-two are filled by 15.3 s, where
before the grid said "counting…" until 16.9 s and then changed all at once. The
wall time is the same; the staring is not.

What it did not change is the pass itself. A heat map cell is an *average* of
readiness against adoption, and no count endpoint produces an average. The pass
still runs — in the background, where nobody is waiting on it.

## What the portal does not do yet

- **Data sources cannot be listed directly.** `field_data_source` points at
  node--digital_asset, which holds 544+ records. The catalogue pass collects the
  ids innovations actually cite — 15 of them — and asks for just those.
- **CORS is not enabled.** Hence the proxy.
