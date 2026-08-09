import { withExpandedKeywords } from '../src/utils/filterEncoding';
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
