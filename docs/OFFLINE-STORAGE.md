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

## When IndexedDB is not there

Private browsing, blocked site data, a corrupted store. `isIndexedDbAvailable()`
is the check callers make. Nothing throws; the lists come back empty and writes
report `false`, which is the same contract the native module has always had.

## Verified in a browser

Bookmarking two results and liking one, then reloading the page: both rows
return from IndexedDB with their pins and sizes, the tab badge reads 2, and
`localStorage.bookmarkedInnovations` is `null` — nothing is written there any
more.
