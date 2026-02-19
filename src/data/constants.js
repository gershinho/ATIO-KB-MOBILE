/**
 * Taxonomy and reference data only (labels, filter options, SDG metadata).
 * Actual innovation records come from the database; this file has no innovation content.
 * Icon names are Ionicons (from @expo/vector-icons).
 */
// Challenge use-case groups (12 groups mapped from 107 use cases). iconColor for Explore UI.
// subTerms: { label, keyword } for drill-down filter; keyword matches innovation_use_cases.term_name.
export const CHALLENGES = [
  {
    id: 'crops', name: 'Crops & Production', icon: 'leaf-outline', iconColor: '#16a34a',
    keywords: ['crop production', 'animal production', 'Production'],
    subTerms: [
      { label: 'Crop production', keyword: 'crop production' },
      { label: 'Field management', keyword: 'field management' },
      { label: 'Resource optimization', keyword: 'optimization of resource use for better production' },
      { label: 'Precision agriculture', keyword: 'precision seeding and fertilization for better production' },
      { label: 'Improved varieties', keyword: 'improved plant varieties' },
      { label: 'Crop monitoring', keyword: 'crop monitoring' },
      { label: 'Plant health', keyword: 'plant health' },
      { label: 'Pesticide reduction', keyword: 'minimize pesticide use' },
      { label: 'Planting & harvest planning', keyword: 'forecasting, planning of planting and harvesting' },
      { label: 'Production (general)', keyword: 'Production' },
      { label: 'Farm management (general)', keyword: 'Farm management' },
    ],
  },
  {
    id: 'livestock', name: 'Livestock & Fisheries', icon: 'paw-outline', iconColor: '#b45309',
    keywords: ['animal production', 'fishery', 'aquaculture', 'livestock'],
    subTerms: [
      { label: 'Animal production', keyword: 'animal production' },
      { label: 'Animal health', keyword: 'animal health' },
      { label: 'Livestock monitoring', keyword: 'livestock monitoring' },
      { label: 'Pastoralist production', keyword: "pastoralists' animal production" },
      { label: 'Improved breeds', keyword: 'improved animal breeds' },
      { label: 'Fisheries management', keyword: 'fisheries products management' },
      { label: 'Aquaponics', keyword: 'aquaponics management' },
    ],
  },
  {
    id: 'water', name: 'Water & Irrigation', icon: 'water-outline', iconColor: '#0284c7',
    keywords: ['water', 'irrigation', 'Water harvesting'],
    subTerms: [
      { label: 'Water optimization', keyword: 'water use optimization for sustainability' },
    ],
  },
  {
    id: 'soil', name: 'Soil & Land', icon: 'earth-outline', iconColor: '#92400e',
    keywords: ['soil', 'land', 'erosion', 'conservation'],
    subTerms: [
      { label: 'Soil management', keyword: 'improving soil management practices' },
      { label: 'Carbon sequestration', keyword: 'soil carbon sequestration monitoring' },
      { label: 'Biodiversity & conservation', keyword: 'biodiversity preservation, agroecology, conservation ag' },
      { label: 'Biodiversity mapping', keyword: 'biodiversity mapping to inform land use planning' },
      { label: 'Forestry management', keyword: 'forestry management' },
      { label: 'Forest products', keyword: 'forest products and logging management' },
      { label: 'Natural resource management', keyword: 'Natural resources management' },
    ],
  },
  {
    id: 'climate', name: 'Climate & Environment', icon: 'thermometer-outline', iconColor: '#0d9488',
    keywords: ['climate', 'environment', 'carbon', 'weather'],
    subTerms: [
      { label: 'Climate adaptation', keyword: 'climate change adaptation' },
      { label: 'Climate mitigation', keyword: 'climate change mitigation' },
      { label: 'Disaster management', keyword: 'disaster management' },
      { label: 'Energy & environment', keyword: 'reduction of energy consumption' },
      { label: 'Carbon credits', keyword: 'carbon credit management' },
    ],
  },
  {
    id: 'finance', name: 'Finance & Insurance', icon: 'cash-outline', iconColor: '#059669',
    keywords: ['finance', 'loan', 'insurance', 'banking', 'financial', 'payment'],
    subTerms: [
      { label: 'Access to finance', keyword: 'Access to finance' },
      { label: 'Loans for inputs/equipment', keyword: 'easier access to loans' },
      { label: 'Mobile transactions & savings', keyword: 'remote financial transactions' },
      { label: 'Farmer economic identity', keyword: "farmers' economic identity" },
      { label: 'Evidence-based credit', keyword: 'evidence-based credit' },
      { label: 'Raising capital', keyword: 'raising capital' },
      { label: 'Risk protection', keyword: 'protection against risks' },
      { label: 'Index-based insurance', keyword: 'index-based insurance' },
      { label: 'Income increase', keyword: 'income increase' },
      { label: 'Economic optimization', keyword: 'optimization of resource use for economic' },
      { label: 'Anticipatory cash transfers', keyword: 'Anticipatory Cash Transfers' },
    ],
  },
  {
    id: 'markets', name: 'Markets & Trade', icon: 'stats-chart-outline', iconColor: '#7c3aed',
    keywords: ['market', 'trade', 'price', 'supply chain', 'distribution'],
    subTerms: [
      { label: 'Access to markets', keyword: 'Access to markets' },
      { label: 'Output price info', keyword: 'access to price information (output)' },
      { label: 'Input price info', keyword: 'access to price information (input)' },
      { label: 'Virtual marketplaces', keyword: 'access to virtual marketplaces' },
      { label: 'Physical marketplaces', keyword: 'access to physical marketplaces' },
      { label: 'Direct sales', keyword: 'direct sale to consumers' },
      { label: 'Farm-to-fork', keyword: 'disintermediation' },
      { label: 'Input trading', keyword: 'trading between input suppliers' },
      { label: 'Market forecasting', keyword: 'market forecasting' },
      { label: 'Collective selling', keyword: 'collective selling' },
    ],
  },
  {
    id: 'postharvest', name: 'Post-Harvest & Supply', icon: 'cube-outline', iconColor: '#475569',
    keywords: ['post-harvest', 'storage', 'processing', 'food processing'],
    subTerms: [
      { label: 'Supply chain', keyword: 'Supply chain management' },
      { label: 'Post-harvest handling', keyword: 'post-harvest handling' },
      { label: 'Food processing', keyword: 'food processing' },
      { label: 'Logistics optimization', keyword: 'logistics optimization' },
      { label: 'Cold chain monitoring', keyword: 'cold chain monitoring' },
      { label: 'Inventory management', keyword: 'inventory management' },
      { label: 'Traceability', keyword: 'traceability' },
      { label: 'Product authenticity', keyword: 'verification of product authenticity' },
      { label: 'Smart packaging', keyword: 'smart packaging' },
      { label: 'Food quality & safety', keyword: 'Food quality and safety' },
      { label: 'Food safety compliance', keyword: 'food safety compliance' },
      { label: 'Certification schemes', keyword: 'certification schemes' },
      { label: 'Compliance tracking', keyword: 'compliance tracking' },
    ],
  },
  {
    id: 'knowledge', name: 'Knowledge & Advisory', icon: 'book-outline', iconColor: '#4f46e5',
    keywords: ['knowledge', 'advisory', 'extension', 'training', 'skills'],
    subTerms: [
      { label: 'Knowledge & advisory', keyword: 'Access to knowledge and advisory' },
      { label: 'Agricultural advice', keyword: 'access to agricultural advice' },
      { label: 'Skills development', keyword: 'agricultural skills development' },
      { label: 'Farmer profiling', keyword: 'farmer profiling' },
      { label: 'Connectivity access', keyword: 'access to connectivity' },
      { label: 'Record-keeping', keyword: 'record-keeping and accounting' },
      { label: 'Equipment management', keyword: 'equipment management' },
    ],
  },
  {
    id: 'business', name: 'Business & Cooperation', icon: 'people-outline', iconColor: '#2563eb',
    keywords: ['cooperative', 'business', 'enterprise', 'organization'],
    subTerms: [
      { label: 'Business models', keyword: 'Business models support' },
      { label: 'Innovative business models', keyword: 'innovative business models' },
      { label: 'Collective action', keyword: 'Collective action and aggregation' },
      { label: 'Cooperative management', keyword: 'cooperative management' },
      { label: 'Shared economy', keyword: 'shared economy' },
      { label: 'Group purchasing', keyword: 'group purchasing' },
      { label: 'Data value chain', keyword: 'data value chain' },
      { label: 'Data cooperatives', keyword: 'data cooperatives' },
      { label: 'Business negotiation', keyword: 'negotiation of business models' },
    ],
  },
  {
    id: 'governance', name: 'Governance & Policy', icon: 'business-outline', iconColor: '#334155',
    keywords: ['governance', 'policy', 'regulation', 'legislation'],
    subTerms: [
      { label: 'Governance & policy', keyword: 'Governance, policy support' },
      { label: 'Policy insights', keyword: 'provision of insights for policy' },
      { label: 'Policy simulation', keyword: 'policy simulation' },
      { label: 'SDG monitoring', keyword: 'SDG monitoring' },
      { label: 'Impact assessment', keyword: 'impact assessment' },
      { label: 'Open data support', keyword: 'open data support' },
      { label: 'Subsidy management', keyword: 'subsidies' },
      { label: 'Incentive schemes', keyword: 'incentives schemes' },
      { label: 'Ethical practices', keyword: 'ethical practices' },
      { label: "Indigenous rights", keyword: "indigenous peoples' rights" },
      { label: 'Social responsibility', keyword: 'social responsibility' },
      { label: 'Data ethics', keyword: 'data sharing' },
      { label: 'Taxation', keyword: 'taxation' },
    ],
  },
  {
    id: 'nutrition', name: 'Nutrition & Alt. Food', icon: 'nutrition-outline', iconColor: '#ea580c',
    keywords: ['nutrition', 'food security', 'consumption', 'diet'],
    subTerms: [
      { label: 'Nutrition support', keyword: 'consumption and nutrition' },
      { label: 'Distribution support', keyword: 'support to distribution' },
      { label: 'Alternative food', keyword: 'Alternative food production' },
      { label: 'Alternative proteins', keyword: 'alternative protein' },
      { label: 'Urban/vertical farming', keyword: 'production of food in limited spaces' },
      { label: 'Food fortification', keyword: 'food fortification' },
      { label: 'Cellular agriculture', keyword: 'cellular agriculture' },
      { label: 'School feeding', keyword: 'school feeding' },
      { label: 'Rapid testing', keyword: 'rapid testing' },
    ],
  },
];

