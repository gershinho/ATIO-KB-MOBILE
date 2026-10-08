/**
 * Whether a finished import is fit to publish.
 *
 * Every check guards against a portal answer that looks like success but is
 * not: an empty page read as the end of the collection, a vocabulary that
 * failed quietly, a record count that halved overnight. Publishing any of those
 * would replace a good catalogue with a broken one for every visitor, so the
 * run is refused and the previous snapshot stays live.
 */
import { VOCABULARIES } from '../src/api/jsonapi/taxonomies';

/** How far the record count may move from the last published run. */
export const COUNT_TOLERANCE = 0.1;

/**
 * Records captured in __tests__/fixtures/jsonapi/innovations.json. If they
 * vanish from a run, either FAO unpublished them — worth a human look — or the
 * crawl missed pages.
 */
export const KNOWN_RECORDS = [
  'be8819ba-bb9a-4773-a031-d939894c6920', // Silvi Pasture
  '99dcb012-fae3-48b5-84d8-db6ce3cba446', // Silvo-pastoralism: Orchard with integrated grazing…
];

/**
 * @param {object} run
 * @param {string[]} run.uuids - every record id written, duplicates included
 * @param {Object<string, number>} run.vocabularyCounts - terms per vocabulary type
 * @param {Array<{uuid, costLevel, complexityLevel}>} run.derived
 * @param {number|null} previousCount - row count of the last published run
 * @param {string[]} [known]
 * @returns {string[]} problems; empty when the run may be published
 */
export function validateRun({ uuids, vocabularyCounts, derived }, previousCount, known = KNOWN_RECORDS) {
  const problems = [];

  if (uuids.length === 0) problems.push('no records were imported');

  const unique = new Set(uuids);
  if (unique.size !== uuids.length) {
    problems.push(`${uuids.length - unique.size} duplicate record ids`);
  }

  for (const { type } of VOCABULARIES) {
    if (!(vocabularyCounts?.[type] > 0)) problems.push(`vocabulary ${type} is empty`);
  }

  if (previousCount > 0) {
    const change = Math.abs(unique.size - previousCount) / previousCount;
    if (change > COUNT_TOLERANCE) {
      problems.push(
        `record count moved ${(change * 100).toFixed(1)}% (${previousCount} → ${unique.size}), ` +
          `more than the ${COUNT_TOLERANCE * 100}% allowed`
      );
    }
  }

  const underived = derived.filter((r) => !r.costLevel || !r.complexityLevel).length;
  if (underived > 0) problems.push(`${underived} records have no derived cost or complexity`);

  const missing = known.filter((id) => !unique.has(id));
  if (missing.length > 0) problems.push(`known records missing: ${missing.join(', ')}`);

  return problems;
}
