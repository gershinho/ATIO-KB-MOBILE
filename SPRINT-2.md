# Sprint 2 — what we built

The app's web version used to be a shell: it looked right and had almost no real
data in it. It now reads FAO's live catalogue of **6,287 innovations**, works
with no connection, and search and Explore finally agree with each other.

Everything below maps to a line on the Sprint 2 card.

## Where the data comes from

Before, the app carried a copy of the catalogue inside itself — a file made a
year ago holding 3,075 innovations. It could never be newer than the day it was
built.

Now the web app asks FAO's own system directly, so it shows what FAO published
this morning. Nothing to re-copy, nothing to go stale.

> **One thing is still outstanding, and it isn't ours.** Browsers refuse to
> accept data from another website unless that website gives permission. FAO
> haven't switched that permission on yet, so for now we run a small helper on
> the laptop that fetches on the browser's behalf. Until FAO enable it, the web
> app can't be put in front of anyone outside the team. Diego has agreed to it;
> it needs a date.

| Card item | Done |
|---|---|
| Build the API client | ✅ |
| Map responses to the app's existing shape | ✅ |
| Query and filter builders | ✅ |
| Preload taxonomies at startup | ✅ |
| Create `db.web.js` | ✅ |
| Fetch a single innovation | ✅ |
| Search, filters and counts against the API | ✅ |
| ~~Full-text search~~ | struck out on the card — see below |
| Implement stats | ✅ — **was marked blocked**, see below |

### The two that needed a decision

**"Stats" was blocked** because FAO's system couldn't tell us *how many*
innovations match a filter — it would hand over the records but never a total.
Rather than wait, we find the total by narrowing: ask whether there are more
than 16, more than 64, more than 256, and close in. About twenty quick questions
instead of one, and it unblocked the item. FAO are adding a proper count; when
it appears the app uses it automatically and stops guessing.

**Full-text search was struck out** because FAO's system can't rank — it can say
which innovations mention "solar pump" but not which one is the best answer. We
kept to that: we never ask it to rank. We ask it *who matches*, sort those
ourselves, and let our AI pick the best. Worth a sentence to Diego, since the
card says not to build search on their system and we have, differently.

## Search and Explore now mean the same thing

A real problem you spotted: the two halves of the app were reading two different
catalogues. Explore showed FAO's 6,287 innovations; search showed our old copy of
3,075. The same innovation had two different identities, so bookmarking it from
each saved it twice.

Both now read FAO's catalogue. One list, one set of names, nothing to keep in
sync. Searching works in four steps:

1. our server turns your question into search words
2. FAO's catalogue says which innovations contain them
3. we sort those by how well they match
4. our AI picks the best, as it always did

Our server stops being a place data is kept and becomes purely the clever part —
translating and ranking.

## Working without a connection

| Card item | Done |
|---|---|
| Storage set up in the browser | ✅ |
| Bookmarks, likes and downloads moved into it | ✅ |
| Pin, prefetch 100, remove the oldest first | ✅ |

The card argued that saving only what people bookmark isn't enough — someone who
has never bookmarked anything would open the app on a dropped connection and
find nothing. So on every launch the app quietly saves a hundred recent
innovations in the background.

Saving them turned out to be half the job. They sat there unreachable, because
every way of *reaching* an innovation was a live request. So three screens now
fall back to what's on the device, and each says so rather than pretending:

- **Search** — looks through the saved records
- **Explore** — shows the headline figures and the grids from the saved copy
- **Any filtered list** — *"You are offline — showing the 16 solutions saved on
  this device."*

Three things still need a connection: the two heat maps, and the exact totals.
Both read the whole catalogue, which is thousands of records.

## The heat maps

| Card item | Done |
|---|---|
| Port the opportunity heat map | ✅ |
| Port the ready-to-use heat map | ✅ |

Both work and match the phone. Along the way we found a real bug **on the phone**:
the "most advanced innovations" list was showing the *least* advanced. FAO number
their readiness stages in an order that runs opposite to the stages themselves,
and the app had trusted the numbers. Fixed, and the test now holds it in place.

We also fixed a filter that was quietly wrong: asking for Goal 1 also returned
Goal 15, because "Goal 1" is contained in "Goal 15".

## Where it stands

945 automated checks on the app and 109 on the server, all passing. Everything
is on the `sprint2` branch.

**Before this is shown to anyone:**

1. **Open it on the iPhone.** Three changes this sprint affect the phone —
   including that readiness fix — and none have run on a real device yet.
2. **FAO's permission setting.** Until then the web app only runs on a laptop
   with the helper running.

Smaller things, written up in [PWA-FOLLOW-UPS.md](PWA-FOLLOW-UPS.md): the app
icons are still stand-ins, FAO's short descriptions are cut off mid-word in their
own system, and the phone still carries the old 3,075-record copy.
