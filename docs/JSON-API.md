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
| `src/database/db.web.js` | The web twin of `db.js` |
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
once; the rows are awaited and the total is not. Until `meta.count` lands a
total costs about 20 requests — 53 seconds against a cold portal, 7 warm — and
the header shows an ellipsis until it arrives.

### Costs, measured

| | Cold | Warm |
|---|---|---|
| A page of 10 filtered records | 5–25 s | under 1 s |
| A filtered count (~20 requests) | ~53 s | ~7 s |
| All nine vocabularies | 3.8 s | 1 ms (IndexedDB) |

The portal caches each distinct query URL for an hour, so the second person to
ask the same question pays the warm price. Keeping the number of distinct query
shapes small is therefore worth as much as keeping each one cheap.

## Tests

`__tests__/fixtures/jsonapi/innovations.json` is a real response, trimmed to two
records and the terms they reference. Captured rather than written by hand: a
handcrafted fixture only proves the mapper agrees with its author, while this
one fails if the portal's shape and our reading of it ever part ways.

No test touches the network — `fetch` is injected.

## What the portal does not do yet

- **`meta.count` is absent.** Due Monday 5 October per Diego. Until then a total
  costs about 20 requests — bracketing the offset where the collection ends,
  then halving — which is how we know there are 6,287 published innovations.
  `countMatching` reads `meta.count` the moment it appears, with nothing else to
  change.
- **Data sources cannot be listed.** `field_data_source` points at
  node--digital_asset, which holds 544+ records where the filter panel offers
  the 7 that innovations actually cite. Which 7 falls out of the catalogue pass
  in step 5.
- **CORS is not enabled.** Hence the proxy.
