-- browse_innovations: the web app's filtered, paged, counted list, answered
-- from the active snapshot. SUPABASE-IMPLEMENTATION.md, task 2.
--
-- The filter bag is not interpreted here. The app runs it through the same
-- buildFilterSpec() it has always used — which resolves challenge and type
-- keywords to vocabulary terms, expands hub regions to their countries, turns
-- a readiness minimum into the terms that satisfy it, and writes SDGs as
-- "Goal N:" — and src/api/supabase/browseFilters.js hands the result over as
-- clauses. Each clause is an OR of conditions; the clauses are ANDed. That is
-- the reading localFilter.js already gives the same spec, so the two paths
-- cannot disagree about what a filter means.
--
-- {
--   "all": [
--     [{"field": "useCase", "op": "in", "values": ["Crop production"]}],
--     [{"field": "sdg", "op": "contains", "value": "Goal 1:"},
--      {"field": "sdg", "op": "contains", "value": "Goal 2:"}]
--   ],
--   "cost": ["low"],
--   "complexity": ["simple", "moderate"]
-- }
--
-- Only allowlisted fields and operators are accepted, and every value reaches
-- the SQL through format('%L'), never as raw text.

-- `value` as an ILIKE pattern matching it anywhere, its own wildcards escaped.
create function catalog.contains_pattern(value text)
returns text
language sql
immutable
set search_path = catalog, pg_temp
as $$
  select '%' || replace(replace(replace(value, '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

-- The WHERE condition for one filter object. Raises on anything unknown.
create function catalog.browse_where(p_filters jsonb)
returns text
language plpgsql
immutable
set search_path = catalog, pg_temp
as $$
declare
  v_clause jsonb;
  v_cond jsonb;
  v_ands text[] := array['true'];
  v_ors text[];
  v_col text;
  v_kind text;
  v_values text[];
  v_value text;
begin
  if p_filters is null or p_filters = 'null'::jsonb then
    return 'true';
  end if;
  if jsonb_typeof(p_filters) <> 'object' then
    raise exception 'filters must be an object';
  end if;
  -- Hub regions expand to dozens of countries, but nothing the app builds is
  -- anywhere near this; it only stops a hand-made request from being huge.
  if length(p_filters::text) > 50000 then
    raise exception 'filters too large';
  end if;

  if jsonb_typeof(coalesce(p_filters -> 'all', '[]'::jsonb)) <> 'array' then
    raise exception 'filters.all must be an array';
  end if;

  for v_clause in select value from jsonb_array_elements(coalesce(p_filters -> 'all', '[]'::jsonb)) loop
    if jsonb_typeof(v_clause) <> 'array' or jsonb_array_length(v_clause) = 0 then
      raise exception 'each clause must be a non-empty array';
    end if;

    v_ors := '{}';
    for v_cond in select value from jsonb_array_elements(v_clause) loop
      v_col := null;
      v_kind := null;
      select f.col, f.kind into v_col, v_kind
        from (values
          ('useCase', 'use_cases', 'array'),
          ('type', 'types', 'array'),
          ('country', 'countries', 'array'),
          ('region', 'regions', 'array'),
          ('sdg', 'sdgs', 'array'),
          ('user', 'users', 'array'),
          ('readiness', 'readiness_term', 'text'),
          ('adoption', 'adoption_term', 'text'),
          ('source', 'source_title', 'text'),
          ('title', 'title', 'text'),
          ('grassroots', 'grassroots', 'bool')
        ) as f (field, col, kind)
       where f.field = v_cond ->> 'field';

      if v_col is null then
        raise exception 'unknown filter field %', v_cond ->> 'field';
      end if;

      v_values := array(select jsonb_array_elements_text(coalesce(v_cond -> 'values', '[]'::jsonb)));
      v_value := v_cond ->> 'value';

      v_ors := v_ors || case
        when v_kind = 'array' and v_cond ->> 'op' = 'in' then
          format('%I && %L::text[]', v_col, v_values)
        when v_kind = 'array' and v_cond ->> 'op' = 'contains' and v_value is not null then
          format('exists (select 1 from unnest(%I) as v where v ilike %L)', v_col, catalog.contains_pattern(v_value))
        when v_kind = 'text' and v_cond ->> 'op' = 'in' then
          format('%I = any (%L::text[])', v_col, v_values)
        when v_kind = 'text' and v_cond ->> 'op' = 'contains' and v_value is not null then
          format('%I ilike %L', v_col, catalog.contains_pattern(v_value))
        when v_kind = 'text' and v_cond ->> 'op' = 'present' then
          format('%I is not null', v_col)
        when v_kind = 'bool' and v_cond ->> 'op' = 'eq' and v_value in ('1', 'true', '0', 'false') then
          format('%I = %L::boolean', v_col, v_value in ('1', 'true'))
        else null
      end;

      if v_ors[array_length(v_ors, 1)] is null then
        raise exception 'unsupported condition %', v_cond;
      end if;
    end loop;

    v_ands := v_ands || ('(' || array_to_string(v_ors, ' or ') || ')');
  end loop;

  -- Cost and complexity are stored by the importer, so they filter, page and
  -- count like every other field.
  if p_filters ? 'cost' then
    v_ands := v_ands || format('cost_level = any (%L::text[])',
      array(select jsonb_array_elements_text(p_filters -> 'cost')));
  end if;
  if p_filters ? 'complexity' then
    v_ands := v_ands || format('complexity_level = any (%L::text[])',
      array(select jsonb_array_elements_text(p_filters -> 'complexity')));
  end if;

  return array_to_string(v_ands, ' and ');
end
$$;

-- A page of mapped innovations, the total behind it, and which snapshot
-- answered.
--
-- sort: 'recent'   most recently changed first (the drilldown's order)
--       'advanced' highest readiness first, unlevelled last
-- Both break ties on uuid, so a page boundary never shuffles.
create function public.browse_innovations(
  filters jsonb default '{}'::jsonb,
  lim integer default 10,
  off integer default 0,
  sort text default 'recent'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = catalog, pg_temp
as $$
declare
  v_run bigint := catalog.active_run();
  v_where text;
  v_order text;
  v_count bigint;
  v_results jsonb;
begin
  if v_run is null then
    raise exception 'no catalogue has been published yet';
  end if;

  v_order := case sort
    when 'recent' then 'changed desc nulls last, uuid'
    when 'advanced' then 'readiness_level desc nulls last, uuid'
  end;
  if v_order is null then
    raise exception 'unknown sort %', sort;
  end if;

  lim := least(greatest(coalesce(lim, 10), 0), 100);
  off := greatest(coalesce(off, 0), 0);
  v_where := catalog.browse_where(filters);

  execute format('select count(*) from catalog.innovations where run_id = $1 and %s', v_where)
    into v_count using v_run;

  execute format(
    'select coalesce(jsonb_agg(payload order by %1$s), ''[]''::jsonb)
       from (select payload, changed, readiness_level, uuid
               from catalog.innovations
              where run_id = $1 and %2$s
              order by %1$s
              limit $2 offset $3) as page',
    v_order, v_where
  ) into v_results using v_run, lim, off;

  return jsonb_build_object(
    'results', v_results,
    'count', v_count,
    'exact', true,
    'snapshotVersion', v_run::text
  );
end
$$;

revoke all on function catalog.contains_pattern(text) from public, anon, authenticated;
revoke all on function catalog.browse_where(jsonb) from public, anon, authenticated;
revoke all on function public.browse_innovations(jsonb, integer, integer, text) from public;
grant execute on function public.browse_innovations(jsonb, integer, integer, text) to anon, authenticated;
