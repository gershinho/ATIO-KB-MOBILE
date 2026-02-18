/**
 * Innovation Hub regions: 15 higher-level groupings of countries for the Explore tab.
 * Each region is clickable and filters innovations by its member countries.
 * Country names must match innovation_countries.country_name in the database.
 */
export const INNOVATION_HUB_REGIONS = [
  {
    id: 'east-africa',
    name: 'East Africa',
    icon: 'earth-outline',
    iconColor: '#16a34a',
    countries: [
      'Kenya', 'Uganda', 'Ethiopia', 'Zimbabwe', 'Rwanda', 'Mozambique', 'Madagascar',
      'United Republic of Tanzania', 'Burundi', 'Somalia', 'South Sudan', 'Eritrea',
      'Djibouti', 'Mauritius', 'Seychelles', 'Comoros', 'Reunion', 'Mayotte',
    ],
  },
  {
    id: 'west-africa',
    name: 'West Africa',
    icon: 'earth-outline',
    iconColor: '#b45309',
    countries: [
      'Nigeria', 'Ghana', 'Mali', 'Senegal', 'Burkina Faso', 'Niger', 'Benin',
      'Sierra Leone', 'Cote d\'Ivoire', 'Liberia', 'Togo', 'Guinea', 'Guinea-Bissau',
      'Gambia', 'Mauritania', 'Sao Tome and Principe', 'Cabo Verde',
    ],
  },
  {
    id: 'southern-africa',
    name: 'Southern Africa',
    icon: 'earth-outline',
    iconColor: '#0284c7',
    countries: [
      'South Africa', 'Zambia', 'Malawi', 'Namibia', 'Lesotho', 'Botswana',
      'Angola', 'Eswatini',
    ],
  },
  {
    id: 'central-africa',
    name: 'Central Africa',
    icon: 'earth-outline',
    iconColor: '#059669',
    countries: [
      'Democratic Republic of the Congo', 'Cameroon', 'Congo', 'Chad', 'Gabon',
      'Central African Republic', 'Equatorial Guinea',
    ],
  },
  {
    id: 'north-africa',
    name: 'North Africa',
    icon: 'earth-outline',
    iconColor: '#0d9488',
    countries: ['Egypt', 'Morocco', 'Sudan', 'Tunisia', 'Algeria', 'Libya'],
  },
  {
    id: 'south-asia',
    name: 'South Asia',
    icon: 'earth-outline',
    iconColor: '#7c3aed',
    countries: [
      'India', 'Bangladesh', 'Nepal', 'Afghanistan', 'Pakistan', 'Sri Lanka',
      'Bhutan', 'Maldives',
    ],
  },
  {
    id: 'east-asia',
    name: 'East Asia',
    icon: 'earth-outline',
    iconColor: '#dc2626',
    countries: [
      'China', 'Japan', 'Republic of Korea', 'Mongolia', 'Hong Kong SAR', 'Macao SAR',
    ],
  },
  {
    id: 'southeast-asia',
    name: 'Southeast Asia',
    icon: 'earth-outline',
    iconColor: '#ea580c',
    countries: [
      'Philippines', 'Indonesia', 'Viet Nam', 'Thailand', 'Cambodia', 'Myanmar',
      'Lao PDR', 'Timor-Leste', 'Malaysia', 'Singapore', 'Brunei Darussalam',
    ],
  },
  {
    id: 'middle-east-central-asia',
    name: 'Middle East & Central Asia',
    icon: 'earth-outline',
    iconColor: '#ca8a04',
    countries: [
      'Tajikistan', 'Iran', 'Uzbekistan', 'Kazakhstan', 'Kyrgyzstan', 'Syrian Arab Republic',
      'Turkiye', 'Jordan', 'Yemen', 'Israel', 'Azerbaijan', 'Iraq', 'Lebanon',
      'Saudi Arabia', 'Turkmenistan', 'United Arab Emirates', 'Georgia', 'Oman',
      'Bahrain', 'Qatar', 'State of Palestine', 'Kuwait', 'Armenia',
    ],
  },
  {
    id: 'north-america',
    name: 'North America',
    icon: 'earth-outline',
    iconColor: '#2563eb',
    countries: ['Mexico', 'United States of America', 'Canada'],
  },
  {
    id: 'central-america-caribbean',
    name: 'Central America & Caribbean',
    icon: 'earth-outline',
    iconColor: '#4f46e5',
    countries: [
      'Guatemala', 'Honduras', 'Nicaragua', 'Costa Rica', 'Dominican Republic',
      'Haiti', 'El Salvador', 'Panama', 'Cuba', 'Jamaica', 'Trinidad and Tobago',
      'Grenada', 'Saint Lucia', 'Belize', 'Saint Vincent and the Grenadines',
      'Dominica', 'Puerto Rico', 'Saint Kitts and Nevis', 'Antigua and Barbuda',
      'Bahamas', 'Barbados',
    ],
  },
  {
    id: 'south-america',
    name: 'South America',
    icon: 'earth-outline',
    iconColor: '#16a34a',
    countries: [
      'Brazil', 'Colombia', 'Argentina', 'Ecuador', 'Peru', 'Chile', 'Paraguay',
      'Bolivia', 'Uruguay', 'Venezuela', 'Suriname', 'Guyana',
    ],
  },
  {
    id: 'western-europe',
    name: 'Western Europe',
    icon: 'earth-outline',
    iconColor: '#475569',
    countries: [
      'France', 'Spain', 'Italy', 'Germany', 'United Kingdom', 'Portugal',
      'Switzerland', 'Netherlands', 'Ireland', 'Austria', 'Belgium', 'Luxembourg',
      'Liechtenstein', 'Andorra', 'Monaco', 'San Marino',
    ],
  },
  {
    id: 'northern-eastern-europe',
    name: 'Northern & Eastern Europe',
    icon: 'earth-outline',
    iconColor: '#64748b',
    countries: [
      'Sweden', 'Poland', 'Greece', 'Russian Federation', 'Denmark', 'Romania',
      'Finland', 'Czechia', 'Hungary', 'Norway', 'Ukraine', 'Bulgaria', 'Estonia',
      'Latvia', 'Lithuania', 'Slovakia', 'Slovenia', 'Croatia', 'Cyprus', 'Serbia',
      'Republic of Moldova', 'Malta', 'Bosnia and Herzegovina', 'Albania', 'Iceland',
      'Belarus', 'Montenegro', 'North Macedonia',
    ],
  },
  {
    id: 'oceania-pacific',
    name: 'Oceania & Pacific',
    icon: 'earth-outline',
    iconColor: '#0ea5e9',
    countries: [
      'Australia', 'New Zealand', 'Papua New Guinea', 'Vanuatu', 'Kiribati',
      'Solomon Islands', 'Tonga', 'Fiji', 'Samoa', 'Marshall Islands', 'Micronesia',
      'Nauru', 'Palau', 'Cook Islands', 'Tuvalu', 'Niue',
    ],
  },
];
