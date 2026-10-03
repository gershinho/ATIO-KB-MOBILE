/**
 * A JSON:API record, turned into the Innovation the app already knows.
 *
 * This is the hinge of the whole migration. Every screen, hook and component
 * consumes the shape that database/enrich.js documents, so as long as what
 * comes out of here matches it field for field, nothing downstream has to
 * change — the web build swaps its source of data without swapping its UI.
 *
 * Two shapes go in. The record is one entry from `data`. Names for the things
 * it points at come from a lookup, because JSON:API sends relationships as
 * bare ids: `field_readiness_level` is a uuid, and "7. Proof of Application"
 * arrives separately, either in the same response's `included` array or from
 * the taxonomy cache preloaded at startup. Either source builds the same index.
 *
 * @typedef {import('../../database/enrich').Innovation} Innovation
 */
import { deriveCost, deriveComplexity } from '../../data/constants';
import { parseLeadingLevel } from '../../database/levels';
import { htmlToText } from './htmlToText';

/**
 * Index the `included` array by type and id.
 *
 * Returns a plain Map keyed by `${type}:${id}`, which is also the key the
 * taxonomy cache will use, so the two sources are interchangeable.
 *
 * @param {Array<object>} [included]
 * @returns {Map<string, string>} key → display name
 */
export function buildTermIndex(included = []) {
  const index = new Map();
  for (const entry of included) {
    if (!entry?.type || !entry?.id) continue;
    // Taxonomy terms carry `name`; nodes — organizations, data sources —
    // carry `title`. Both are the human-readable label we want.
    const label = entry.attributes?.name ?? entry.attributes?.title;
    if (label == null) continue;
    index.set(`${entry.type}:${entry.id}`, String(label));
  }
  return index;
}

/** The relationship's referenced ids, whether it is to-one, to-many or absent. */
function references(record, field) {
  const data = record?.relationships?.[field]?.data;
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

/**
 * Resolve a relationship to the names behind it.
 *
 * Unresolvable ids are dropped rather than rendered as a uuid: a missing term
 * means the response did not include that vocabulary, and a visible uuid is
 * worse than a shorter list.
 */
function namesFor(record, field, index) {
  return references(record, field)
    .map((ref) => index.get(`${ref.type}:${ref.id}`))
    .filter((name) => typeof name === 'string' && name.length > 0);
}

/** The first name, or '' — for the relationships that hold at most one. */
function nameFor(record, field, index) {
  return namesFor(record, field, index)[0] ?? '';
}

/**
 * SDG terms read "Goal 2: Zero hunger"; the app stores the number.
 *
 * Same parse as enrich.js, against the same strings — the bundled database
 * stores these term names verbatim, so the two agree by construction.
 */
function sdgNumbers(names) {
  return names
    .map((name) => {
      const match = name.match(/Goal (\d+)/);
      return match ? parseInt(match[1], 10) : null;
    })
    .filter(Boolean);
}

/** `field_shorter_description` and `body` are text fields: {value, processed}. */
function textField(attributes, field) {
  const raw = attributes?.[field];
  if (!raw) return '';
  // `processed` is the rendered HTML, `value` the source. Prefer processed —
  // it is what the portal considers display-ready — and flatten it to text.
  return htmlToText(raw.processed ?? raw.value ?? '');
}

/**
 * Map one record.
 *
 * @param {object} record - an entry from a JSON:API `data` array
 * @param {Map<string, string>} [index] - from buildTermIndex, or the taxonomy cache
 * @returns {Innovation} with `id` as a uuid string rather than a number —
 *   the one documented departure from the bundled shape, and the reason the
 *   mapping card lists "IDs migrate to UUID" as a constraint
 */
export function mapInnovation(record, index = new Map()) {
  const attributes = record?.attributes ?? {};

  const readinessName = nameFor(record, 'field_readiness_level', index);
  const adoptionName = nameFor(record, 'field_adoption_level', index);

  // Use cases come from field_use_cases alone, though the mapping card also
  // names field_challenges_addressed. They are two different vocabularies, and
  // the bundled innovation_use_cases table holds the first one's terms —
  // "Natural resources management & sustainable practices", "climate change
  // adaptation". Merging the second in would change which innovations land in
  // which heatmap column, so the two platforms would stop agreeing.
  const useCases = namesFor(record, 'field_use_cases', index);
  const types = namesFor(record, 'field_innovation_type', index);
  const users = namesFor(record, 'field_prospective_users', index);

  const shortDescription = textField(attributes, 'field_shorter_description');
  const longDescription = textField(attributes, 'body');
  const isGrassroots = attributes.field_if_grassroots === true;

  // The same signals enrich.js feeds these, so a record derives the same cost
  // and complexity whichever platform mapped it.
  const signals = { types, useCases, users, shortDescription, longDescription, isGrassroots };

  return {
    id: record?.id ?? null,
    title: attributes.title ?? '',
    shortDescription,
    longDescription,
    readinessName,
    // enrich.js defaults a missing level to 1; here it stays null. The portal
    // has a real "NOT INDICATED" term with no leading digit, and counting those
    // as level 1 would invent a reading the data never made.
    readinessLevel: parseLeadingLevel(readinessName, null),
    adoptionName,
    adoptionLevel: parseLeadingLevel(adoptionName, null),
    region: nameFor(record, 'field_region', index),
    isGrassroots,
    owner: nameFor(record, 'field_owner', index),
    partner: nameFor(record, 'field_partners', index),
    dataSource: nameFor(record, 'field_data_source', index),
    countries: namesFor(record, 'field_countries_adoption', index),
    types,
    sdgs: sdgNumbers(namesFor(record, 'field_impact_sdgs', index)),
    useCases,
    users,
    cost: deriveCost(signals),
    complexity: deriveComplexity(signals),
    // Engagement is local to the device on web, per the mapping card: no server
    // writes. The counts are filled in from IndexedDB, not from the portal.
    thumbsUpCount: 0,
    commentCount: 0,
  };
}

/**
 * Map a whole collection response, resolving names from its own `included`.
 *
 * @param {object} document - a JSON:API document with `data` and `included`
 * @param {Map<string, string>} [extraIndex] - preloaded taxonomy names, used
 *   for anything the response did not include
 * @returns {Innovation[]}
 */
export function mapInnovations(document, extraIndex) {
  const index = buildTermIndex(document?.included);
  if (extraIndex) {
    for (const [key, value] of extraIndex) {
      if (!index.has(key)) index.set(key, value);
    }
  }
  const data = Array.isArray(document?.data) ? document.data : [document?.data].filter(Boolean);
  return data.map((record) => mapInnovation(record, index));
}
