/**
 * Web twin of db.js: the same functions, answered by the FAO JSON:API.
 *
 * Every screen imports from '../database/db' and Metro hands the web build this
 * file instead, so nothing above this layer knows which platform it is on. The
 * exports therefore have to match db.js name for name, including the ones not
 * yet implemented — an absent export is `undefined` at the call site, which
 * fails as a TypeError somewhere far away from here.
 *
 * Three things are genuinely different, and each is commented where it happens:
 * ids are uuids, ordering has to work around a sort the portal cannot do, and
 * counting has no endpoint until FAO add `meta.count`.
 */
import { fetchJsonApi } from '../api/jsonapi/client';
import { buildFilterSpec, PATHS } from '../api/jsonapi/filterSpec';
import { countMatching } from '../api/jsonapi/count';
import { mapInnovations } from '../api/jsonapi/mapInnovation';
import { loadTaxonomies, termNames } from '../api/jsonapi/taxonomies';
import { loadCatalogIndex } from '../api/jsonapi/catalogIndex';
import { challengesFor, typesFor, regionsFor } from './heatmapGrids';
import { CHALLENGES, TYPES } from '../data/constants';
import { INNOVATION_HUB_REGIONS } from '../data/innovationHubRegions';
import {
  hasDerivedFilters,
  filterByCostAndComplexity,
  collectFilteredPage,
  countFiltered,
} from './paginate';
import { createLogger } from '../utils/logger';

const log = createLogger('ATIO DB web');

const INNOVATIONS = '/node/innovation';

/**
 * What a list needs to render a card and derive cost and complexity.
 *
 * `body` is here despite being the largest field: deriveCost and
 * deriveComplexity read the long description, and a page that left it out
 * would hand the same innovation a different cost on web than on the phone.
 * The catalogue crawl in step 5 has no such constraint and omits it.
 */
const LIST_FIELDS = {
  'node--innovation': [
    'title',
    // Cheap, and the only way the offline refresh can tell a record has moved
    // without downloading it again.
    'changed',
    'field_shorter_description',
    'body',
    'field_if_grassroots',
    'field_readiness_level',
    'field_adoption_level',
    'field_countries_adoption',
    'field_innovation_type',
    'field_impact_sdgs',
    'field_use_cases',
    'field_prospective_users',
    'field_region',
    'field_data_source',
  ],
  'node--digital_asset': ['title'],
};

/** The detail drawer additionally shows who owns it and who partnered on it. */
const DETAIL_FIELDS = {
  'node--innovation': [...LIST_FIELDS['node--innovation'], 'field_owner', 'field_partners'],
  'node--digital_asset': ['title'],
  'node--organization': ['title'],
};

/**
 * Only data sources and organizations are asked for inline. Every other name a
 * record points at comes from the preloaded vocabularies, which is the entire
 * reason for preloading them — see taxonomies.js.
 */
const LIST_INCLUDE = ['field_data_source'];
const DETAIL_INCLUDE = ['field_data_source', 'field_owner', 'field_partners'];

/**
 * Most advanced first, for the one list that is about being advanced.
 *
 * The portal cannot sort on "the number at the front of the label", so this
 * sorts on the term id — ascending, not descending as the mapping card
 * suggests, because those ids run opposite to the levels they name: 88 is
 * "9. Ready" and 96 is "1. Idea/Hypothesis". Sorting by `-tid`, as the card
 * says, returns the least advanced records led by "NOT INDICATED", which is
 * the defect the bundled SQL had.
 *
 * __tests__/dbWeb.test.js pins that relationship against a captured copy of
 * the vocabulary, so the day FAO renumber it, a test says so rather than every
 * list silently inverting.
 */
const ADVANCED_FIRST = 'field_readiness_level.drupal_internal__tid';

/** Records that have a level at all. 1,123 of 6,287 published records do not. */
const HAS_LEVEL = { lvl: { path: PATHS.readiness, operator: 'IS NOT NULL' } };

/**
 * Most recently updated first, for every other list.
 *
 * Not the bundled build's order, which is most advanced first, and the
 * difference is deliberate. Reproducing that order here would need the
 * levelled records sorted ahead of the unlevelled ones, because the portal
 * sorts an empty relationship before every value and 1,123 published records
 * have no readiness level — so a plain sort leads every list with a sixth of
 * the catalogue in no order at all.
 *
 * Splitting the list in two is what the portal cannot do: measured against the
 * live site, `IS NOT NULL` combined with a filter on a related field times out
 * past 50 seconds, where the same query sorted by `changed` answers in about
 * 12. "Recently updated" is a real order, costs one query, and has no empty
 * values to trip over. The divergence is in docs/JSON-API.md.
 */
const RECENT_FIRST = '-changed';

