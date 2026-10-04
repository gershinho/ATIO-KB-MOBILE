# Offline UI — what's there and where to change it

Hi Eshaan. The offline behaviour works but looks plain — it's three grey notes
and a badge, all written by me, none designed. That's your bit. This is where
everything lives and the two or three things worth not breaking.

Branch: **`sprint2`**. All of this is web-only; the phone carries the whole
catalogue and never goes offline in this sense.

## Running it

Four terminals from the repo root:

```sh
npm run proxy              # :3002  FAO data — Explore is empty without it
cd backend && npm start    # :3001  search ranking, AI
npm run web                # :8081  the app, live-reloads your edits
```

Work on **:8081** while you style things. But **test offline on :4173**, which
needs a build first:

```sh
npm run build:web && npx serve dist -l 4173
```

The dev server registers no service worker, so with the network off the page
dies on Chrome's own "You're offline" screen before any of our code runs. It
looks like a bug in the app and isn't.

## Seeing the offline states at all

In this order, or you'll see nothing:

1. Open **:4173**, **reload once** (the service worker only takes control on the
   second load).
2. Go to **Explore** and wait until the grid counts stop saying "counting…".
   That's the catalogue being saved; offline Explore needs it.
3. Wait ~45s on the home screen for the background save of 100 records. Settings
   → Offline should show the count climbing.
4. Bookmark two or three things.
5. DevTools → **Network → Offline**, and **tick "Disable cache"**.

That last tick matters more than it looks. FAO let the browser reuse any answer
for an hour, so without it Chrome serves whole pages of real data with the
network off and you'll never see the offline UI at all. It fooled me for a
while.

Full checklist: [docs/TESTING-WEB.md](docs/TESTING-WEB.md) section 8.

## The four things to design

Each screen gets a boolean and decides what to show. The flags are already
plumbed — you shouldn't need to touch any hook.

| Where | File | Flag |
|---|---|---|
| Search results | `src/screens/home/SearchMode.js:258` | `search.fromCache` |
| Explore landing | `src/screens/home/ExploreMode.js:69` | `explore.fromCache` |
| Any filtered list | `src/screens/home/DrilldownView.js:104` | `drilldown.fromCache` |
| Innovation detail | `src/components/DetailDrawer.js:374` | `innovation.availableOffline` |

Current wording, all placeholder:

- Search — the "Powered by AI" strip becomes **"Saved on this device"**, over
  *"You are offline — showing the 16 solutions saved on this device that match."*
  The number is `search.cachedTotal`.
- Explore — *"You are offline — these figures are from the copy saved on this
  device."*
- Drilldown — *"You are offline — showing the 16 solutions saved on this
  device."* The number is `drilldown.count`.
- Detail — an **"Available offline"** badge beside the overview heading.

### A tidy-up if you want it

`offlineNote` and `offlineNoteText` are copy-pasted into all three screens with
identical values. Worth one shared component — `src/components/OfflineNote.js`
or similar. Nothing depends on them being separate.

## Three things worth keeping

Not rules, just the reasoning behind the current wording, so you can decide
against it knowingly.

1. **The notes say they're partial.** A list quietly showing 16 of 6,287 with no
   explanation is worse than an error — the user thinks that's all there is.
   Whatever it ends up looking like, it should still say *some*.
2. **"Powered by AI" is replaced, not kept.** The model never saw those rows; the
   device answered them. Leaving the strip up would claim otherwise.
3. **Never show zeroes instead of a message.** If nothing is cached, the data
   layer returns null and the screen shows its error on purpose. A page reading
   "0 solutions" says there are none, which is a worse lie than "couldn't load".

## What's deliberately not available offline

Don't design states for these; they need the whole catalogue:

- both heat maps
- exact totals — a cached list reports what's on the device, not what exists
- any innovation that was never saved

## Checks

```sh
npm test            # app + backend, currently 945 + 109 passing
npx eslint src
```

Only one test asserts on wording you might change:
`__tests__/rendered/HomeScreen.test.js` pins **"Could not load these solutions"**
on the Explore error. Update it alongside if you reword — it's there to catch
accidental changes, not deliberate ones.

The three notes and the "Available offline" badge are **not** pinned by any
test, so reword or restyle them freely.

Background on how any of this works:
[docs/OFFLINE-STORAGE.md](docs/OFFLINE-STORAGE.md). Shout if something doesn't
reproduce — most likely the cache wasn't warm or "Disable cache" wasn't ticked.
