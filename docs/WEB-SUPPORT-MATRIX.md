# Native vs web library matrix

Every runtime dependency, classified as **works on web** / **needs a `.web.js`
split** / **descoped on web**, with the evidence behind each call.

Produced for the Sprint 1 goal "every dependency classified as works on web /
needs .web.js split / descoped on web" and the Notion card *Platform Splits for
Native-Only APIs*.

Verified against `package.json` on 17 September 2026, by reading each package's
own web implementation in `node_modules` rather than assuming.

---

## The classification

| Dependency | Verdict | Evidence |
|---|---|---|
| `@expo/metro-runtime` | Works (web only) | The runtime that makes Metro's web output run; added when web support was restored. |
| `react-native-svg` | Works | Draws the Bootstrap Icons set (`src/components/icons/`); renders through react-native-web. Replaced `@expo/vector-icons`, so the web build no longer fetches an icon font. |
| `@react-native-async-storage/async-storage` | **Works, now settings only** | Ships two implementations: `lib/module/AsyncStorage.js` is backed by `window.localStorage`, `AsyncStorage.native.js` by the native module. Metro picks per platform. Sprint 2 moved bookmarks, downloads and likes off it on web — localStorage holds about 5 MB of strings and stored each innovation twice — into IndexedDB (`storage/offlineStore.js`). Settings stay here on both platforms. |
| `@react-navigation/bottom-tabs` | Works | Pure JS. |
| `@react-navigation/native` | Works | Pure JS. |
| `expo` | Works | Core runtime. |
| `expo-asset` | Works, but absent from the web bundle | Has a web build (`PlatformUtils.web.js`), but the only importer was `database/connection.js`, which the web twin replaces. |
| `expo-audio` | **Needs split** | Playback has a web build; the *recorder* path this app uses (`useAudioRecorder`, `AudioModule.requestRecordingPermissionsAsync`) does not work in a browser. Replaced by `hooks/useSpeechToText.web.js`, which reports dictation unavailable so the UI hides the mic. |
| `expo-constants` | Works | Used by `services/api.js` to derive the dev host; has a web build. |
| `expo-file-system` | **Needs split** | Its web build warns *"expo-file-system is not supported on web"* from every method, `documentDirectory` included. Two importers, both replaced: `database/connection.web.js` and `utils/downloadInnovation.web.js`. |
| `expo-sharing` | **Needs split** | Browsers have no system share sheet for files. `utils/downloadInnovation.web.js` saves through an object URL and a download link instead. |
| `expo-sqlite` | **Descoped on web** | It *does* have a real web implementation — SQLite compiled to WebAssembly (`web/wa-sqlite/wa-sqlite.wasm`) running in a worker over OPFS. Unusable here for two reasons: the 37 MB catalogue would have to be downloaded into the browser, which decision D9 forbids, and OPFS access handles plus SharedArrayBuffer require cross-origin isolation (COOP/COEP headers) that the hosting has not agreed. Replaced by `database/connection.web.js`, which rejects with a typed error. Since Sprint 2 the web build has its own data — the FAO JSON:API, cached in IndexedDB — so nothing asks it for SQLite at all. |
| `expo-status-bar` | Works | Has `StatusBar.web.ts`. |
| `react` | Works | — |
| `react-dom` | Works (web only) | Required for the web renderer. |
| `react-native` | Works | Through `react-native-web`. |
| `react-native-safe-area-context` | Works | Ships `SafeAreaView.web.tsx`. |
| `react-native-screens` | Works | Has web builds; navigation renders without native screens. |
| `react-native-svg` | Works | Required, not optional: `metro.config.js` routes `.svg` through `react-native-svg-transformer`, and three components import SVGs — `SearchMode`, `HelpEmptyState`, `BouncingLoader`. |
| `react-native-web` | Works (web only) | The renderer itself. |

**Totals:** 16 work as-is, 3 need a split, 1 is descoped.

---

## The splits created

| File | Replaces | Keeps out of the web bundle |
|---|---|---|
| `src/database/connection.web.js` | `connection.js` | `expo-sqlite`, `expo-asset`, `expo-file-system` |
| `src/database/engagement.web.js` | `engagement.js` | (storage swap, not a native module) |
| `src/utils/downloadInnovation.web.js` | `downloadInnovation.js` | `expo-sharing`, `expo-file-system` |
| `src/hooks/useSpeechToText.web.js` | `useSpeechToText.js` | `expo-audio` |
| guard in `src/services/api.js` | — | Refuses the React-Native upload shape on web |
| `src/utils/dialogs.web.js` | `dialogs.js` | Browser `confirm`/`alert` instead of the no-op `Alert` |

`src/database/webDataUnavailable.js` holds the typed error and the single
sentence shown wherever the catalogue would have been, so both platforms can
import it.

### Why `engagement` is a storage swap, not a stub

Likes, comments and the AI-bullet cache have always been per-device: the tables
are created empty in `connection.js` and hold nothing from the bundled
catalogue, so a fresh phone install already starts with zero likes and no
comments. The web twin stores the same data in AsyncStorage — `localStorage` in
a browser — so web behaves exactly like a new install rather than losing the
features.

---

## What works on web, and what does not

