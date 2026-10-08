-- The rest of the web app's catalogue reads, over the active snapshot.
-- SUPABASE-IMPLEMENTATION.md, task 3.
--
--   get_innovations     detail records by uuid
--   get_changed         changed stamps, for the pinned-record refresh
--   get_taxonomies      the nine vocabularies, in loadTaxonomies' cache shape
--   get_catalog_index   the catalogIndex:v2 rows, paged
--   search_candidates   textSearch.findCandidates, ported
--
-- Same pattern as browse_innovations: security definer, a fixed search_path,
-- execute granted to the API roles and nothing else, and the private catalog
-- schema never reachable directly.

create function catalog.require_active_run()
returns bigint
language plpgsql
stable
set search_path = catalog, pg_temp
as $$
declare
  v_run bigint := catalog.active_run();
begin
  if v_run is null then
    raise exception 'no catalogue has been published yet';
  end if;
  return v_run;
end
$$;

-- Mapped records for these uuids, in no particular order: the app reorders,
-- as it already does for the portal (db.web.js getInnovationsByIds).
create function public.get_innovations(ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = catalog, pg_temp
as $$
begin
  if coalesce(array_length(ids, 1), 0) > 100 then
    raise exception 'at most 100 ids at once';
  end if;
  return coalesce(
    (select jsonb_agg(payload)
       from catalog.innovations
      where run_id = catalog.require_active_run() and uuid = any (ids)),
    '[]'::jsonb
  );
end
$$;

-- [{id, changed}] for these uuids. `changed` is the portal's own string, as
-- stored in the payload, because the offline refresh compares it with the
-- string it saved last time; a timestamp re-formatted by Postgres would read
-- as "changed" for every record.
create function public.get_changed(ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = catalog, pg_temp
as $$
begin
  if coalesce(array_length(ids, 1), 0) > 200 then
    raise exception 'at most 200 ids at once';
  end if;
  return coalesce(
    (select jsonb_agg(jsonb_build_object('id', uuid, 'changed', payload -> 'changed'))
       from catalog.innovations
      where run_id = catalog.require_active_run() and uuid = any (ids)),
    '[]'::jsonb
  );
end
$$;

-- {byType: {type: [[id, name], ...]}, snapshotVersion}: what taxonomies.js
-- caches, each vocabulary in the order the portal returned it.
create function public.get_taxonomies()
returns jsonb
language sql
stable
security definer
set search_path = catalog, pg_temp
as $$
  select jsonb_build_object(
    'byType', coalesce(jsonb_object_agg(vocabulary, terms), '{}'::jsonb),
    'snapshotVersion', catalog.require_active_run()::text
  )
  from (
    select vocabulary, jsonb_agg(jsonb_build_array(term_id, name) order by position) as terms
      from catalog.taxonomies
     where run_id = catalog.require_active_run()
     group by vocabulary
  ) as v
$$;

-- One page of catalogIndex:v2 rows, in uuid order, after `after`.
--
-- Keyset paging, so a page is a range scan however deep it is. Pass the
-- snapshotVersion from the first page as `snapshot` on the rest: if a publish
-- lands mid-walk the call fails rather than mixing two catalogues, and the
-- caller starts again.
--
-- Returns {rows, sources, total, snapshotVersion, next}; `next` is null on the
-- last page. `sources` is every data source title the snapshot cites.
create function public.get_catalog_index(
  after uuid default null,
  lim integer default 1000,
  snapshot text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = catalog, pg_temp
as $$
declare
  v_run bigint := catalog.require_active_run();
  v_rows jsonb;
  v_last uuid;
  v_count integer;
begin
  if snapshot is not null and snapshot <> v_run::text then
    raise exception 'snapshot changed from % to %; start again', snapshot, v_run
      using errcode = 'P0002';
  end if;
  lim := least(greatest(coalesce(lim, 1000), 1), 2000);

  select jsonb_agg(index_row order by uuid), max(uuid::text)::uuid, count(*)
    into v_rows, v_last, v_count
    from (select index_row, uuid
            from catalog.innovations
           where run_id = v_run and (after is null or uuid > after)
           order by uuid
           limit lim) as page;

  return jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'sources', (select coalesce(jsonb_agg(title), '[]'::jsonb)
                  from (select distinct title from catalog.sources where run_id = v_run) as s),
    'total', (select count(*) from catalog.innovations where run_id = v_run),
    'snapshotVersion', v_run::text,
    'next', case when v_count = lim then to_jsonb(v_last) else null end
  );
end
$$;

-- textSearch.findCandidates, against the snapshot instead of the portal.
--
-- terms     the typed words: every one must appear (strict) or any (loose)
-- expanded  the backend's suggested words; only the rarest few widen the
--           loose search, chosen exactly as discriminating() chooses them:
--           counted, rarest first, kept while their matches fit in the 150
--           records the loose search reads, at most six, none matching zero
--
-- One word and nothing to widen with makes strict and loose the same search,
-- so only the loose one runs and, as in textSearch.js, its rows are the pool
-- the strictCount describes. Each search reads at most 150 records; strict
-- matches go first and a record found by both keeps its strict place.
--
-- Matching is case-insensitive substring over the title and the short
-- description, the two fields the portal search used. The order within a
-- search is most recently changed first, where the portal's was unspecified.
--
-- Returns {candidates: [{id, title, summary}], conjunction, strictCount,
-- requests, expandedKept}.
create function public.search_candidates(terms text[], expanded text[] default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = catalog, pg_temp
as $$
declare
  c_read_limit constant integer := 150;
  c_max_extra constant integer := 6;
  c_enough constant integer := 25;
  v_run bigint := catalog.require_active_run();
  v_cleaned text[];
  v_kept text[] := '{}';
  v_loose text[];
  v_budget integer := c_read_limit;
  v_word record;
  v_two_stages boolean;
  v_strict jsonb;
  v_loose_rows jsonb;
  v_strict_count integer;
  v_candidates jsonb;
begin
  if coalesce(array_length(terms, 1), 0) > 20 or coalesce(array_length(expanded, 1), 0) > 30 then
    raise exception 'too many words';
  end if;

  -- Three characters or more, first occurrence wins, as in textSearch.js.
  select coalesce(array_agg(t order by first_at), '{}') into v_cleaned
    from (select t, min(n) as first_at
            from unnest(terms) with ordinality as u (t, n)
           where t is not null and length(t) > 2 and length(t) <= 100
           group by t) as w;

  if coalesce(array_length(v_cleaned, 1), 0) = 0 then
    return jsonb_build_object('candidates', '[]'::jsonb, 'conjunction', null,
                              'strictCount', 0, 'requests', 0, 'expandedKept', '[]'::jsonb);
  end if;

  -- discriminating(): rarest first, ties in the order suggested.
  for v_word in
    select w.t, w.first_at,
           (select count(*) from catalog.innovations i
             where i.run_id = v_run and i.search_text ilike catalog.contains_pattern(w.t)) as hits
      from (select t, min(n) as first_at
              from unnest(expanded) with ordinality as u (t, n)
             where t is not null and length(t) > 2 and length(t) <= 100
             group by t) as w
     order by hits, w.first_at
  loop
    continue when v_word.hits = 0;
    exit when v_word.hits > v_budget or coalesce(array_length(v_kept, 1), 0) >= c_max_extra;
    v_kept := v_kept || v_word.t;
    v_budget := v_budget - v_word.hits;
  end loop;

  select array_agg(t order by first_at) into v_loose
    from (select t, min(n) as first_at
            from unnest(v_cleaned || v_kept) with ordinality as u (t, n)
           group by t) as w;

  v_two_stages := array_length(v_cleaned, 1) > 1 or coalesce(array_length(v_kept, 1), 0) > 0;

  -- Loose: any word, title or short description.
  select coalesce(jsonb_agg(jsonb_build_object('id', uuid, 'title', title, 'summary', summary)
                            order by changed desc nulls last, uuid), '[]'::jsonb)
    into v_loose_rows
    from (select uuid, title, summary, changed
            from catalog.innovations i
           where i.run_id = v_run
             and exists (select 1 from unnest(v_loose) as t
                          where i.search_text ilike catalog.contains_pattern(t))
           order by changed desc nulls last, uuid
           limit c_read_limit) as l;

  if v_two_stages then
    -- Strict: every typed word.
    select coalesce(jsonb_agg(jsonb_build_object('id', uuid, 'title', title, 'summary', summary)
                              order by changed desc nulls last, uuid), '[]'::jsonb)
      into v_strict
      from (select uuid, title, summary, changed
              from catalog.innovations i
             where i.run_id = v_run
               and not exists (select 1 from unnest(v_cleaned) as t
                                where i.search_text not ilike catalog.contains_pattern(t))
             order by changed desc nulls last, uuid
             limit c_read_limit) as s;
  else
    v_strict := v_loose_rows;
    v_loose_rows := '[]'::jsonb;
  end if;

  v_strict_count := jsonb_array_length(v_strict);

  -- Strict first; a record in both keeps its strict place.
  select coalesce(jsonb_agg(candidate order by stage, n), '[]'::jsonb) into v_candidates
    from (select distinct on (candidate ->> 'id') candidate, stage, n
            from (select value as candidate, 0 as stage, n
                    from jsonb_array_elements(v_strict) with ordinality as s (value, n)
                  union all
                  select value, 1, n
                    from jsonb_array_elements(v_loose_rows) with ordinality as l (value, n)) as both_stages
           order by candidate ->> 'id', stage, n) as merged;

  return jsonb_build_object(
    'candidates', v_candidates,
    'conjunction', case when v_strict_count >= c_enough then 'AND' else 'OR' end,
    'strictCount', v_strict_count,
    'requests', 1,
    'expandedKept', to_jsonb(v_kept)
  );
end
$$;

revoke all on function catalog.require_active_run() from public, anon, authenticated;
revoke all on function public.get_innovations(uuid[]) from public;
revoke all on function public.get_changed(uuid[]) from public;
revoke all on function public.get_taxonomies() from public;
revoke all on function public.get_catalog_index(uuid, integer, text) from public;
revoke all on function public.search_candidates(text[], text[]) from public;
grant execute on function public.get_innovations(uuid[]) to anon, authenticated;
grant execute on function public.get_changed(uuid[]) to anon, authenticated;
grant execute on function public.get_taxonomies() to anon, authenticated;
grant execute on function public.get_catalog_index(uuid, integer, text) to anon, authenticated;
grant execute on function public.search_candidates(text[], text[]) to anon, authenticated;
