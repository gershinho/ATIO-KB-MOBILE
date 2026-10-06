# Talking to the FAO JSON:API

The web build gets its innovation data from `https://sti-portal.fao.org/jsonapi`
rather than from the bundled SQLite catalogue, which the phone keeps using. This
is the layer underneath that: how requests are made, and what the portal's shape
becomes once it reaches the app.

Looking into why it is slow? Start with
[Where the time goes, measured 6 October](#where-the-time-goes-measured-6-october).

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
| `src/api/jsonapi/catalogIndex.js` | One pass over the catalogue, kept for days |
| `src/api/jsonapi/localFilter.js` | Answers a drilldown's filters from that pass |
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

**Filtered lists are answered in the browser, since 6 October.** Every
condition above is still built, but it is evaluated against the catalogue pass
(`localFilter.js`), and the portal is asked only for the page shown, by id. The
portal took 13 s for one related-field filter, 54 s for two, and gave no answer
in two minutes for Digital & ICT + East Africa + readiness + adoption; the same
question now takes about a second. Asking the portal the whole question is kept
as the fallback for when there is no pass to filter on.

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
requests in flight, asking for relationship ids and two small attributes
(`changed`, `field_if_grassroots`) and resolving each id to a name from the
vocabularies already in hand. Since 6 October it also reads region, SDGs and
prospective users, so the drilldown's filters can be answered from it. Out of that single pass come the Explore
challenge, type and region counts, the data source list, and both heat maps.

Measured against the live portal: **6,287 records in 12 seconds warm**; cold,
anywhere from 35 seconds to two and a half minutes on 6 October. About 3.5 MB
over the wire compressed. Started at app launch rather than when Explore is
opened, and kept in IndexedDB: fresh for six hours, then served at once while a
new pass runs behind it, up to seven days old. A screen that has to wait for a
first pass shows its progress.

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

### Widening with the backend's suggestions

For a short query the backend also returns related words — "bunny" becomes
rabbit, care, pet, tips, health, small, animal. Those go to the *search*, not
only to the ranking: ranking can only reorder what was fetched, so a word the
search never used can never surface the record it was suggested for.

Merging them all into one OR is worse than useless. Measured against the live
portal, that query matches **2,243 records**, and the 150 we read contain **none
of the four rabbit ones** — "care" and "small" and "animal" drown the word that
mattered.

So each suggestion is counted first, which `meta.count` made a single request:

```
rabbit 4 · tips 17 · behavior 55 · care 88 · pet 132 · advice 185
training 299 · nutrition 330 · animal 360 · health 589 · small 1072
```

Rarest first, kept while their matches still fit in the 150 the loose search
reads. "help with bunny" widens with rabbit, tips and behavior — 76 candidates —
and returns *"Try the rabbit: a practical guide"*. Before, it returned nothing.

The suggestions never join the strict search: the user's own words narrow, and
a machine's guesses should not.

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

## Where the time goes, measured 6 October

Everything below was measured against the live portal on 6 October, through the
dev proxy and directly. FAO's server is a black box from here, so the
explanations are inferences from the numbers.

### The path a request takes

```
browser ──HTTP/1.1──▶ dev proxy 127.0.0.1:3002 ──HTTP/2──▶ sti-portal.fao.org/jsonapi
browser ──────────────▶ our backend localhost:3001 ──▶ OpenAI   (search words, ranking)
```

The proxy exists because the portal sends no CORS headers, so a browser cannot
read its responses directly. Production web needs CORS on the portal, or a
deployed proxy.

**Chrome opens at most six connections to one host over HTTP/1.1**, and the
proxy speaks HTTP/1.1. Anything past six queues in the browser. At launch these
compete for them:

| | requests at once |
|---|---|
| catalogue pass | 6 |
| Explore tile counts | 8 (37 in all) |
| a search | ~5–15, plus 1–2 record fetches |

So a search started while the pass runs waits behind pages that take 5–14 s
each. The portal itself speaks HTTP/2, which has no such limit, so this queue is
a property of the proxy, not of the portal.

### Cold and warm

The portal appears to cache each distinct request URL for about an hour. The
first time a URL is asked is slow whatever it asks for; a repeat is fast:

| request | first time | repeat |
|---|---|---|
| trivial (`page[limit]=1`) | ~0.5 s | ~0.5 s |
| text search, one word, title or description | 11–13 s | 0.6–1 s |
| one related-field filter (a type) | 13 s | <1 s |
| catalogue page, 50 records, ids only | 5–14 s | ~1 s |
| 15 records by id, list fields | ~2 s | — |
| 15 records by id, plus owner and partners (`include`) | 7–8 s | — |

The catalogue page does no text matching at all and is still as slow as a text
search, which suggests the cost is in building any uncached JSON:API response
(loading and normalising entities, access checks, includes) rather than in the
matching. A page with the extra filter fields took 6.0 s against 5.9 s without,
so the size of the response does not seem to be what costs.

### A search, stage by stage

Every new query is cold. "managing weeds in maize fields", fresh, run directly
(no proxy queue):

| stage | time |
|---|---|
| 1. backend prepares the words | 0.0 s (four English words need no AI) |
| 2. portal text search | **27.4 s** |
| 4. AI ranking | 3.5 s |
| 5. 15 records, with owner and partners | 4.8 s |
| **to first results** | **35.8 s** |

"help with tomatoes" spent 12.5 s in stage 2 waiting on counts of the
backend's suggested words: ten answered in about a second, "methods" and
"irrigation" took 10.9 and 12.5. Counts now get one try and two seconds
(`textSearch.js`), and a word that misses the deadline is skipped.

Until 4 October web search did not touch the portal: it went to our backend's
copy of the catalogue, which is why it used to feel fast.

### What changed on 6 October

- Drilldown filters are answered from the catalogue pass, not by the portal.
- The pass carries the fields those filters need, is served stale for up to a
  week while it refreshes, and reports progress to a screen that waits on it.
- A search runs its stages once and pages through the result; "load more" asks
  nothing of the backend or the model.
- Word counts in search have a two-second deadline.
- Offline, search goes straight to what is saved on the device.

### Open questions for the portal side

- Why is an uncached response 5–15 s even when it asks for ids only?
- Can CORS be enabled, so the browser talks to the portal over HTTP/2?
- Is there a search endpoint (Search API, Solr) that is cheaper than
  `CONTAINS` over JSON:API?
- Does the portal cope better with six requests in flight than with forty?

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
