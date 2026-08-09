# Errors needed to fix

Known problems that are **not** fixed, written down so they don't have to be
rediscovered. Each one says what a user would see, what causes it, and what
fixing it would involve.

Everything here was found deliberately and left deliberately. Nothing in this
file blocks running the app or testing it.

---

## 1. The filter panel can't recognise the category you're already in

**Severity:** user-visible, affects the app's main browsing path
**Where:** `src/screens/home/drilldownTargets.js`, `src/utils/filterEncoding.js`
**Status:** not fixed — the fix changes what results people see, so it wants a
device in hand rather than a code change made on faith

### What a user sees

1. On Explore, tap a category — say **Soil & Land**.
2. A list opens: *"Soil & Land — 40 solutions"*. This is correct.
3. Tap **Filter**.
4. The Soil & Land section shows **all seven checkboxes empty**. The panel is
   saying no category is selected, while you are standing inside one and looking
   at its results.

Two things then go wrong, both silently:

- **"Reset all" takes you out of the category instead of back to it.** It is
  meant to restore the slice you entered with. It cannot find that slice, so it
  resets to nothing selected.
- **Pressing "Done" without touching anything changes your results.** The panel
  submits "no category selected", the filter is dropped, and 40 solutions
  become the entire catalogue of 3,075. The user changed nothing.

A third, subtler version: ticking one checkbox narrows the list far more than
expected, because it replaces the whole category rather than refining it.

### Why it happens

Each category carries **two separate word lists**, and nothing records that they
describe the same thing.

| | Soil & Land |
|---|---|
| **Search words** — used to find results when you tap the category | `soil`, `land`, `erosion`, `conservation` |
| **Checkbox words** — what the filter panel's list is built from | `improving soil management practices`, `soil carbon sequestration monitoring`, `forestry management`, … (7 total) |

Tapping a category stores the **search words**. The filter panel matches by
**exact string comparison** against the **checkbox words**. `soil` is not
identical to `improving soil management practices`, so nothing matches and the
panel concludes the category was never selected.

**Nine of the twelve challenge categories have zero overlap between their two
lists.** The three that partly work — Crops, Livestock, Post-harvest — share a
word or two by coincidence, not by design.

Measure it by saving this as `overlap-check.mjs` in the repository root and
running `node overlap-check.mjs`. It reads the file as text rather than importing
it, because the app's modules use extensionless imports that only Metro resolves:

```js
import { readFileSync } from 'node:fs';

const src = readFileSync('src/data/constants.js', 'utf8');
const block = src.slice(src.indexOf('export const CHALLENGES'), src.indexOf('export const TYPES'));
let zero = 0, total = 0;

for (const entry of block.split(/\n {4}id: '/).slice(1)) {
  const id = entry.slice(0, entry.indexOf("'"));
  const broad = (entry.match(/keywords: \[([^\]]*)\]/s)?.[1].match(/'([^']+)'/g) || [])
    .map((s) => s.slice(1, -1));
  const sub = [...entry.matchAll(/keyword: '([^']+)'/g)].map((m) => m[1]);
  if (!sub.length) continue;
  total += 1;
  const shared = broad.filter((k) => sub.includes(k)).length;
  if (!shared) zero += 1;
  console.log(id.padEnd(14), 'broad', broad.length, 'sub', sub.length, 'shared', shared);
}

console.log('zero-overlap categories:', zero, 'of', total);
```

At the time of writing this prints `zero-overlap categories: 9 of 12`.

### The fix

The translation this needs **already exists and is simply never reached**.
`withExpandedKeywords` in `src/utils/filterEncoding.js` takes a category *id* and
expands it into that category's *checkbox words* — exactly the vocabulary the
panel understands. It is skipped because the drilldown hands over search words
instead of the id, and the function returns early when the keyword list is
already populated.

**Minimal fix** — in `drilldownTargets.js`, store the category id rather than its
search words:

```js
filters: { challenges: [challenge.id] }        // instead of
filters: { challengeKeywords: challenge.keywords }
```

What that changes:

- **Initial results: unchanged.** The SQL builder expands a category id back to
  the same search words, so the query and the count are identical.
