/**
 * The weekly catalogue import: FAO JSON:API → Supabase, run by hand.
 *
 *   npm run import:supabase
 *   npm run import:supabase -- --fail-before-publish   # rehearse a failed run
 *
 * Reads SUPABASE_DB_URL from .env.local (git-ignored) or the environment.
 *
 * A run is written under its own id beside the live one, checked, and only
 * then published — catalog.publish_run moves the active pointer in one
 * transaction. Anything that goes wrong before that marks the run failed and
 * leaves the live catalogue exactly as it was.
 *
 * Requests go through the app's own client.js, so the import observes the same
 * limits the browser does: two requests in flight, backoff on 5xx and 429, a
 * pause after repeated overloads. It is one polite reader of the portal, once
 * a week, in place of every visitor reading it.
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { fetchJsonApi, MAX_IN_FLIGHT } from '../src/api/jsonapi/client';
import { loadTaxonomies } from '../src/api/jsonapi/taxonomies';
import { buildFilterSpec } from '../src/api/jsonapi/filterSpec';
import { MAX_PAGE_SIZE } from '../src/api/jsonapi/query';
import { DETAIL_FIELDS, DETAIL_INCLUDE } from '../src/database/db.web';
import { buildRecords, sourcesOf } from './records';
import { validateRun } from './validate';

dotenv.config({ path: '.env.local', override: false, quiet: true });

const INNOVATIONS = '/node/innovation';

/** A full page with bodies and includes is slow on a cold portal. */
const PAGE_TIMEOUT_MS = 120000;

/** Timeouts are not retried by the client; a page gets this many tries here. */
const PAGE_TRIES = 3;
const PAGE_RETRY_PAUSE_MS = 30000;

/** A ceiling, so a portal that never returns a short page cannot loop forever. */
const MAX_PAGES = 400;

/**
 * Rehearse a failed run: write a couple of pages under a new run id, then fail
 * before publishing. Stops early rather than crawling everything, so a test
 * of the failure path does not cost the portal a full pass.
 */
const failBeforePublish = process.argv.includes('--fail-before-publish');
const REHEARSAL_PAGES = 2;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const elapsed = (since) => `${((Date.now() - since) / 1000).toFixed(0)}s`;

/** One page of full records, retried on timeout after a pause. */
async function fetchPage(spec, page) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetchJsonApi(INNOVATIONS, {
        query: {
          ...spec,
          fields: DETAIL_FIELDS,
          include: DETAIL_INCLUDE,
          // A stable order, so offset paging cannot skip or repeat a record
          // while the walk is under way.
          sort: 'drupal_internal__nid',
          page: { limit: MAX_PAGE_SIZE, offset: page * MAX_PAGE_SIZE },
        },
        timeoutMs: PAGE_TIMEOUT_MS,
      });
    } catch (err) {
      if (attempt >= PAGE_TRIES) throw err;
      console.warn(`page ${page} failed (${err.cause?.reason ?? err.status ?? err.message}); retrying in ${PAGE_RETRY_PAUSE_MS / 1000}s`);
      await wait(PAGE_RETRY_PAUSE_MS);
    }
  }
}

/**
 * Walk the collection with as many workers as the client lets through, handing
 * each page to `onPage` as it lands.
 */
async function crawl(spec, onPage) {
  let nextPage = 0;
  let finished = false;

  const worker = async () => {
    while (!finished) {
      const page = nextPage;
      nextPage += 1;
      if (page >= MAX_PAGES) throw new Error(`no short page after ${MAX_PAGES} pages`);
      const document = await fetchPage(spec, page);
      const count = document?.data?.length ?? 0;
      await onPage(document, page);
      if (count < MAX_PAGE_SIZE) finished = true;
    }
  };

  await Promise.all(Array.from({ length: MAX_IN_FLIGHT }, worker));
}

const INNOVATION_COLUMNS = [
  'run_id', 'uuid', 'changed', 'title', 'summary', 'search_text',
  'readiness_level', 'adoption_level', 'readiness_term', 'adoption_term',
  'use_cases', 'types', 'countries', 'regions', 'sdgs', 'users',
  'source_title', 'grassroots', 'cost_level', 'complexity_level',
  'payload', 'index_row',
];

/** A multi-row INSERT with numbered placeholders. */
function insertSql(table, columns, rowCount) {
  const values = [];
  for (let r = 0; r < rowCount; r += 1) {
    const base = r * columns.length;
    values.push(`(${columns.map((_, c) => `$${base + c + 1}`).join(', ')})`);
  }
  return `insert into ${table} (${columns.join(', ')}) values ${values.join(', ')}`;
}

