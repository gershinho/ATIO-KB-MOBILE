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

**Prefetch.** The hundred most recently updated records are cached at launch,
unpinned, so someone who has never bookmarked anything still has something to
read when their connection goes. Two requests, because the portal caps a page
at 50 and returns 50 without complaint when asked for more — the first run
against the live portal quietly prefetched half of what the card asks for.

**Refresh.** Pinned records are fetched again at launch, up to 20 per session,
oldest copy first. A bookmark made in March and read in June should not be
March's copy. Capped because the card warns the cost grows with the number of
pins, and someone with three hundred bookmarks should not pay for all of them
at startup.

**Views.** Opening the detail drawer caches that record and sets its
`lastViewedAt`. That timestamp is the only thing that says which records anyone
still cares about.

**Eviction.** Unpinned records over the cap are dropped, least recently viewed
first. A record that has never been opened falls back to when it arrived, so
the prefetched hundred go before anything a person actually read — which is
right, since nobody asked for them.

| Limit | Value | Whose number |
|---|---|---|
| Unpinned records | 500 | ours |
| Cache size | 20 MB | the card's Settings mock |

Both are ceilings on the **unpinned** tail. A bookmark or a download is never
evicted, however many there are: a Bookmarks screen that quietly forgot things
would be worse than one that fills the disk.

## In Settings

```
Offline                 100 records, 0.4 MB used of 20.0 MB
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

Storing a hundred records is only half the job: until a list could be answered
from the cache, nothing could reach them. Every route to a record — search,
Explore, a drilldown — is a live query, so with no connection the prefetched
hundred sat there unreachable, and a user who had never bookmarked anything saw
nothing offline. Which is the exact complaint the offline card makes against
keeping only what people pin.

So a filtered list that cannot be fetched is answered from the device instead:
the prefetched hundred, everything bookmarked or downloaded, everything read
recently. The list says so — "You are offline — showing the 31 solutions saved
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
