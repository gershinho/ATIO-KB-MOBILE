# Supabase web architecture

The web app is served from `https://sti-portal.fao.org/atiokb-webapp`. A developer runs the weekly catalogue importer manually from a local machine; the browser reads the published snapshot from Supabase.

```mermaid
flowchart LR
  subgraph Refresh[Manual weekly refresh — developer machine]
    FAO[FAO JSON:API] -->|paged catalogue + vocabularies| Importer[Local Node importer]
    Importer -->|stage · validate · publish pointer| DB[(Supabase Postgres\nversioned catalogue)]
  end

  subgraph Browser[User's browser]
    PWA[PWA frontend\nsti-portal.fao.org/atiokb-webapp]
    IDB[(IndexedDB\nfull index · taxonomy · saved data)]
  end

  PWA -->|browse · details · search · taxonomy RPCs| DB
  DB -->|active snapshot responses| PWA
  PWA <-->|offline cache| IDB

  PWA -->|AI requests| Edge[Supabase Edge Functions]
  Edge -->|server-side API key| OpenAI[OpenAI API]
```

## Trust and runtime notes

- The browser ships only the Supabase URL and publishable key. Catalogue reads go through scoped read RPCs; importer/database and OpenAI credentials remain server-side.
- IndexedDB remains the offline store for the full catalogue index, taxonomy cache and locally saved records. The service worker continues to cache the PWA shell.
- FAO is contacted by the manually run importer, not by migrated browser flows.
- The importer remains a local command initially. A future GitHub Actions workflow will run the same script; it does not change the data flow or publish transaction.
