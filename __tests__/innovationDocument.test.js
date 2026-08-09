import { sanitizeFilename, buildTextContent } from '../src/utils/innovationDocument';
import { READINESS_LEVELS, ADOPTION_LEVELS, SDGS } from '../src/data/constants';

const FULL = {
  title: 'Solar Drip Irrigation',
  shortDescription: 'Low-cost drip irrigation powered by a small solar pump.',
  longDescription: 'A longer account of how the system works in the field.',
  readinessLevel: READINESS_LEVELS[2].level,
  adoptionLevel: ADOPTION_LEVELS[1].level,
  cost: 'low',
  complexity: 'simple',
  types: ['Water management'],
  countries: ['Kenya', 'Uganda'],
  region: 'East Africa',
  isGrassroots: true,
  useCases: ['Smallholder irrigation', 'Dry-season cropping'],
  users: ['Smallholder farmers'],
  sdgs: [SDGS[0].number],
  dataSource: 'ATIO KB',
  owner: 'Acme Agritech',
};

describe('sanitizeFilename', () => {
  it('keeps an ordinary title intact', () => {
    expect(sanitizeFilename('Solar Drip Irrigation')).toBe('Solar Drip Irrigation');
  });

  it('replaces characters that are illegal in filenames', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).not.toMatch(/[<>:"/\\|?*]/);
  });

  it('collapses runs of whitespace', () => {
    expect(sanitizeFilename('too    many     spaces')).toBe('too many spaces');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeFilename('   padded   ')).toBe('padded');
  });

  it('caps the length at 80 characters', () => {
    expect(sanitizeFilename('x'.repeat(200))).toHaveLength(80);
  });

  it('falls back to "solution" for an empty or missing title', () => {
    expect(sanitizeFilename('')).toBe('solution');
    expect(sanitizeFilename(undefined)).toBe('solution');
    expect(sanitizeFilename(null)).toBe('solution');
  });
});

describe('buildTextContent — structure', () => {
  const doc = buildTextContent(FULL);

  it('opens with the title as a top-level heading', () => {
    expect(doc.split('\n')[0]).toBe('# Solar Drip Irrigation');
  });

  it('includes every expected section heading', () => {
    for (const heading of [
      '## Overview',
      '## Readiness & adoption',
      '## Cost & complexity',
      '## Where this works best (use cases)',
      '## Who can use this (user groups)',
      '## Key benefits',
      '## Source & adoption',
      '## SDG alignment',
    ]) {
      expect(doc).toContain(heading);
    }
  });

  it('returns a string, not an array of lines', () => {
    expect(typeof doc).toBe('string');
  });
});

describe('buildTextContent — content', () => {
  it('lists the countries', () => {
    expect(buildTextContent(FULL)).toContain('Kenya, Uganda');
  });

  it('marks a grassroots solution', () => {
    expect(buildTextContent(FULL)).toContain('Grassroots solution');
  });

  it('omits the grassroots marker when the flag is false', () => {
    expect(buildTextContent({ ...FULL, isGrassroots: false })).not.toContain('Grassroots solution');
  });

  it('labels low cost', () => {
    expect(buildTextContent({ ...FULL, cost: 'low' })).toContain('$ Low / Free');
  });

  it('labels high cost', () => {
    expect(buildTextContent({ ...FULL, cost: 'high' })).toContain('$$$ High');
  });

  it('falls back to moderate for an unknown cost', () => {
    expect(buildTextContent({ ...FULL, cost: undefined })).toContain('$$ Moderate');
  });

  it('capitalises the complexity', () => {
    expect(buildTextContent({ ...FULL, complexity: 'advanced' })).toContain('Advanced');
  });

  it('adds the low-cost benefit line only for low cost', () => {
    expect(buildTextContent({ ...FULL, cost: 'low' })).toContain('**Low cost**');
    expect(buildTextContent({ ...FULL, cost: 'high' })).not.toContain('**Low cost**');
  });

  it('lists each use case as a bullet', () => {
    const doc = buildTextContent(FULL);
    for (const u of FULL.useCases) expect(doc).toContain(`- ${u}`);
  });

  it('lists each user group as a bullet', () => {
    expect(buildTextContent(FULL)).toContain('- Smallholder farmers');
  });

  it('names the SDG rather than only its number', () => {
    expect(buildTextContent(FULL)).toContain(SDGS[0].name);
  });

  it('credits the data source and owner', () => {
    expect(buildTextContent(FULL)).toContain('ATIO KB');
    expect(buildTextContent(FULL)).toContain('Acme Agritech');
  });
});

describe('buildTextContent — sparse records', () => {
  it('builds a document from a title alone without throwing', () => {
    expect(() => buildTextContent({ title: 'Bare' })).not.toThrow();
  });

  it('falls back to a placeholder title', () => {
    expect(buildTextContent({})).toContain('# Untitled Solution');
  });

  it('states when there is no overview', () => {
    expect(buildTextContent({ title: 'Bare' })).toContain('No overview available.');
  });

  it('uses the long description as the overview when the short one is missing', () => {
    const doc = buildTextContent({ title: 'X', longDescription: 'Only the long one.' });
    expect(doc).toContain('Only the long one.');
  });

  it('omits the use-case section entirely when there are none', () => {
    expect(buildTextContent({ title: 'X' })).not.toContain('## Where this works best');
  });

  it('omits the user-group section entirely when there are none', () => {
    expect(buildTextContent({ title: 'X' })).not.toContain('## Who can use this');
  });

  it('omits the SDG section entirely when there are none', () => {
    expect(buildTextContent({ title: 'X' })).not.toContain('## SDG alignment');
  });

  it('falls back to the region when no countries are listed', () => {
    expect(buildTextContent({ title: 'X', region: 'West Africa' })).toContain('West Africa');
  });

  it('skips unknown SDG numbers rather than emitting an empty bullet', () => {
    const doc = buildTextContent({ title: 'X', sdgs: [999] });
    expect(doc).not.toContain('**SDG 999**');
  });

  it('shows a dash for a missing data source', () => {
    expect(buildTextContent({ title: 'X' })).toContain('—');
  });
});
