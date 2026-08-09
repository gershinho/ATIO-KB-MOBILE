import { CHALLENGES, TYPES, getCountriesForRegion } from '../../data/constants';

/**
 * Builders for the config object `useDrilldown().open` takes.
 *
 * Six openers used to be written out inline, each repeating the same lookup
 * against CHALLENGES/TYPES and the same shape. Two of them live on the Search
 * side (the heat map cells) and four on the Explore side, so there was nowhere
 * natural to share them until they stopped being bound to a screen. Pure
 * functions — no state, no data access — so they can be asserted on directly.
 */

/** A wider first page for grid cells, which are usually the denser slices. */
const CELL_PAGE_SIZE = 30;

export function challengeTarget(challenge) {
  return {
    source: 'challenge',
    title: challenge.name,
    icon: challenge.icon,
    iconColor: challenge.iconColor,
    filters: { challenges: [challenge.id] },
    entryFilters: { challengeKeywords: challenge.keywords || [] },
  };
}

export function typeTarget(type) {
  return {
    source: 'type',
    title: type.name,
    icon: type.icon,
    iconColor: type.iconColor,
    filters: { types: [type.id] },
    entryFilters: { typeKeywords: type.keywords || [] },
  };
}

export function regionTarget(region) {
  return {
    source: 'region',
    title: region.name,
    icon: region.icon || 'earth-outline',
    iconColor: region.iconColor,
    filters: { hubRegions: [region.id] },
    entryFilters: { hubRegions: [region.id] },
  };
}

export function allTarget() {
  return {
    source: 'all',
    title: 'All Solutions',
    icon: 'apps-outline',
    filters: {},
  };
}

/** A cell of the Adoption Opportunities map: one region hub × one challenge. */
export function opportunityCellTarget(regionHubName, challengeId) {
  const challenge = CHALLENGES.find((c) => c.id === challengeId);
  return {
    source: 'challenge',
    title: challenge ? `${challenge.name} in ${regionHubName}` : regionHubName,
    icon: challenge?.icon || 'grid-outline',
    iconColor: challenge?.iconColor,
    filters: { challenges: [challengeId], countries: getCountriesForRegion(regionHubName) },
    entryFilters: { challengeKeywords: challenge?.keywords || [] },
    limit: CELL_PAGE_SIZE,
  };
}

/** A cell of the Ready to Use map: one challenge × one solution type. */
export function readyCellTarget(challengeId, typeId) {
  const challenge = CHALLENGES.find((c) => c.id === challengeId);
  const type = TYPES.find((t) => t.id === typeId);
  return {
    source: 'challenge',
    title: `${challenge?.name || challengeId} × ${type?.name || typeId}`,
    icon: challenge?.icon || 'help-outline',
    iconColor: challenge?.iconColor,
    filters: { challenges: [challengeId], types: [typeId] },
    entryFilters: {
      challengeKeywords: challenge?.keywords || [],
      typeKeywords: type?.keywords || [],
    },
    limit: CELL_PAGE_SIZE,
  };
}
