/**
 * Profile field options for EditableInfoCard
 * These match ProfileV1.sol enum values
 */

import type { SelectOption } from '../primitives'

export const GENDER_OPTIONS: SelectOption[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'non-binary', label: 'Non-binary' },
  { value: 'trans-woman', label: 'Trans woman' },
  { value: 'trans-man', label: 'Trans man' },
  { value: 'intersex', label: 'Intersex' },
  { value: 'other', label: 'Other' },
]

export const RELATIONSHIP_OPTIONS: SelectOption[] = [
  { value: 'single', label: 'Single' },
  { value: 'in-relationship', label: 'In a relationship' },
  { value: 'married', label: 'Married' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'separated', label: 'Separated' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'its-complicated', label: "It's complicated" },
]

export const SEXUALITY_OPTIONS: SelectOption[] = [
  { value: 'straight', label: 'Straight' },
  { value: 'gay', label: 'Gay' },
  { value: 'lesbian', label: 'Lesbian' },
  { value: 'bisexual', label: 'Bisexual' },
  { value: 'pansexual', label: 'Pansexual' },
  { value: 'asexual', label: 'Asexual' },
  { value: 'queer', label: 'Queer' },
  { value: 'questioning', label: 'Questioning' },
  { value: 'other', label: 'Other' },
]

export const ETHNICITY_OPTIONS: SelectOption[] = [
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
  { value: 'east-asian', label: 'East Asian' },
  { value: 'south-asian', label: 'South Asian' },
  { value: 'southeast-asian', label: 'Southeast Asian' },
  { value: 'middle-eastern-north-african', label: 'Middle Eastern / North African' },
  { value: 'hispanic-latinao', label: 'Hispanic / Latino/a' },
  { value: 'native-american-indigenous', label: 'Native American / Indigenous' },
  { value: 'pacific-islander', label: 'Pacific Islander' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'other', label: 'Other' },
]

export const DATING_STYLE_OPTIONS: SelectOption[] = [
  { value: 'monogamous', label: 'Monogamous' },
  { value: 'non-monogamous', label: 'Non-monogamous' },
  { value: 'open-relationship', label: 'Open relationship' },
  { value: 'polyamorous', label: 'Polyamorous' },
  { value: 'other', label: 'Other' },
]

export const CHILDREN_OPTIONS: SelectOption[] = [
  { value: 'none', label: 'None' },
  { value: 'has-children', label: 'Has children' },
]

export const WANTS_CHILDREN_OPTIONS: SelectOption[] = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
  { value: 'open-to-it', label: 'Open to it' },
  { value: 'unsure', label: 'Unsure' },
]

export const DRINKING_OPTIONS: SelectOption[] = [
  { value: 'never', label: 'Never' },
  { value: 'rarely', label: 'Rarely' },
  { value: 'socially', label: 'Socially' },
  { value: 'often', label: 'Often' },
]

export const SMOKING_OPTIONS: SelectOption[] = [
  { value: 'no', label: 'No' },
  { value: 'socially', label: 'Socially' },
  { value: 'yes', label: 'Yes' },
  { value: 'vape', label: 'Vape' },
]

export const DRUGS_OPTIONS: SelectOption[] = [
  { value: 'never', label: 'Never' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'often', label: 'Often' },
]

export const RELIGION_OPTIONS: SelectOption[] = [
  { value: 'agnostic', label: 'Agnostic' },
  { value: 'atheist', label: 'Atheist' },
  { value: 'buddhist', label: 'Buddhist' },
  { value: 'christian', label: 'Christian' },
  { value: 'hindu', label: 'Hindu' },
  { value: 'jewish', label: 'Jewish' },
  { value: 'muslim', label: 'Muslim' },
  { value: 'sikh', label: 'Sikh' },
  { value: 'spiritual', label: 'Spiritual' },
  { value: 'other', label: 'Other' },
]

export const PETS_OPTIONS: SelectOption[] = [
  { value: 'no-pets', label: 'No pets' },
  { value: 'has-pets', label: 'Has pets' },
  { value: 'wants-pets', label: 'Wants pets' },
  { value: 'allergic', label: 'Allergic' },
]

export const DIET_OPTIONS: SelectOption[] = [
  { value: 'omnivore', label: 'Omnivore' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'halal', label: 'Halal' },
  { value: 'kosher', label: 'Kosher' },
  { value: 'other', label: 'Other' },
]

export const RELOCATE_OPTIONS: SelectOption[] = [
  { value: 'no', label: "Won't travel" },
  { value: 'maybe', label: 'Might travel' },
  { value: 'yes', label: 'Can travel' },
]

