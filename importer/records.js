/**
 * One page from the portal, turned into rows for catalog.innovations.
 *
 * Nothing here maps a record itself. The payload is mapInnovations() — the
 * same function the web app runs on every page it fetches — and the index row
 * is catalogIndex.js's toRows(), so what the app reads out of Supabase is what
 * it would have built from the portal, by construction. Cost and complexity
 * come with the payload, from shared/deriveCostComplexity.js.
 *
 * The typed columns repeat fields the RPCs filter, sort and search on. They are
 * copied out of those two shapes, never computed separately.
 */
import { mapInnovations, buildTermIndex } from '../src/api/jsonapi/mapInnovation';
import { toRows } from '../src/api/jsonapi/catalogIndex';

/**
 * @param {object} document - a JSON:API page fetched with DETAIL_FIELDS/DETAIL_INCLUDE
 * @param {Map<string, string>} index - the taxonomy index from loadTaxonomies
 * @returns {Array<object>} one row per record, in the page's order
 */
export function buildRecords(document, index) {
  const payloads = mapInnovations(document, index);
  const rows = toRows(document, index);
  // The crawl names data sources with a second request; this page already
  // carries them in `included`, under the same ids.
  const included = buildTermIndex(document?.included);

  return payloads.map((payload, i) => {
    const row = rows[i];
    row.sourceTitle = row.sourceId ? included.get(`node--digital_asset:${row.sourceId}`) ?? null : null;

    return {
      uuid: payload.id,
      changed: payload.changed,
      title: payload.title,
      summary: payload.shortDescription,
      // textSearch.js matches words in the title or the short description.
      searchText: `${payload.title} ${payload.shortDescription}`.toLowerCase(),
      readinessLevel: payload.readinessLevel,
      adoptionLevel: payload.adoptionLevel,
      readinessTerm: row.readinessTerm,
      adoptionTerm: row.adoptionTerm,
      useCases: row.useCases,
      types: row.types,
      countries: row.countries,
      regions: row.regions,
      sdgs: row.sdgs,
      users: row.users,
      sourceTitle: row.sourceTitle,
      grassroots: row.grassroots,
      costLevel: payload.cost,
      complexityLevel: payload.complexity,
      payload,
      indexRow: row,
    };
  });
}

/** The data sources a set of records cites, as [id, title] pairs. */
export function sourcesOf(records) {
  const byId = new Map();
  for (const { indexRow } of records) {
    if (indexRow.sourceId && indexRow.sourceTitle) byId.set(indexRow.sourceId, indexRow.sourceTitle);
  }
  return [...byId.entries()];
}
