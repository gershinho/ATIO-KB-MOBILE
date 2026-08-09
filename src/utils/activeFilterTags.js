/**
 * Builds active filter tags for display (horizontal chips) with color coding
 * and provides a function to compute filters after removing a tag.
 */
import {
  CHALLENGES, TYPES, REGIONS, USER_GROUPS,
  SDGS, COST_LEVELS, COMPLEXITY_LEVELS,
} from '../data/constants';
import { INNOVATION_HUB_REGIONS } from '../data/innovationHubRegions';

/**
 * @typedef {import('../database/db').InnovationFilters} InnovationFilters
 */

// Category colors for filters that don't have per-item colors
const REGION_COLOR = '#0d9488';
const HUB_REGION_COLOR = '#0d9488';
const READINESS_COLOR = '#16a34a';
const ADOPTION_COLOR = '#2563eb';
const USER_GROUP_COLOR = '#dc2626';
const COUNTRY_COLOR = '#475569';
const SOURCE_COLOR = '#4f46e5';
const GRASSROOTS_COLOR = '#16a34a';
const COST_COLORS = { low: '#16a34a', med: '#d97706', high: '#dc2626' };
const COMPLEXITY_COLORS = { simple: '#16a34a', moderate: '#d97706', advanced: '#dc2626' };

// Color-blind-friendly palette: avoid red/green only; use blue, orange, teal
const COLOR_BLIND_MAP = {
  '#16a34a': '#0d9488', // green -> teal
  '#dc2626': '#2563eb', // red -> blue
  '#d97706': '#ea580c', // amber -> orange
  '#7e22ce': '#7c3aed', // purple (slightly distinct)
};
function toColorBlindSafe(hex) {
  if (!hex) return hex;
  const h = (hex || '').toLowerCase();
  return COLOR_BLIND_MAP[h] || h;
}

export const FILTER_CATEGORY_COLORS = {
  region: REGION_COLOR,
  readiness: READINESS_COLOR,
  adoption: ADOPTION_COLOR,
  userGroup: USER_GROUP_COLOR,
  country: COUNTRY_COLOR,
  source: SOURCE_COLOR,
  grassroots: GRASSROOTS_COLOR,
  cost: COST_COLORS,
  complexity: COMPLEXITY_COLORS,
};

/**
 * How each filter category becomes a chip.
 *
 * This was fifteen consecutive hand-written blocks that differed only in source
 * list, id prefix and colour — sitting directly above getFiltersAfterRemove,
 * which had already been converted to lookup tables for the same fifteen
 * categories. Two halves of one mapping, one declarative and one not.
 *
 * Four shapes cover all fifteen:
 *
 * - `taxonomyKeywords` — a sub-term keyword; the label and colour come from
 *   whichever taxonomy entry owns it.
 * - `taxonomyEntries` — a whole entry, suppressed while its keyword sibling is
 *   populated, since the narrower selection is the one being shown.
 * - `lookup` — find the value in a source list; a miss emits nothing.
 * - `passthrough` — the value is its own label.
 *
 * The two scalars and the one boolean are handled after the table; there is no
 * point generalising three one-line cases into a fifth shape.
 */
const TAG_SOURCES = [
  {
    shape: 'taxonomyKeywords',
    category: 'challengeKeywords',
    idPrefix: 'challengeKw',
    taxonomy: CHALLENGES,
    fallbackColor: '#16a34a',
  },
  {
    shape: 'taxonomyEntries',
    category: 'challenges',
    idPrefix: 'challenge',
    taxonomy: CHALLENGES,
    suppressedBy: 'challengeKeywords',
  },
  {
    shape: 'taxonomyKeywords',
    category: 'typeKeywords',
    idPrefix: 'typeKw',
    taxonomy: TYPES,
    fallbackColor: '#2563eb',
  },
  {
    shape: 'taxonomyEntries',
    category: 'types',
    idPrefix: 'type',
    taxonomy: TYPES,
    suppressedBy: 'typeKeywords',
  },
  {
    shape: 'lookup',
    category: 'regions',
    idPrefix: 'region',
    source: REGIONS,
    matchOn: 'value',
    labelFrom: (r) => r.name,
    color: REGION_COLOR,
  },
  {
    shape: 'lookup',
    category: 'hubRegions',
    idPrefix: 'hubRegion',
    source: INNOVATION_HUB_REGIONS,
    matchOn: 'id',
    labelFrom: (h) => h.name,
    color: HUB_REGION_COLOR,
  },
  {
    shape: 'passthrough',
    category: 'countries',
    idPrefix: 'country',
    color: COUNTRY_COLOR,
  },
  {
    shape: 'lookup',
    category: 'userGroups',
    idPrefix: 'userGroup',
    source: USER_GROUPS,
    matchOn: 'value',
    labelFrom: (u) => u.name,
    color: USER_GROUP_COLOR,
  },
  {
    shape: 'lookup',
    category: 'cost',
    idPrefix: 'cost',
    source: COST_LEVELS,
    matchOn: 'value',
    labelFrom: (c) => c.label,
    colorFor: (value) => COST_COLORS[value] || '#059669',
  },
  {
    shape: 'lookup',
    category: 'complexity',
    idPrefix: 'complexity',
    source: COMPLEXITY_LEVELS,
    matchOn: 'value',
    labelFrom: (c) => c.label,
    colorFor: (value) => COMPLEXITY_COLORS[value] || '#d97706',
  },
  {
    shape: 'lookup',
    category: 'sdgs',
    idPrefix: 'sdg',
    source: SDGS,
    matchOn: 'number',
    labelFrom: (sdg) => `SDG ${sdg.number}`,
    colorFor: (value, sdg) => sdg.color,
  },
  {
    shape: 'passthrough',
    category: 'sources',
    idPrefix: 'source',
    color: SOURCE_COLOR,
  },
];

