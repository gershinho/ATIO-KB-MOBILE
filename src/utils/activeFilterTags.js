/**
 * Builds active filter tags for display (horizontal chips) with color coding
 * and provides a function to compute filters after removing a tag.
 */
import {
  CHALLENGES, TYPES, REGIONS, USER_GROUPS, READINESS_LEVELS, ADOPTION_LEVELS,
  SDGS, COST_LEVELS, COMPLEXITY_LEVELS,
} from '../data/constants';
import { INNOVATION_HUB_REGIONS } from '../data/innovationHubRegions';

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
 * @param {object} activeFilters - current filters from drilldown state
 * @returns {Array<{ id: string, label: string, color: string, category: string, value: any }>}
 */
export function getActiveFilterTags(activeFilters) {
  if (!activeFilters || typeof activeFilters !== 'object') return [];
  const tags = [];

  (activeFilters.challengeKeywords || []).forEach((kw) => {
    let label = kw;
    for (const c of CHALLENGES) {
      const st = c.subTerms?.find((s) => s.keyword === kw);
      if (st) {
        label = st.label;
        tags.push({ id: `challengeKw-${kw.replace(/\s/g, '_')}`, label, color: c.iconColor || '#333', category: 'challengeKeywords', value: kw });
        break;
      }
    }
    if (!tags.some((t) => t.value === kw)) {
      tags.push({ id: `challengeKw-${kw.replace(/\s/g, '_')}`, label, color: '#16a34a', category: 'challengeKeywords', value: kw });
    }
  });
  (activeFilters.challenges || []).forEach((id) => {
    const c = CHALLENGES.find((x) => x.id === id);
    if (c && !(activeFilters.challengeKeywords || []).length) tags.push({ id: `challenge-${id}`, label: c.name, color: c.iconColor || '#333', category: 'challenges', value: id });
  });
  (activeFilters.typeKeywords || []).forEach((kw) => {
    let label = kw;
    for (const t of TYPES) {
      const st = t.subTerms?.find((s) => s.keyword === kw);
      if (st) {
        label = st.label;
        tags.push({ id: `typeKw-${kw.replace(/\s/g, '_')}`, label, color: t.iconColor || '#333', category: 'typeKeywords', value: kw });
        break;
      }
    }
    if (!tags.some((t) => t.value === kw)) {
      tags.push({ id: `typeKw-${kw.replace(/\s/g, '_')}`, label, color: '#2563eb', category: 'typeKeywords', value: kw });
    }
  });
  (activeFilters.types || []).forEach((id) => {
    const t = TYPES.find((x) => x.id === id);
    if (t && !(activeFilters.typeKeywords || []).length) tags.push({ id: `type-${id}`, label: t.name, color: t.iconColor || '#333', category: 'types', value: id });
  });

  if (activeFilters.readinessMin > 1) {
    const r = READINESS_LEVELS[activeFilters.readinessMin - 1];
    tags.push({ id: 'readinessMin', label: r ? `Readiness ≥ ${activeFilters.readinessMin}` : `Readiness ≥ ${activeFilters.readinessMin}`, color: READINESS_COLOR, category: 'readinessMin', value: 1 });
  }
  if (activeFilters.adoptionMin > 1) {
    tags.push({ id: 'adoptionMin', label: `Adoption ≥ ${activeFilters.adoptionMin}`, color: ADOPTION_COLOR, category: 'adoptionMin', value: 1 });
  }

  (activeFilters.regions || []).forEach((v) => {
    const r = REGIONS.find((x) => x.value === v);
    if (r) tags.push({ id: `region-${v}`, label: r.name, color: REGION_COLOR, category: 'regions', value: v });
  });
  (activeFilters.hubRegions || []).forEach((rid) => {
    const hub = INNOVATION_HUB_REGIONS.find((x) => x.id === rid);
    if (hub) tags.push({ id: `hubRegion-${rid}`, label: hub.name, color: HUB_REGION_COLOR, category: 'hubRegions', value: rid });
  });
  (activeFilters.countries || []).forEach((name) => {
    tags.push({ id: `country-${name}`, label: name, color: COUNTRY_COLOR, category: 'countries', value: name });
  });
  (activeFilters.userGroups || []).forEach((v) => {
    const u = USER_GROUPS.find((x) => x.value === v);
    if (u) tags.push({ id: `userGroup-${v}`, label: u.name, color: USER_GROUP_COLOR, category: 'userGroups', value: v });
  });
  (activeFilters.cost || []).forEach((v) => {
    const c = COST_LEVELS.find((x) => x.value === v);
    if (c) tags.push({ id: `cost-${v}`, label: c.label, color: COST_COLORS[v] || '#059669', category: 'cost', value: v });
  });
  (activeFilters.complexity || []).forEach((v) => {
    const c = COMPLEXITY_LEVELS.find((x) => x.value === v);
    if (c) tags.push({ id: `complexity-${v}`, label: c.label, color: COMPLEXITY_COLORS[v] || '#d97706', category: 'complexity', value: v });
  });
  (activeFilters.sdgs || []).forEach((num) => {
    const s = SDGS.find((x) => x.number === num);
    if (s) tags.push({ id: `sdg-${num}`, label: `SDG ${num}`, color: s.color, category: 'sdgs', value: num });
  });
  (activeFilters.sources || []).forEach((title) => {
    tags.push({ id: `source-${title}`, label: title, color: SOURCE_COLOR, category: 'sources', value: title });
  });
  if (activeFilters.grassrootsOnly) {
    tags.push({ id: 'grassroots', label: 'Grassroots only', color: GRASSROOTS_COLOR, category: 'grassrootsOnly', value: false });
  }

  return tags;
}

/**
 * Returns new filters object with the given tag removed.
 * @param {object} activeFilters
 * @param {{ category: string, value: any }} tag
 */
export function getFiltersAfterRemove(activeFilters, tag) {
  const next = { ...activeFilters };
  switch (tag.category) {
    case 'challengeKeywords':
      next.challengeKeywords = (next.challengeKeywords || []).filter((x) => x !== tag.value);
      break;
    case 'challenges':
      next.challenges = (next.challenges || []).filter((x) => x !== tag.value);
      break;
    case 'typeKeywords':
      next.typeKeywords = (next.typeKeywords || []).filter((x) => x !== tag.value);
      break;
    case 'types':
      next.types = (next.types || []).filter((x) => x !== tag.value);
      break;
    case 'readinessMin':
      next.readinessMin = 1;
      break;
    case 'adoptionMin':
      next.adoptionMin = 1;
      break;
    case 'regions':
      next.regions = (next.regions || []).filter((x) => x !== tag.value);
      break;
    case 'hubRegions':
      next.hubRegions = (next.hubRegions || []).filter((x) => x !== tag.value);
      break;
    case 'countries':
      next.countries = (next.countries || []).filter((x) => x !== tag.value);
      break;
    case 'userGroups':
      next.userGroups = (next.userGroups || []).filter((x) => x !== tag.value);
      break;
    case 'cost':
      next.cost = (next.cost || []).filter((x) => x !== tag.value);
      break;
    case 'complexity':
      next.complexity = (next.complexity || []).filter((x) => x !== tag.value);
      break;
    case 'sdgs':
      next.sdgs = (next.sdgs || []).filter((x) => x !== tag.value);
      break;
    case 'sources':
      next.sources = (next.sources || []).filter((x) => x !== tag.value);
      break;
    case 'grassrootsOnly':
      next.grassrootsOnly = false;
      break;
    default:
      break;
  }
  return next;
}