export const DEGREE_OPTIONS: SelectOption[] = [
  { value: 'no-degree', label: 'No degree' },
  { value: 'high-school', label: 'High school' },
  { value: 'associate', label: 'Associate' },
  { value: 'bachelor', label: 'Bachelor' },
  { value: 'master', label: 'Master' },
  { value: 'doctorate', label: 'Doctorate' },
  { value: 'professional', label: 'Professional' },
  { value: 'bootcamp', label: 'Bootcamp' },
  { value: 'other', label: 'Other' },
]

export const FIELD_OPTIONS: SelectOption[] = [
  { value: 'computer-science', label: 'Computer Science' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'math-stats', label: 'Math / Statistics' },
  { value: 'physical-sciences', label: 'Physical Sciences' },
  { value: 'biology', label: 'Biology' },
  { value: 'medicine-health', label: 'Medicine / Health' },
  { value: 'business', label: 'Business' },
  { value: 'economics', label: 'Economics' },
  { value: 'law', label: 'Law' },
  { value: 'social-sciences', label: 'Social Sciences' },
  { value: 'psychology', label: 'Psychology' },
  { value: 'arts-design', label: 'Arts / Design' },
  { value: 'humanities', label: 'Humanities' },
  { value: 'education', label: 'Education' },
  { value: 'communications', label: 'Communications' },
  { value: 'other', label: 'Other' },
]

export const PROFESSION_OPTIONS: SelectOption[] = [
  { value: 'software-engineer', label: 'Software Engineer' },
  { value: 'product', label: 'Product' },
  { value: 'design', label: 'Design' },
  { value: 'data', label: 'Data' },
  { value: 'sales', label: 'Sales' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'operations', label: 'Operations' },
  { value: 'founder', label: 'Founder' },
  { value: 'student', label: 'Student' },
  { value: 'other', label: 'Other' },
]

export const INDUSTRY_OPTIONS: SelectOption[] = [
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'retail', label: 'Retail' },
  { value: 'media', label: 'Media' },
  { value: 'government', label: 'Government' },
  { value: 'nonprofit', label: 'Nonprofit' },
  { value: 'other', label: 'Other' },
]

export const LOOKING_FOR_OPTIONS: SelectOption[] = [
  { value: 'friendship', label: 'Friendship' },
  { value: 'casual', label: 'Casual' },
  { value: 'serious', label: 'Serious' },
  { value: 'long-term', label: 'Long-term' },
  { value: 'marriage', label: 'Marriage' },
  { value: 'not-sure', label: 'Not sure' },
  { value: 'other', label: 'Other' },
]

