/**
 * Do the task 3 read RPCs return what their callers expect?
 *
 *   npx tsx importer/checks/rpcContracts.js
 *
 * Every RPC is called with the publishable key, as the browser will, and
 * compared with the snapshot read directly (SUPABASE_DB_URL):
 *
 *   get_innovations    payloads for the ids asked, and only those
 *   get_changed        the portal's own `changed` strings
 *   get_taxonomies     every vocabulary, in order, in the cache shape
 *   get_catalog_index  paged to the end: unique ids, count = total, rows equal
 *                      to the stored index rows, a mid-walk publish refused
 *   search_candidates  against the real textSearch.findCandidates, run over
 *                      a stand-in portal that answers its JSON:API requests
 *                      from the same snapshot (in the RPC's documented order)
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { findCandidates } from '../../src/api/jsonapi/textSearch';
import { resetCountCache } from '../../src/api/jsonapi/count';

dotenv.config({ path: '.env.local', quiet: true });

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
};

async function rpc(fn, body) {
  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, bytes: text.length, json: JSON.parse(text) };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A stand-in for the portal's /node/innovation, enough for textSearch.js:
 * CONTAINS conditions on title and the short description, OR/AND groups,
 * paging and meta.count. Records come back most recently changed first, ties
 * by uuid — the order search_candidates documents in place of the portal's.
 */
function portalOver(records) {
  return async (url) => {
    const params = new URL(url).searchParams;
    const conditions = {};
    const groups = {};
    for (const [key, value] of params) {
      const m = key.match(/^filter\[([^\]]+)\]\[(condition|group)\]\[([^\]]+)\]/);
      if (!m) continue;
      const [, name, kind, prop] = m;
      const target = kind === 'group' ? groups : conditions;
      (target[name] ??= {})[prop] = value;
    }

    const field = (record, path) =>
      (path === 'title' ? record.title : record.summary).toLowerCase();
    const evalGroup = (record, group) => {
      const results = [
        ...Object.values(conditions)
          .filter((c) => (c.memberOf ?? null) === group)
          .map((c) => field(record, c.path).includes(String(c.value).toLowerCase())),
        ...Object.entries(groups)
          .filter(([, g]) => (g.memberOf ?? null) === group)
          .map(([name]) => evalGroup(record, name)),
      ];
      const conjunction = group ? groups[group].conjunction : 'AND';
      return conjunction === 'OR' ? results.some(Boolean) : results.every(Boolean);
    };

    const matched = records.filter((r) => evalGroup(r, null));
    const limit = Number(params.get('page[limit]') ?? 50);
    const offset = Number(params.get('page[offset]') ?? 0);
    const data = matched.slice(offset, offset + limit).map((r) => ({
      id: r.id,
      attributes: { title: r.title, field_shorter_description: { processed: r.summary } },
    }));
    return { ok: true, status: 200, json: async () => ({ data, meta: { count: matched.length } }) };
  };
}

