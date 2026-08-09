const { deriveCost, deriveComplexity } = require('../deriveCostComplexity');

describe('deriveCost', () => {
  it('returns low when only low-cost signals are present', () => {
    expect(deriveCost({ shortDescription: 'An affordable low-cost tool' })).toBe('low');
    expect(deriveCost({ types: ['Indigenous knowledge'] })).toBe('low');
  });

  it('returns high when only high-cost signals are present', () => {
    expect(deriveCost({ shortDescription: 'Satellite imagery and drone surveys' })).toBe('high');
    expect(deriveCost({ types: ['Blockchain traceability'] })).toBe('high');
  });

  it('returns med when both signal families appear', () => {
    expect(
      deriveCost({ shortDescription: 'Low-cost drone kit for smallholder farms' })
    ).toBe('med');
  });

  it('returns med when no signals match', () => {
    expect(deriveCost({ shortDescription: 'A cooperative marketing programme' })).toBe('med');
  });

  it('treats isGrassroots as a low-cost signal on its own', () => {
    expect(deriveCost({ shortDescription: 'A cooperative programme', isGrassroots: true })).toBe('low');
  });

  it('lets isGrassroots offset a high-cost signal into med', () => {
    expect(deriveCost({ shortDescription: 'satellite mapping', isGrassroots: true })).toBe('med');
  });

  it('handles missing and empty input without throwing', () => {
    expect(deriveCost(undefined)).toBe('med');
    expect(deriveCost(null)).toBe('med');
    expect(deriveCost({})).toBe('med');
  });

  it('accepts either the types or typeNames key', () => {
    expect(deriveCost({ types: ['low-cost irrigation'] })).toBe('low');
    expect(deriveCost({ typeNames: ['low-cost irrigation'] })).toBe('low');
  });

  it('matches ai only as a whole word, not inside other words', () => {
    // \bai\b must not fire on "rain", "maize", "available"
    expect(deriveCost({ shortDescription: 'Maize rainfall data available' })).toBe('med');
    expect(deriveCost({ shortDescription: 'An AI powered advisory' })).toBe('high');
  });

  it('searches useCases and users alongside descriptions', () => {
    expect(deriveCost({ useCases: ['low-income households'] })).toBe('low');
    expect(deriveCost({ users: ['smallholder farmers'] })).toBe('low');
  });

  it('is case insensitive and tolerant of hyphen or space variants', () => {
    expect(deriveCost({ shortDescription: 'LOW COST kit' })).toBe('low');
    expect(deriveCost({ shortDescription: 'low-cost kit' })).toBe('low');
    expect(deriveCost({ shortDescription: 'lowcost kit' })).toBe('low');
  });
});

describe('deriveComplexity', () => {
  it('returns simple when only simple signals are present', () => {
    expect(deriveComplexity({ shortDescription: 'A basic manual hand tool' })).toBe('simple');
  });

  it('returns advanced when only advanced signals are present', () => {
    expect(deriveComplexity({ shortDescription: 'Machine learning on remote sensing data' })).toBe(
      'advanced'
    );
  });

  it('returns moderate when both families appear', () => {
    expect(deriveComplexity({ shortDescription: 'A simple digital platform' })).toBe('moderate');
  });

  it('returns moderate when nothing matches', () => {
    expect(deriveComplexity({ shortDescription: 'A cooperative marketing programme' })).toBe(
      'moderate'
    );
  });

  it('ignores isGrassroots, unlike deriveCost', () => {
    // Documents a real asymmetry between the two functions.
    expect(deriveComplexity({ shortDescription: 'a programme', isGrassroots: true })).toBe(
      'moderate'
    );
  });

  it('handles missing and empty input without throwing', () => {
    expect(deriveComplexity(undefined)).toBe('moderate');
    expect(deriveComplexity({})).toBe('moderate');
  });

  it('matches gis and iot only as whole words', () => {
    expect(deriveComplexity({ shortDescription: 'GIS mapping' })).toBe('advanced');
    expect(deriveComplexity({ shortDescription: 'registration logistics' })).toBe('moderate');
  });
});
