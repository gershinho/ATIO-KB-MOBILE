import { escapeLikePattern, buildKeywordLikeClause } from '../src/database/likeClause';
import { CHALLENGES, TYPES } from '../src/data/constants';

describe('escapeLikePattern', () => {
  it('leaves ordinary text untouched', () => {
    expect(escapeLikePattern('post-harvest loss')).toBe('post-harvest loss');
  });

  it('escapes the percent wildcard', () => {
    expect(escapeLikePattern('100% organic')).toBe('100\\% organic');
  });

  it('escapes the underscore wildcard', () => {
    expect(escapeLikePattern('drip_irrigation')).toBe('drip\\_irrigation');
  });

  it('escapes the escape character itself', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('leaves apostrophes alone — binding handles quoting, not escaping', () => {
    expect(escapeLikePattern("farmer's field")).toBe("farmer's field");
  });

  it('coerces null and undefined to an empty string', () => {
    expect(escapeLikePattern(null)).toBe('');
    expect(escapeLikePattern(undefined)).toBe('');
  });
});

describe('buildKeywordLikeClause', () => {
  it('produces one bound placeholder per keyword', () => {
    const { clause, params } = buildKeywordLikeClause('uc.term_name', ['a', 'b', 'c']);
    expect(clause.match(/LIKE \?/g)).toHaveLength(3);
    expect(params).toEqual(['%a%', '%b%', '%c%']);
  });

  it('never inlines a keyword into the SQL text', () => {
    const { clause } = buildKeywordLikeClause('uc.term_name', ["'; DROP TABLE innovations;--"]);
    expect(clause).not.toMatch(/DROP/i);
    expect(clause).toBe("uc.term_name LIKE ? ESCAPE '\\'");
  });

  it('passes a would-be injection through as an inert bound value', () => {
    const { params } = buildKeywordLikeClause('c', ["'; DROP TABLE innovations;--"]);
    expect(params).toEqual(["%'; DROP TABLE innovations;--%"]);
  });

  it('ORs multiple conditions together', () => {
    const { clause } = buildKeywordLikeClause('it.term_name', ['x', 'y']);
    expect(clause).toBe("it.term_name LIKE ? ESCAPE '\\' OR it.term_name LIKE ? ESCAPE '\\'");
  });

  it('returns a match-nothing clause for an empty keyword list', () => {
    expect(buildKeywordLikeClause('c', [])).toEqual({ clause: '0', params: [] });
    expect(buildKeywordLikeClause('c', undefined)).toEqual({ clause: '0', params: [] });
  });

  it('skips null and empty keywords rather than emitting a bare %% match-all', () => {
    const { clause, params } = buildKeywordLikeClause('c', ['real', null, '', 'also']);
    expect(params).toEqual(['%real%', '%also%']);
    expect(clause.match(/LIKE \?/g)).toHaveLength(2);
  });

  it('escapes wildcards inside the bound value', () => {
    expect(buildKeywordLikeClause('c', ['50%_x']).params).toEqual(['%50\\%\\_x%']);
  });
});

describe('taxonomy keywords are safe for the new escaping', () => {
  const allKeywords = [
    ...CHALLENGES.flatMap((c) => c.keywords || []),
    ...TYPES.flatMap((t) => t.keywords || []),
  ];

  it('has keywords to check', () => {
    expect(allKeywords.length).toBeGreaterThan(0);
  });

  // Escaping % and _ only changes results if a keyword actually contains one.
  // This asserts the migration to ESCAPE '\' was behaviour-preserving, and
  // fails loudly if someone later adds a keyword that relies on wildcards.
  it('contains no LIKE wildcards, so escaping them changes no query result', () => {
    const withWildcards = allKeywords.filter((k) => /[%_\\]/.test(k));
    expect(withWildcards).toEqual([]);
  });

  it('every keyword is a non-empty string', () => {
    for (const k of allKeywords) {
      expect(typeof k).toBe('string');
      expect(k.trim().length).toBeGreaterThan(0);
    }
  });
});