async function main() {
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const { rows: [{ run }] } = await db.query('select catalog.active_run() as run');
  const { rows: stored } = await db.query(
    `select uuid::text as id, title, summary, payload, index_row
       from catalog.innovations where run_id = $1
      order by changed desc nulls last, uuid`,
    [run]
  );
  const { rows: terms } = await db.query(
    'select vocabulary, term_id, name from catalog.taxonomies where run_id = $1 order by vocabulary, position',
    [run]
  );
  const { rows: sourceRows } = await db.query('select distinct title from catalog.sources where run_id = $1', [run]);
  await db.end();
  const byId = new Map(stored.map((r) => [r.id, r]));

  // get_innovations
  const sample = [stored[0].id, stored[100].id, stored[5000].id, '00000000-0000-0000-0000-000000000000'];
  const details = await rpc('get_innovations', { ids: sample });
  check(
    'get_innovations returns the stored payloads for known ids, nothing for unknown',
    details.ok && details.json.length === 3 && details.json.every((p) => same(p, byId.get(p.id)?.payload))
  );

  // get_changed
  const changed = await rpc('get_changed', { ids: sample });
  check(
    'get_changed returns the portal’s own changed strings',
    changed.ok && changed.json.length === 3 &&
      changed.json.every((c) => c.changed === byId.get(c.id).payload.changed && typeof c.changed === 'string'),
    changed.ok ? `e.g. ${changed.json[0]?.changed}` : ''
  );

  // get_taxonomies
  const expectedByType = {};
  for (const t of terms) (expectedByType[t.vocabulary] ??= []).push([t.term_id, t.name]);
  const tax = await rpc('get_taxonomies', {});
  check(
    'get_taxonomies returns all nine vocabularies, in order, in the cache shape',
    tax.ok && Object.keys(tax.json.byType).length === 9 && same(
      Object.fromEntries(Object.entries(tax.json.byType).sort()),
      Object.fromEntries(Object.entries(expectedByType).sort())
    ) && tax.json.snapshotVersion === String(run),
    tax.ok ? `${terms.length} terms, ${(tax.bytes / 1024).toFixed(0)} KB` : ''
  );

  // get_catalog_index
  const startedAt = Date.now();
  const walked = [];
  let after = null;
  let snapshot = null;
  let total = null;
  let pages = 0;
  let biggest = 0;
  let sources = null;
  do {
    const page = await rpc('get_catalog_index', { after, lim: 1000, snapshot });
    if (!page.ok) throw new Error(`get_catalog_index ${page.status} ${page.json.message}`);
    pages += 1;
    biggest = Math.max(biggest, page.bytes);
    walked.push(...page.json.rows);
    ({ snapshotVersion: snapshot, total, sources } = page.json);
    after = page.json.next;
  } while (after);
  const ids = walked.map((r) => r.id);
  check(
    'get_catalog_index pages to a unique set the size of the snapshot',
    new Set(ids).size === ids.length && ids.length === total && total === stored.length,
    `${total} rows in ${pages} pages, ${((Date.now() - startedAt) / 1000).toFixed(1)}s, largest page ${(biggest / 1024).toFixed(0)} KB`
  );
  check(
    'get_catalog_index rows are the stored catalogIndex:v2 rows',
    walked.every((r) => same(r, byId.get(r.id).index_row))
  );
  check(
    'get_catalog_index lists every cited data source',
    same([...sources].sort(), sourceRows.map((s) => s.title).sort()),
    `${sources.length} sources`
  );
  const stale = await rpc('get_catalog_index', { after: null, lim: 10, snapshot: 'not-the-active-run' });
  check('get_catalog_index refuses to continue a walk across a publish', !stale.ok && stale.json.code === 'P0002');

  // search_candidates against the real findCandidates
  const portal = portalOver(stored.map((r) => ({ id: r.id, title: r.title, summary: r.summary })));
  const queries = [
    [['solar', 'irrigation', 'pump'], []],
    [['water', 'storage'], []],
    [['water'], []],
    [['rabbit'], ['rabbit', 'care', 'pet', 'tips', 'health', 'small', 'animal']],
    [['bunny'], ['rabbit', 'care', 'pet', 'tips', 'health', 'small', 'animal']],
    [['drought', 'resistant', 'maize'], ['seed', 'variety', 'tolerance']],
    [['tomato'], ['tomatoes', 'vegetable', 'horticulture', 'greenhouse']],
    [['to', 'of'], []],
    [['zzqqxx'], []],
  ];
  for (const [words, expandedTerms] of queries) {
    resetCountCache?.();
    const expected = await findCandidates(words, { expandedTerms, fetchImpl: portal, attempts: 1 });
    const got = await rpc('search_candidates', { terms: words, expanded: expandedTerms });
    const name = `search_candidates "${words.join(' ')}"${expandedTerms.length ? ` +${expandedTerms.length} suggested` : ''}`;
    if (!got.ok) {
      check(name, false, `${got.status} ${got.json.message}`);
      continue;
    }
    // Ids and titles against findCandidates. Not summaries: the stand-in
    // portal can only serve the stored plain text, which findCandidates runs
    // through htmlToText a second time. The stored summary is already
    // htmlToText of the portal's HTML — what findCandidates computes from the
    // real portal — so the RPC is checked against that instead.
    const key = (c) => ({ id: c.id, title: c.title });
    const ok =
      same(got.json.candidates.map(key), expected.candidates.map(key)) &&
      got.json.candidates.every((c) => c.summary === byId.get(c.id).summary) &&
      got.json.strictCount === (expected.strictCount ?? 0) &&
      got.json.conjunction === expected.conjunction;
    const firstDiff = expected.candidates.findIndex((c, i) => !same(key(c), key(got.json.candidates[i] ?? {})));
    check(
      name,
      ok,
      `${got.json.candidates.length} candidates, ${got.json.strictCount} strict, kept [${got.json.expandedKept}]` +
        (ok ? '' : ` — expected ${expected.candidates.length}/${expected.strictCount}/${expected.conjunction}, first difference at ${firstDiff}`)
    );
  }

  console.log(`\n${failures === 0 ? 'all checks pass' : `${failures} checks failed`} (snapshot ${run})`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
