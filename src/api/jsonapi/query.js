/**
 * Query strings for the FAO JSON:API.
 *
 * JSON:API asks for everything through bracketed parameters — page[limit],
 * fields[node--innovation], filter[title][condition][operator] — and every
 * bracket has to be percent-encoded. Hand-writing them is how you end up with
 * `filter[status]=1` silently ignored because one bracket went through raw, so
 * this module is the only place in the app that spells them.
 *
 * Nothing here talks to the network. It turns a plain object into a string,
 * which is what makes it testable without a server.
 */

/** JSON:API's own cap. Asking for more is not an error, it is silently 50. */
export const MAX_PAGE_SIZE = 50;

const enc = encodeURIComponent;

/**
 * `filter[a][b]=c`, with every bracket encoded.
 *
 * @param {string} root - the first segment, e.g. 'filter'
 * @param {string[]} path - the bracketed segments after it
 * @param {string|number|boolean} value
 */
function param(root, path, value) {
  const brackets = path.map((p) => `%5B${enc(p)}%5D`).join('');
  return `${root}${brackets}=${enc(String(value))}`;
}

/**
 * One filter entry, in any of the three shapes JSON:API accepts.
 *
 * - a scalar is a plain equality:      `{status: 1}`
 * - an array is an IN condition:       `{'field_x.name': ['a', 'b']}`
 * - an object is an explicit condition `{title: {operator: 'CONTAINS', value: 'drought'}}`
 *
 * The explicit form is written as a named condition group rather than the
 * shorthand, because the shorthand has no slot for an operator. The group name
 * is the key, which keeps two filters on the same path from colliding.
 */
function filterParams(key, spec) {
  if (Array.isArray(spec)) {
    const path = param('filter', [key, 'condition', 'path'], key);
    const operator = param('filter', [key, 'condition', 'operator'], 'IN');
    const values = spec.map((v) => param('filter', [key, 'condition', 'value', ''], v));
    return [path, operator, ...values];
  }

  if (spec && typeof spec === 'object') {
    const { path = key, operator, value, memberOf } = spec;
    const out = [
      param('filter', [key, 'condition', 'path'], path),
      param('filter', [key, 'condition', 'operator'], operator),
    ];
    // IS NULL and IS NOT NULL are the two operators that take no value, and
    // sending an empty one makes the API reject the whole query.
    if (value !== undefined) {
      if (Array.isArray(value)) {
        out.push(...value.map((v) => param('filter', [key, 'condition', 'value', ''], v)));
      } else {
        out.push(param('filter', [key, 'condition', 'value'], value));
      }
    }
    if (memberOf) out.push(param('filter', [key, 'condition', 'memberOf'], memberOf));
    return out;
  }

  return [param('filter', [key], spec)];
}

/**
 * A named OR/AND group that conditions can be attached to with `memberOf`.
 *
 * @param {string} name
 * @param {{conjunction: 'OR'|'AND', memberOf?: string}} group
 */
function groupParams(name, group) {
  const out = [param('filter', [name, 'group', 'conjunction'], group.conjunction)];
  if (group.memberOf) out.push(param('filter', [name, 'group', 'memberOf'], group.memberOf));
  return out;
}

/**
 * Build the query string for a JSON:API request.
 *
 * Every part is optional, and the order of the output is fixed rather than
 * dependent on object key order, so a test can assert on the whole string.
 *
 * @param {object} [spec]
 * @param {object} [spec.filter] - see filterParams for the three shapes
 * @param {object} [spec.groups] - named OR/AND groups keyed by group name
 * @param {object} [spec.fields] - sparse fieldsets, keyed by resource type,
 *   each an array of field names. Not optional in practice: a full innovation
 *   record is ~5 KB, and asking for whole records times the API out.
 * @param {string[]} [spec.include] - relationships to resolve inline
 * @param {string|string[]} [spec.sort]
 * @param {{limit?: number, offset?: number}} [spec.page]
 * @returns {string} e.g. `filter%5Bstatus%5D=1&page%5Blimit%5D=50`
 */
export function buildQuery({ filter, groups, fields, include, sort, page } = {}) {
  const parts = [];

  for (const [name, group] of Object.entries(groups || {})) {
    parts.push(...groupParams(name, group));
  }

  for (const [key, spec] of Object.entries(filter || {})) {
    if (spec === undefined) continue;
    parts.push(...filterParams(key, spec));
  }

  for (const [type, names] of Object.entries(fields || {})) {
    parts.push(param('fields', [type], names.join(',')));
  }

  if (include?.length) parts.push(`include=${enc(include.join(','))}`);

  if (sort) parts.push(`sort=${enc(Array.isArray(sort) ? sort.join(',') : sort)}`);

  if (page?.limit != null) {
    parts.push(param('page', ['limit'], Math.min(page.limit, MAX_PAGE_SIZE)));
  }
  if (page?.offset) parts.push(param('page', ['offset'], page.offset));

  return parts.join('&');
}

/**
 * Append a query string to a path, respecting a path that already has one.
 *
 * @param {string} path
 * @param {string} query
 */
export function withQuery(path, query) {
  if (!query) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${query}`;
}
