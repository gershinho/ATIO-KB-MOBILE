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

## Tests

`__tests__/fixtures/jsonapi/innovations.json` is a real response, trimmed to two
records and the terms they reference. Captured rather than written by hand: a
handcrafted fixture only proves the mapper agrees with its author, while this
one fails if the portal's shape and our reading of it ever part ways.

No test touches the network — `fetch` is injected.

## What the portal does not do yet

- **`meta.count` is absent.** Due Monday 5 October per Diego. Until then a total
  costs ~13 requests (binary-search the offset where the collection ends), which
  is how we know there are 6,287 published innovations.
- **CORS is not enabled.** Hence the proxy.