- **The panel recognises the category.** Fixed.
- **Reset returns you to the category.** Fixed.
- **Pressing Done still shifts the results** — but it now narrows to the
  category's own sub-topics instead of clearing the filter entirely. A bad
  behaviour replaced by a defensible one.

**Full fix** — make both halves use one vocabulary throughout. This removes the
last inconsistency but changes initial result counts across the app's main
browsing path, because the search words match many more database entries than
the seven specific phrases do. That is a product decision about what "Soil &
Land" should mean, not a refactor.

### Verified

- The nine-of-twelve overlap gap was measured directly against `constants.js`.
- The exact-match comparison was confirmed by reading `keywordsByEntryId` and
  `entryIdsForKeywords` in `filterEncoding.js`.
- The step-4 and step-5 behaviour above is traced from the code and **has not
  been watched on a running device**. Confirm it on a phone before and after any
  fix.

---

## 2. Colour-blind mode only affects one screen

**Severity:** user-visible; the app offers a setting it does not honour
**Where:** `src/context/AccessibilityContext.js` consumers

Settings offers a colour-blind-friendly palette. Exactly one surface honours it:
the filter tags inside a drilldown (`DrilldownView` is the only module that reads
`colorBlindMode` and passes it on).

The solution cards, the cost and complexity badges, and **both heat maps** ignore
it. The heat maps are the worst case — they encode their entire meaning in
colour, so for the user this setting is most needed exactly where it does
nothing.

Either wire the palette through those surfaces, or remove the setting. Offering
it and not honouring it is the worst of the three options.

---

## 3. The app has no error boundary

**Severity:** turns a small bug into a dead app
**Where:** `App.js`

There is no error boundary anywhere in the tree. If any screen throws while
rendering, React unmounts everything and the user gets a **white screen** with no
message and no way back except force-quitting.

For field testing on unfamiliar devices and data, this is the difference between
"one screen looked wrong" and "the app is broken". The fix is a small component
wrapping the navigator that catches the error, shows something readable, and
offers a retry.

---

## 4. Nothing reports crashes

**Severity:** you will not learn what broke
**Where:** no crash reporting is installed

When a tester says "it stopped working", there is currently no stack trace, no
screen name, and no device information. Every log this codebase carefully added
goes to a console nobody is watching.

---

## 5. The OpenAI key has not been rotated

**Severity:** real credential exposure; cannot be fixed by code
**Status:** deliberate — a standing instruction not to rotate

`EXPO_PUBLIC_OPENAI_API_KEY` was removed from `.env`, and nothing in the app
reads it any more. But `EXPO_PUBLIC_*` values are compiled into the JavaScript
bundle, so **any build made while it was present still contains that key**,
extractably, on whatever devices hold those builds.

No amount of restructuring changes that. Only rotating the key at OpenAI does.

---

## 6. First launch on a clean install is unverified

**Severity:** highest remaining ship risk
**Where:** `src/database/connection.js`

The app copies its bundled 37MB database out of assets on first run. That code
was moved to the current Expo file API, and **no automated test can cover it** —
every test replaces the file system with a stand-in, so passing tests only prove
the new code agrees with a stand-in that was written alongside it.

If it is wrong, the app cannot open its database at all: it fails at startup
rather than subtly.

Delete the app, install fresh, launch. If the catalogue loads, it works.

---

## 7. The export path has no tests

**Severity:** quiet failure
**Where:** `src/utils/downloadInnovation.js`

Tapping download does two things: saves the solution to the Downloads tab, and
writes a real file which it hands to the share sheet. Only the first is tested.

The failure is quiet — the item still appears under Downloads, so it looks like
it worked, while no file was produced. This is also the only place in the app
that touches the phone's file system and hands something to another app.

Worth noting: tests here would use a stand-in file system, so they would prove
the logic and not that a real device accepts the file. A single manual export on
a phone covers what they cannot.

---

## Deliberately not listed

A code-quality scan of this repository currently reports a number of further
items — naming preferences, comments describing where code used to live,
documentation-type completeness, directory organisation. They are recorded in
that tool and are **not** reproduced here, because none of them has a
user-visible consequence and none is worth acting on.

See `desloppify show review --status open` if you want that list.
