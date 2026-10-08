-- The catalogue snapshot the web app reads instead of the FAO JSON:API.
--
-- The importer (importer/run.js) writes a complete copy of the catalogue under
-- a new run id, validates it, and only then moves the one active-run pointer,
-- in a single transaction. Readers therefore see the whole previous snapshot or
-- the whole new one, never a half-written mix, and the previous complete run is
-- kept so a bad publish can be rolled back by moving the pointer again.
--
-- Everything lives in the private `catalog` schema, which the Data API does not
-- expose and `anon` cannot reach. The browser reads it only through the scoped
-- read RPCs added in later migrations. See SUPABASE-IMPLEMENTATION.md, task 1.

create extension if not exists pg_trgm with schema extensions;

create schema if not exists catalog;
revoke all on schema catalog from public, anon, authenticated;

-- One row per importer run, failed ones included, so a run's outcome can be
-- read back after the fact.
create table catalog.import_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'validated', 'published', 'superseded', 'failed')),
  row_count integer,
  vocabulary_counts jsonb,
  error text
);

-- The pointer. One row, enforced by the boolean key.
create table catalog.catalog_state (
  id boolean primary key default true check (id),
  active_run bigint references catalog.import_runs (id),
  previous_run bigint references catalog.import_runs (id),
  updated_at timestamptz not null default now()
);
insert into catalog.catalog_state (id) values (true);

-- One published innovation per run.
--
-- `payload` is exactly what mapInnovation() returns, so detail and list reads
-- hand the app the shape it already renders. `index_row` is exactly a
-- catalogIndex:v2 row, so the offline index can be filled without re-deriving
-- anything in the browser. The typed columns repeat what filtering, sorting and
-- search read, so those run on indexes rather than on jsonb.
create table catalog.innovations (
  run_id bigint not null references catalog.import_runs (id) on delete cascade,
  uuid uuid not null,
  changed timestamptz,
  title text not null default '',
  summary text not null default '',
  -- Lower-cased title and short description, the text the substring search
  -- matches against (textSearch.js searches the same two fields).
  search_text text not null default '',
  -- Null where the record has no level, which is how the filters exclude them.
  readiness_level smallint,
  adoption_level smallint,
  readiness_term text,
  adoption_term text,
  use_cases text[] not null default '{}',
  types text[] not null default '{}',
  countries text[] not null default '{}',
  regions text[] not null default '{}',
  -- Term names ("Goal 2: Zero hunger"), not numbers, so "Goal 1:" cannot
  -- match "Goal 10:".
  sdgs text[] not null default '{}',
  users text[] not null default '{}',
  source_title text,
  grassroots boolean not null default false,
  -- Derived by shared/deriveCostComplexity.js during import, so filtering,
  -- paging and counts agree with the badges.
  cost_level text check (cost_level in ('low', 'med', 'high')),
  complexity_level text check (complexity_level in ('simple', 'moderate', 'advanced')),
  payload jsonb not null,
  index_row jsonb not null,
  primary key (run_id, uuid)
);

-- The nine vocabularies, in the order the portal returned them.
create table catalog.taxonomies (
  run_id bigint not null references catalog.import_runs (id) on delete cascade,
  vocabulary text not null,
  term_id text not null,
  name text not null,
  position integer not null,
  primary key (run_id, vocabulary, term_id)
);

-- Data sources the catalogue cites, for the index's `sources` list.
create table catalog.sources (
  run_id bigint not null references catalog.import_runs (id) on delete cascade,
  source_id text not null,
  title text not null,
  primary key (run_id, source_id)
);

-- Only what the planned reads use: the two list orders, the array filters, and
-- the substring search.
create index innovations_recent on catalog.innovations (run_id, changed desc, uuid);
create index innovations_advanced on catalog.innovations (run_id, readiness_level desc nulls last, uuid);
create index innovations_use_cases on catalog.innovations using gin (use_cases);
create index innovations_types on catalog.innovations using gin (types);
create index innovations_countries on catalog.innovations using gin (countries);
create index innovations_regions on catalog.innovations using gin (regions);
create index innovations_sdgs on catalog.innovations using gin (sdgs);
create index innovations_users on catalog.innovations using gin (users);
create index innovations_search on catalog.innovations using gin (search_text extensions.gin_trgm_ops);

-- The run every read answers from. Null until the first publish.
create function catalog.active_run()
returns bigint
language sql
stable
set search_path = catalog, pg_temp
as $$
  select active_run from catalog.catalog_state where id
$$;

-- Make a validated run the live one.
--
-- One transaction: the pointer moves, the new run is marked published, the run
-- it replaces is kept as the rollback target, and anything older is deleted.
-- Raises without changing anything when the run is not validated.
create function catalog.publish_run(p_run bigint)
returns void
language plpgsql
set search_path = catalog, pg_temp
as $$
declare
  v_status text;
  v_current bigint;
begin
  select status into v_status from catalog.import_runs where id = p_run for update;
  if v_status is distinct from 'validated' then
    raise exception 'run % is %, not validated', p_run, coalesce(v_status, 'missing');
  end if;

  select active_run into v_current from catalog.catalog_state where id for update;

  update catalog.import_runs set status = 'superseded' where id = v_current;
  update catalog.import_runs set status = 'published', finished_at = now() where id = p_run;
  update catalog.catalog_state
     set active_run = p_run, previous_run = v_current, updated_at = now()
   where id;

  -- Keep the live run and the one before it; drop the rows of every other run.
  -- The import_runs rows stay as history.
  delete from catalog.innovations where run_id not in (p_run, coalesce(v_current, p_run));
  delete from catalog.taxonomies where run_id not in (p_run, coalesce(v_current, p_run));
  delete from catalog.sources where run_id not in (p_run, coalesce(v_current, p_run));
end
$$;

revoke all on all tables in schema catalog from public, anon, authenticated;
revoke all on all functions in schema catalog from public, anon, authenticated;
alter default privileges in schema catalog revoke all on tables from public, anon, authenticated;
alter default privileges in schema catalog revoke all on functions from public, anon, authenticated;
