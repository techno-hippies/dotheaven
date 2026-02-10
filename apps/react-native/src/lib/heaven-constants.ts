export const MEGA_RPC = 'https://carrot.megaeth.com/rpc';
export const IPFS_GATEWAY = 'https://heaven.myfilebase.com/ipfs/';
export const PROFILES_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-profiles/1.0.0/gn';

export const REGISTRY_V1 = '0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2' as const;
export const RECORDS_V1 = '0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3' as const;
export const PROFILE_V2 = '0xa31545D33f6d656E62De67fd020A26608d4601E5' as const;
export const FOLLOW_V1 = '0x3F32cF9e70EF69DFFed74Dfe07034cb03cF726cb' as const;
export const HEAVEN_NODE =
  '0x8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27' as const;

export const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

const NUM_TO_GENDER: Record<number, string> = {
  1: 'woman',
  2: 'man',
  3: 'non-binary',
  4: 'trans-woman',
  5: 'trans-man',
  6: 'intersex',
  7: 'other',
};

const GENDER_ABBR: Record<string, string> = {
  man: 'M',
  woman: 'F',
  'non-binary': 'NB',
  'trans-woman': 'TW',
  'trans-man': 'TM',
  intersex: 'IX',
  other: 'O',
};

export function toGenderAbbr(genderNum: number): string | undefined {
  const genderKey = NUM_TO_GENDER[genderNum] ?? '';
  return GENDER_ABBR[genderKey];
}

export function bytes2ToCode(hex: string): string | undefined {
  if (!hex || hex === '0x0000') return undefined;
  const n = parseInt(hex, 16);
  if (!n) return undefined;
  const c1 = String.fromCharCode((n >> 8) & 0xff);
  const c2 = String.fromCharCode(n & 0xff);
  return (c1 + c2).toUpperCase();
}

export function resolveIpfsOrHttpUri(uri: string): string | undefined {
  if (!uri) return undefined;
  if (uri.startsWith('ipfs://')) return `${IPFS_GATEWAY}${uri.slice(7)}`;
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  return undefined;
}

// ── Enum display labels (number → human-readable) ────────────────

export const NUM_TO_GENDER_LABEL: Record<number, string> = {
  1: 'Woman', 2: 'Man', 3: 'Non-binary', 4: 'Trans woman',
  5: 'Trans man', 6: 'Intersex', 7: 'Other',
};

export const NUM_TO_RELOCATE: Record<number, string> = {
  1: "Won't travel", 2: 'Might travel', 3: 'Can travel',
};

export const NUM_TO_DEGREE: Record<number, string> = {
  1: 'No degree', 2: 'High school', 3: 'Associate', 4: 'Bachelor',
  5: 'Master', 6: 'Doctorate', 7: 'Professional', 8: 'Bootcamp', 9: 'Other',
};

export const NUM_TO_FIELD: Record<number, string> = {
  1: 'Computer Science', 2: 'Engineering', 3: 'Math / Statistics',
  4: 'Physical Sciences', 5: 'Biology', 6: 'Medicine / Health',
  7: 'Business', 8: 'Economics', 9: 'Law', 10: 'Social Sciences',
  11: 'Psychology', 12: 'Arts / Design', 13: 'Humanities',
  14: 'Education', 15: 'Communications', 16: 'Other',
};

export const NUM_TO_PROFESSION: Record<number, string> = {
  1: 'Software Engineer', 2: 'Product', 3: 'Design', 4: 'Data',
  5: 'Sales', 6: 'Marketing', 7: 'Operations', 8: 'Founder',
  9: 'Student', 10: 'Other',
};

export const NUM_TO_INDUSTRY: Record<number, string> = {
  1: 'Technology', 2: 'Finance', 3: 'Healthcare', 4: 'Education',
  5: 'Manufacturing', 6: 'Retail', 7: 'Media', 8: 'Government',
  9: 'Nonprofit', 10: 'Other',
};

export const NUM_TO_RELATIONSHIP: Record<number, string> = {
  1: 'Single', 2: 'In a relationship', 3: 'Married', 4: 'Divorced',
  5: 'Separated', 6: 'Widowed', 7: "It's complicated",
};

export const NUM_TO_SEXUALITY: Record<number, string> = {
  1: 'Straight', 2: 'Gay', 3: 'Lesbian', 4: 'Bisexual',
  5: 'Pansexual', 6: 'Asexual', 7: 'Queer', 8: 'Questioning', 9: 'Other',
};

