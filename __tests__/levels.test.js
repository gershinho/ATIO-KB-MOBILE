import { parseLeadingLevel } from '../src/database/levels';

describe('parseLeadingLevel', () => {
  it('reads the numeric prefix of a level string', () => {
    expect(parseLeadingLevel('4 - Prototype')).toBe(4);
    expect(parseLeadingLevel('9 - Proven')).toBe(9);
  });

  it('reads a multi-digit prefix whole', () => {
    expect(parseLeadingLevel('10 - Beyond')).toBe(10);
  });

  it('accepts a bare number as well as a string', () => {
    expect(parseLeadingLevel(7)).toBe(7);
  });

  it('falls back when there is no leading integer', () => {
    // The two fallbacks in use: enrichment wants 1, the count aggregators want
    // null so the row is skipped rather than counted at level 1.
    expect(parseLeadingLevel('Unknown')).toBe(1);
    expect(parseLeadingLevel('Unknown', null)).toBeNull();
    expect(parseLeadingLevel(null)).toBe(1);
    expect(parseLeadingLevel(undefined, null)).toBeNull();
    expect(parseLeadingLevel('')).toBe(1);
  });

  it('does not read a number that is not at the start', () => {
    expect(parseLeadingLevel('Level 4', null)).toBeNull();
  });
});
