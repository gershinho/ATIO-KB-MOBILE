/**
 * Our own ranking stage, which stands in for the BM25 the portal cannot do.
 *
 * The assertions are about ordering rather than scores: the exact numbers are an
 * implementation detail, but "a title match beats a description match" is a
 * promise the search makes to anyone using it.
 */
import { rankCandidates, words } from '../src/search/rankCandidates';

const candidate = (id, title, summary = '') => ({ id, title, summary });

describe('words', () => {
  it('lower-cases and splits on anything that is not a word', () => {
    expect(words('Solar-Powered Pump (2024)')).toEqual(['solar', 'powered', 'pump', '2024']);
  });

  it('drops single characters, which carry no signal', () => {
    expect(words('a b solar')).toEqual(['solar']);
  });

  it('survives nothing at all', () => {
    expect(words(undefined)).toEqual([]);
    expect(words('')).toEqual([]);
  });
});

describe('rankCandidates', () => {
  it('puts a title match above a description match', () => {
    const ranked = rankCandidates(
      [
        candidate('buried', 'Composting guide', 'A note about a solar pump somewhere in here'),
        candidate('titled', 'Solar pump for smallholders', 'Unrelated body text'),
      ],
      { terms: ['solar', 'pump'] }
    );

    expect(ranked.map((r) => r.id)).toEqual(['titled', 'buried']);
  });

  it('rewards the record containing every word over one containing a single word', () => {
    const ranked = rankCandidates(
      [
        candidate('one', 'Water', 'water water water water'),
        candidate('both', 'Water storage', 'storage tanks'),
      ],
      { terms: ['water', 'storage'] }
    );

    expect(ranked[0].id).toBe('both');
  });

  it('counts a rare word for more than a common one', () => {
    // "water" is in every candidate and so distinguishes nothing; "cassava" is
    // in one. The record with the rare word should win despite the common word
    // appearing more often in its rival.
    const ranked = rankCandidates(
      [
        candidate('common', 'Water water', 'water water water'),
        candidate('rare', 'Cassava', 'water'),
      ],
      { terms: ['water', 'cassava'] }
    );

    expect(ranked[0].id).toBe('rare');
  });

  it('rewards the typed phrase surviving intact', () => {
    const ranked = rankCandidates(
      [
        candidate('scattered', 'Pumps', 'solar panels here, a pump there'),
        candidate('intact', 'A solar pump review', 'nothing else'),
      ],
      { terms: ['solar', 'pump'], phrase: 'solar pump' }
    );

    expect(ranked[0].id).toBe('intact');
  });

  it('does not reward a long description for being long', () => {
    const padding = 'filler words to make this document long '.repeat(20);
    const ranked = rankCandidates(
      [
        candidate('long', 'Guide', `irrigation ${padding}`),
        candidate('short', 'Guide', 'irrigation'),
      ],
      { terms: ['irrigation'] }
    );

    expect(ranked[0].id).toBe('short');
  });

  it('counts a word the user typed for more than one we added', () => {
    const ranked = rankCandidates(
      [candidate('typed', 'Irrigation'), candidate('expanded', 'Watering')],
      { terms: ['irrigation'], expandedTerms: ['watering'] }
    );

    expect(ranked[0].id).toBe('typed');
  });

  it('keeps the portal order when it has nothing to rank on', () => {
    const ranked = rankCandidates([candidate('a', 'A'), candidate('b', 'B')], { terms: [] });

    expect(ranked.map((r) => r.id)).toEqual(['a', 'b']);
    expect(ranked.every((r) => r.rankScore === 0)).toBe(true);
  });

  it('breaks ties by the order they arrived, so the same query twice is the same list', () => {
    const pool = [candidate('first', 'Solar'), candidate('second', 'Solar')];
    expect(rankCandidates(pool, { terms: ['solar'] }).map((r) => r.id)).toEqual(['first', 'second']);
    expect(rankCandidates(pool, { terms: ['solar'] }).map((r) => r.id)).toEqual(['first', 'second']);
  });

  it('scores every candidate, including the ones that match nothing', () => {
    const ranked = rankCandidates([candidate('miss', 'Composting')], { terms: ['solar'] });

    expect(ranked).toHaveLength(1);
    expect(ranked[0].rankScore).toBe(0);
  });

  it('leaves the caller its own fields alone', () => {
    const ranked = rankCandidates([{ id: 'x', title: 'Solar', summary: '', extra: 'kept' }], {
      terms: ['solar'],
    });

    expect(ranked[0].extra).toBe('kept');
  });

  it('survives an empty pool', () => {
    expect(rankCandidates([], { terms: ['solar'] })).toEqual([]);
  });
});