export const NUM_TO_ETHNICITY: Record<number, string> = {
  1: 'White', 2: 'Black', 3: 'East Asian', 4: 'South Asian',
  5: 'Southeast Asian', 6: 'Middle Eastern / North African',
  7: 'Hispanic / Latino/a', 8: 'Native American / Indigenous',
  9: 'Pacific Islander', 10: 'Mixed', 11: 'Other',
};

export const NUM_TO_DATING_STYLE: Record<number, string> = {
  1: 'Monogamous', 2: 'Non-monogamous', 3: 'Open relationship',
  4: 'Polyamorous', 5: 'Other',
};

export const NUM_TO_CHILDREN: Record<number, string> = {
  1: 'None', 2: 'Has children',
};

export const NUM_TO_WANTS_CHILDREN: Record<number, string> = {
  1: 'No', 2: 'Yes', 3: 'Open to it', 4: 'Unsure',
};

export const NUM_TO_DRINKING: Record<number, string> = {
  1: 'Never', 2: 'Rarely', 3: 'Socially', 4: 'Often',
};

export const NUM_TO_SMOKING: Record<number, string> = {
  1: 'No', 2: 'Socially', 3: 'Yes', 4: 'Vape',
};

export const NUM_TO_DRUGS: Record<number, string> = {
  1: 'Never', 2: 'Sometimes', 3: 'Often',
};

export const NUM_TO_LOOKING_FOR: Record<number, string> = {
  1: 'Friendship', 2: 'Casual', 3: 'Serious', 4: 'Long-term',
  5: 'Marriage', 6: 'Not sure', 7: 'Other',
};

export const NUM_TO_RELIGION: Record<number, string> = {
  1: 'Agnostic', 2: 'Atheist', 3: 'Buddhist', 4: 'Christian',
  5: 'Hindu', 6: 'Jewish', 7: 'Muslim', 8: 'Sikh',
  9: 'Spiritual', 10: 'Other',
};

export const NUM_TO_PETS: Record<number, string> = {
  1: 'No pets', 2: 'Has pets', 3: 'Wants pets', 4: 'Allergic',
};

export const NUM_TO_DIET: Record<number, string> = {
  1: 'Omnivore', 2: 'Vegetarian', 3: 'Vegan', 4: 'Pescatarian',
  5: 'Halal', 6: 'Kosher', 7: 'Other',
};

// ── Language helpers ──────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  EN: 'English', ES: 'Spanish', FR: 'French', DE: 'German', IT: 'Italian',
  PT: 'Portuguese', RU: 'Russian', JA: 'Japanese', KO: 'Korean',
  ZH: 'Mandarin Chinese', AR: 'Arabic', HI: 'Hindi', BN: 'Bengali',
  PA: 'Punjabi', JV: 'Javanese', VI: 'Vietnamese', TR: 'Turkish',
  PL: 'Polish', NL: 'Dutch', SV: 'Swedish', NO: 'Norwegian', DA: 'Danish',
  FI: 'Finnish', CS: 'Czech', EL: 'Greek', HE: 'Hebrew', TH: 'Thai',
  ID: 'Indonesian', MS: 'Malay', TL: 'Tagalog', UK: 'Ukrainian',
  RO: 'Romanian', HU: 'Hungarian', FA: 'Persian', UR: 'Urdu',
  SW: 'Swahili', TA: 'Tamil', TE: 'Telugu', MR: 'Marathi', CA: 'Catalan',
};

const PROFICIENCY_SHORT: Record<number, string> = {
  1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2', 5: 'C1', 6: 'C2', 7: 'Native',
};

export interface LanguageEntry {
  code: string;
  proficiency: number;
}

export function unpackLanguages(packed: bigint | string): LanguageEntry[] {
  let val = typeof packed === 'string'
    ? (packed.startsWith('0x') ? BigInt(packed) : BigInt(packed))
    : packed;
  if (val === 0n) return [];

  const entries: LanguageEntry[] = [];
  for (let i = 0; i < 8; i++) {
    const shift = BigInt((7 - i) * 32);
    const slot = Number((val >> shift) & 0xFFFFFFFFn);
    const langCode = (slot >> 16) & 0xFFFF;
    const proficiency = (slot >> 8) & 0xFF;
    if (langCode === 0) continue;
    const c1 = String.fromCharCode((langCode >> 8) & 0xFF);
    const c2 = String.fromCharCode(langCode & 0xFF);
    entries.push({ code: (c1 + c2).toUpperCase(), proficiency });
  }
  return entries;
}

export function getLanguageName(code: string): string {
  return LANG_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

export function proficiencyLabel(value: number): string {
  return PROFICIENCY_SHORT[value] ?? '';
}
