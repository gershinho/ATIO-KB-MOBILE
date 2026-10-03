/**
 * The query builder's whole job is producing strings the portal accepts, and
 * the failure mode is silent: a bracket that goes through unencoded does not
 * error, it is ignored, and `filter[status]=1` quietly stops filtering. So the
 * assertions are on exact strings rather than on parsed objects.
 */
import { buildQuery, withQuery, MAX_PAGE_SIZE } from '../src/api/jsonapi/query';

describe('buildQuery', () => {
  it('returns an empty string when there is nothing to ask for', () => {
    expect(buildQuery()).toBe('');
    expect(buildQuery({})).toBe('');
  });

  it('encodes every bracket', () => {
    expect(buildQuery({ page: { limit: 10 } })).toBe('page%5Blimit%5D=10');
    expect(buildQuery({ filter: { status: 1 } })).toBe('filter%5Bstatus%5D=1');
  });

  it('caps the page size at the portal’s own limit', () => {
    // Asking for 200 is not an error upstream: it silently returns 50, which
    // reads as "the collection ended" to a pager that trusted the number.
    expect(buildQuery({ page: { limit: 200 } })).toBe(`page%5Blimit%5D=${MAX_PAGE_SIZE}`);
  });

  it('omits a zero offset and keeps a real one', () => {
    expect(buildQuery({ page: { limit: 50, offset: 0 } })).toBe('page%5Blimit%5D=50');
    expect(buildQuery({ page: { offset: 100 } })).toBe('page%5Boffset%5D=100');
  });

  it('writes sparse fieldsets as a comma list per resource type', () => {
    expect(buildQuery({ fields: { 'node--innovation': ['title', 'changed'] } })).toBe(
      'fields%5Bnode--innovation%5D=title%2Cchanged'
    );
  });

  it('writes an array filter as an IN condition', () => {
    expect(buildQuery({ filter: { 'field_countries_adoption.name': ['Kenya', 'India'] } })).toBe(
      [
        'filter%5Bfield_countries_adoption.name%5D%5Bcondition%5D%5Bpath%5D=field_countries_adoption.name',
        'filter%5Bfield_countries_adoption.name%5D%5Bcondition%5D%5Boperator%5D=IN',
        'filter%5Bfield_countries_adoption.name%5D%5Bcondition%5D%5Bvalue%5D%5B%5D=Kenya',
        'filter%5Bfield_countries_adoption.name%5D%5Bcondition%5D%5Bvalue%5D%5B%5D=India',
      ].join('&')
    );
  });

  it('writes an operator filter as a named condition group', () => {
    expect(buildQuery({ filter: { t: { path: 'title', operator: 'CONTAINS', value: 'drought' } } })).toBe(
      [
        'filter%5Bt%5D%5Bcondition%5D%5Bpath%5D=title',
        'filter%5Bt%5D%5Bcondition%5D%5Boperator%5D=CONTAINS',
        'filter%5Bt%5D%5Bcondition%5D%5Bvalue%5D=drought',
      ].join('&')
    );
  });

  it('leaves out the value for the operators that take none', () => {
    // 'IS NOT NULL' with an empty value is rejected outright, taking the whole
    // query with it rather than just that condition.
    expect(buildQuery({ filter: { r: { path: 'field_region', operator: 'IS NOT NULL' } } })).toBe(
      [
        'filter%5Br%5D%5Bcondition%5D%5Bpath%5D=field_region',
        'filter%5Br%5D%5Bcondition%5D%5Boperator%5D=IS%20NOT%20NULL',
      ].join('&')
    );
  });

  it('attaches conditions to an OR group', () => {
    const query = buildQuery({
      groups: { help: { conjunction: 'OR' } },
      filter: {
        a: { path: 'title', operator: 'CONTAINS', value: 'hotline', memberOf: 'help' },
        b: { path: 'title', operator: 'CONTAINS', value: 'helpline', memberOf: 'help' },
      },
    });
    expect(query).toContain('filter%5Bhelp%5D%5Bgroup%5D%5Bconjunction%5D=OR');
    expect(query).toContain('filter%5Ba%5D%5Bcondition%5D%5BmemberOf%5D=help');
    expect(query).toContain('filter%5Bb%5D%5Bcondition%5D%5BmemberOf%5D=help');
  });

  it('skips an undefined filter instead of sending the word undefined', () => {
    expect(buildQuery({ filter: { status: 1, region: undefined } })).toBe('filter%5Bstatus%5D=1');
  });

  it('orders the parts the same way every time', () => {
    // Two builds of the same spec must produce the same string, or the service
    // worker and the HTTP cache treat them as different resources.
    const spec = {
      filter: { status: 1 },
      fields: { 'node--innovation': ['title'] },
      include: ['field_region'],
      sort: '-changed',
      page: { limit: 50, offset: 50 },
    };
    expect(buildQuery(spec)).toBe(buildQuery(spec));
    expect(buildQuery(spec)).toBe(
      [
        'filter%5Bstatus%5D=1',
        'fields%5Bnode--innovation%5D=title',
        'include=field_region',
        'sort=-changed',
        'page%5Blimit%5D=50',
        'page%5Boffset%5D=50',
      ].join('&')
    );
  });

  it('joins a sort array', () => {
    expect(buildQuery({ sort: ['-changed', 'title'] })).toBe('sort=-changed%2Ctitle');
  });
});

describe('withQuery', () => {
  it('leaves the path alone when there is no query', () => {
    expect(withQuery('/node/innovation', '')).toBe('/node/innovation');
  });

  it('starts the query string', () => {
    expect(withQuery('/node/innovation', 'a=1')).toBe('/node/innovation?a=1');
  });

  it('appends to one that already exists', () => {
    expect(withQuery('/node/innovation?a=1', 'b=2')).toBe('/node/innovation?a=1&b=2');
  });
});
