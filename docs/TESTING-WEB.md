# Testing the web build by hand

The automated tests cover the logic; they cannot tell you whether the app looks
right, whether the service worker took over, or whether anything survives the
network being cut. This is the pass to make before showing the web build to
anyone.

## Starting it

Four processes, each in its own terminal, from the repository root:

```sh
npm run proxy      # :3002  the CORS proxy — Explore is empty without it
cd backend && npm start   # :3001  search, transcription, the AI summaries
npm run web        # :8081  the app in development
```

The proxy is not optional in a browser. The FAO portal serves its JSON:API to
anyone, but sends no `Access-Control-Allow-Origin` header, so the browser throws
the response away before our code sees it. See
[PWA-FOLLOW-UPS.md](../PWA-FOLLOW-UPS.md) item 2.

To test the installable app and the service worker you need the built copy
rather than the development server, because Expo's dev server does not register
one:

```sh
npx expo export --platform web
npx serve dist -l 4173
```

## 1. It loads

- [ ] `http://localhost:8081` reaches the home screen with no red error overlay.
- [ ] The browser console has no uncaught errors. Warnings from react-native-web
      about deprecated props are expected and harmless.
- [ ] The ATIO mark and the FAO blue header render; no missing-image icons.

## 2. Search

- [ ] A plain query ("water storage for smallholders") returns results within a
      few seconds.
- [ ] Results carry a match score and are ordered by it.
- [ ] Opening a result shows the detail drawer with a description, not a blank
      panel.
- [ ] A query in another language ("stockage de l'eau") still returns results —
      the backend translates before ranking.
- [ ] An empty query is rejected politely rather than searching for nothing.
- [ ] **Search and Explore agree.** Bookmark a result from a search, then find
      the same innovation through Explore and bookmark it there. It should
      already show as bookmarked rather than be saved a second time. This is
      follow-up 3: before it, the two surfaces used different ids for the same
      record.

## 3. Explore

- [ ] The challenge, type and region tiles all carry counts, not spinners that
      never resolve.
- [ ] Tapping a challenge opens the drill-down and lists solutions. First use is
      slow — the portal computes a query it has not seen before, which has been
      measured at anything from three to twenty-five seconds. The second use of
      the same slice is fast, because the portal caches it for an hour.
- [ ] The count in the header starts as `…` and resolves to a number.
- [ ] Scrolling to the bottom of a drill-down loads a further page.
- [ ] Opening the filter panel, choosing a country and applying it narrows the
      list.
- [ ] Switching to Search and back to Explore does **not** reload the whole
      screen or reset you to the default page.

## 4. Both heat maps

- [ ] Adoption Opportunities opens and the grid is populated, not grey.
- [ ] The low band is light orange — four visibly distinct steps, not four
      near-blacks.
- [ ] Ready to Use opens and its grid is **centred**, not pinned to the left.
- [ ] Tapping a cell opens a drill-down for that region and challenge.
- [ ] Both grids scroll horizontally while the row labels stay put.

## 5. Bookmarks, likes and downloads

- [ ] Bookmarking from a result and from a drill-down both work.
- [ ] A bookmark survives a full page reload.
- [ ] A bookmark survives a browser restart. (This is the IndexedDB check; if it
      only survives a reload it is living in memory.)
- [ ] The compare view on the Bookmarks screen produces a summary for two
      selected records.

## 6. Settings

- [ ] The Offline section reports a record count and a size, e.g.
      "34 records, 0.2 MB used of 20.0 MB".
- [ ] "Clear recently viewed" drops that count but keeps your bookmarks.
- [ ] "Clear everything" drops the bookmarks too.
- [ ] Neither clears Explore — the vocabularies and the catalogue pass are not
      the user's data, and re-fetching them costs minutes.

## 7. The installable app and the service worker

Against the built copy on :4173, not the dev server.

- [ ] DevTools → Application → Manifest lists the name, the FAO blue theme
      colour, and the 192/512/maskable icons with no warnings.
- [ ] DevTools → Application → Service workers shows one **activated and
      running** worker.
- [ ] Cache Storage holds the Workbox precache with the JS, CSS and icons in it.
- [ ] The install icon appears in the address bar, and installing it opens a
      standalone window with no browser chrome.
- [ ] A reload with the proxy and backend both stopped still renders the shell
      rather than the browser's offline page.

## 8. Offline

This is the part worth doing carefully, because almost everything in the app is
a live query and the failure is silent — a list that is quietly incomplete looks
exactly like a list that is complete.

Two things have to be right before any of it means anything.

