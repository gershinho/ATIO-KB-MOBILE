/**
 * The importer must store exactly what the web app would have built from the
 * portal itself, or the Supabase source would show different cards, badges and
 * filter results from the JSON:API one it replaces. These pin that against a
 * captured portal response, and pin the checks that stop a bad run going live.
 */
import fixture from './fixtures/jsonapi/innovations.json';
import { buildRecords, sourcesOf } from '../importer/records';
import { validateRun, KNOWN_RECORDS, COUNT_TOLERANCE } from '../importer/validate';
import { mapInnovations, buildTermIndex } from '../src/api/jsonapi/mapInnovation';
import { toRows } from '../src/api/jsonapi/catalogIndex';
import { VOCABULARIES } from '../src/api/jsonapi/taxonomies';
import { deriveCost, deriveComplexity } from '../shared/deriveCostComplexity';

// The captured page carries its terms in `included`, which stands in for the
// preloaded vocabularies the importer passes.
const index = buildTermIndex(fixture.included);

describe('buildRecords', () => {
  const records = buildRecords(fixture, index);

  it('stores the mapper’s own output as the payload', () => {
    expect(records.map((r) => r.payload)).toEqual(mapInnovations(fixture, index));
  });

  it('stores the catalogue index row the browser crawl would build, named source included', () => {
    const rows = toRows(fixture, index);
    records.forEach((record, i) => {
      const title = rows[i].sourceId
        ? fixture.included.find((e) => e.type === 'node--digital_asset' && e.id === rows[i].sourceId)
            ?.attributes?.title ?? null
        : null;
      expect(record.indexRow).toEqual({ ...rows[i], sourceTitle: title });
    });
  });

  it('derives cost and complexity with the shared module', () => {
    for (const { payload, costLevel, complexityLevel } of records) {
      const signals = {
        types: payload.types,
        useCases: payload.useCases,
        users: payload.users,
        shortDescription: payload.shortDescription,
        longDescription: payload.longDescription,
        isGrassroots: payload.isGrassroots,
      };
      expect(costLevel).toBe(deriveCost(signals));
      expect(complexityLevel).toBe(deriveComplexity(signals));
    }
  });

  it('copies the typed columns out of those two shapes, not recomputing them', () => {
    for (const r of records) {
      expect(r.uuid).toBe(r.payload.id);
      expect(r.readinessLevel).toBe(r.payload.readinessLevel);
      expect(r.sdgs).toBe(r.indexRow.sdgs);
      expect(r.sdgs.every((name) => /^Goal \d+:/.test(name))).toBe(true);
      expect(r.searchText).toBe(`${r.payload.title} ${r.payload.shortDescription}`.toLowerCase());
    }
  });

  it('lists each cited data source once', () => {
    const sources = sourcesOf([...records, ...records]);
    expect(new Set(sources.map(([id]) => id)).size).toBe(sources.length);
    expect(sources.every(([, title]) => typeof title === 'string' && title)).toBe(true);
  });
});

describe('validateRun', () => {
  const vocabularyCounts = Object.fromEntries(VOCABULARIES.map(({ type }) => [type, 5]));
  const good = (n, extra = []) => {
    const uuids = [...KNOWN_RECORDS, ...extra, ...Array.from({ length: n }, (_, i) => `id-${i}`)];
    return {
      uuids,
      vocabularyCounts,
      derived: uuids.map((uuid) => ({ uuid, costLevel: 'low', complexityLevel: 'simple' })),
    };
  };

  it('checks for records that really are innovations in the captured page', () => {
    // The first list held two ids grepped from the fixture's relationships —
    // vocabulary terms, not innovations — and failed a complete import.
    expect(fixture.data.map((r) => r.id).sort()).toEqual([...KNOWN_RECORDS].sort());
  });

  it('passes a complete run', () => {
    expect(validateRun(good(98), 100)).toEqual([]);
  });

  it('passes the first run, which has nothing to compare against', () => {
    expect(validateRun(good(10), null)).toEqual([]);
  });

  it('refuses an empty run', () => {
    expect(validateRun({ uuids: [], vocabularyCounts, derived: [] }, null)).toContain('no records were imported');
  });

  it('refuses duplicate ids', () => {
    expect(validateRun(good(10, ['id-1']), null).join()).toMatch(/1 duplicate/);
  });

  it('refuses a run with an empty vocabulary', () => {
    const run = good(10);
    run.vocabularyCounts = { ...vocabularyCounts, [VOCABULARIES[0].type]: 0 };
    expect(validateRun(run, null).join()).toMatch(/vocabulary .* is empty/);
  });

  it(`refuses a count that moved more than ${COUNT_TOLERANCE * 100}%`, () => {
    expect(validateRun(good(78), 100).join()).toMatch(/record count moved/);
    expect(validateRun(good(108), 100)).toEqual([]);
  });

  it('refuses records with no derived cost or complexity', () => {
    const run = good(10);
    run.derived[3].costLevel = null;
    expect(validateRun(run, null).join()).toMatch(/1 records have no derived/);
  });

  it('refuses a run missing a known record', () => {
    const run = good(10);
    run.uuids = run.uuids.slice(1);
    run.derived = run.derived.slice(1);
    expect(validateRun(run, null).join()).toMatch(/known records missing/);
  });
});