**Works:** search, results, opening a solution, AI summaries, bookmarks,
downloads (saved as a file by the browser), likes, comments, accessibility
settings.

Search works because it is computed on the **server**: the app posts a query to
the backend, which runs the same catalogue server-side and returns finished
records. Nothing on the device touches a database.

**Does not work:** Explore — the stats, challenge and type grids, innovation
hubs, filters, drilldowns and both heat maps. All of it is computed *on the
device* by SQL against the bundled catalogue, roughly forty queries on first
load. Web shows "Browsing isn't available in the web preview yet." with no retry
button, because retrying cannot succeed.

---

## The trap: APIs that exist on web but do nothing

Absent modules are the easy case — the build fails and you notice. The
dangerous ones are present, callable, and silently useless.

`Alert` is the example this app hit. `react-native-web` exports it, so nothing
errors and nothing warns, but the implementation is:

```js
class Alert { static alert() {} }
```

An empty function. Every confirmation built on it did nothing on web, which
meant three features were **silently dead** while looking perfectly fine:

- the trash button on each row of Downloads
- **Clear bookmarks** and **Clear downloads** in Settings

All three ask for confirmation before destroying something, and the
confirmation never appeared, so the destroy never ran. Two further uses — the
export-failure and save-failure notices — were merely invisible rather than
broken.

Fixed by `src/utils/dialogs.js` and its web twin: `confirmAction()` returns a
promise the caller awaits, backed by `Alert` on native and `window.confirm` in
a browser, with `notify()` for one-way messages. The native half deliberately
calls `Alert.alert(title, message)` unchanged, which is the shape the existing
tests assert.

The other react-native APIs this app imports — `ActivityIndicator`, `Animated`,
`FlatList`, `Keyboard`, `KeyboardAvoidingView`, `LayoutAnimation`, `Platform`,
`ScrollView`, `StyleSheet`, `Text`, `TouchableOpacity`, `View` — were checked
against react-native-web and are all genuinely implemented.

**The lesson for the rest of this migration:** "it imports without error" is not
evidence that something works. Anything that talks to the device or the user
needs to be *exercised* on web, not just compiled.

---

## The heat maps

> **Resolved in Sprint 2.** Both maps work on web. What follows is how, and the
> two conditions below still hold.

Both maps are two-dimensional aggregates — regions x challenges, and challenges
x types, roughly 96 cells each. The phone counts them with SQL over the bundled
catalogue. The web build has no catalogue, and this section used to say it
needed one precomputed endpoint per map.

It did not. Each cell holds an *average* — of readiness, and of adoption — and
no count endpoint produces an average, so even the `meta.count` FAO are adding
would not have answered it. What the web build does instead is walk the whole
collection once, 6,287 records in about twelve seconds against a warm portal,
and compute every cell locally from the result. That pass also answers Explore's
counts, and is cached for six hours. See [JSON-API.md](JSON-API.md).

Two conditions are easy to miss:

- **The axes are not in the database.** Rows and columns come from
  `INNOVATION_HUB_REGIONS`, `CHALLENGES` and `TYPES` in `src/data/constants.js`,
  and regions are assigned through `COUNTRY_TO_REGION`. Whoever computes the
  cells needs those exact definitions. If they drift, the maps still render and
  the numbers are quietly wrong — worse than a blank screen, because nobody
  notices. Sprint 2 answered this by computing both grids from one module,
  `src/database/heatmapGrids.js`, called by the phone and the web build alike:
  the definitions can still change, but the two platforms cannot read them
  differently. The extraction was checked against the bundled catalogue, both
  grids byte-identical before and after.
- **The response shape must match** what the components read: `data.rows`,
  `data.cols`, and `cells[rowName][colId]`.

---

## Follow-ups, deliberately not done here

1. **A real web microphone is feasible.** Browsers record with `getUserMedia`
   plus `MediaRecorder`, and the backend already accepts whatever format it is
   given — it reads the extension off the uploaded filename and hands the file
   to Whisper, so a `recording.webm` works untouched. The only app-side blocker
   is that `transcribeAudio` builds a React-Native `{uri, type, name}` upload,
   where a browser needs a Blob. Out of scope per the card; worth raising before
   the booth, where voice search would otherwise be dead.

2. ~~**Explore needs aggregate endpoints.**~~ **Resolved in Sprint 2, without
   them.** Explore, its drilldowns, its filters and both heat maps read the FAO
   JSON:API directly: the vocabularies are preloaded and cached for a day, the
   catalogue is walked once and cached for six hours, and every count and grid
   falls out of that pass. No endpoint was built on either side. What remains is
   CORS on the portal, which is one setting and is tracked in
   [PWA-FOLLOW-UPS.md](../PWA-FOLLOW-UPS.md).

3. **Booth feedback capture needs a decision before 7 October.** The WFF cards
   require collecting rating, comment and user type from visitors, and the booth
   runs on web via a QR code. The app's existing per-innovation comments cannot
   serve that: they are device-local, and the *Drupal JSON:API mapping* card
   states they stay device-local until an auth model is chosen. So booth
   feedback needs either purpose-built capture in Sprint 2 or the form-link
   fallback the work plan allows. No card currently says which.