**Use the built copy on :4173, not the dev server on :8081.** The dev server
registers no service worker, so with the network off the browser has nothing to
serve the page from: anything that re-navigates — a reload, or launching an
installed copy — dies on Chrome's own "You're offline" screen before a line of
our code runs. That screen says nothing about whether offline support works. It
is also easy to mistake for a bug, because an installed copy shows the ATIO mark
on it and looks like our page. Both the shell and the cached data work on :4173,
so there is no reason to split the testing across two ports.

**Tick "Disable cache" in the Network panel while you do this.** The portal tells
the browser it may reuse any answer for an hour, and the proxy passes that on, so
Chrome will quietly serve a page's worth of innovations from its own HTTP cache
with the network off. That is genuinely useful in the field and it is not what
you are testing: it makes our offline handling look like it works when it has not
run at all. With the box ticked you see what someone meets on a cold device.

**Do not use Airplane Mode on the laptop.** It kills localhost too, so the
backend and the proxy go with it and you cannot tell "offline handling is broken"
from "I switched off my own servers". Use DevTools instead:
**Network → Throttling → Offline**, which cuts the page's network and leaves the
servers running.

If you have an installed copy from an earlier build, uninstall it before
testing. An install keeps the icon and the start URL it was created with, so an
old one can be pointing at a port that is no longer serving anything — and if
its mark is green rather than FAO blue, it predates the icon recolour in
[PWA-FOLLOW-UPS.md](../PWA-FOLLOW-UPS.md) item 1 and is certainly stale.

### Warm the cache first

Offline storage holds what you gave it. With the network **on**:

- [ ] Open five or six innovations from Explore or search. Nothing is cached
      automatically any more — what you open and what you bookmark is the whole
      of it — so Settings should climb as you read. (A launch-time preload of a
      hundred records was removed; it was struck out on the design card. See
      [PWA-FOLLOW-UPS.md](../PWA-FOLLOW-UPS.md) item 6.)
- [ ] Bookmark two or three records you can recognise later.
- [ ] Open four or five more records so they land in the recently-viewed cache.

### Then cut the network

DevTools → Network → Offline, then:

- [ ] **Reload the page.** The shell still renders, because the service worker
      serves it. This is the step that fails on :8081, and only means something
      on :4173.
- [ ] **Bookmarks** still list, and still open with their descriptions.
- [ ] **A drill-down** — tap any challenge on Explore. It should list the cached
      records that match, with the note *"You are offline — showing the N
      solutions saved on this device."* It should **not** show "Could not load
      these solutions".
- [ ] That note's number is plausible — the tens, not 6,287. It is counting what
      is on the device, and it says so.
- [ ] **Opening one of those records** shows the detail drawer with an
      **"Available offline"** badge next to the overview heading.
- [ ] **Applying a filter** while offline narrows the cached list rather than
      erroring. The local filters are meant to agree with the ones we send the
      portal, so a country filter should behave the same way, on fewer records.
- [ ] **A challenge nothing was cached for** shows an honest empty state, not a
      spinner that never stops.
- [ ] **The Explore page itself** renders, under the note *"You are offline —
      these figures are from the copy saved on this device."* The headline
      figures and the challenge and type grids should all carry real numbers.
      This only works if the catalogue pass finished while you were online —
      visit Explore and wait for the grid counts to stop saying "counting…"
      before cutting the network.
- [ ] **Settings** still reports the record count and size.
- [ ] **Search** for a word you know is in the cache — use one from a record
      you opened a moment ago. The banner above the results should read **"Saved on this
      device"** instead of "Powered by AI", over the note *"You are offline —
      showing the N solutions saved on this device that match."*
- [ ] Those results are actually about what you searched for. The cache is
      searched, not merely listed, so a query matching nothing cached should
      give the empty state rather than a random assortment.

### Known gaps, so you do not report them as new

- **Search offline covers the cache, not the catalogue.** It looks through the
  records on the device — what you bookmarked and read — not FAO's 6,287, and
  says so. A query for
  something genuinely rare will find nothing.
- **The heat maps do not work offline.** They need the whole-catalogue pass,
  which is 6,287 records' worth of queries.
- **The counts do not work offline**, for the same reason, so a cached list
  reports what the device holds rather than what exists.

### Back online

- [ ] Switch throttling back to "No throttling" and reload. Lists fill from the
      portal again, and the offline note disappears.
- [ ] Bookmarks made while offline are still there.

## 9. Narrow screens

- [ ] At 390px wide (DevTools device toolbar, iPhone 14) nothing overflows
      sideways and both heat maps still scroll rather than squash.