async function fetchPage(spec, { limit, offset, sort, fields = LIST_FIELDS, include = LIST_INCLUDE }) {
  const document = await fetchJsonApi(INNOVATIONS, {
    query: { ...spec, fields, include, sort, page: { limit, offset } },
  });
  const { index } = await loadTaxonomies({});
  return mapInnovations(document, index);
}

/**
 * Page through innovations matching `filters`.
 *
 * Cost and complexity are derived in JavaScript from the description text, so
 * no query can express them. The bundled build scans rows and filters them in
 * memory; this does the same through the same helpers, so a page of results
 * means the same thing on both platforms.
 *
 * @param {object} [filters] - an InnovationFilters bag
 * @param {{limit?: number, offset?: number}} [options]
 */
export async function searchInnovations(filters = {}, options = {}) {
  const { limit = 50, offset = 0 } = options;
  const { byType } = await loadTaxonomies({});
  const spec = buildFilterSpec(filters, { byType });

  if (!hasDerivedFilters(filters)) {
    return fetchPage(spec, { limit, offset, sort: RECENT_FIRST });
  }

  return collectFilteredPage({
    fetchChunk: (chunkLimit, chunkOffset) =>
      fetchPage(spec, { limit: chunkLimit, offset: chunkOffset, sort: RECENT_FIRST }),
    keep: async (rows) => filterByCostAndComplexity(rows, filters),
    offset,
    limit,
    // Smaller than the bundled build's 250: there every chunk is a local query,
    // here each one is a request over the network.
    chunkSize: 50,
  });
}

/**
 * How many innovations match `filters`.
 *
 * Without a derived filter this is one count — one request once FAO enable
 * meta.count, about 23 until then. With one, it has to scan, and the scan is
 * capped: the bundled build can afford an unbounded one over a local table,
 * but here every chunk is a request, and a drilldown header is not worth
 * minutes of them. The cap is what makes `exact` meaningful.
 *
 * @param {object} [filters]
 * @returns {Promise<number>}
 */
export async function countInnovations(filters = {}) {
  const { byType } = await loadTaxonomies({});
  const spec = buildFilterSpec(filters, { byType });

  if (!hasDerivedFilters(filters)) {
    const { count, fromMeta, requests } = await countMatching(INNOVATIONS, spec);
    if (!fromMeta) log.note(`counted ${count} in ${requests} requests; meta.count is not live yet`);
    return count;
  }

  const { count } = await countFiltered({
    fetchChunk: (limit, offset) => fetchPage(spec, { limit, offset, sort: RECENT_FIRST }),
    keep: async (rows) => filterByCostAndComplexity(rows, filters),
    chunkSize: 50,
    maxScan: 500,
  });
  return count;
}

/**
 * The most field-tested innovations.
 *
 * Here the records with no level are genuinely excluded rather than moved to
 * the end: whatever "NOT INDICATED" means, it does not mean most advanced.
 */
export async function getMostAdvancedInnovations(limit = 10) {
  const { byType } = await loadTaxonomies({});
  const spec = buildFilterSpec({}, { byType });
  return fetchPage(
    { ...spec, filter: { ...spec.filter, ...HAS_LEVEL } },
    { limit, offset: 0, sort: ADVANCED_FIRST }
  );
}

/** One innovation, by uuid. What the detail drawer opens. */
export async function getInnovationById(id) {
  if (!id) return null;

  const document = await fetchJsonApi(`${INNOVATIONS}/${id}`, {
    query: { fields: DETAIL_FIELDS, include: DETAIL_INCLUDE },
  });
  const { index } = await loadTaxonomies({});
  return mapInnovations(document, index)[0] ?? null;
}

/**
 * Several innovations at once, by uuid.
 *
 * What the detail fetch above does for one record, in a single request, for the
 * page of search results being shown. Stage 2 of the web search asks the portal
 * only for titles and summaries, because that is all ranking needs; a result
 * card needs a readiness level, a region and the rest, and fetching those for
 * sixty candidates to display five would waste most of them.
 *
 * The portal returns them in its own order, not the order asked for — verified
 * against the live site — so the caller reorders. It is the caller that knows
 * the ranking anyway.
 *
 * Has no counterpart in db.js: the phone's search comes back from the backend
 * already enriched from the same SQLite file it reads for everything else.
 *
 * @param {string[]} ids - uuids
 */
export async function getInnovationsByIds(ids = []) {
  const wanted = ids.filter(Boolean);
  if (wanted.length === 0) return [];

  return fetchPage(
    { filter: { status: 1, ids: { path: 'id', operator: 'IN', value: wanted } } },
    { limit: wanted.length, offset: 0, fields: DETAIL_FIELDS, include: DETAIL_INCLUDE }
  );
}

