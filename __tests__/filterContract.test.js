import { buildFilterQuery } from '../src/database/filterQuery';
import { INNOVATION_HUB_REGIONS } from '../src/data/innovationHubRegions';
import { getActiveFilterTags, getFiltersAfterRemove } from '../src/utils/activeFilterTags';
import { withExpandedKeywords } from '../src/utils/filterEncoding';
import { CHALLENGES, TYPES } from '../src/data/constants';

/**
 * The filters object is interpreted by three modules that never see each other:
 *
 * - filterQuery.js  turns it into SQL
 * - activeFilterTags.js  turns it into the removable chips the user sees
 * - filterEncoding.js  converts between entry ids and their sub-term keywords
 *
 * Each had its own tests, so each was correct about its own reading. Nothing
 * checked that the three readings were the *same* reading — a key honoured in
 * SQL but not shown as a chip is a filter the user cannot see or remove, and a
 * key shown as a chip but ignored by SQL is one that silently does nothing.
 *
 * This is the contract, in one place, asserted against all three.
 */

const CROPS = CHALLENGES.find((c) => c.id === 'crops');
const NATURE = TYPES.find((t) => t.id === 'nature');
// Hub regions are addressed by slug id ('east-africa'), not display name.
const EAST_AFRICA = INNOVATION_HUB_REGIONS.find((r) => r.id === 'east-africa');

/**
 * buildFilterQuery always emits a `1=1` placeholder so callers can join
 * conditions with AND unconditionally. "Narrows" therefore means "added
 * something beyond the baseline", not "produced any condition at all".
 */
const BASELINE_CONDITIONS = buildFilterQuery({}).conditions.length;
const narrows = (filters) => buildFilterQuery(filters).conditions.length > BASELINE_CONDITIONS;

/**
 * Every key the filters object supports.
 *
 * `sql` — narrows the SQL query.
 * `chip` — appears as a removable chip.
 * A key that is neither would be dead weight; a key that is `chip` but not
 * `sql` has to be derived, and is called out as such.
 */
const CONTRACT = [
  { key: 'challenges', sample: ['crops'], sql: true, chip: true },
  { key: 'types', sample: ['nature'], sql: true, chip: true },
  { key: 'challengeKeywords', sample: [CROPS.subTerms[0].keyword], sql: true, chip: true },
  { key: 'typeKeywords', sample: [NATURE.subTerms[0].keyword], sql: true, chip: true },
  { key: 'countries', sample: ['Kenya'], sql: true, chip: true },
  { key: 'hubRegions', sample: [EAST_AFRICA.id], sql: true, chip: true },
  { key: 'regions', sample: ['Africa'], sql: true, chip: true },
  { key: 'sdgs', sample: [2], sql: true, chip: true },
  { key: 'sources', sample: ['FAO'], sql: true, chip: true },
  { key: 'userGroups', sample: ['farmers'], sql: true, chip: true },
  { key: 'readinessMin', sample: 5, sql: true, chip: true },
  { key: 'adoptionMin', sample: 5, sql: true, chip: true },
  { key: 'grassrootsOnly', sample: true, sql: true, chip: true },
  // Derived in JavaScript from description text, so they cannot reach the WHERE
  // clause. The data layer detects them and switches to chunked post-filtering.
  { key: 'cost', sample: ['low'], sql: false, chip: true },
  { key: 'complexity', sample: ['simple'], sql: false, chip: true },
];

const only = (entry) => ({ [entry.key]: entry.sample });

