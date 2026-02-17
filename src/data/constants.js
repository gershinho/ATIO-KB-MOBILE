/**
 * Taxonomy and reference data only (labels, filter options, SDG metadata).
 * Actual innovation records come from the database; this file has no innovation content.
 * Icon names are Ionicons (from @expo/vector-icons).
 */
// Challenge use-case groups (12 groups mapped from 107 use cases)
export const CHALLENGES = [
  { id: 'crops', name: 'Crops & Production', icon: 'leaf-outline', keywords: ['crop production', 'animal production', 'Production'] },
  { id: 'livestock', name: 'Livestock & Fisheries', icon: 'paw-outline', keywords: ['animal production', 'fishery', 'aquaculture', 'livestock'] },
  { id: 'water', name: 'Water & Irrigation', icon: 'water-outline', keywords: ['water', 'irrigation', 'Water harvesting'] },
  { id: 'soil', name: 'Soil & Land', icon: 'earth-outline', keywords: ['soil', 'land', 'erosion', 'conservation'] },
  { id: 'climate', name: 'Climate & Environment', icon: 'thermometer-outline', keywords: ['climate', 'environment', 'carbon', 'weather'] },
  { id: 'finance', name: 'Finance & Insurance', icon: 'cash-outline', keywords: ['finance', 'loan', 'insurance', 'banking', 'financial', 'payment'] },
  { id: 'markets', name: 'Markets & Trade', icon: 'stats-chart-outline', keywords: ['market', 'trade', 'price', 'supply chain', 'distribution'] },
  { id: 'postharvest', name: 'Post-Harvest & Supply', icon: 'cube-outline', keywords: ['post-harvest', 'storage', 'processing', 'food processing'] },
  { id: 'knowledge', name: 'Knowledge & Advisory', icon: 'book-outline', keywords: ['knowledge', 'advisory', 'extension', 'training', 'skills'] },
  { id: 'business', name: 'Business & Cooperation', icon: 'people-outline', keywords: ['cooperative', 'business', 'enterprise', 'organization'] },
  { id: 'governance', name: 'Governance & Policy', icon: 'business-outline', keywords: ['governance', 'policy', 'regulation', 'legislation'] },
  { id: 'nutrition', name: 'Nutrition & Alt. Food', icon: 'nutrition-outline', keywords: ['nutrition', 'food security', 'consumption', 'diet'] },
];

// Innovation type groups (10 groups mapped from 179 types)
export const TYPES = [
  { id: 'nature', name: 'Nature-based', icon: 'leaf-outline', keywords: ['Nature-based', 'Biological control', 'Agroforestry', 'Organic'] },
  { id: 'digital', name: 'Digital & ICT', icon: 'phone-portrait-outline', keywords: ['Digital', 'ICT', 'Mobile', 'SMS', 'E-', 'Platform', 'Software', 'App'] },
  { id: 'mechanical', name: 'Mechanization', icon: 'construct-outline', keywords: ['Mechanization', 'Mechanical', 'Equipment', 'Tool', 'Machine'] },
  { id: 'biotech', name: 'Biotechnology', icon: 'flask-outline', keywords: ['Biotech', 'Genetic', 'Genomic', 'Breeding', 'Tissue culture'] },
  { id: 'financial', name: 'Financial', icon: 'cash-outline', keywords: ['Financial', 'Fintech', 'Banking', 'Insurance', 'Credit'] },
  { id: 'social', name: 'Social & Community', icon: 'people-outline', keywords: ['Social', 'Community', 'Institutional', 'Capacity', 'Partnership'] },
  { id: 'policy', name: 'Policy & Governance', icon: 'document-text-outline', keywords: ['Policy', 'Governance', 'Regulatory', 'Legal'] },
  { id: 'traditional', name: 'Traditional & Indigenous', icon: 'archive-outline', keywords: ['Traditional', 'Indigenous', 'Local knowledge'] },
  { id: 'research', name: 'Research & Education', icon: 'school-outline', keywords: ['Research', 'Education', 'Training', 'Academic'] },
  { id: 'frugal', name: 'Frugal & Low-cost', icon: 'bulb-outline', keywords: ['Frugal', 'Low-cost', 'Affordable', 'Appropriate'] },
];

export const REGIONS = [
  { value: 'Africa', name: 'Africa' },
  { value: 'Asia', name: 'Asia' },
  { value: 'Americas', name: 'Americas' },
  { value: 'Europe', name: 'Europe' },
  { value: 'Location-independent', name: 'Global' },
  { value: 'Oceania', name: 'Oceania' },
];

