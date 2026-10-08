/**
 * Does browse_innovations select what the current web path selects?
 *
 *   npx tsx importer/checks/browseParity.js
 *
 * For each filter bag, against the live active snapshot:
 *
 *   oracle   buildFilterSpec → localFilter.matchIndex over the snapshot's own
 *            catalogue index rows → paginate.js's cost/complexity filter,
 *            which is exactly what the web app does with the index today
 *   rpc      browse_innovations, called with the publishable key, as the
 *            browser will call it
 *
 * and compares the counts, the ordered ids page by page (every page up to
 * FULL_LIMIT results, a sample beyond), so page boundaries and tie-breaks are
 * exercised, and the cost the payloads carry.
 * Reads the snapshot with SUPABASE_DB_URL and calls the RPC with
 * EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY, all from .env.local.
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { browseFiltersFor } from '../../src/api/supabase/browseFilters';
import { buildFilterSpec } from '../../src/api/jsonapi/filterSpec';
import { matchIndex } from '../../src/api/jsonapi/localFilter';
import { filterByCostAndComplexity } from '../../src/database/paginate';
import { CHALLENGES, TYPES, USER_GROUPS } from '../../src/data/constants';
import { INNOVATION_HUB_REGIONS } from '../../src/data/innovationHubRegions';

dotenv.config({ path: '.env.local', quiet: true });

const PAGE = 37; // deliberately not a round number, so boundaries land mid-tie

async function rpc(body) {
  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/rpc/browse_innovations`, {
    method: 'POST',
    headers: {
      apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${json.message}`);
  return json;
}

/** Results this size or smaller are compared in full; larger ones by sample. */
const FULL_LIMIT = 600;

/**
 * The RPC's ids for `filters`, by page, keyed by offset. Every page when the
 * result is small; otherwise the first three and the last, which still crosses
 * page boundaries and the far end of the order.
 */
async function rpcPages(filters, total) {
  const offsets = [];
  if (total <= FULL_LIMIT) {
    for (let off = 0; off < total; off += PAGE) offsets.push(off);
  } else {
    offsets.push(0, PAGE, PAGE * 2, Math.floor((total - 1) / PAGE) * PAGE);
  }
  const pages = new Map();
  const costs = new Map();
  for (const off of offsets) {
    const { results } = await rpc({ filters, lim: PAGE, off, sort: 'recent' });
    pages.set(off, results.map((r) => r.id));
    for (const r of results) costs.set(r.id, r.cost);
  }
  return { pages, costs };
}

async function main() {
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const { rows: [{ run }] } = await db.query('select catalog.active_run() as run');
  const { rows: terms } = await db.query(
    'select vocabulary, term_id, name from catalog.taxonomies where run_id = $1 order by vocabulary, position',
    [run]
  );
  const { rows: stored } = await db.query(
    'select index_row, cost_level, complexity_level from catalog.innovations where run_id = $1',
    [run]
  );
  await db.end();

  const byType = {};
  for (const t of terms) (byType[t.vocabulary] ??= []).push([t.term_id, t.name]);
  const rows = stored.map((s) => ({ ...s.index_row, cost: s.cost_level, complexity: s.complexity_level }));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const country = (n) => byType['taxonomy_term--countries'][n][1];
  const source = rows.find((r) => r.sourceTitle)?.sourceTitle ?? 'FAO';

  const bags = [
    ['empty', {}],
    ...CHALLENGES.map((c) => [`challenge ${c.id}`, { challenges: [c.id] }]),
    ...TYPES.map((t) => [`type ${t.id}`, { types: [t.id] }]),
    ['challenge sub-term', { challengeKeywords: [CHALLENGES[0].subTerms[0].keyword] }],
    ['type sub-term', { typeKeywords: [TYPES[0].subTerms[0].keyword] }],
    ['two countries', { countries: [country(10), country(40)] }],
    ...INNOVATION_HUB_REGIONS.map((h) => [`hub ${h.id}`, { hubRegions: [h.id] }]),
    ['hub + country', { hubRegions: [INNOVATION_HUB_REGIONS[0].id], countries: [country(5)] }],
    ['region', { regions: [byType['taxonomy_term--geographic_regions'][0][1]] }],
    ...Array.from({ length: 17 }, (_, i) => [`sdg ${i + 1}`, { sdgs: [i + 1] }]),
    ['sdg 1 + 10', { sdgs: [1, 10] }],
    ['source substring, lower case', { sources: [source.slice(0, 6).toLowerCase()] }],
    ...USER_GROUPS.map((u) => [`users ${u.value}`, { userGroups: [u.value] }]),
    ...[2, 5, 7, 9].map((n) => [`readiness ≥ ${n}`, { readinessMin: n }]),
    ...[2, 5, 9].map((n) => [`adoption ≥ ${n}`, { adoptionMin: n }]),
    ['grassroots', { grassrootsOnly: true }],
    ['cost low', { cost: ['low'] }],
    ['cost low+high', { cost: ['low', 'high'] }],
    ['complexity advanced', { complexity: ['advanced'] }],
    ['crops + East Africa + readiness ≥ 5', { challenges: ['crops'], hubRegions: ['east-africa'], readinessMin: 5 }],
    ['nature + sdg 2 + low cost', { types: ['nature'], sdgs: [2], cost: ['low'] }],
    ['farmers + grassroots + simple', { userGroups: ['farmers'], grassrootsOnly: true, complexity: ['simple'] }],
    ['no such keyword', { challengeKeywords: ['zzzz no such term'] }],
  ];

  let failures = 0;
  for (const [name, filters] of bags) {
    const spec = buildFilterSpec(filters, { byType });
    const matched = matchIndex(spec, rows).map((id) => byId.get(id));
    const expected = filterByCostAndComplexity(matched, filters)
      // The RPC's documented order: most recently changed, ties by uuid.
      .sort((a, b) => b.changed - a.changed || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((r) => r.id);

    const browse = browseFiltersFor(filters, byType);
    const { count, exact, snapshotVersion } = await rpc({ filters: browse, lim: 0 });
    const { pages, costs } = await rpcPages(browse, count);

    const problems = [];
    if (snapshotVersion !== String(run)) problems.push(`snapshot ${snapshotVersion} ≠ ${run}`);
    if (!exact) problems.push('count not exact');
    if (count !== expected.length) problems.push(`count ${count} ≠ ${expected.length}`);
    const ids = [...pages.values()].flat();
    if (ids.length !== new Set(ids).size) problems.push('duplicate ids across pages');
    for (const [off, got] of pages) {
      const want = expected.slice(off, off + PAGE);
      const at = want.findIndex((id, i) => got[i] !== id);
      if (at !== -1 || got.length !== want.length) {
        problems.push(`page at ${off} differs at position ${off + (at === -1 ? want.length : at)}`);
        break;
      }
    }
    const costMismatch = ids.filter((id) => costs.get(id) !== byId.get(id)?.cost).length;
    if (costMismatch) problems.push(`${costMismatch} payload costs differ from the stored column`);

    if (problems.length) failures += 1;
    console.log(`${problems.length ? '✗' : '✓'} ${name.padEnd(42)} ${String(count).padStart(5)}  ${problems.join('; ')}`);
  }

  console.log(`\n${bags.length - failures}/${bags.length} filter bags match (snapshot ${run}, ${rows.length} records)`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
