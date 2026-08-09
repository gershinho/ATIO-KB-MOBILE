import {
  withExpandedKeywords, keywordsByEntryId, entryIdsForKeywords, keywordsForEntries,
} from '../src/utils/filterEncoding';
import { CHALLENGES, TYPES } from '../src/data/constants';

const CROPS = CHALLENGES.find((c) => c.id === 'crops');
const NATURE = TYPES.find((t) => t.id === 'nature');

describe('withExpandedKeywords', () => {
  it('leaves a filters object with neither encoding alone', () => {
    expect(withExpandedKeywords({ countries: ['Kenya'] })).toEqual({ countries: ['Kenya'] });
  });

  it('expands a challenge id into every sub-term keyword', () => {
    const expanded = withExpandedKeywords({ challenges: ['crops'] });
    expect(expanded.challengeKeywords).toEqual(CROPS.subTerms.map((s) => s.keyword));
  });

  it('expands a type id into every sub-term keyword', () => {
    const expanded = withExpandedKeywords({ types: ['nature'] });
    expect(expanded.typeKeywords).toEqual(NATURE.subTerms.map((s) => s.keyword));
  });

  it('expands challenges and types in the same pass', () => {
    const expanded = withExpandedKeywords({ challenges: ['crops'], types: ['nature'] });
    expect(expanded.challengeKeywords.length).toBeGreaterThan(0);
    expect(expanded.typeKeywords.length).toBeGreaterThan(0);
  });

  it('accumulates keywords across several selected ids', () => {
    const two = withExpandedKeywords({ challenges: ['crops', 'livestock'] });
    const one = withExpandedKeywords({ challenges: ['crops'] });
    expect(two.challengeKeywords.length).toBeGreaterThan(one.challengeKeywords.length);
  });

  it('does not overwrite keywords the caller already narrowed', () => {
    // This is the whole point of the guard: expanding the parent id here would
    // silently re-check the sub-terms the user just unchecked.
    const narrowed = { challenges: ['crops'], challengeKeywords: ['crop production'] };
    expect(withExpandedKeywords(narrowed).challengeKeywords).toEqual(['crop production']);
  });

  it('treats an empty keyword array as "not narrowed" and expands', () => {
    const expanded = withExpandedKeywords({ challenges: ['crops'], challengeKeywords: [] });
    expect(expanded.challengeKeywords.length).toBeGreaterThan(1);
  });

  it('ignores ids that match no known entry', () => {
    expect(withExpandedKeywords({ challenges: ['not-a-challenge'] }).challengeKeywords).toEqual([]);
  });

  it('does not modify the object it was given', () => {
    const original = { challenges: ['crops'] };
    withExpandedKeywords(original);
    expect(original).toEqual({ challenges: ['crops'] });
  });

  it('carries unrelated filter keys through untouched', () => {
    const expanded = withExpandedKeywords({ challenges: ['crops'], countries: ['Kenya'], cost: ['Low'] });
    expect(expanded.countries).toEqual(['Kenya']);
    expect(expanded.cost).toEqual(['Low']);
  });
});

describe('keywordsByEntryId', () => {
  it('groups keywords under the entry that owns them', () => {
    const first = CROPS.subTerms[0].keyword;
    const second = CROPS.subTerms[1].keyword;
    expect(keywordsByEntryId(CHALLENGES, [first, second])).toEqual({ crops: [first, second] });
  });

  it('omits entries with no matching keyword rather than listing them empty', () => {
    const grouped = keywordsByEntryId(CHALLENGES, [CROPS.subTerms[0].keyword]);
    expect(Object.keys(grouped)).toEqual(['crops']);
  });

  it('returns nothing for no keywords', () => {
    expect(keywordsByEntryId(CHALLENGES, [])).toEqual({});
    expect(keywordsByEntryId(CHALLENGES, undefined)).toEqual({});
  });

  it('ignores keywords no entry claims', () => {
    expect(keywordsByEntryId(CHALLENGES, ['not-a-keyword'])).toEqual({});
  });
});

describe('entryIdsForKeywords', () => {
  it('names the entry owning a keyword', () => {
    expect(entryIdsForKeywords(CHALLENGES, [CROPS.subTerms[0].keyword])).toEqual(['crops']);
  });

  it('names each entry once even for several of its keywords', () => {
    const two = CROPS.subTerms.slice(0, 2).map((s) => s.keyword);
    expect(entryIdsForKeywords(CHALLENGES, two)).toEqual(['crops']);
  });

  it('returns nothing for no keywords', () => {
    expect(entryIdsForKeywords(CHALLENGES, [])).toEqual([]);
    expect(entryIdsForKeywords(CHALLENGES, undefined)).toEqual([]);
  });

  it('is the inverse of withExpandedKeywords', () => {
    // The round trip that the two halves living in separate modules could break.
    const expanded = withExpandedKeywords({ challenges: ['crops'] });
    expect(entryIdsForKeywords(CHALLENGES, expanded.challengeKeywords)).toEqual(['crops']);
  });
});

describe('keywordsForEntries', () => {
  it('uses the checked sub-terms when there are any', () => {
    const chosen = [CROPS.subTerms[0].keyword];
    expect(keywordsForEntries(CHALLENGES, ['crops'], { crops: chosen })).toEqual(chosen);
  });

  it('uses every sub-term when an entry is in scope with nothing checked', () => {
    // "The whole entry" is what an unchecked-but-in-scope entry means.
    expect(keywordsForEntries(CHALLENGES, ['crops'], {}))
      .toEqual(CROPS.subTerms.map((s) => s.keyword));
  });

  it('treats an empty selection as no selection', () => {
    expect(keywordsForEntries(CHALLENGES, ['crops'], { crops: [] }))
      .toEqual(CROPS.subTerms.map((s) => s.keyword));
  });

  it('accumulates across several entries', () => {
    const combined = keywordsForEntries(CHALLENGES, ['crops', 'livestock'], {});
    expect(combined.length).toBeGreaterThan(CROPS.subTerms.length);
  });

  it('skips an id no entry matches', () => {
    expect(keywordsForEntries(CHALLENGES, ['nope'], {})).toEqual([]);
  });
});
