/**
 * The two heat map grids, as arithmetic over plain rows.
 *
 * Lifted out of heatmaps.js so both platforms share the maths. The phone reads
 * the rows out of SQLite and the web build collects them from the portal; what
 * either does with them has to be identical, or the same innovation produces
 * two different grids and nobody can say which is right.
 *
 * Nothing here touches a database or the network. A row is:
 *
 *   { readiness, adoption, countries[], useCases[], types[] }
 *
 * with the levels already parsed to numbers, or null where the record has no
 * level. Null matters: the portal has a real "NOT INDICATED" term, and
 * counting it as a 1 would invent a reading the data never made.
 */
import { CHALLENGES, TYPES, COUNTRY_TO_REGION } from '../data/constants';
import { INNOVATION_HUB_REGIONS } from '../data/innovationHubRegions';

/**
 * Case-insensitive substring match of a taxonomy term against a keyword list.
 *
 * The app's challenges and types are keyword lists rather than taxonomy ids,
 * so membership is decided here rather than by the data.
 */
export function termMatchesKeywords(termName, keywords) {
  if (!termName || !keywords?.length) return false;
  const lower = String(termName).toLowerCase();
  return keywords.some((k) => lower.includes(String(k).toLowerCase()));
}

/** The challenge ids a record's use cases put it under. */
export function challengesFor(useCases) {
  return CHALLENGES.filter((c) => (useCases ?? []).some((uc) => termMatchesKeywords(uc, c.keywords)))
    .map((c) => c.id);
}

/** The type ids a record's type terms put it under. */
export function typesFor(typeTerms) {
  return TYPES.filter((t) => (typeTerms ?? []).some((tt) => termMatchesKeywords(tt, t.keywords)))
    .map((t) => t.id);
}

/** The hub regions a record's countries put it in, without repeats. */
export function regionsFor(countries) {
  return [...new Set((countries ?? []).map((c) => COUNTRY_TO_REGION[c]).filter(Boolean))];
}

/**
 * Region × Challenge, scored by adoption opportunity: how far readiness runs
 * ahead of adoption, i.e. proven solutions that have not spread yet.
 *
 * @param {Array<{readiness: number|null, adoption: number|null, countries: string[], useCases: string[]}>} records
 * @returns {{rows: string[], cols: string[], colNames: object, cells: object}}
 */
export function buildOpportunityGrid(records) {
  const rows = INNOVATION_HUB_REGIONS.map((r) => r.name);
  const cols = CHALLENGES.map((c) => ({ id: c.id, name: c.name }));

  const cells = {};
  for (const r of rows) {
    cells[r] = {};
    for (const col of cols) {
      cells[r][col.id] = { count: 0, sumReadiness: 0, sumAdoption: 0 };
    }
  }

  for (const record of records ?? []) {
    const regionNames = regionsFor(record.countries);
    const challengeIds = challengesFor(record.useCases);
    if (regionNames.length === 0 || challengeIds.length === 0) continue;

    // A record with no level contributes a count but nothing to the averages,
    // which is what the bundled build does: its levels come back as 0 from
    // parseLeadingLevel's fallback and are summed as such.
    const readiness = record.readiness ?? 0;
    const adoption = record.adoption ?? 0;

    for (const region of regionNames) {
      for (const challengeId of challengeIds) {
        const cell = cells[region][challengeId];
        cell.count += 1;
        cell.sumReadiness += readiness;
        cell.sumAdoption += adoption;
      }
    }
  }

  for (const r of rows) {
    for (const col of cols) {
      const { count, sumReadiness, sumAdoption } = cells[r][col.id];
      const avgReadiness = count > 0 ? sumReadiness / count : 0;
      const avgAdoption = count > 0 ? sumAdoption / count : 0;
      cells[r][col.id] = {
        count,
        avgReadiness,
        avgAdoption,
        opportunityScore: Math.max(0, avgReadiness - avgAdoption),
      };
    }
  }

  return {
    rows,
    cols: cols.map((c) => c.id),
    colNames: cols.reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {}),
    cells,
  };
}

/**
 * Challenge × Type, scored by average readiness.
 *
 * Keyed by a composite "challengeId::typeId" rather than nested by row, because
 * this grid is sparse where the other is dense — the same shape the screens
 * already read.
 *
 * Records with no readiness level are skipped entirely here, rather than
 * counted as zero: this grid is *about* readiness, so a record that does not
 * state one has nothing to contribute to it.
 *
 * @param {Array<{readiness: number|null, useCases: string[], types: string[]}>} records
 */
export function buildReadyToUseGrid(records) {
  const rows = CHALLENGES.map((c) => ({
    id: c.id, name: c.name, icon: c.icon, iconColor: c.iconColor || '#333',
  }));
  const cols = TYPES.map((t) => ({
    id: t.id, name: t.name, icon: t.icon, iconColor: t.iconColor || '#333',
  }));

  const cells = {};
  for (const r of rows) {
    for (const col of cols) cells[`${r.id}::${col.id}`] = { count: 0, totalReadiness: 0 };
  }

  for (const record of records ?? []) {
    const readiness = record.readiness;
    if (readiness == null) continue;

    const challengeIds = challengesFor(record.useCases);
    const typeIds = typesFor(record.types);
    if (challengeIds.length === 0 || typeIds.length === 0) continue;

    for (const challengeId of challengeIds) {
      for (const typeId of typeIds) {
        // Every pair is seeded above and both id sets come from those same
        // taxonomies, so there is no cell to create here.
        const cell = cells[`${challengeId}::${typeId}`];
        cell.count += 1;
        cell.totalReadiness += readiness;
      }
    }
  }

  let minReadiness = 9;
  let maxReadiness = 0;
  for (const key of Object.keys(cells)) {
    const { count, totalReadiness } = cells[key];
    const avgReadiness = count > 0 ? totalReadiness / count : 0;
    cells[key] = { count, avgReadiness };
    if (count > 0) {
      minReadiness = Math.min(minReadiness, avgReadiness);
      maxReadiness = Math.max(maxReadiness, avgReadiness);
    }
  }
  // An empty or single-valued grid has no range to colour by, so the scale
  // falls back to the full one rather than collapsing.
  if (minReadiness >= maxReadiness) {
    minReadiness = 0;
    maxReadiness = 9;
  }

  return { rows, cols, cells, minReadiness, maxReadiness };
}