// ISO 3166-1 alpha-2 nationality codes
export const NATIONALITY_OPTIONS: SelectOption[] = [
  { value: 'AF', label: 'Afghan' },
  { value: 'AL', label: 'Albanian' },
  { value: 'DZ', label: 'Algerian' },
  { value: 'AR', label: 'Argentinian' },
  { value: 'AM', label: 'Armenian' },
  { value: 'AU', label: 'Australian' },
  { value: 'AT', label: 'Austrian' },
  { value: 'AZ', label: 'Azerbaijani' },
  { value: 'BH', label: 'Bahraini' },
  { value: 'BD', label: 'Bangladeshi' },
  { value: 'BY', label: 'Belarusian' },
  { value: 'BE', label: 'Belgian' },
  { value: 'BO', label: 'Bolivian' },
  { value: 'BA', label: 'Bosnian' },
  { value: 'BR', label: 'Brazilian' },
  { value: 'BG', label: 'Bulgarian' },
  { value: 'KH', label: 'Cambodian' },
  { value: 'CM', label: 'Cameroonian' },
  { value: 'CA', label: 'Canadian' },
  { value: 'CL', label: 'Chilean' },
  { value: 'CN', label: 'Chinese' },
  { value: 'CO', label: 'Colombian' },
  { value: 'CR', label: 'Costa Rican' },
  { value: 'HR', label: 'Croatian' },
  { value: 'CU', label: 'Cuban' },
  { value: 'CY', label: 'Cypriot' },
  { value: 'CZ', label: 'Czech' },
  { value: 'DK', label: 'Danish' },
  { value: 'DO', label: 'Dominican' },
  { value: 'EC', label: 'Ecuadorian' },
  { value: 'EG', label: 'Egyptian' },
  { value: 'SV', label: 'Salvadoran' },
  { value: 'EE', label: 'Estonian' },
  { value: 'ET', label: 'Ethiopian' },
  { value: 'FI', label: 'Finnish' },
  { value: 'FR', label: 'French' },
  { value: 'GE', label: 'Georgian' },
  { value: 'DE', label: 'German' },
  { value: 'GH', label: 'Ghanaian' },
  { value: 'GR', label: 'Greek' },
  { value: 'GT', label: 'Guatemalan' },
  { value: 'HT', label: 'Haitian' },
  { value: 'HN', label: 'Honduran' },
  { value: 'HK', label: 'Hong Konger' },
  { value: 'HU', label: 'Hungarian' },
  { value: 'IS', label: 'Icelandic' },
  { value: 'IN', label: 'Indian' },
  { value: 'ID', label: 'Indonesian' },
  { value: 'IR', label: 'Iranian' },
  { value: 'IQ', label: 'Iraqi' },
  { value: 'IE', label: 'Irish' },
  { value: 'IL', label: 'Israeli' },
  { value: 'IT', label: 'Italian' },
  { value: 'JM', label: 'Jamaican' },
  { value: 'JP', label: 'Japanese' },
  { value: 'JO', label: 'Jordanian' },
  { value: 'KZ', label: 'Kazakhstani' },
  { value: 'KE', label: 'Kenyan' },
  { value: 'KW', label: 'Kuwaiti' },
  { value: 'KG', label: 'Kyrgyzstani' },
  { value: 'LV', label: 'Latvian' },
  { value: 'LB', label: 'Lebanese' },
  { value: 'LY', label: 'Libyan' },
  { value: 'LT', label: 'Lithuanian' },
  { value: 'LU', label: 'Luxembourger' },
  { value: 'MY', label: 'Malaysian' },
  { value: 'MX', label: 'Mexican' },
  { value: 'MD', label: 'Moldovan' },
  { value: 'MN', label: 'Mongolian' },
  { value: 'ME', label: 'Montenegrin' },
  { value: 'MA', label: 'Moroccan' },
  { value: 'NP', label: 'Nepalese' },
  { value: 'NL', label: 'Dutch' },
  { value: 'NZ', label: 'New Zealander' },
  { value: 'NI', label: 'Nicaraguan' },
  { value: 'NG', label: 'Nigerian' },
  { value: 'NO', label: 'Norwegian' },
  { value: 'OM', label: 'Omani' },
  { value: 'PK', label: 'Pakistani' },
  { value: 'PA', label: 'Panamanian' },
  { value: 'PY', label: 'Paraguayan' },
  { value: 'PE', label: 'Peruvian' },
  { value: 'PH', label: 'Filipino' },
  { value: 'PL', label: 'Polish' },
  { value: 'PT', label: 'Portuguese' },
  { value: 'PR', label: 'Puerto Rican' },
  { value: 'QA', label: 'Qatari' },
  { value: 'RO', label: 'Romanian' },
  { value: 'RU', label: 'Russian' },
  { value: 'SA', label: 'Saudi Arabian' },
  { value: 'RS', label: 'Serbian' },
  { value: 'SG', label: 'Singaporean' },
  { value: 'SK', label: 'Slovak' },
  { value: 'SI', label: 'Slovenian' },
  { value: 'ZA', label: 'South African' },
  { value: 'KR', label: 'South Korean' },
  { value: 'ES', label: 'Spanish' },
  { value: 'LK', label: 'Sri Lankan' },
  { value: 'SE', label: 'Swedish' },
  { value: 'CH', label: 'Swiss' },
  { value: 'SY', label: 'Syrian' },
  { value: 'TW', label: 'Taiwanese' },
  { value: 'TJ', label: 'Tajikistani' },
  { value: 'TZ', label: 'Tanzanian' },
  { value: 'TH', label: 'Thai' },
  { value: 'TN', label: 'Tunisian' },
  { value: 'TR', label: 'Turkish' },
  { value: 'TM', label: 'Turkmen' },
  { value: 'UG', label: 'Ugandan' },
  { value: 'UA', label: 'Ukrainian' },
  { value: 'AE', label: 'Emirati' },
  { value: 'GB', label: 'British' },
  { value: 'US', label: 'American' },
  { value: 'UY', label: 'Uruguayan' },
  { value: 'UZ', label: 'Uzbekistani' },
  { value: 'VE', label: 'Venezuelan' },
  { value: 'VN', label: 'Vietnamese' },
  { value: 'YE', label: 'Yemeni' },
  { value: 'ZM', label: 'Zambian' },
  { value: 'ZW', label: 'Zimbabwean' },
]

