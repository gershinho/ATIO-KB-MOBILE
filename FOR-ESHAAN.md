# For Eshaan — the offline UI

**What I'm asking for:** five screens tell the user they're offline, and all five
look like a developer wrote them, because one did. The behaviour is finished and
tested. The design isn't started.

Branch **`sprint2`**. All web-only — the phone carries the whole catalogue and
never hits these states.

---

## 1. Get it running

Three terminals from the repo root:

```sh
npm run proxy              # :3002  FAO's data. Explore is empty without it.
cd backend && npm start    # :3001  search ranking
npm run web                # :8081  the app, live-reloads your edits
```

Style on **:8081**. It picks up your changes as you save.

## 2. Get it running *offline*

Offline only works on a built copy, which is a different server:

```sh
npm run build:web && npx serve dist -l 4173
```

**Use :4173 for anything offline.** The dev server registers no service worker,
so with the network off the page dies on Chrome's own error screen before any of
our code runs. It looks like a bug in the app. It isn't.

> Rebuild after every change you want to see on :4173 — it's a snapshot, not a
> live server. And if a change doesn't appear, it's almost always a waiting
> service worker: tick **Application → Service Workers → "Update on reload"**
> and leave it ticked.

## 3. Make the offline states appear

In this order, or you'll see none of them:

1. Open **:4173** and **reload once** — the service worker only takes control on
   the second load.
2. Go to **Explore**. Wait for the tile counts, then give it another minute so
   the catalogue finishes saving in the background. Offline Explore needs it.
3. **Open five or six innovations.** Nothing is cached automatically — what you
   open and bookmark *is* the offline set. Watch Settings → Offline count up.
4. **Bookmark two or three.**
5. DevTools → **Network → Offline**, and **tick "Disable cache"**.

> That last tick matters more than it looks. FAO lets the browser reuse any
> answer for an hour, so without it Chrome serves whole pages of real data with
> the network off and you never see the offline UI at all. It fooled me twice.

Don't use Airplane Mode — it kills localhost and takes the proxy and backend
with it, so you can't tell a broken app from servers you switched off.

---

## 4. The five things to design

Each one is a boolean the screen already receives. **You shouldn't need to touch
a hook or any data code.**

| # | Where | File | Shown when |
|---|---|---|---|
| 1 | Search results | `src/screens/home/SearchMode.js:257` | `search.fromCache` |
| 2 | Explore landing | `src/screens/home/ExploreMode.js:69` | `explore.fromCache` |
| 3 | Any filtered list | `src/screens/home/DrilldownView.js:104` | `drilldown.fromCache` |
| 4 | Detail — badge | `src/components/DetailDrawer.js:376` | `innovation.availableOffline` |
| 5 | Detail — no content | `src/components/DetailDrawer.js:390` | `availableOffline === false` |

What each says today, all placeholder:

**1 · Search** — the "Powered by AI" strip becomes **"Saved on this device"**,
over *"You are offline — showing the 16 solutions saved on this device that
match."* The number is `search.cachedTotal`.

**2 · Explore** — *"You are offline — these figures are from the copy saved on
this device."*

**3 · Drill-down** — *"You are offline — showing the 16 solutions saved on this
device."* The number is `drilldown.count`.

**4 · Detail badge** — **"Available offline"** beside the Overview heading.

**5 · Detail, content gone** — the roughest of the five, and the one I'd start
with. A bookmark whose cached copy was evicted has only a title and an id, so
instead of blank sections it shows a grey box: *"Not available offline. This one
was saved as a bookmark, but its details are not on this device."* with a **Try
again** button, and a spinner while that runs (the `loading` prop).

### A refactor if you want it

`offlineNote` and `offlineNoteText` are copy-pasted into screens 1–3 with
identical values. One shared `src/components/OfflineNote.js` would be cleaner.
Nothing depends on them being separate.

---

## 5. Three things worth keeping

Not rules — the reasoning behind the current wording, so you can overrule it
knowingly.

1. **The notes admit they're partial.** A list quietly showing 16 of 6,287 makes
   the user think that's all there is. However it ends up looking, it should
   still say *some*.
2. **"Powered by AI" is replaced, not kept.** The model never saw those rows —
   the device answered them. Leaving the strip up would claim otherwise.
3. **Never show zeroes instead of a message.** When nothing is cached the data
   layer returns null and the screen shows an error on purpose. "0 solutions"
   says there are none, which is a worse lie than "couldn't load".

## 6. What works offline, and what doesn't

**Works** — don't be surprised when these render with no connection:

- Explore, with all 6,287 counts and the category grids
- **Both heat maps**
- Bookmarks, downloads, and anything opened recently
- Search, over the saved records only

**Doesn't** — no state needed, they're out of scope:

- any innovation that was never opened or bookmarked
- exact live totals (a cached list reports what's on the device, and says so)
- voice search and the AI comparison on the Bookmarks screen

---

## 7. Before you push

```sh
npm test            # app + backend — 972 and 109 passing right now
npx eslint src
```

Two tests assert on wording you might change:

- `__tests__/rendered/HomeScreen.test.js` → **"Could not load these solutions"**
- `__tests__/rendered/DetailDrawer.test.js` → **"Not available offline"**, **"Try again"**

Update them alongside — they exist to catch accidental changes, not deliberate
ones. The three offline notes and the "Available offline" badge aren't pinned by
anything, so reword or restyle those freely.

---

Background on how any of this works:
[docs/OFFLINE-STORAGE.md](docs/OFFLINE-STORAGE.md), and the full by-hand pass is
[docs/TESTING-WEB.md](docs/TESTING-WEB.md) section 8.

If a state won't reproduce, it's nearly always one of three things: you're on
:8081, "Disable cache" isn't ticked, or the cache was never warmed.