// Innovation type groups (10 groups mapped from 179 types). iconColor for Explore UI.
// subTerms: { label, keyword } for drill-down filter; keyword matches innovation_types.term_name.
export const TYPES = [
  {
    id: 'nature', name: 'Nature-based', icon: 'leaf-outline', iconColor: '#16a34a',
    keywords: ['Nature-based', 'Biological control', 'Agroforestry', 'Organic'],
    subTerms: [
      { label: 'Nature-based solutions', keyword: 'Nature-based solutions' },
      { label: 'Conservation practices', keyword: 'Conservation practices' },
      { label: 'Drought-resistant techniques', keyword: 'Drought-resistant techniques' },
      { label: 'Living barriers', keyword: 'Living barriers' },
      { label: 'Species diversification', keyword: 'Species diversification' },
      { label: 'Biologicals', keyword: 'Biologicals' },
      { label: 'Biofertilizers & biopesticides', keyword: 'Biofertilizers and biopesticides' },
      { label: 'Native species utilization', keyword: 'Native species utilization' },
      { label: 'Pollinator-friendly practices', keyword: 'Pollinator-friendly practices' },
      { label: 'Bioremediation', keyword: 'Bioremediation and phytoremediation' },
      { label: 'Constructed wetlands', keyword: 'Constructed wetlands' },
      { label: 'Ecological corridors', keyword: 'Ecological corridors' },
    ],
  },
  {
    id: 'digital', name: 'Digital & ICT', icon: 'phone-portrait-outline', iconColor: '#2563eb',
    keywords: ['Digital', 'ICT', 'Mobile', 'SMS', 'E-', 'Platform', 'Software', 'App'],
    subTerms: [
      { label: 'Digital technologies', keyword: 'Digital technologies' },
      { label: 'Mobile app', keyword: 'Mobile app' },
      { label: 'Website / web app', keyword: 'Website' },
      { label: 'E-commerce / marketplace', keyword: 'E-commerce/online marketplace' },
      { label: 'Cloud', keyword: 'Cloud' },
      { label: 'AI', keyword: 'Artificial intelligence (AI)' },
      { label: 'Sensor', keyword: 'Sensor' },
      { label: 'IoT', keyword: 'Internet of Things (IoT)' },
      { label: 'Remote sensing', keyword: 'Remote sensing' },
      { label: 'Machine learning', keyword: 'Machine learning' },
      { label: 'Geospatial', keyword: 'Geospatial technologies' },
      { label: 'Big data', keyword: 'Big data' },
      { label: 'SMS', keyword: 'SMS' },
      { label: 'Satellite imagery', keyword: 'Realtime satellite imagery' },
      { label: 'GPS / GIS', keyword: 'GPS' },
      { label: 'Drone', keyword: 'Drone' },
      { label: 'Blockchain', keyword: 'Blockchain' },
      { label: 'Digital twins', keyword: 'Digital twins' },
    ],
  },
  {
    id: 'mechanical', name: 'Mechanization', icon: 'construct-outline', iconColor: '#d97706',
    keywords: ['Mechanization', 'Mechanical', 'Equipment', 'Tool', 'Machine'],
    subTerms: [
      { label: 'Mechanization', keyword: 'Mechanization' },
      { label: 'Ground preparation machinery', keyword: 'Ground preparation and management machinery' },
      { label: 'Harvesting & processing equipment', keyword: 'Harvesting and processing equipment' },
      { label: 'Manufacturing technologies', keyword: 'Manufacturing technologies' },
      { label: 'Vehicles & machinery', keyword: 'Vehicles and machinery' },
      { label: 'Animal management machinery', keyword: 'Animal management machinery' },
      { label: 'Robotics & automation', keyword: 'Robotics' },
      { label: 'Solar-powered farming', keyword: 'Solar-powered farming systems' },
      { label: 'Renewable energy', keyword: 'Renewable energy' },
      { label: 'Advanced food processing', keyword: 'Advanced food processing techniques' },
      { label: 'Novel preservation', keyword: 'Novel preservation methods' },
      { label: 'Sustainable packaging', keyword: 'Sustainable packaging solutions' },
    ],
  },
  {
    id: 'biotech', name: 'Biotechnology', icon: 'flask-outline', iconColor: '#7c3aed',
    keywords: ['Biotech', 'Genetic', 'Genomic', 'Breeding', 'Tissue culture'],
    subTerms: [
      { label: 'Biotechnologies', keyword: 'Biotechnologies' },
      { label: 'Selective breeding', keyword: 'Selective breeding practices' },
      { label: 'Genetic engineering / CRISPR', keyword: 'Genetic engineering and gene editing' },
      { label: 'Participatory plant breeding', keyword: 'Participatory plant breeding' },
      { label: 'Environmental biotech', keyword: 'Environmental biotechnology' },
      { label: 'Heat-tolerant varieties', keyword: 'Heat-tolerant varieties' },
      { label: 'Synthetic biology', keyword: 'Synthetic biology' },
    ],
  },
  {
    id: 'financial', name: 'Financial', icon: 'cash-outline', iconColor: '#059669',
    keywords: ['Financial', 'Fintech', 'Banking', 'Insurance', 'Credit'],
    subTerms: [
      { label: 'Financial', keyword: 'Financial' },
      { label: 'Fintech solutions', keyword: 'Fintech solutions' },
      { label: 'Mobile banking', keyword: 'Mobile banking for farmers' },
      { label: 'E-payment', keyword: 'E-payment' },
      { label: 'Microcredit', keyword: 'Microcredit' },
      { label: 'Agricultural microfinance', keyword: 'Agricultural microfinance' },
      { label: 'Innovative insurance', keyword: 'Innovative insurance products' },
      { label: 'Index-based crop insurance', keyword: 'Index-based crop insurance' },
      { label: 'Crowdfunding', keyword: 'Crowdfunding platforms for agriculture' },
      { label: 'Carbon credits', keyword: 'Carbon credits' },
      { label: 'Parametric insurance', keyword: 'Parametric insurance for agriculture' },
    ],
  },
  {
    id: 'social', name: 'Social & Community', icon: 'people-outline', iconColor: '#dc2626',
    keywords: ['Social', 'Community', 'Institutional', 'Capacity', 'Partnership'],
    subTerms: [
      { label: 'Social & socio-economic', keyword: 'Social and socio-economic' },
      { label: 'Community engagement', keyword: 'Community engagement' },
      { label: 'Partnerships', keyword: 'Partnerships' },
      { label: 'Capacity development', keyword: 'Capacity development function' },
      { label: 'Cooperative models', keyword: 'Cooperative models and aggregation' },
      { label: 'Farmer field schools', keyword: 'Farmer field schools' },
      { label: 'Farmer producer organizations', keyword: 'Farmer producer organizations' },
      { label: 'Multi-stakeholder platforms', keyword: 'Multi-stakeholder platforms' },
      { label: 'Public-private partnerships', keyword: 'Public-private partnerships' },
      { label: 'Inclusive decision-making', keyword: 'Inclusive decision-making processes' },
      { label: 'Grassroots solution networks', keyword: 'Grassroots innovation networks' },
      { label: 'Community-supported agriculture', keyword: 'Community-supported agriculture' },
    ],
  },
  {
    id: 'policy', name: 'Policy & Governance', icon: 'document-text-outline', iconColor: '#475569',
    keywords: ['Policy', 'Governance', 'Regulatory', 'Legal'],
    subTerms: [
      { label: 'Institutional', keyword: 'Institutional' },
      { label: 'Governance', keyword: 'Governance function' },
      { label: 'Policy', keyword: 'Policy' },
      { label: 'Inclusion & equity policies', keyword: 'Inclusion and Equity-Oriented Policies' },
      { label: 'Transparency policies', keyword: 'Transparency and Information-Enabling Policies' },
      { label: 'Cross-sectoral policy', keyword: 'Cross-sectoral and Collaborative Policy Approaches' },
      { label: 'Policy co-creation', keyword: 'Policy co-creation mechanisms' },
      { label: 'Social responsibility', keyword: 'Social responsibility schemes' },
      { label: 'Adaptive governance', keyword: 'Adaptive governance frameworks' },
    ],
  },
  {
    id: 'traditional', name: 'Traditional & Indigenous', icon: 'archive-outline', iconColor: '#b45309',
    keywords: ['Traditional', 'Indigenous', 'Local knowledge'],
    subTerms: [
      { label: 'Traditional & indigenous practices', keyword: 'Traditional and indigenous practices' },
      { label: 'Traditional + scientific knowledge', keyword: 'Integration of traditional and scientific knowledge' },
      { label: 'Local environmental prediction', keyword: 'Local environmental prediction techniques' },
    ],
  },
  {
    id: 'research', name: 'Research & Education', icon: 'school-outline', iconColor: '#4f46e5',
    keywords: ['Research', 'Education', 'Training', 'Academic'],
    subTerms: [
      { label: 'Knowledge management', keyword: 'Knowledge management function' },
      { label: 'Research & education', keyword: 'Research and education function' },
      { label: 'Knowledge sharing initiatives', keyword: 'Knowledge management and data sharing initiatives' },
      { label: 'Vocational training centers', keyword: 'Agricultural vocational training centers' },
      { label: 'Citizen science', keyword: 'Citizen science in agriculture' },
      { label: 'R&D collaborations', keyword: 'Research and development collaborations' },
      { label: 'Farmer business schools', keyword: 'Farmer business schools' },
    ],
  },
  {
    id: 'frugal', name: 'Frugal & Low-cost', icon: 'bulb-outline', iconColor: '#ca8a04',
    keywords: ['Frugal', 'Low-cost', 'Affordable', 'Appropriate'],
    subTerms: [
      { label: 'Frugal solution', keyword: 'Frugal innovation' },
      { label: 'Low-cost farming tools', keyword: 'Low-cost farming tools and techniques' },
      { label: 'Appropriate technology', keyword: 'Appropriate technology promotion' },
      { label: 'Shared economy models', keyword: 'Shared economy models in agriculture' },
    ],
  },
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
  { level: 1, name: 'Idea / Hypothesis', description: 'Formulated idea or hypothesis for a solution.' },
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
  { level: 4, name: 'Solution Network (Rare)', description: 'Used by some connected organizations outside project.' },
  { level: 5, name: 'Solution Network (Common)', description: 'Commonly used by connected organizations.' },
  { level: 6, name: 'Solution System (Rare)', description: 'Used by some in similar geographies/sectors.' },
  { level: 7, name: 'Solution System (Common)', description: 'Commonly used in similar geographies/sectors.' },
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
  { number: 9, name: 'Industry & Innovation', color: '#FD6925', description: 'Build resilient infrastructure and foster solutions.' },
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