export const USER_GROUPS = [
  { value: 'farmers', name: 'Farmers & Producers', keywords: ['farmer', 'Smallholder', 'Medium size farm', 'Large size farm'] },
  { value: 'communities', name: 'Farming Communities', keywords: ['Rural communities', 'Indigenous communities'] },
  { value: 'advisors', name: 'Advisors & Researchers', keywords: ['Farm advisors', 'Academia', 'researcher'] },
  { value: 'private', name: 'Private Sector', keywords: ['enterprise', 'entrepreneur', 'Small-medium'] },
  { value: 'investors', name: 'Investors & Funders', keywords: ['Funder', 'investor'] },
  { value: 'government', name: 'Government & Orgs', keywords: ['government', 'organization', 'Civil society'] },
  { value: 'consumers', name: 'Consumers', keywords: ['consumer', 'Food consumer'] },
];

export const READINESS_LEVELS = [
  { level: 1, name: 'Idea / Hypothesis', description: 'Formulated idea or hypothesis for an innovation.' },
  { level: 2, name: 'Basic Research', description: 'Validated hypothesis using basic science evidence.' },
  { level: 3, name: 'Basic Model', description: 'Validated principles using basic science.' },
  { level: 4, name: 'Formulating Working Model', description: 'Researched capacity using applied science.' },
  { level: 5, name: 'Working Model', description: 'Tested in a controlled environment.' },
  { level: 6, name: 'Working Application', description: 'Tested in controlled environment with partners.' },
  { level: 7, name: 'Proof of Application', description: 'Tested in real-world with intervention support.' },
  { level: 8, name: 'Incubation', description: 'Proven in real-world, scaling underway.' },
  { level: 9, name: 'Ready', description: 'Validated without external support. Market-ready.' },
];

export const ADOPTION_LEVELS = [
  { level: 1, name: 'Project Leaders', description: 'Embraced by project leaders, not yet used by team.' },
  { level: 2, name: 'Project Team', description: 'Used only by intervention or project team.' },
  { level: 3, name: 'Project Partners', description: 'Used by teams and direct funded partners.' },
  { level: 4, name: 'Innovation Network (Rare)', description: 'Used by some connected organizations outside project.' },
  { level: 5, name: 'Innovation Network (Common)', description: 'Commonly used by connected organizations.' },
  { level: 6, name: 'Innovation System (Rare)', description: 'Used by some in similar geographies/sectors.' },
  { level: 7, name: 'Innovation System (Common)', description: 'Commonly used in similar geographies/sectors.' },
  { level: 8, name: 'Livelihood System (Rare)', description: 'Used by some end-users unconnected to development.' },
  { level: 9, name: 'Livelihood System (Common)', description: 'Commonly used by end-users worldwide.' },
];

export const SDGS = [
  { number: 1, name: 'No Poverty', color: '#E5243B', description: 'End poverty in all its forms everywhere.' },
  { number: 2, name: 'Zero Hunger', color: '#DDA63A', description: 'End hunger, achieve food security and improved nutrition.' },
  { number: 3, name: 'Good Health', color: '#4C9F38', description: 'Ensure healthy lives and promote well-being for all.' },
  { number: 4, name: 'Quality Education', color: '#C5192D', description: 'Ensure inclusive and equitable quality education.' },
  { number: 5, name: 'Gender Equality', color: '#FF3A21', description: 'Achieve gender equality and empower all women and girls.' },
  { number: 6, name: 'Clean Water', color: '#26BDE2', description: 'Ensure availability of water and sanitation for all.' },
  { number: 7, name: 'Clean Energy', color: '#FCC30B', description: 'Ensure access to affordable, sustainable energy.' },
  { number: 8, name: 'Decent Work', color: '#A21942', description: 'Promote sustained economic growth and decent work.' },
  { number: 9, name: 'Industry & Innovation', color: '#FD6925', description: 'Build resilient infrastructure and foster innovation.' },
  { number: 10, name: 'Reduced Inequalities', color: '#DD1367', description: 'Reduce inequality within and among countries.' },
  { number: 11, name: 'Sustainable Cities', color: '#FD9D24', description: 'Make cities inclusive, safe, resilient and sustainable.' },
  { number: 12, name: 'Responsible Consumption', color: '#BF8B2E', description: 'Ensure sustainable consumption and production patterns.' },
  { number: 13, name: 'Climate Action', color: '#3F7E44', description: 'Take urgent action to combat climate change.' },
  { number: 14, name: 'Life Below Water', color: '#0A97D9', description: 'Conserve and sustainably use oceans and marine resources.' },
  { number: 15, name: 'Life on Land', color: '#56C02B', description: 'Protect and restore terrestrial ecosystems.' },
  { number: 16, name: 'Peace & Justice', color: '#00689D', description: 'Promote peaceful and inclusive societies.' },
  { number: 17, name: 'Partnerships', color: '#19486A', description: 'Strengthen the Global Partnership for Sustainable Development.' },
];

