/**
 * The app and the API must classify an innovation identically, or a UI filter
 * and the server response disagree about the same row.
 *
 * These were two hand-maintained copies of the same rules, and this test was
 * the only thing holding them together — able to detect divergence after it
 * shipped, for the inputs it happened to try, but not to prevent it. Both sides
 * now load shared/deriveCostComplexity.js.
 *
 * The test stays, unchanged, and is expected to be trivially true. It is the
 * guard on the wiring rather than on the logic: it fails the moment either
 * package goes back to its own copy, which is the mistake worth catching.
 */
import { deriveCost as fePricing, deriveComplexity as feComplexity } from '../src/data/constants';

const {
  deriveCost: bePricing,
  deriveComplexity: beComplexity,
} = require('../backend/deriveCostComplexity');

const CASES = [
  { name: 'empty object', signals: {} },
  { name: 'undefined', signals: undefined },
  { name: 'grassroots only', signals: { isGrassroots: true } },
  { name: 'low-cost phrase', signals: { shortDescription: 'affordable low-cost drip kit' } },
  { name: 'high-cost phrase', signals: { shortDescription: 'satellite and drone survey' } },
  { name: 'conflicting cost', signals: { shortDescription: 'low-cost drone for smallholders' } },
  { name: 'simple phrase', signals: { shortDescription: 'a basic manual hand tool' } },
  { name: 'advanced phrase', signals: { shortDescription: 'machine learning remote sensing' } },
  { name: 'conflicting complexity', signals: { shortDescription: 'a simple digital platform' } },
  { name: 'ai word boundary', signals: { shortDescription: 'maize rainfall data available' } },
  { name: 'ai real match', signals: { shortDescription: 'an AI advisory service' } },
  { name: 'gis token', signals: { shortDescription: 'GIS based mapping' } },
  { name: 'iot token', signals: { shortDescription: 'IoT soil sensors' } },
  { name: 'types alias', signals: { types: ['Indigenous knowledge'] } },
  { name: 'unsupported typeNames key', signals: { typeNames: ['Blockchain traceability'] } },
  { name: 'useCases field', signals: { useCases: ['low-income households'] } },
  { name: 'users field', signals: { users: ['smallholder farmers'] } },
  { name: 'long description only', signals: { longDescription: 'capital-intensive automation' } },
  {
    name: 'all fields populated',
    signals: {
      types: ['Digital platform'],
      useCases: ['post-harvest losses'],
      users: ['smallholder farmers'],
      shortDescription: 'A low-tech storage solution',
      longDescription: 'Uses traditional methods with minimal training.',
      isGrassroots: true,
    },
  },
  { name: 'grassroots plus high cost', signals: { shortDescription: 'drone survey', isGrassroots: true } },
  { name: 'uppercase input', signals: { shortDescription: 'LOW COST AND ORGANIC' } },
  { name: 'hyphen variant', signals: { shortDescription: 'low-tech appropriate-tech' } },
];

describe.each(CASES)('$name', ({ signals }) => {
  it('derives the same cost on frontend and backend', () => {
    expect(fePricing(signals)).toBe(bePricing(signals));
  });

  it('derives the same complexity on frontend and backend', () => {
    expect(feComplexity(signals)).toBe(beComplexity(signals));
  });
});

describe('output domains', () => {
  it('cost is always one of low/med/high on both sides', () => {
    for (const { signals } of CASES) {
      expect(['low', 'med', 'high']).toContain(fePricing(signals));
      expect(['low', 'med', 'high']).toContain(bePricing(signals));
    }
  });

  it('complexity is always one of simple/moderate/advanced on both sides', () => {
    for (const { signals } of CASES) {
      expect(['simple', 'moderate', 'advanced']).toContain(feComplexity(signals));
      expect(['simple', 'moderate', 'advanced']).toContain(beComplexity(signals));
    }
  });
});
