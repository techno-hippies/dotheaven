/**
 * Unified Language Model — pack/unpack helpers + types
 *
 * Each entry: (ISO 639-1 language code, CEFR proficiency level)
 * Packed into uint256: 8 slots x 32 bits, MSB-first
 *
 * Slot layout: [langCode:16][proficiency:8][reserved:8]
 * Entry[0] = bits 255..224, Entry[7] = bits 31..0
 *
 * Proficiency: 0=Unset, 1=A1, 2=A2, 3=B1, 4=B2, 5=C1, 6=C2, 7=Native
 */

export interface LanguageEntry {
  /** ISO 639-1 code, lowercase (e.g. "en", "fr") */
  code: string
  /** CEFR proficiency level (0-7) */
  proficiency: number
}

export const PROFICIENCY = {
  UNSET: 0,
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
  NATIVE: 7,
} as const

export type ProficiencyLevel = (typeof PROFICIENCY)[keyof typeof PROFICIENCY]

export const PROFICIENCY_LEVELS = [
  { value: 7, label: 'Native', shortLabel: 'Native' },
  { value: 6, label: 'C2 — Proficient', shortLabel: 'C2' },
  { value: 5, label: 'C1 — Advanced', shortLabel: 'C1' },
  { value: 4, label: 'B2 — Upper Intermediate', shortLabel: 'B2' },
  { value: 3, label: 'B1 — Intermediate', shortLabel: 'B1' },
  { value: 2, label: 'A2 — Elementary', shortLabel: 'A2' },
  { value: 1, label: 'A1 — Beginner', shortLabel: 'A1' },
] as const

/** Proficiency select options (value ascending for dropdowns) */
export const PROFICIENCY_OPTIONS = [
  { value: '1', label: 'A1 — Beginner' },
  { value: '2', label: 'A2 — Elementary' },
  { value: '3', label: 'B1 — Intermediate' },
  { value: '4', label: 'B2 — Upper Intermediate' },
  { value: '5', label: 'C1 — Advanced' },
  { value: '6', label: 'C2 — Proficient' },
  { value: '7', label: 'Native' },
] as const

/** Map proficiency value to short display label */
export function proficiencyLabel(value: number): string {
  const level = PROFICIENCY_LEVELS.find((l) => l.value === value)
  return level?.shortLabel ?? ''
}

/** ISO 639-1 language code → ISO 3166-1 alpha-2 flag code */
export const LANG_TO_FLAG: Record<string, string> = {
  en: 'GB',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  it: 'IT',
  pt: 'PT',
  ru: 'RU',
  ja: 'JP',
  ko: 'KR',
  zh: 'CN',
  ar: 'SA',
  hi: 'IN',
  bn: 'BD',
  pa: 'IN',
  jv: 'ID',
  vi: 'VN',
  tr: 'TR',
  pl: 'PL',
  nl: 'NL',
  sv: 'SE',
  no: 'NO',
  da: 'DK',
  fi: 'FI',
  cs: 'CZ',
  el: 'GR',
  he: 'IL',
  th: 'TH',
  id: 'ID',
  ms: 'MY',
  tl: 'PH',
  uk: 'UA',
  ro: 'RO',
  hu: 'HU',
  fa: 'IR',
  ur: 'PK',
  sw: 'KE',
  ta: 'IN',
  te: 'IN',
  mr: 'IN',
  ca: 'ES',
}

const MAX_SLOTS = 8

/** Convert a 2-char ISO 639-1 code to uint16 (big-endian ASCII) */
function langCodeToUint16(code: string): number {
  if (!code || code.length < 2) return 0
  const upper = code.slice(0, 2).toUpperCase()
  return (upper.charCodeAt(0) << 8) | upper.charCodeAt(1)
}

/** Convert uint16 back to 2-char lowercase code */
function uint16ToLangCode(val: number): string {
  if (!val) return ''
  return String.fromCharCode((val >> 8) & 0xff, val & 0xff).toLowerCase()
}

/**
 * Pack up to 8 LanguageEntry into a decimal string (for ethers v5 / Lit Actions).
 *
 * Layout: 8 x 32-bit slots from MSB.
 * Each slot: [langCode:16][proficiency:8][reserved:8]
 */
export function packLanguages(entries: LanguageEntry[]): string {
  let packed = 0n

  const slots = entries.slice(0, MAX_SLOTS)
  for (let i = 0; i < slots.length; i++) {
    const { code, proficiency } = slots[i]
    const langVal = langCodeToUint16(code)
    if (!langVal) continue

    const slotVal = BigInt(((langVal & 0xffff) << 16) | ((proficiency & 0xff) << 8))
    const shift = BigInt((7 - i) * 32)
    packed |= slotVal << shift
  }

  return packed.toString()
}

/**
 * Pack into hex string (0x-prefixed, 64 chars).
 */
export function packLanguagesHex(entries: LanguageEntry[]): `0x${string}` {
  const dec = packLanguages(entries)
  return ('0x' + BigInt(dec).toString(16).padStart(64, '0')) as `0x${string}`
}

/**
 * Unpack a uint256 (bigint, decimal string, or hex string) into LanguageEntry[].
 * Only returns non-empty slots (langCode != 0).
 */
export function unpackLanguages(packed: bigint | string): LanguageEntry[] {
  let n: bigint
  if (typeof packed === 'string') {
    n = BigInt(packed)
  } else {
    n = packed
  }

  if (n === 0n) return []

  const entries: LanguageEntry[] = []
  for (let i = 0; i < MAX_SLOTS; i++) {
    const shift = BigInt((7 - i) * 32)
    const slot = Number((n >> shift) & 0xffffffffn)

    const langVal = (slot >> 16) & 0xffff
    const prof = (slot >> 8) & 0xff

    if (langVal === 0) continue

    entries.push({
      code: uint16ToLangCode(langVal),
      proficiency: prof,
    })
  }

  return entries
}

/** Extract native languages (proficiency === 7) */
export function getNativeLanguages(entries: LanguageEntry[]): LanguageEntry[] {
  return entries.filter((e) => e.proficiency === PROFICIENCY.NATIVE)
}

/** Extract learning languages (0 < proficiency < 7) */
export function getLearningLanguages(entries: LanguageEntry[]): LanguageEntry[] {
  return entries.filter((e) => e.proficiency > 0 && e.proficiency < PROFICIENCY.NATIVE)
}

/** ISO 639-1 code → English language name */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  bn: 'Bengali',
  pa: 'Punjabi',
  jv: 'Javanese',
  vi: 'Vietnamese',
  tr: 'Turkish',
  pl: 'Polish',
  nl: 'Dutch',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  cs: 'Czech',
  el: 'Greek',
  he: 'Hebrew',
  th: 'Thai',
  id: 'Indonesian',
  ms: 'Malay',
  tl: 'Tagalog',
  uk: 'Ukrainian',
  ro: 'Romanian',
  hu: 'Hungarian',
  fa: 'Persian',
  ur: 'Urdu',
  sw: 'Swahili',
  ta: 'Tamil',
  te: 'Telugu',
  mr: 'Marathi',
  ca: 'Catalan',
}

/** Get the English name for a language code */
export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase()
}
