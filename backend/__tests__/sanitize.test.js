const { sanitizeForAI, buildSanitizedDocs } = require('../sanitize');

// The sanitizer is the enforcement point for the project's strict rule that
// the AI never sees identifying metadata. These tests pin that contract.
const FULL_ROW = {
  id: 42,
  title: 'Solar Drip Irrigation Kit',
  owner_text: 'Acme Agritech Ltd',
  partner_text: 'Ministry of Agriculture',
  data_source: 'ATIO KB Export 2024',
  url: 'https://example.org/innovations/42',
  short_description: 'Low-cost drip irrigation powered by a small solar pump.',
  long_description: 'Serves smallholder farmers on plots under two hectares.',
};

describe('sanitizeForAI', () => {
  it('includes both description fields separated by a blank line', () => {
    expect(sanitizeForAI(FULL_ROW)).toBe(
      'Low-cost drip irrigation powered by a small solar pump.\n\n' +
        'Serves smallholder farmers on plots under two hectares.'
    );
  });

  it('strips every identifying field', () => {
    const text = sanitizeForAI(FULL_ROW);
    for (const secret of [
      'Solar Drip Irrigation Kit',
      'Acme Agritech Ltd',
      'Ministry of Agriculture',
      'ATIO KB Export 2024',
      'example.org',
      '42',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('trims surrounding whitespace on each field', () => {
    expect(
      sanitizeForAI({ short_description: '  padded  ', long_description: '\n\tmore\n' })
    ).toBe('padded\n\nmore');
  });

  it('returns only the present field when one description is missing', () => {
    expect(sanitizeForAI({ short_description: 'only short' })).toBe('only short');
    expect(sanitizeForAI({ long_description: 'only long' })).toBe('only long');
  });

  it('returns an empty string when both descriptions are absent or empty', () => {
    expect(sanitizeForAI({})).toBe('');
    expect(sanitizeForAI({ short_description: '', long_description: '' })).toBe('');
    expect(sanitizeForAI({ title: 'Has a title but no descriptions' })).toBe('');
  });
});

describe('buildSanitizedDocs', () => {
  it('labels documents anonymously in order, starting at Doc 1', () => {
    const { docs } = buildSanitizedDocs([
      { id: 7, short_description: 'first' },
      { id: 9, short_description: 'second' },
    ]);
    expect(docs.map((d) => d.anonId)).toEqual(['Doc 1', 'Doc 2']);
  });

  it('maps each anonymous id back to the real innovation id', () => {
    const { docs, mapping } = buildSanitizedDocs([
      { id: 7, short_description: 'first' },
      { id: 9, short_description: 'second' },
    ]);
    expect(mapping.get('Doc 1')).toBe(7);
    expect(mapping.get('Doc 2')).toBe(9);
    expect(docs[0].realId).toBe(7);
  });

  it('skips rows with no usable text but does not reuse their index', () => {
    // Row 2 is empty, so numbering jumps — Doc 1 then Doc 3. This documents
    // current behaviour: anonIds track input position, not output position.
    const { docs, mapping } = buildSanitizedDocs([
      { id: 1, short_description: 'kept' },
      { id: 2, title: 'metadata only' },
      { id: 3, long_description: 'also kept' },
    ]);
    expect(docs).toHaveLength(2);
    expect(docs.map((d) => d.anonId)).toEqual(['Doc 1', 'Doc 3']);
    expect(mapping.has('Doc 2')).toBe(false);
  });

  it('never leaks identifying metadata into any document text', () => {
    const { docs } = buildSanitizedDocs([FULL_ROW]);
    expect(docs[0].text).not.toMatch(/Acme|Ministry|example\.org|Solar Drip/);
  });

  it('returns empty results for an empty input array', () => {
    const { docs, mapping } = buildSanitizedDocs([]);
    expect(docs).toEqual([]);
    expect(mapping.size).toBe(0);
  });
});