export const COST_LEVELS = [
  { value: 'low', label: '$ Low / Free' },
  { value: 'med', label: '$$ Moderate' },
  { value: 'high', label: '$$$ High' },
];

export const COMPLEXITY_LEVELS = [
  { value: 'simple', label: 'Simple' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'advanced', label: 'Advanced' },
];

// Build one searchable string from all text signals (for cost/complexity derivation)
function toSearchText(signals) {
  const a = signals.typeNames || [];
  const b = (signals.useCases || []).concat(signals.users || []);
  const desc = [signals.shortDescription, signals.longDescription].filter(Boolean).join(' ');
  return [...a, ...b, desc].join(' ').toLowerCase().replace(/\s+/g, ' ');
}

// Normalize input: support legacy (typeNames array) or { typeNames, useCases, description, ... }
function normalizeSignals(typeNamesOrSignals) {
  if (Array.isArray(typeNamesOrSignals)) {
    return { typeNames: typeNamesOrSignals, useCases: [], users: [], shortDescription: '', longDescription: '', isGrassroots: false };
  }
  const s = typeNamesOrSignals || {};
  return {
    typeNames: s.types || s.typeNames || [],
    useCases: s.useCases || [],
    users: s.users || [],
    shortDescription: s.shortDescription || '',
    longDescription: s.longDescription || '',
    isGrassroots: !!s.isGrassroots,
  };
}

/**
 * Derive cost (low/med/high) from types, use cases, description, users, and grassroots.
 * Uses multiple signals; no DB or manual data changes required.
 */
export function deriveCost(typeNamesOrSignals) {
  const s = normalizeSignals(typeNamesOrSignals);
  const text = toSearchText({
    typeNames: s.typeNames,
    useCases: s.useCases,
    users: s.users,
    shortDescription: s.shortDescription,
    longDescription: s.longDescription,
  });

  const lowCostTerms = /frugal|traditional|indigenous|low[- ]?cost|organic|nature[- ]?based|affordable|appropriate\s*tech|low[- ]?tech|free\s*to\s*use|minimal\s*cost|cost[- ]?effective|resource[- ]?constrained|smallholder|small[- ]?scale|low[- ]?income/;
  const highCostTerms = /ai\b|blockchain|biotech|genetic|genomic|satellite|drone|automation|capital[- ]?intensive|premium|high[- ]?cost|sophisticated\s*equipment/;

  const hasLow = lowCostTerms.test(text) || s.isGrassroots;
  const hasHigh = highCostTerms.test(text);

  if (hasHigh && !hasLow) return 'high';
  if (hasLow && !hasHigh) return 'low';
  return 'med';
}

/**
 * Derive complexity (simple/moderate/advanced) from types, use cases, and description.
 * Uses multiple signals; no DB or manual data changes required.
 */
export function deriveComplexity(typeNamesOrSignals) {
  const s = normalizeSignals(typeNamesOrSignals);
  const text = toSearchText({
    typeNames: s.typeNames,
    useCases: s.useCases,
    users: s.users,
    shortDescription: s.shortDescription,
    longDescription: s.longDescription,
  });

  const simpleTerms = /frugal|traditional|indigenous|simple|basic|easy\s*to\s*use|low[- ]?cost|manual|low[- ]?tech|appropriate\s*tech|minimal\s*training|no\s*special\s*equipment|accessible/;
  const advancedTerms = /ai\b|blockchain|biotech|genetic|genomic|satellite|drone|machine\s*learning|automated|sophisticated|digital\s*platform|software\s*platform|remote\s*sensing|gis\b|iot\b|automation/;

  const hasSimple = simpleTerms.test(text);
  const hasAdvanced = advancedTerms.test(text);

  if (hasAdvanced && !hasSimple) return 'advanced';
  if (hasSimple && !hasAdvanced) return 'simple';
  return 'moderate';
}