// ISO 639-1 language codes
export const LANGUAGE_OPTIONS: SelectOption[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Mandarin Chinese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'bn', label: 'Bengali' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'jv', label: 'Javanese' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'tr', label: 'Turkish' },
  { value: 'pl', label: 'Polish' },
  { value: 'nl', label: 'Dutch' },
  { value: 'sv', label: 'Swedish' },
]

// Extended language list for multi-select learning languages
export const LEARNING_LANGUAGE_OPTIONS: SelectOption[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Mandarin Chinese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'bn', label: 'Bengali' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'jv', label: 'Javanese' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'tr', label: 'Turkish' },
  { value: 'pl', label: 'Polish' },
  { value: 'nl', label: 'Dutch' },
  { value: 'sv', label: 'Swedish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'da', label: 'Danish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'cs', label: 'Czech' },
  { value: 'el', label: 'Greek' },
  { value: 'he', label: 'Hebrew' },
  { value: 'th', label: 'Thai' },
  { value: 'id', label: 'Indonesian' },
  { value: 'ms', label: 'Malay' },
  { value: 'tl', label: 'Tagalog' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'ro', label: 'Romanian' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'fa', label: 'Persian (Farsi)' },
  { value: 'ur', label: 'Urdu' },
  { value: 'sw', label: 'Swahili' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'ca', label: 'Catalan' },
]

/**
 * ISO 3166-1 alpha-3 → alpha-2 mapping.
 * Used to convert Self.xyz passport nationality (alpha-3) to profile system (alpha-2).
 * Only includes countries present in NATIONALITY_OPTIONS.
 */
export const ALPHA3_TO_ALPHA2: Record<string, string> = {
  AFG: 'AF', ALB: 'AL', DZA: 'DZ', ARG: 'AR', ARM: 'AM',
  AUS: 'AU', AUT: 'AT', AZE: 'AZ', BHR: 'BH', BGD: 'BD',
  BLR: 'BY', BEL: 'BE', BOL: 'BO', BIH: 'BA', BRA: 'BR',
  BGR: 'BG', KHM: 'KH', CMR: 'CM', CAN: 'CA', CHL: 'CL',
  CHN: 'CN', COL: 'CO', CRI: 'CR', HRV: 'HR', CUB: 'CU',
  CYP: 'CY', CZE: 'CZ', DNK: 'DK', DOM: 'DO', ECU: 'EC',
  EGY: 'EG', SLV: 'SV', EST: 'EE', ETH: 'ET', FIN: 'FI',
  FRA: 'FR', GEO: 'GE', DEU: 'DE', GHA: 'GH', GRC: 'GR',
  GTM: 'GT', HTI: 'HT', HND: 'HN', HKG: 'HK', HUN: 'HU',
  ISL: 'IS', IND: 'IN', IDN: 'ID', IRN: 'IR', IRQ: 'IQ',
  IRL: 'IE', ISR: 'IL', ITA: 'IT', JAM: 'JM', JPN: 'JP',
  JOR: 'JO', KAZ: 'KZ', KEN: 'KE', KWT: 'KW', KGZ: 'KG',
  LVA: 'LV', LBN: 'LB', LBY: 'LY', LTU: 'LT', LUX: 'LU',
  MYS: 'MY', MEX: 'MX', MDA: 'MD', MNG: 'MN', MNE: 'ME',
  MAR: 'MA', NPL: 'NP', NLD: 'NL', NZL: 'NZ', NIC: 'NI',
  NGA: 'NG', NOR: 'NO', OMN: 'OM', PAK: 'PK', PAN: 'PA',
  PRY: 'PY', PER: 'PE', PHL: 'PH', POL: 'PL', PRT: 'PT',
  PRI: 'PR', QAT: 'QA', ROU: 'RO', RUS: 'RU', SAU: 'SA',
  SRB: 'RS', SGP: 'SG', SVK: 'SK', SVN: 'SI', ZAF: 'ZA',
  KOR: 'KR', ESP: 'ES', LKA: 'LK', SWE: 'SE', CHE: 'CH',
  SYR: 'SY', TWN: 'TW', TJK: 'TJ', TZA: 'TZ', THA: 'TH',
  TUN: 'TN', TUR: 'TR', TKM: 'TM', UGA: 'UG', UKR: 'UA',
  ARE: 'AE', GBR: 'GB', USA: 'US', URY: 'UY', UZB: 'UZ',
  VEN: 'VE', VNM: 'VN', YEM: 'YE', ZMB: 'ZM', ZWE: 'ZW',
}

/** Convert an alpha-3 nationality code to alpha-2. Returns undefined if unknown. */
export function alpha3ToAlpha2(alpha3: string): string | undefined {
  return ALPHA3_TO_ALPHA2[alpha3.toUpperCase()]
}
