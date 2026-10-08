# Where the web build keeps things

The phone keeps bookmarks, downloads and likes in AsyncStorage, and the
catalogue in a bundled SQLite file. In a browser AsyncStorage *is*
localStorage: about 5 MB of strings, parsed in full on every read, with each
list holding its own complete copy of every innovation in it. A record that is
bookmarked and downloaded is stored twice.

So the web build uses IndexedDB, in the shape the offline card specifies.

```
innovations   { uuid, data, cachedAt, lastViewedAt, sizeBytes, pinnedBy[] }
    ▲              ▲              ▲
    │              │              │
bookmarks      downloads       likes
{ addedAt,     { addedAt,      { likedAt }
  title }        title }
```

## The two ideas

**One copy of the content.** The content record lives once; the lists hold ids.

**`pinnedBy` is a set of reasons to keep it.** Bookmarking adds `'bookmark'`,
downloading adds `'download'`. Un-bookmarking takes that reason away and leaves
the record, because the download still wants it. A record nobody has a reason to
keep is not deleted either — it simply becomes eligible for eviction, which is
the LRU's business in step 7.

Adding a pin writes the index entry and the content **in one transaction**, as
the card requires. Two separate writes could leave a bookmark pointing at
nothing.

## The index entries carry the title

The card has them hold metadata only, so a row still renders after its content
is evicted. A row with no title renders as nothing at all, so the title is kept
alongside the timestamp. An entry whose content is gone comes back with
`availableOffline: false` instead of being dropped — the Bookmarks screen never
silently loses a row.

## Not a table-for-table copy of the SQLite schema

The phone normalises countries, types, SDGs and use cases into child tables
because SQL has no arrays. A mapped `Innovation` already carries them as arrays,
so splitting them apart here would be undoing work to imitate a shape we no
longer have. What the schema is really for — look up an innovation by id — is
the store itself.

## Moving the existing data across

`localState.web.js` exports exactly what `localState.js` does, so no screen
changes. The first time it is asked for a list it imports whatever the previous
build left in localStorage, keeping each entry's original timestamp so the lists
stay in the order the user built.

The old keys are **not** deleted. If we ever have to put the previous build
back, a user's bookmarks are still where it expects them. The import is marked
done in the `meta` store so it cannot run twice and resurrect rows someone has
since removed.

Settings — reduce motion, text size, colour-blind mode — stay in AsyncStorage.
Three short strings per viewer, read once at startup, gain nothing from a
database.

## What fills the cache, and what empties it

**Pinning.** A record is pinned from a screen that is already showing it, so
the full record is stored as the pin is made. That is the first half of the
card's strategy D and needs no code of its own.

> **Nothing else is cached at launch, deliberately.** The offline card's
> strategies A, E and F are struck through, and E is the one that would have
> preloaded a hundred recent records so a first-time user had something offline.
> What is left is C and D: bookmarks and downloads, the last N visited, and
> prefetch on pin. So the offline set is what the user put there.

**Refresh.** Pinned records are brought up to date at launch — but the question
"has anything moved?" is asked first, in one request carrying two fields per
row, against the ~5 KB a full record costs. Only what moved is downloaded. The
card asks for "If-Modified-Since or by comparing the `changed` attribute"; the
second, because it is one request for the batch where conditional requests would
be one per record. If that cheap question fails, everything is refreshed, as it
was before.

Up to 20 per session, oldest copy first — a bookmark made in March and read in
June should not be March's copy. Capped because the card warns the cost grows
with the number of pins, and someone with three hundred bookmarks should not pay
for all of them at startup.

**Views.** Opening the detail drawer caches that record and sets its
`lastViewedAt`. That timestamp is the only thing that says which records anyone
still cares about.

**Eviction.** Unpinned records over the cap are dropped, least recently viewed
first. A record that has never been opened falls back to when it arrived.

| Limit | Value | Whose number |
|---|---|---|
| Unpinned records | 500 | ours |
| Cache size | 20 MB | the card's Settings mock |

Both are ceilings on the **unpinned** tail. A bookmark or a download is never
evicted, however many there are: a Bookmarks screen that quietly forgot things
would be worse than one that fills the disk.

## In Settings

```
Offline                  34 records, 0.2 MB used of 20.0 MB
Clear recently viewed                          Keep pinned
Clear everything                                Remove all
```

"Clear recently viewed" drops the unpinned cache and keeps bookmarks and
downloads. "Clear everything" drops those too. Neither touches the vocabularies
or the catalogue pass: those are not the user's data, they are what makes the
app work, and re-fetching them costs minutes.

