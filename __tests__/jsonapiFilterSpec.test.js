/**
 * The filter bag, translated for the portal.
 *
 * filterQuery.js turns the same bag into SQL, and the two have to agree about
 * what a filter means or the phone and the browser answer the same question
 * differently. These tests assert on the generated query string, because a
 * filter that is malformed is not rejected by the portal — it is ignored, and
 * an ignored filter returns the whole catalogue.
 */
import { buildFilterSpec, levelsAtLeast, termsMatching, PATHS } from '../src/api/jsonapi/filterSpec';
import { buildQuery } from '../src/api/jsonapi/query';
import { CHALLENGES, USER_GROUPS } from '../src/data/constants';
import { INNOVATION_HUB_REGIONS } from '../src/data/innovationHubRegions';
import readiness from './fixtures/jsonapi/readinessLevels.json';

const USER_GROUPS_FIRST = USER_GROUPS[0].value;

const byType = {
  'taxonomy_term--readiness_levels': readiness.data.map((t) => [t.id, t.attributes.name]),
  'taxonomy_term--adoption_levels': [
    ['a1', '1. None'], ['a8', '8. Livelihood system (Rare)'], ['a9', '9. Widespread'],
  ],
};

const query = (filters, options) => buildQuery(buildFilterSpec(filters, options));

describe('every query is for published records', () => {
  it('filters on status, always', () => {
    // The portal's collection includes unpublished drafts — there are records
    // titled "TEST Athira (draft)" in it — so a query without this is wrong
    // before it starts.
    expect(query({})).toContain('filter%5Bf0%5D%5Bcondition%5D%5Bpath%5D=status');
    expect(query({ grassrootsOnly: true })).toContain('status');
  });
});

describe('list filters', () => {
  it('matches a single country as an IN condition', () => {
    const q = query({ countries: ['Kenya'] });
    expect(q).toContain(`%5Bpath%5D=${encodeURIComponent(PATHS.country)}`);
    expect(q).toContain('%5Boperator%5D=IN');
    expect(q).toContain('%5Bvalue%5D%5B%5D=Kenya');
  });

  it('expands a hub region into its countries, merged with any chosen directly', () => {
    const region = INNOVATION_HUB_REGIONS[0];
    const q = query({ hubRegions: [region.id], countries: ['Nowhere'] });

    expect(q).toContain('%5Bvalue%5D%5B%5D=Nowhere');
    expect(q).toContain(`%5Bvalue%5D%5B%5D=${encodeURIComponent(region.countries[0])}`);
    // One country condition, not two filters that would AND each other and
    // return nothing.
    expect((q.match(/%5Boperator%5D=IN/g) ?? [])).toHaveLength(1);
  });

  it('does not repeat a country named twice', () => {
    const region = INNOVATION_HUB_REGIONS[0];
    const q = query({ hubRegions: [region.id], countries: [region.countries[0]] });
    const occurrences = q.split(`%5Bvalue%5D%5B%5D=${encodeURIComponent(region.countries[0])}`).length - 1;
    expect(occurrences).toBe(1);
  });
});