async function insertRecords(db, runId, records) {
  if (records.length === 0) return;
  const params = records.flatMap((r) => [
    runId, r.uuid, r.changed, r.title, r.summary, r.searchText,
    r.readinessLevel, r.adoptionLevel, r.readinessTerm, r.adoptionTerm,
    r.useCases, r.types, r.countries, r.regions, r.sdgs, r.users,
    r.sourceTitle, r.grassroots, r.costLevel, r.complexityLevel,
    JSON.stringify(r.payload), JSON.stringify(r.indexRow),
  ]);
  await db.query(insertSql('catalog.innovations', INNOVATION_COLUMNS, records.length), params);
}

async function insertTaxonomies(db, runId, byType) {
  const rows = Object.entries(byType).flatMap(([vocabulary, terms]) =>
    terms.map(([termId, name], position) => [runId, vocabulary, termId, name, position])
  );
  const columns = ['run_id', 'vocabulary', 'term_id', 'name', 'position'];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await db.query(insertSql('catalog.taxonomies', columns, chunk.length), chunk.flat());
  }
}

async function insertSources(db, runId, sources) {
  if (sources.length === 0) return;
  const columns = ['run_id', 'source_id', 'title'];
  await db.query(
    insertSql('catalog.sources', columns, sources.length),
    sources.flatMap(([id, title]) => [runId, id, title])
  );
}

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error('SUPABASE_DB_URL is not set (see .env.local)');

  const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const startedAt = Date.now();
  const { rows: [run] } = await db.query('insert into catalog.import_runs default values returning id');
  const runId = run.id;
  console.log(`run ${runId}: started`);

  try {
    const { index, byType } = await loadTaxonomies({ force: true });
    const vocabularyCounts = Object.fromEntries(Object.entries(byType).map(([t, terms]) => [t, terms.length]));
    await insertTaxonomies(db, runId, byType);
    console.log(`run ${runId}: ${Object.keys(byType).length} vocabularies, ${Object.values(vocabularyCounts).reduce((a, b) => a + b, 0)} terms`);

    const spec = buildFilterSpec({}, { byType });
    const uuids = [];
    const derived = [];
    const sources = new Map();
    let pages = 0;

    await crawl(spec, async (document) => {
      const records = buildRecords(document, index);
      await insertRecords(db, runId, records);
      for (const r of records) {
        uuids.push(r.uuid);
        derived.push({ uuid: r.uuid, costLevel: r.costLevel, complexityLevel: r.complexityLevel });
      }
      for (const [id, title] of sourcesOf(records)) sources.set(id, title);
      pages += 1;
      if (failBeforePublish && pages >= REHEARSAL_PAGES) {
        throw new Error(`--fail-before-publish: stopping after ${pages} pages, before publish, as asked`);
      }
      if (pages % 10 === 0) console.log(`run ${runId}: ${pages} pages, ${uuids.length} records, ${elapsed(startedAt)}`);
    });

    await insertSources(db, runId, [...sources.entries()]);

    const { rows: [previous] } = await db.query(
      `select r.row_count from catalog.catalog_state s
         join catalog.import_runs r on r.id = s.active_run where s.id`
    );
    const problems = validateRun({ uuids, vocabularyCounts, derived }, previous?.row_count ?? null);
    if (problems.length > 0) throw new Error(`validation failed: ${problems.join('; ')}`);

    await db.query(
      `update catalog.import_runs set status = 'validated', row_count = $2, vocabulary_counts = $3 where id = $1`,
      [runId, uuids.length, JSON.stringify(vocabularyCounts)]
    );
    await db.query('select catalog.publish_run($1)', [runId]);

    console.log(
      `run ${runId}: published ${uuids.length} records, ${sources.size} data sources, ` +
        `${pages} pages in ${elapsed(startedAt)}`
    );
  } catch (err) {
    await db
      .query(
        `update catalog.import_runs set status = 'failed', finished_at = now(), error = $2 where id = $1`,
        [runId, String(err?.stack ?? err).slice(0, 4000)]
      )
      .catch(() => {});
    const { rows: [state] } = await db.query('select active_run from catalog.catalog_state where id');
    console.error(`run ${runId}: FAILED — ${err.message}`);
    console.error(`live catalogue unchanged (active run: ${state?.active_run ?? 'none'})`);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
