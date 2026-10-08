# Sprint 2 — what we built

The web app used to be a shell with almost no real data in it. It now reads
FAO's live catalogue of **6,287 innovations**, works with no connection, and
search and Explore finally agree with each other.

## Where the data comes from

Before, the app carried a copy of the catalogue inside itself — a file made a
year ago holding 3,075 innovations, which could never be newer than the day it
was built. The web app now asks FAO's own system directly, so it shows what FAO
published this morning.

> **One thing is outstanding and it isn't ours.** Browsers refuse data from
> another website unless that website gives permission. FAO haven't switched
> that on, so for now a small helper runs on the laptop and fetches on the
> browser's behalf. Until then the web app can't go in front of anyone outside
> the team. Diego has agreed to it; it needs a date.

| Card item | |
|---|---|
| API client, response mapping, query and filter builders | ✅ |
| Preload taxonomies at startup | ✅ |
| `db.web.js`, fetch one innovation, search, filters, counts | ✅ |
| ~~Full-text search~~ | struck out — see below |
| Stats | ✅ — **was marked blocked** |
| IndexedDB stores; bookmarks, likes, downloads moved into them | ✅ |
| Pin, recently-viewed, remove the oldest first | ✅ |
| Both heat maps | ✅ |

**"Stats" was blocked** because FAO's system couldn't say *how many* innovations
match a filter. Rather than wait, we found totals by narrowing — more than 16?
more than 64? — about twenty quick questions instead of one.

**FAO added the proper count on 5 October**, and the app picked it up with no
change, because it had always been written to prefer it. Every total is now one
question instead of twenty.

The category counts on Explore use it too, and each tile now shows its number
the moment that number arrives instead of all of them appearing at once at the
end. On a first visit the grid fills over a few seconds; on any visit within the
hour it is instant, because FAO caches each answer.

**Full-text search was struck out** because FAO's system can't rank. We kept to
that: we never ask it to rank. We ask *who matches*, sort those ourselves, and
let our AI pick the best. Worth a sentence to Diego, since we did build search
on their system, just not the way the card ruled out.

## Search and Explore now mean the same thing

The two halves of the app were reading two different catalogues — Explore showed
FAO's 6,287, search showed our old copy of 3,075 — so the same innovation had
two identities and bookmarking it twice saved it twice.

Both now read FAO's catalogue. Searching works in four steps: our server turns
your question into search words, FAO's catalogue says which innovations contain
them, we sort those by how well they match, and our AI picks the best. Our
server stops being a place data is kept and becomes purely the clever part.

## Working without a connection

Following the offline card's chosen strategies (C and D; A, E and F are struck
out on it), what's saved is what the user put there: bookmarks, downloads, and
what they opened. Pinned things are protected; the rest is dropped oldest-first.

Saving them turned out to be half the job — every route to an innovation was a
live request, so saved records sat there unreachable. Four screens now fall back
to the device, and each says so rather than pretending:

- **Search** — looks through the saved records
- **Explore** — headline figures and grids from the saved copy
- **Any filtered list** — *"You are offline — showing the 16 solutions saved on
  this device."*
- **A bookmark whose details were cleared** — *"Not available offline"*, with a
  retry, instead of a screen of blanks

**Both heat maps work offline too**, from the same saved copy.

Three things reduce what gets downloaded, which is the other half of that card:

- **Vocabularies** — the country and category lists are fetched once a day
  instead of being re-sent attached to every page of results.
- **Only what changed** — refreshing your bookmarks asks "has anything moved?"
  in one small request, then downloads only what has.
- **Served from the copy we have** — a repeated request is answered instantly
  while a fresh copy is fetched behind it.

## The heat maps

Both work and match the phone. Along the way we found a real bug **on the
phone**: the "most advanced innovations" list was showing the *least* advanced,
because FAO number their readiness stages in the opposite order to the stages
themselves. We also fixed a filter where asking for Goal 1 also returned Goal 15.

## Where it stands

959 automated checks on the app and 109 on the server, all passing. Everything
is on the `sprint2` branch.

**Before this is shown to anyone:**

1. **Open it on the iPhone.** Several changes this sprint affect the phone —
   including that readiness fix — and none have run on a real device.
2. **FAO's permission setting.** Until then the web app only runs on a laptop
   with the helper running.

Smaller things are in [PWA-FOLLOW-UPS.md](PWA-FOLLOW-UPS.md): the app icons are
still stand-ins, FAO's short descriptions are cut off mid-word in their own
system, and the phone still carries the old 3,075-record copy.
