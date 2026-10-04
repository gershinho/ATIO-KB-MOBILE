# Follow-ups

Things still to do from the Sprint 1 web work.
Fuller detail: [docs/WEB-SUPPORT-MATRIX.md](docs/WEB-SUPPORT-MATRIX.md).

## 1. The app icons are still placeholder artwork

The icons in `public/` are generated from the existing app mark, not drawn for
this. They still need proper artwork from the brand owners.

They are at least on the FAO palette now. They were previously the legacy green
(`#22C55E`) while the manifest, the splash and the in-app logo were all FAO
Primary, so an installed app showed a green tile under a blue theme. The mark
was recoloured onto `#116AAB` and everything in `public/` regenerated from it;
`public/favicon.png` was the stock Expo logo and now uses the ATIO mark too.

This was a recolour, not a redraw. Replacing the artwork is still open, and
whether ATIO overrides FAO's corporate blue is still unconfirmed — ask Chiko or
Diego. To remake them from a new source icon:

```sh
sips -z 192 192 assets/icon.png --out public/logo192.png
sips -z 512 512 assets/icon.png --out public/logo512.png
sips -z 410 410 assets/icon.png --out /tmp/inner.png
sips -p 512 512 --padColor 116AAB /tmp/inner.png --out public/logo512-maskable.png
sips -z 48 48 assets/icon.png --out public/favicon.png
```

The 410-then-pad step is the maskable safe zone: Android crops the tile to its
own shape, so the mark has to sit inside the middle 80%. `--padColor` must match
the artwork's own background or the crop shows a ring.


## 2. The web app needs CORS on the portal

**Done, except for this.** Explore, the counts and both heat maps now read the FAO
JSON:API directly — no backend endpoints were needed in the end. See
[docs/JSON-API.md](docs/JSON-API.md).

What is left is one setting on FAO's side. The portal serves the JSON:API to anyone —
`curl` it and you get data — but it sends no `Access-Control-Allow-Origin` header, so a
**browser** throws the response away before our code sees it. Until that is enabled, the
web app only works alongside the development proxy (`npm run proxy`), which asks on the
browser's behalf and is not something we can put in front of the public.

Diego's mapping card lists it as agreed ("CORS will be enabled on
https://sti-portal.fao.org, so the PWA can call the JSON:API directly"). It needs a date.


## 3. Search and Explore agree on what an innovation is — on web

**Done on web.** Search no longer reads this project's bundled SQLite catalogue.
It reads the FAO JSON:API, like Explore, so both surfaces cover the same 6,287
published innovations under the same uuids. Bookmarking one record from each now
stores it once, and a record saved from search can be refreshed from the portal.

How, in four stages — the detail is in
[docs/JSON-API.md](docs/JSON-API.md#searching-by-a-typed-question):

1. our backend turns the question into search words, translating it first
2. the portal says which of its records contain them, strict and loose at once
3. `src/search/rankCandidates.js` ranks them, on text stage 2 already returned
4. our backend orders the best sixty with the model, as it always did

Our backend keeps the two jobs only it can do and holds no catalogue for either.
`/api/rank` and `/api/search-terms` open no database handle, so nothing can drift
out of sync, because there is one copy.

**What is left is the phone.** Native search and Explore both read the bundled
`assets/db/atiokb.db`, so they already agree with each other — but at 3,075
records a year old, where web is at 6,287 and live. The phone and the web build
therefore disagree, which is a smaller problem than the one this item opened
with and the same cause. Fixing it means regenerating or replacing that bundled
file, which is a piece of work with no card.

Two smaller things this surfaced, neither new:

- **Only non-Latin queries are translated.** `translateIfNeeded` decides by how
  much of the query is ASCII letters, so Arabic and Chinese are translated and
  French and Spanish are not — "comment stocker l'eau" is searched as typed.
  `/api/search` has always behaved this way; it is just more visible now that
  the catalogue being searched is the live one.
- **Accented words are split, not folded.** `extractQueryTerms` strips anything
  outside `a-z0-9`, so "sèche" becomes "s" and "che" rather than "seche". Also
  pre-existing, and also shared with `/api/search`.


## 4. For Diego: short descriptions are cut off mid-word in the portal

`field_shorter_description` is truncated at exactly 300 characters, mid-word. One
example, "Vision for Adapted Crops and Soils", ends: *"…to be more resilient,
nutritious, and sus"*.

The app shows what the portal publishes, so the overview on web reads as half a
sentence for those records. It looks worse than on the phone, where the bundled
catalogue has full paragraphs in that field.

We can paper over it by falling back to the full `body` when the short field is
truncated — one line in the mapper — but that is worth deciding rather than
assuming, since it would make web show more text than the phone. Left as-is for
now, deliberately. The real fix is on the portal.


## 5. Voice search could work on the web

Browsers can record audio, and the backend already accepts whatever audio file it is sent.
The only change needed is how the app packages the recording before uploading it. Hidden
for now.