/**
 * When the portal last changed each of these records.
 *
 * One small request for the whole batch — two fields per row against the ~5 KB
 * a full record costs — so the offline refresh can download only what actually
 * moved. The offline card asks for exactly this: "refresh all pinned records
 * with If-Modified-Since or by comparing the changed attribute". The second,
 * because it is one request for twenty records where conditional requests would
 * be twenty.
 *
 * @param {string[]} ids - uuids
 * @returns {Promise<Map<string, string>>} id → the portal's `changed` stamp
 */
export async function getChangedTimes(ids = []) {
  const wanted = ids.filter(Boolean);
  if (wanted.length === 0) return new Map();

  const document = await fetchJsonApi(INNOVATIONS, {
    query: {
      filter: { status: 1, ids: { path: 'id', operator: 'IN', value: wanted } },
      fields: { 'node--innovation': ['changed'] },
      page: { limit: wanted.length },
    },
  });

  return new Map(
    (document?.data ?? []).map((row) => [row.id, row.attributes?.changed ?? null])
  );
}

/**
 * Innovations that are hotlines, helplines or general help and support.
 *
 * The bundled build asks its full-text index. The portal has no ranked search,
 * so this is an OR of substring matches on the title — which is what the
 * mapping card specifies, and what the spike behind it verified.
 */
export async function getHelpInnovations(limit = 30) {
  const { byType } = await loadTaxonomies({});
  const base = buildFilterSpec({}, { byType });
  const keywords = ['hotline', 'helpline', 'help line', 'support'];

  const filter = { ...base.filter };
  const groups = { ...base.groups, help: { conjunction: 'OR' } };
  keywords.forEach((value, i) => {
    filter[`help${i}`] = { path: PATHS.title, operator: 'CONTAINS', value, memberOf: 'help' };
  });

  return fetchPage({ filter, groups }, { limit, offset: 0 });
}

/**
 * Headline counts for the Explore landing page.
 *
 * The mapping card marks this blocked on meta.count, and the innovation total
 * does cost about 23 requests until that lands — but it is one number, asked
 * once a session, and an Explore page that cannot say how many innovations
 * exist is worse than one that takes a moment to say it. Countries come from
 * the preloaded vocabulary for nothing, and the SDG count is 17 by definition.
 */
export async function getStats() {
  const { byType } = await loadTaxonomies({});
  const spec = buildFilterSpec({}, { byType });
  const { count } = await countMatching(INNOVATIONS, spec);

  return {
    innovations: count,
    countries: (byType['taxonomy_term--countries'] ?? []).length,
    sdgs: 17,
  };
}

/** Every country name, for the filter panel. */
export async function getAllCountries() {
  const { byType } = await loadTaxonomies({});
  return termNames(byType, 'taxonomy_term--countries').map((name) => ({ name }));
}

/**
 * The data sources offered by the filter panel.
 *
 * `field_data_source` points at node--digital_asset, which holds 544+ records
 * where innovations cite seven. Which seven is not a question the portal can be
 * asked, so it falls out of the catalogue pass, which collects the ids as it
 * goes and then names just those.
 */
export async function getDataSources() {
  const { sources } = await loadCatalogIndex();
  return sources.map((title) => ({ title }));
}

/**
 * Innovations per challenge, per type, and per innovation hub region.
 *
 * All three are counted from the same pass over the catalogue, because all
 * three ask the same unanswerable question in different words. A challenge is
 * not a field on a record — it is a dozen keywords matched against use case
 * terms — so no filter can count one, and counting them separately would be
 * 12 challenges plus 10 types plus 15 regions of roughly 20 requests each.
 *
 * The pass costs two to three minutes once, is kept for hours, and answers all
 * of them at once. It also feeds both heat maps.
 */
async function countBy(classify, ids) {
  const { rows } = await loadCatalogIndex();
  const counts = Object.fromEntries(ids.map((id) => [id, 0]));

  for (const row of rows) {
    for (const id of classify(row)) {
      // A record counts once per group it belongs to, and belongs to as many
      // as its terms put it in — the same reading the heat maps take.
      if (counts[id] != null) counts[id] += 1;
    }
  }
  return counts;
}

/** @returns {Promise<Object<string, number>>} keyed by challenge id */
export function getChallengeCounts() {
  return countBy((row) => challengesFor(row.useCases), CHALLENGES.map((c) => c.id));
}

/** @returns {Promise<Object<string, number>>} keyed by type id */
export function getTypeCounts() {
  return countBy((row) => typesFor(row.types), TYPES.map((t) => t.id));
}

/**
 * Innovation hub regions by count, largest first.
 *
 * Matches the bundled build's shape — {name, count}, sorted descending — and
 * its reading: a record in two countries of one region counts once for that
 * region, and once for each other region it also reaches.
 */
export async function getTopRegions(limit = 15) {
  const counts = await countBy(
    (row) => regionsFor(row.countries),
    INNOVATION_HUB_REGIONS.map((r) => r.name)
  );

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