describe('the filters contract — SQL', () => {
  it('binds no parameters for an empty filter bag', () => {
    const { conditions, params } = buildFilterQuery({});
    expect(params).toEqual([]);
    // The placeholder exists so callers can AND unconditionally.
    expect(conditions).toEqual(['1=1']);
  });

  const sqlKeys = CONTRACT.filter((entry) => entry.sql);
  it.each(sqlKeys)('narrows the query for $key', (entry) => {
    expect(narrows(only(entry))).toBe(true);
  });

  const derivedKeys = CONTRACT.filter((entry) => !entry.sql);
  it.each(derivedKeys)('leaves $key out of SQL, because it is derived', (entry) => {
    expect(narrows(only(entry))).toBe(false);
  });

  it('binds every value as a parameter rather than inlining it', () => {
    // The whole bag at once, which is also the shape a real drilldown produces.
    const all = Object.assign({}, ...CONTRACT.map(only));
    const { conditions, params } = buildFilterQuery(all);
    const placeholders = conditions.join(' ').split('?').length - 1;
    expect(placeholders).toBe(params.length);
  });

  it('never interpolates a filter value into the SQL text', () => {
    const { conditions } = buildFilterQuery({ countries: ["'; DROP TABLE innovations; --"] });
    expect(conditions.join(' ')).not.toContain('DROP TABLE');
  });
});

describe('the filters contract — chips', () => {
  it('shows nothing for an empty filter bag', () => {
    expect(getActiveFilterTags({})).toEqual([]);
  });

  const chipKeys = CONTRACT.filter((entry) => entry.chip);
  it.each(chipKeys)('shows a removable chip for $key', (entry) => {
    const tags = getActiveFilterTags(only(entry));
    expect(tags.length).toBeGreaterThan(0);
  });

  it.each(chipKeys)('removing the $key chip clears it from the filters', (entry) => {
    const filters = only(entry);
    const [tag] = getActiveFilterTags(filters);
    const remaining = getFiltersAfterRemove(filters, tag);
    expect(getActiveFilterTags(remaining).length).toBeLessThan(
      getActiveFilterTags(filters).length
    );
  });

  it('gives every chip an id, a label and a colour', () => {
    const all = Object.assign({}, ...CONTRACT.map(only));
    for (const tag of getActiveFilterTags(all)) {
      expect(tag.id).toEqual(expect.any(String));
      expect(tag.label).toEqual(expect.any(String));
      expect(tag.color).toMatch(/^#[0-9a-f]{3,8}$/i);
    }
  });

  it('gives every chip a distinct id, so removing one cannot remove another', () => {
    const all = Object.assign({}, ...CONTRACT.map(only));
    const ids = getActiveFilterTags(all).map((tag) => tag.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the filters contract — the two encodings agree', () => {
  it('expands an entry id into keywords the SQL side also honours', () => {
    // The round trip that matters: a drilldown opens with `challenges`, the
    // panel expands it to `challengeKeywords`, and the query has to narrow
    // either way.
    expect(narrows({ challenges: ['crops'] })).toBe(true);
    expect(narrows(withExpandedKeywords({ challenges: ['crops'] }))).toBe(true);
  });

  it('shows chips for the expanded form too', () => {
    const expanded = withExpandedKeywords({ challenges: ['crops'] });
    expect(getActiveFilterTags(expanded).length).toBeGreaterThan(0);
  });

  it('leaves keys it does not own untouched', () => {
    const expanded = withExpandedKeywords({ countries: ['Kenya'], cost: ['low'] });
    expect(expanded.countries).toEqual(['Kenya']);
    expect(expanded.cost).toEqual(['low']);
  });
});

describe('the filters contract — no key is honoured by only one reader', () => {
  it('every SQL-narrowing key is also visible to the user as a chip', () => {
    // A key that narrows results without appearing as a chip is a filter the
    // user cannot see they have on, and cannot remove.
    const invisible = CONTRACT.filter(
      (entry) => narrows(only(entry)) && getActiveFilterTags(only(entry)).length === 0
    );
    expect(invisible.map((entry) => entry.key)).toEqual([]);
  });

  it('every chip either narrows the SQL or is a documented derived filter', () => {
    // A chip that changes nothing is a control that lies about what it does.
    const inert = CONTRACT.filter(
      (entry) => getActiveFilterTags(only(entry)).length > 0
        && !narrows(only(entry))
        && entry.sql !== false
    );
    expect(inert.map((entry) => entry.key)).toEqual([]);
  });
});