/** Ids have to survive being used as React keys, so whitespace is replaced. */
const tagId = (prefix, value) => `${prefix}-${String(value).replace(/\s/g, '_')}`;

/**
 * The taxonomy entry that owns a sub-term keyword, or null.
 *
 * The old code used `!tags.some((t) => t.value === kw)` after a `break` as its
 * "not found" test, which scanned every tag pushed so far — including tags from
 * unrelated categories — so an unrelated filter holding the same string would
 * have suppressed the fallback.
 */
function entryOwningKeyword(taxonomy, keyword) {
  for (const entry of taxonomy) {
    if (entry.subTerms?.some((sub) => sub.keyword === keyword)) return entry;
  }
  return null;
}

function keywordLabel(entry, keyword) {
  return entry?.subTerms?.find((sub) => sub.keyword === keyword)?.label ?? keyword;
}

/**
 * @param {InnovationFilters} activeFilters - current filters from drilldown state
 * @param {{ colorBlindMode?: boolean }} options - when colorBlindMode true, use color-blind-safe palette
 * @returns {Array<{ id: string, label: string, color: string, category: string, value: any }>}
 */
export function getActiveFilterTags(activeFilters, options = {}) {
  if (!activeFilters || typeof activeFilters !== 'object') return [];
  const mapColor = (c) => (options.colorBlindMode ? toColorBlindSafe(c) : c);
  const tags = [];

  for (const spec of TAG_SOURCES) {
    const values = activeFilters[spec.category] || [];
    if (values.length === 0) continue;

    if (spec.shape === 'taxonomyEntries' && (activeFilters[spec.suppressedBy] || []).length) {
      continue;
    }

    for (const value of values) {
      const tag = { id: tagId(spec.idPrefix, value), category: spec.category, value };

      if (spec.shape === 'taxonomyKeywords') {
        const entry = entryOwningKeyword(spec.taxonomy, value);
        tag.label = keywordLabel(entry, value);
        tag.color = mapColor(entry ? entry.iconColor || '#333' : spec.fallbackColor);
      } else if (spec.shape === 'taxonomyEntries') {
        const entry = spec.taxonomy.find((x) => x.id === value);
        if (!entry) continue;
        tag.label = entry.name;
        tag.color = mapColor(entry.iconColor || '#333');
      } else if (spec.shape === 'lookup') {
        const match = spec.source.find((x) => x[spec.matchOn] === value);
        if (!match) continue;
        tag.label = spec.labelFrom(match);
        tag.color = mapColor(spec.colorFor ? spec.colorFor(value, match) : spec.color);
      } else {
        tag.label = String(value);
        tag.color = mapColor(spec.color);
      }

      tags.push(tag);
    }
  }

  // The readiness and adoption chips read as thresholds, so they carry the
  // threshold. Removing one resets it via SCALAR_FILTER_DEFAULTS, which does not
  // consult `value` — so this is the current setting, like every other tag.
  if (activeFilters.readinessMin > 1) {
    // The label used to be a ternary on a READINESS_LEVELS lookup whose two
    // branches were byte-identical, so the lookup never affected the output.
    tags.push({
      id: 'readinessMin',
      label: `Readiness ≥ ${activeFilters.readinessMin}`,
      color: mapColor(READINESS_COLOR),
      category: 'readinessMin',
      value: activeFilters.readinessMin,
    });
  }
  if (activeFilters.adoptionMin > 1) {
    tags.push({
      id: 'adoptionMin',
      label: `Adoption ≥ ${activeFilters.adoptionMin}`,
      color: mapColor(ADOPTION_COLOR),
      category: 'adoptionMin',
      value: activeFilters.adoptionMin,
    });
  }
  if (activeFilters.grassrootsOnly) {
    // Was `value: false` — the value to reset to rather than the value in force,
    // the only tag in the set that meant something different by `value`.
    tags.push({
      id: 'grassroots',
      label: 'Grassroots only',
      color: mapColor(GRASSROOTS_COLOR),
      category: 'grassrootsOnly',
      value: true,
    });
  }

  return tags;
}

/**
 * Filter categories whose value is a list; removing a tag drops one entry.
 * Derived from the tag `category` values produced by getActiveFilterTags.
 */
const LIST_FILTER_CATEGORIES = new Set([
  'challengeKeywords', 'challenges', 'typeKeywords', 'types',
  'regions', 'hubRegions', 'countries', 'userGroups',
  'cost', 'complexity', 'sdgs', 'sources',
]);

/** Filter categories that are scalars; removing a tag resets them to a default. */
const SCALAR_FILTER_DEFAULTS = {
  readinessMin: 1,
  adoptionMin: 1,
  grassrootsOnly: false,
};

/**
 * Returns new filters with the given tag removed.
 *
 * This was a 15-arm switch in which 12 arms were the same array-filter
 * statement, so adding a filter category meant copying a line and hoping the
 * key matched. The two tables below say the same thing declaratively; an
 * unknown category still falls through unchanged.
 *
 * @param {InnovationFilters} activeFilters
 * @param {{ category: string, value: any }} tag
 * @returns {InnovationFilters} a new bag; the input is not modified
 */
export function getFiltersAfterRemove(activeFilters, tag) {
  const next = { ...activeFilters };
  const category = tag?.category;

  if (LIST_FILTER_CATEGORIES.has(category)) {
    next[category] = (next[category] || []).filter((x) => x !== tag.value);
  } else if (Object.prototype.hasOwnProperty.call(SCALAR_FILTER_DEFAULTS, category)) {
    next[category] = SCALAR_FILTER_DEFAULTS[category];
  }

  return next;
}
