-- search_candidates, rewritten to use the trigram index.
--
-- The first version matched each row against an unnest() of the words, which
-- the planner can only answer by scanning every row: 370 ms warm for a
-- four-word query, and intermittently past the anon role's 3 s statement
-- timeout on a cold instance, which surfaced in the app as a failed search.
-- Writing the words out as explicit ILIKE conditions lets Postgres use
-- innovations_search: the loose stage drops to ~65 ms and each suggested
-- word's count to ~3 ms (measured on staging, 8 October).
--
-- Same inputs, same outputs, same order; only how the rows are found changes.
-- Patterns are quoted with format('%L'), never spliced in raw.

-- How many records contain `word`, for choosing suggested words.
create function catalog.count_containing(p_run bigint, word text)
returns bigint
language plpgsql
stable
set search_path = catalog, extensions, pg_temp
as $$
declare
  v_count bigint;
begin
  execute format(
    'select count(*) from catalog.innovations where run_id = $1 and search_text ilike %L',
    catalog.contains_pattern(word)
  ) into v_count using p_run;
  return v_count;
end
$$;

-- One search stage: records containing the words, joined by ' or ' (any) or
-- ' and ' (every), most recently changed first, at most `lim`, as
-- [{id, title, summary}].
create function catalog.search_stage(p_run bigint, words text[], joiner text, lim integer)
returns jsonb
language plpgsql
stable
set search_path = catalog, extensions, pg_temp
as $$
declare
  v_where text;
  v_rows jsonb;
begin
  if joiner not in (' or ', ' and ') then
    raise exception 'joiner must be or/and';
  end if;
  select string_agg(format('search_text ilike %L', catalog.contains_pattern(w)), joiner)
    into v_where
    from unnest(words) as w;
  if v_where is null then
    return '[]'::jsonb;
  end if;

  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''id'', uuid, ''title'', title, ''summary'', summary)
                               order by changed desc nulls last, uuid), ''[]''::jsonb)
       from (select uuid, title, summary, changed
               from catalog.innovations
              where run_id = $1 and (%s)
              order by changed desc nulls last, uuid
              limit $2) as stage',
    v_where
  ) into v_rows using p_run, lim;
  return v_rows;
end
$$;

revoke all on function catalog.count_containing(bigint, text) from public, anon, authenticated;
revoke all on function catalog.search_stage(bigint, text[], text, integer) from public, anon, authenticated;

create or replace function public.search_candidates(terms text[], expanded text[] default '{}')
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
    select w.t, w.first_at, catalog.count_containing(v_run, w.t) as hits
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
  v_loose_rows := catalog.search_stage(v_run, v_loose, ' or ', c_read_limit);

  if v_two_stages then
    -- Strict: every typed word.
    v_strict := catalog.search_stage(v_run, v_cleaned, ' and ', c_read_limit);
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
