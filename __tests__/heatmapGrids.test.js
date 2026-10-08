/**
 * The grid arithmetic both platforms share.
 *
 * Extracted from heatmaps.js so the phone's SQL rows and the web build's
 * portal rows go through the same maths. The extraction was verified against
 * the bundled catalogue — 3,075 records, both grids byte-identical before and
 * after — and these tests pin the behaviour that check could only confirm.
 */
import { buildOpportunityGrid, buildReadyToUseGrid, regionsFor, challengesFor, typesFor } from '../src/database/heatmapGrids';
import { CHALLENGES, TYPES, COUNTRY_TO_REGION } from '../src/data/constants';

/** A country, challenge and type that really exist in the taxonomies. */
const KENYA = Object.keys(COUNTRY_TO_REGION).find((c) => c === 'Kenya') ?? Object.keys(COUNTRY_TO_REGION)[0];
const KENYA_REGION = COUNTRY_TO_REGION[KENYA];
const CHALLENGE = CHALLENGES[0];
const TYPE = TYPES[0];

const record = (overrides = {}) => ({
  readiness: 7,
  adoption: 3,
  countries: [KENYA],
  useCases: [CHALLENGE.keywords[0]],
  types: [TYPE.keywords[0]],
  ...overrides,
});

describe('classification', () => {
  it('puts a country in its hub region', () => {
    expect(regionsFor([KENYA])).toEqual([KENYA_REGION]);
  });

  it('does not list a region twice for two countries in it', () => {
    const sameRegion = Object.keys(COUNTRY_TO_REGION).filter((c) => COUNTRY_TO_REGION[c] === KENYA_REGION);
    expect(regionsFor(sameRegion)).toEqual([KENYA_REGION]);
  });

  it('ignores a country in no region', () => {
    expect(regionsFor(['Atlantis'])).toEqual([]);
  });

  it('matches a challenge keyword anywhere in the term, ignoring case', () => {
    expect(challengesFor([`prefix ${CHALLENGE.keywords[0].toUpperCase()} suffix`])).toContain(CHALLENGE.id);
  });

  it('matches types the same way', () => {
    expect(typesFor([TYPE.keywords[0]])).toContain(TYPE.id);
  });

  it('returns nothing for terms that match no keyword', () => {
    expect(challengesFor(['unrelated term'])).toEqual([]);
    expect(typesFor([])).toEqual([]);
  });
});

describe('the opportunity grid', () => {
  it('scores how far readiness runs ahead of adoption', () => {
    const grid = buildOpportunityGrid([record({ readiness: 8, adoption: 3 })]);
    const cell = grid.cells[KENYA_REGION][CHALLENGE.id];

    expect(cell).toMatchObject({ count: 1, avgReadiness: 8, avgAdoption: 3, opportunityScore: 5 });
  });

  it('never scores below zero', () => {
    // Adoption ahead of readiness is not a negative opportunity; it is none.
    const grid = buildOpportunityGrid([record({ readiness: 2, adoption: 9 })]);
    expect(grid.cells[KENYA_REGION][CHALLENGE.id].opportunityScore).toBe(0);
  });

  it('averages across the records in a cell', () => {
    const grid = buildOpportunityGrid([
      record({ readiness: 9, adoption: 1 }),
      record({ readiness: 5, adoption: 1 }),
    ]);
    const cell = grid.cells[KENYA_REGION][CHALLENGE.id];
    expect(cell).toMatchObject({ count: 2, avgReadiness: 7, opportunityScore: 6 });
  });

  it('counts one record in every region and challenge it belongs to', () => {
    const second = CHALLENGES[1];
    const grid = buildOpportunityGrid([
      record({ useCases: [CHALLENGE.keywords[0], second.keywords[0]] }),
    ]);
    expect(grid.cells[KENYA_REGION][CHALLENGE.id].count).toBe(1);
    expect(grid.cells[KENYA_REGION][second.id].count).toBe(1);
  });

  it('skips a record that belongs to no region or no challenge', () => {
    const grid = buildOpportunityGrid([
      record({ countries: [] }),
      record({ useCases: ['nothing matches this'] }),
    ]);
    const total = Object.values(grid.cells)
      .flatMap((row) => Object.values(row))
      .reduce((sum, cell) => sum + cell.count, 0);
    expect(total).toBe(0);
  });

  it('leaves an empty cell at zero rather than dividing by it', () => {
    const grid = buildOpportunityGrid([]);
    const cell = grid.cells[KENYA_REGION][CHALLENGE.id];
    expect(cell).toEqual({ count: 0, avgReadiness: 0, avgAdoption: 0, opportunityScore: 0 });
  });

  it('seeds every region and challenge, so no screen reads undefined', () => {
    const grid = buildOpportunityGrid([]);
    for (const region of grid.rows) {
      for (const challenge of grid.cols) expect(grid.cells[region][challenge]).toBeDefined();
    }
    expect(grid.colNames[CHALLENGE.id]).toBe(CHALLENGE.name);
  });
});

describe('the ready-to-use grid', () => {
  it('averages readiness per challenge and type', () => {
    const grid = buildReadyToUseGrid([record({ readiness: 9 }), record({ readiness: 7 })]);
    expect(grid.cells[`${CHALLENGE.id}::${TYPE.id}`]).toEqual({ count: 2, avgReadiness: 8 });
  });

  it('skips a record with no readiness level, rather than averaging it as zero', () => {
    // This grid is about readiness: a record that does not state one has
    // nothing to say here. The opportunity grid treats it differently on
    // purpose — there it is a count that pulls an average down.
    const grid = buildReadyToUseGrid([record({ readiness: null }), record({ readiness: 8 })]);
    expect(grid.cells[`${CHALLENGE.id}::${TYPE.id}`]).toEqual({ count: 1, avgReadiness: 8 });
  });

  it('reports the range of the cells it filled', () => {
    // Asserted as a property rather than fixed numbers: a keyword can match
    // more than one challenge, so which cells two records land in is a fact
    // about the taxonomies rather than something a test should assume.
    const grid = buildReadyToUseGrid([
      record({ readiness: 3 }),
      record({ readiness: 9, types: [TYPES[1].keywords[0]] }),
    ]);
    const averages = Object.values(grid.cells).filter((c) => c.count > 0).map((c) => c.avgReadiness);

    expect(grid.minReadiness).toBe(Math.min(...averages));
    expect(grid.maxReadiness).toBe(Math.max(...averages));
    expect(grid.minReadiness).toBeLessThan(grid.maxReadiness);
  });

  it('falls back to the full scale when there is no range to colour by', () => {
    expect(buildReadyToUseGrid([])).toMatchObject({ minReadiness: 0, maxReadiness: 9 });
    expect(buildReadyToUseGrid([record()])).toMatchObject({ minReadiness: 0, maxReadiness: 9 });
  });

  it('keys cells by challenge and type together', () => {
    const grid = buildReadyToUseGrid([record()]);
    expect(Object.keys(grid.cells)).toHaveLength(CHALLENGES.length * TYPES.length);
    expect(grid.rows[0]).toMatchObject({ id: CHALLENGES[0].id, name: CHALLENGES[0].name });
  });
});
