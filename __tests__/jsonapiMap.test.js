/**
 * The mapper is the hinge: every screen keeps working only for as long as what
 * comes out of here matches the shape database/enrich.js hands them.
 *
 * The fixture is a real response from sti-portal.fao.org, trimmed to two
 * records and the terms they reference. Captured rather than hand-written, so
 * the test fails if the portal's shape and our reading of it ever part ways —
 * a handcrafted fixture only ever proves the mapper agrees with its author.
 */
import { mapInnovation, mapInnovations, buildTermIndex } from '../src/api/jsonapi/mapInnovation';
import { htmlToText } from '../src/api/jsonapi/htmlToText';
import document from './fixtures/jsonapi/innovations.json';

const [first, second] = document.data;
const index = buildTermIndex(document.included);

describe('mapInnovation', () => {
  it('maps a live record onto the app’s Innovation shape', () => {
    const innovation = mapInnovation(first, index);

    expect(innovation).toMatchObject({
      id: 'be8819ba-bb9a-4773-a031-d939894c6920',
      title: 'Silvi Pasture',
      readinessName: '7. Proof of Application',
      readinessLevel: 7,
      adoptionName: '8. Livelihood system (Rare)',
      adoptionLevel: 8,
      region: 'Asia',
      isGrassroots: true,
      dataSource: 'World Overview of Conservation Approaches and Technologies (WOCAT)',
      countries: ['India'],
      sdgs: [2, 15, 13],
      thumbsUpCount: 0,
      commentCount: 0,
    });
  });

  it('carries every key the Innovation typedef promises', () => {
    // A screen reading a key the mapper forgot gets undefined, which renders as
    // nothing rather than as an error — so absence is asserted on directly.
    const innovation = mapInnovation(first, index);
    for (const key of [
      'id', 'title', 'shortDescription', 'longDescription',
      'readinessName', 'readinessLevel', 'adoptionName', 'adoptionLevel',
      'region', 'isGrassroots', 'owner', 'partner', 'dataSource',
      'countries', 'types', 'sdgs', 'useCases', 'users',
      'cost', 'complexity', 'thumbsUpCount', 'commentCount',
    ]) {
      expect(innovation).toHaveProperty(key);
    }
  });

  it('flattens the portal’s HTML into the plain text the app renders', () => {
    const innovation = mapInnovation(first, index);
    expect(innovation.shortDescription).toBe(
      'Regeneration of degraded hill side using structural, vegetative & managerial measures.'
    );
    expect(innovation.shortDescription).not.toContain('<');
    expect(innovation.longDescription).not.toContain('<br>');
    expect(innovation.longDescription).toContain('Compiler:');
  });

  it('reads the leading digit of the level, and derives cost and complexity', () => {
    const innovation = mapInnovation(second, index);
    expect(innovation.readinessLevel).toBe(7);
    expect(innovation.useCases).toContain('Farm management');
    expect(innovation.users).toContain('Smallholder farms / farmers');
    // Both are derived from the same shared module the phone uses, so the value
    // is whatever that module says — the test asserts it is a real one.
    expect(['low', 'med', 'high']).toContain(innovation.cost);
    expect(['simple', 'moderate', 'advanced']).toContain(innovation.complexity);
  });

  it('takes use cases from field_use_cases alone', () => {
    // The mapping card also names field_challenges_addressed, but that is a
    // different vocabulary — "Drought / water scarcity", "Poverty" — and the
    // bundled innovation_use_cases table holds the first one's terms. Merging
    // would move innovations between heatmap columns on web only.
    const innovation = mapInnovation(first, index);
    expect(innovation.useCases).toContain('climate change adaptation');
    expect(innovation.useCases).not.toContain('Drought / water scarcity');
  });

  it('leaves an unknown level null rather than defaulting it to 1', () => {
    // The portal has a real "NOT INDICATED" readiness term. Reading it as
    // level 1 would state something the record does not.
    const unlevelled = {
      ...first,
      relationships: { ...first.relationships, field_readiness_level: { data: null } },
    };
    expect(mapInnovation(unlevelled, index).readinessLevel).toBeNull();
    expect(mapInnovation(unlevelled, index).readinessName).toBe('');
  });

  it('drops a reference whose term was not included rather than showing a uuid', () => {
    const innovation = mapInnovation(first, new Map());
    expect(innovation.countries).toEqual([]);
    expect(innovation.region).toBe('');
  });

  it('survives a record with no attributes or relationships', () => {
    const innovation = mapInnovation({ id: 'x' });
    expect(innovation.id).toBe('x');
    expect(innovation.title).toBe('');
    expect(innovation.countries).toEqual([]);
    expect(innovation.sdgs).toEqual([]);
  });
});

describe('mapInnovations', () => {
  it('maps a collection using the response’s own included terms', () => {
    const [a, b] = mapInnovations(document);
    expect(a.title).toBe('Silvi Pasture');
    expect(b.countries).toEqual(['Tajikistan']);
  });

  it('falls back to preloaded taxonomy names for terms the response omitted', () => {
    // This is the low-bandwidth path: once the vocabularies are cached at
    // startup, list calls stop carrying `include=` and the names come from there.
    const withoutIncluded = { data: document.data };
    const preloaded = new Map([['taxonomy_term--countries:' +
      document.data[0].relationships.field_countries_adoption.data[0].id, 'India']]);
    const [a] = mapInnovations(withoutIncluded, preloaded);
    expect(a.countries).toEqual(['India']);
  });

  it('maps a single-record document', () => {
    expect(mapInnovations({ data: first, included: document.included })).toHaveLength(1);
  });
});

describe('htmlToText', () => {
  it('returns an empty string for nothing', () => {
    expect(htmlToText(null)).toBe('');
    expect(htmlToText('')).toBe('');
  });

  it('keeps paragraphs apart', () => {
    expect(htmlToText('<p>One</p><p>Two</p>')).toBe('One\n\nTwo');
  });

  it('turns a line break into one newline', () => {
    expect(htmlToText('a<br>b')).toBe('a\nb');
  });

  it('decodes entities after stripping, never before', () => {
    // &lt;p&gt; is text the author escaped on purpose. Decoding first would
    // manufacture a tag and the stripper would eat the words around it.
    expect(htmlToText('<p>a &amp; b</p>')).toBe('a & b');
    expect(htmlToText('<p>escaped &lt;p&gt; tag</p>')).toBe('escaped <p> tag');
  });

  it('removes script and style bodies whole', () => {
    expect(htmlToText('<p>keep</p><script>var drop = 1;</script>')).toBe('keep');
  });

  it('collapses the whitespace that stripping leaves behind', () => {
    expect(htmlToText('<div>  a   <span> b </span>  </div>')).toBe('a b');
  });

  it('leaves an entity it does not know alone rather than deleting it', () => {
    expect(htmlToText('<p>&weird; x</p>')).toBe('&weird; x');
  });
});