describe('keyword filters', () => {
  // The vocabularies are preloaded, so a keyword is matched against the term
  // names here and the query names the terms outright. Measured against the
  // portal, a group of CONTAINS conditions on a related field combined with
  // any sort takes 40 seconds or more; the same question asked as IN takes
  // under 12. Same meaning, usable list.
  const useCases = [
    ['u1', 'climate change adaptation'],
    ['u2', 'improving soil management practices'],
    ['u3', 'crop production'],
  ];
  const types = [['t1', 'Digital tools'], ['t2', 'Machinery and equipment']];
  const vocab = {
    'taxonomy_term--use_cases': useCases,
    'taxonomy_term--type': types,
    'taxonomy_term--actors': [['a1', 'Smallholder farms / farmers']],
    'taxonomy_term--geographic_regions': [['g1', 'Africa'], ['g2', 'Asia']],
  };

  it('names the terms a keyword matches, rather than asking the portal to search', () => {
    const q = query({ challengeKeywords: ['climate'] }, { byType: vocab });

    expect(q).toContain('%5Boperator%5D=IN');
    expect(q).toContain(encodeURIComponent('climate change adaptation'));
    expect(q).not.toContain('%5Boperator%5D=CONTAINS');
  });

  it('matches a keyword anywhere in the term name, as the SQL LIKE does', () => {
    const q = query({ challengeKeywords: ['soil'] }, { byType: vocab });
    expect(q).toContain(encodeURIComponent('improving soil management practices'));
  });

  it('matches regardless of case', () => {
    const q = query({ typeKeywords: ['DIGITAL'] }, { byType: vocab });
    expect(q).toContain(encodeURIComponent('Digital tools'));
  });

  it('collects the terms for every keyword behind a challenge', () => {
    const challenge = { ...CHALLENGES[0], keywords: ['climate', 'crop'] };
    const q = buildQuery(buildFilterSpec({ challengeKeywords: challenge.keywords }, { byType: vocab }));
    expect(q).toContain(encodeURIComponent('climate change adaptation'));
    expect(q).toContain(encodeURIComponent('crop production'));
  });

  it('matches nothing when a keyword matches no term', () => {
    // The dangerous case: dropping the condition would widen the query to the
    // whole catalogue, so a filter that found nothing would return everything.
    const q = query({ challengeKeywords: ['nonexistent'] }, { byType: vocab });

    expect(q).toContain('%5Boperator%5D=IN');
    expect(q).toContain('no%20such%20term');
    expect(termsMatching(vocab, 'taxonomy_term--use_cases', ['nonexistent'])).toHaveLength(1);
  });

  it('lets a specific sub-term override the broad challenge', () => {
    const challenge = CHALLENGES[0];
    const q = query({ challenges: [challenge.id], challengeKeywords: ['climate'] }, { byType: vocab });
    expect(q).toContain(encodeURIComponent('climate change adaptation'));
  });

  it('resolves user groups and regions the same way', () => {
    const users = query({ userGroups: [USER_GROUPS_FIRST] }, { byType: vocab });
    expect(users).toContain(`%5Bpath%5D=${encodeURIComponent(PATHS.user)}`);

    const regions = query({ regions: ['Africa'] }, { byType: vocab });
    expect(regions).toContain(encodeURIComponent('Africa'));
  });

  it('keeps sources as a substring match, having no vocabulary to resolve', () => {
    // field_data_source points at 544+ digital assets, the one vocabulary not
    // worth preloading.
    const q = query({ sources: ['WOCAT'] }, { byType: vocab });
    expect(q).toContain('%5Boperator%5D=CONTAINS');
  });
});

describe('SDG filters', () => {
  it('matches the goal number with its colon', () => {
    expect(query({ sdgs: [2] })).toContain('%5Bvalue%5D=Goal%202%3A');
  });

  it('does not let goal 1 match goals 10 to 17', () => {
    // The SQL builder matches LIKE '%Goal 1%', which also matches
    // "Goal 15: Life on Land" — so choosing SDG 1 on the phone quietly returns
    // half the goals. The term names all carry the colon.
    const q = query({ sdgs: [1] });
    expect(q).toContain('Goal%201%3A');
    expect(q).not.toContain('Goal%201&');
  });
});

describe('level filters', () => {
  it('becomes the set of terms that satisfy the minimum', () => {
    const q = query({ readinessMin: 8 }, { byType });
    expect(q).toContain(encodeURIComponent('9. Ready'));
    expect(q).toContain(encodeURIComponent('8. Incubation'));
    expect(q).not.toContain(encodeURIComponent('7. Proof of Application'));
  });

  it('leaves out the term that has no level', () => {
    const names = levelsAtLeast(byType, 'taxonomy_term--readiness_levels', 1);
    expect(names).not.toContain('NOT INDICATED');
    expect(names).toHaveLength(9);
  });

  it('ignores a minimum of 1, which excludes nothing', () => {
    expect(query({ readinessMin: 1 }, { byType })).toBe(query({}, { byType }));
  });

  it('filters adoption the same way', () => {
    const q = query({ adoptionMin: 8 }, { byType });
    expect(q).toContain(encodeURIComponent('8. Livelihood system (Rare)'));
    expect(q).not.toContain(encodeURIComponent('1. None'));
  });
});

describe('the rest of the bag', () => {
  it('filters grassroots with an equality', () => {
    expect(query({ grassrootsOnly: true })).toContain(
      `%5Bpath%5D=${encodeURIComponent(PATHS.grassroots)}`
    );
  });

  it('treats grassrootsOnly false as absent, as the SQL builder does', () => {
    expect(query({ grassrootsOnly: false })).toBe(query({}));
  });

  it('matches a data source on the node title', () => {
    const q = query({ sources: ['WOCAT'] });
    expect(q).toContain(`%5Bpath%5D=${encodeURIComponent(PATHS.source)}`);
    expect(q).toContain('%5Bvalue%5D=WOCAT');
  });

  it('matches the record’s own region text', () => {
    expect(query({ regions: ['Africa'] })).toContain(
      `%5Bpath%5D=${encodeURIComponent(PATHS.region)}`
    );
  });

  it('ignores cost and complexity, which no query language can express', () => {
    // They are derived from the description text after the rows arrive, on
    // both platforms. A spec that tried to send them would be rejected.
    expect(query({ cost: ['low'], complexity: ['simple'] })).toBe(query({}));
  });

  it('ignores empty lists', () => {
    const empty = query({ countries: [], challenges: [], sdgs: [], sources: [] });
    expect(empty).toBe(query({}));
  });
});
