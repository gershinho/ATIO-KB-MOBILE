/**
 * Answering a filter spec from the catalogue index instead of the portal.
 *
 * The portal answers one related-field filter in seconds and several in
 * minutes, if at all: measured on 6 October, Digital & ICT took 13 s, adding a
 * readiness floor took 54 s, and adding East Africa as well ran past two
 * minutes without an answer — at which point the dev proxy has given up at 30
 * and the user is looking at a spinner. Every extra filter is another join on
 * the portal's side, and that is the shape of query the drilldown sends.
 *
 * The catalogue index already holds every published record with the fields
 * those filters read, so the browser can answer the question itself, in
 * milliseconds, and ask the portal only for the page of records it will show.
 *
 * It evaluates the very spec buildFilterSpec produces for the portal, rather
 * than reinterpreting the filter bag, so the two cannot drift apart: whatever a
 * filter means to the portal, it means here. A condition this file cannot
 * evaluate makes the whole spec unanswerable, and the caller asks the portal.
 */
import { PATHS } from './filterSpec';

/** Each filterable path, read off an index row as a list of values. */
const ROW_VALUES = {
  // The pass reads published records only, so every row satisfies status = 1.
  status: () => [1],
  [PATHS.useCase]: (row) => row.useCases,
  [PATHS.type]: (row) => row.types,
  [PATHS.country]: (row) => row.countries,
  [PATHS.region]: (row) => row.regions,
  [PATHS.sdg]: (row) => row.sdgs,
  [PATHS.user]: (row) => row.users,
  [PATHS.readiness]: (row) => (row.readinessTerm == null ? [] : [row.readinessTerm]),
  [PATHS.adoption]: (row) => (row.adoptionTerm == null ? [] : [row.adoptionTerm]),
  [PATHS.source]: (row) => (row.sourceTitle == null ? [] : [row.sourceTitle]),
  [PATHS.grassroots]: (row) => (typeof row.grassroots === 'boolean' ? [row.grassroots ? 1 : 0] : undefined),
};

/** A condition against one row, or undefined when it cannot be judged. */
function testCondition(condition, row) {
  const read = ROW_VALUES[condition.path];
  const values = read?.(row);
  if (!Array.isArray(values)) return undefined;

  switch (condition.operator ?? '=') {
    case 'IN': {
      const wanted = new Set(condition.value);
      return values.some((v) => wanted.has(v));
    }
    case 'CONTAINS': {
      // The portal's CONTAINS is a LIKE, which ignores case.
      const needle = String(condition.value).toLowerCase();
      return values.some((v) => String(v).toLowerCase().includes(needle));
    }
    case '=':
      return values.some((v) => String(v) === String(condition.value));
    default:
      return undefined;
  }
}

/**
 * Turn a spec into a predicate over index rows, or null if any part of it is
 * beyond what the index can answer.
 *
 * JSON:API groups: a condition or group with `memberOf` belongs to that group;
 * anything without one sits at the top level, where the conjunction is AND.
 */
export function compileSpec({ filter = {}, groups = {} } = {}) {
  const conditions = Object.values(filter);
  if (conditions.some((c) => !ROW_VALUES[c.path])) return null;

  const membersOf = (groupName) => ({
    conditions: conditions.filter((c) => (c.memberOf ?? null) === groupName),
    groups: Object.entries(groups)
      .filter(([, g]) => (g.memberOf ?? null) === groupName)
      .map(([name]) => name),
  });

  const evaluate = (row, groupName, conjunction) => {
    const { conditions: own, groups: children } = membersOf(groupName);
    const results = [
      ...own.map((c) => testCondition(c, row)),
      ...children.map((name) => evaluate(row, name, groups[name].conjunction ?? 'AND')),
    ];
    if (results.some((r) => r === undefined)) return undefined;
    return conjunction === 'OR' ? results.some(Boolean) : results.every(Boolean);
  };

  return (row) => evaluate(row, null, 'AND');
}

/**
 * The ids of the index rows matching `spec`, most recently changed first — the
 * same order the portal's `-changed` sort gives the drilldown.
 *
 * @param {object} spec - from buildFilterSpec
 * @param {Array<object>} rows - catalogue index rows
 * @returns {string[]|null} null when the index cannot answer this spec
 */
export function matchIndex(spec, rows) {
  const predicate = compileSpec(spec);
  if (!predicate || !Array.isArray(rows)) return null;

  const matched = [];
  for (const row of rows) {
    const verdict = predicate(row);
    // A row missing a field the spec reads cannot be judged, which means the
    // stored index predates that field. Better to ask the portal than to treat
    // "unknown" as "no".
    if (verdict === undefined) return null;
    if (verdict) matched.push(row);
  }

  return matched
    .sort((a, b) => (b.changed ?? 0) - (a.changed ?? 0))
    .map((row) => row.id);
}