The section is absent on the phone, which carries the whole catalogue and has
no cache to report — `readStorageUsage()` returns null there rather than
zeroes, so Settings leaves the rows out instead of showing "0 records of 20 MB"
on a device where it would mean nothing.

## Reading it back offline

Storing records is only half the job: until a list could be answered from the
cache, nothing could reach them. Every route to a record — search, Explore, a
drilldown — is a live query, so with no connection everything on the device sat
there unreachable.

So a filtered list that cannot be fetched is answered from the device instead:
everything bookmarked or downloaded, and everything read recently. The list says so — "You are offline — showing the 31 solutions saved
on this device" — because a list that is quietly incomplete is worse than no
list.

The filters are applied locally in `storage/cachedSearch.js`, and they have to
agree with `api/jsonapi/filterSpec.js`: the same keywords against the same term
names, levels as minimums, hub regions expanded to countries, an SDG matched by
its number. Where the two disagree the offline list is wrong in a way nobody can
see, so the tests check them together.

A record served this way carries `availableOffline`, which is what shows the
card's "Available offline" badge when it is opened.

## When IndexedDB is not there

Private browsing, blocked site data, a corrupted store. `isIndexedDbAvailable()`
is the check callers make. Nothing throws; the lists come back empty and writes
report `false`, which is the same contract the native module has always had.

## Verified in a browser

Bookmarking two results and liking one, then reloading the page: both rows
return from IndexedDB with their pins and sizes, the tab badge reads 2, and
`localStorage.bookmarkedInnovations` is `null` — nothing is written there any
more.


## The service worker's share

Precaching the shell is in [SERVICE-WORKER.md](SERVICE-WORKER.md). What belongs
here is the other half of the card's service-worker section: `/jsonapi/*` GETs
are served **stale-while-revalidate** — the copy we have goes back immediately
while a fresh one is fetched behind it.

It is not a replacement for the IndexedDB fallbacks above and does not overlap
them. Those answer "this list could not be fetched at all". This answers "this
exact request was made recently", and turns a second visit to a drilldown from a
three-to-twenty-five-second wait into an instant one.

The browser's own HTTP cache already did a crude version of this, because the
portal allows an hour of reuse — which is why Explore appeared to work offline
until "Disable cache" was ticked. Doing it in the worker makes it deliberate:
our own lifetime, our own entry cap of 300, and it survives the browser evicting
its own cache. Measured against the live portal, a session's catalogue pass and
Explore leave 152 responses in that cache.

## With the Supabase data source

`EXPO_PUBLIC_DATA_SOURCE=supabase` changes where the catalogue index and the
vocabularies come from, and nothing about how they are kept. `catalogIndex.js`
and `taxonomies.js` fetch from the `get_catalog_index` and `get_taxonomies` RPCs
instead of the portal, and store the result under the same keys
(`catalogIndex:v2` in `meta`, `vocabularies` in `taxonomies`), in the same
shapes, with the same lifetimes: the index fresh for 6 hours and served stale
for up to 7 days while a new one is fetched, the vocabularies for a day. When
Supabase cannot be reached the stored copies are served, exactly as when the
portal could not be. Bookmarks, downloads, likes, cached records, cached search
and Explore, the heat map grids and the pinned-record refresh are untouched;
the refresh asks `get_changed` for the stamps instead of the portal.

Measured in Chrome against staging (snapshot 2): a cold load stores all 6,287
index rows and 15 sources in 8 requests — one for the vocabularies, seven pages
of the index — and 1.8 MB on the wire, where the portal pass took 126 pages and
minutes. No request goes to the portal.

The worker's `/jsonapi` rule above does not apply to Supabase requests, and no
equivalent was added: the index already lives in IndexedDB, so it would only
duplicate it.

## The heat map grids

The card lists "the heatmap results" alongside the taxonomies as things
IndexedDB should hold, and `database/heatmaps.web.js` stores both computed grids
under one key.

Keyed on the catalogue pass's own `builtAt` rather than a lifetime of their own.
A grid is a pure function of those rows, so it is current exactly as long as
they are, and when the pass refreshes the mismatch rebuilds them without anyone
having to remember to invalidate anything.

Worth being honest about what it bought: the heat maps already worked offline,
because the pass they are built from is cached and served stale. Opening one
cold was measured at 216 ms before this and about 120 ms after. It is the card's
instruction followed, not a capability gained.
