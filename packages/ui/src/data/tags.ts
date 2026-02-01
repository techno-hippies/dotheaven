/**
 * Tag Dictionary — canonical uint16 IDs for hobbies & skills.
 *
 * Rules:
 * - IDs are **stable forever**. Never reuse or renumber.
 * - To rename a tag, change the label — keep the ID.
 * - To deprecate, remove from the exported arrays but keep the ID→label map entry.
 * - Hobbies: 1–999, Skills: 1000–1999 (convention, not enforced).
 * - Max 16 tags per field (packed into one bytes32 as 16 × uint16 big-endian).
 */

export interface Tag {
  id: number  // uint16, stable forever
  label: string  // English canonical label
  // Future: labels: Record<string, string> for i18n
}

// ── Hobbies (1–999) ─────────────────────────────────────────────────

export const HOBBY_TAGS: Tag[] = [
  // Sports & Fitness
  { id: 1, label: 'Running' },
  { id: 2, label: 'Swimming' },
  { id: 3, label: 'Cycling' },
  { id: 4, label: 'Hiking' },
  { id: 5, label: 'Yoga' },
  { id: 6, label: 'Gym / Weight Training' },
  { id: 7, label: 'Climbing' },
  { id: 8, label: 'Martial Arts' },
  { id: 9, label: 'Dancing' },
  { id: 10, label: 'Surfing' },
  { id: 11, label: 'Skiing / Snowboarding' },
  { id: 12, label: 'Tennis' },
  { id: 13, label: 'Basketball' },
  { id: 14, label: 'Football / Soccer' },
  { id: 15, label: 'Volleyball' },
  { id: 16, label: 'Skateboarding' },
  { id: 17, label: 'Boxing' },
  { id: 18, label: 'Pilates' },
  { id: 19, label: 'Golf' },
  { id: 20, label: 'Sailing' },

  // Music & Performance
  { id: 50, label: 'Playing Guitar' },
  { id: 51, label: 'Playing Piano' },
  { id: 52, label: 'Singing' },
  { id: 53, label: 'DJing' },
  { id: 54, label: 'Music Production' },
  { id: 55, label: 'Playing Drums' },
  { id: 56, label: 'Playing Violin' },
  { id: 57, label: 'Karaoke' },

  // Arts & Crafts
  { id: 100, label: 'Drawing' },
  { id: 101, label: 'Painting' },
  { id: 102, label: 'Photography' },
  { id: 103, label: 'Filmmaking' },
  { id: 104, label: 'Writing' },
  { id: 105, label: 'Poetry' },
  { id: 106, label: 'Ceramics / Pottery' },
  { id: 107, label: 'Knitting / Crochet' },
  { id: 108, label: 'Woodworking' },
  { id: 109, label: 'Calligraphy' },
  { id: 110, label: 'Graphic Design' },
  { id: 111, label: 'Fashion Design' },
  { id: 112, label: 'Tattoo Art' },

  // Food & Drink
  { id: 150, label: 'Cooking' },
  { id: 151, label: 'Baking' },
  { id: 152, label: 'Wine Tasting' },
  { id: 153, label: 'Coffee' },
  { id: 154, label: 'Mixology / Cocktails' },
  { id: 155, label: 'Food Exploring' },

  // Games & Tech
  { id: 200, label: 'Video Games' },
  { id: 201, label: 'Board Games' },
  { id: 202, label: 'Chess' },
  { id: 203, label: 'Poker' },
  { id: 204, label: 'Coding / Programming' },
  { id: 205, label: '3D Printing' },
  { id: 206, label: 'VR / AR' },
  { id: 207, label: 'Crypto / Web3' },
  { id: 208, label: 'Robotics' },

  // Outdoors & Nature
  { id: 250, label: 'Camping' },
  { id: 251, label: 'Fishing' },
  { id: 252, label: 'Gardening' },
  { id: 253, label: 'Bird Watching' },
  { id: 254, label: 'Stargazing' },
  { id: 255, label: 'Scuba Diving' },
  { id: 256, label: 'Rock Collecting' },
  { id: 257, label: 'Foraging' },

  // Mind & Wellness
  { id: 300, label: 'Meditation' },
  { id: 301, label: 'Journaling' },
  { id: 302, label: 'Reading' },
  { id: 303, label: 'Podcasts' },
  { id: 304, label: 'Learning Languages' },
  { id: 305, label: 'Volunteering' },
  { id: 306, label: 'Astrology' },
  { id: 307, label: 'Philosophy' },
  { id: 308, label: 'Psychology' },

  // Social & Lifestyle
  { id: 350, label: 'Traveling' },
  { id: 351, label: 'Thrifting / Vintage' },
  { id: 352, label: 'Going Out / Nightlife' },
  { id: 353, label: 'Movies / Cinema' },
  { id: 354, label: 'Anime / Manga' },
  { id: 355, label: 'Theatre' },
  { id: 356, label: 'Concerts / Live Music' },
  { id: 357, label: 'Museums / Galleries' },
  { id: 358, label: 'Dogs' },
  { id: 359, label: 'Cats' },
  { id: 360, label: 'Interior Design' },
  { id: 361, label: 'Collecting' },
  { id: 362, label: 'Cars / Motorsport' },
  { id: 363, label: 'Motorcycles' },
  { id: 364, label: 'Stand-up Comedy' },
  { id: 365, label: 'True Crime' },
]

// ── Skills (1000–1999) ──────────────────────────────────────────────

export const SKILL_TAGS: Tag[] = [
  // Engineering & Tech
  { id: 1000, label: 'JavaScript / TypeScript' },
  { id: 1001, label: 'Python' },
  { id: 1002, label: 'Rust' },
  { id: 1003, label: 'Solidity / Smart Contracts' },
  { id: 1004, label: 'Machine Learning / AI' },
  { id: 1005, label: 'Data Science' },
  { id: 1006, label: 'DevOps / Cloud' },
  { id: 1007, label: 'Mobile Development' },
  { id: 1008, label: 'Backend Engineering' },
  { id: 1009, label: 'Frontend Engineering' },
  { id: 1010, label: 'Game Development' },
  { id: 1011, label: 'Systems Programming' },
  { id: 1012, label: 'Cybersecurity' },
  { id: 1013, label: 'Databases / SQL' },
  { id: 1014, label: 'Embedded Systems' },

  // Design & Creative
  { id: 1050, label: 'UI / UX Design' },
  { id: 1051, label: 'Product Design' },
  { id: 1052, label: 'Brand / Identity Design' },
  { id: 1053, label: 'Motion Graphics' },
  { id: 1054, label: 'Video Editing' },
  { id: 1055, label: 'Audio Engineering' },
  { id: 1056, label: 'Illustration' },
  { id: 1057, label: '3D Modeling' },

  // Business & Communication
  { id: 1100, label: 'Project Management' },
  { id: 1101, label: 'Marketing' },
  { id: 1102, label: 'Sales' },
  { id: 1103, label: 'Public Speaking' },
  { id: 1104, label: 'Copywriting' },
  { id: 1105, label: 'Financial Analysis' },
  { id: 1106, label: 'Fundraising / VC' },
  { id: 1107, label: 'Community Management' },
  { id: 1108, label: 'Strategy / Consulting' },
  { id: 1109, label: 'Recruiting / HR' },
  { id: 1110, label: 'Legal / Compliance' },
  { id: 1111, label: 'Accounting' },

  // Science & Research
  { id: 1150, label: 'Biology / Biotech' },
  { id: 1151, label: 'Chemistry' },
  { id: 1152, label: 'Physics' },
  { id: 1153, label: 'Mathematics' },
  { id: 1154, label: 'Environmental Science' },
  { id: 1155, label: 'Neuroscience' },

  // Trades & Practical
  { id: 1200, label: 'Electrical Work' },
  { id: 1201, label: 'Plumbing' },
  { id: 1202, label: 'Carpentry' },
  { id: 1203, label: 'Automotive Repair' },
  { id: 1204, label: 'Welding' },
  { id: 1205, label: 'First Aid / CPR' },

  // Language & Teaching
  { id: 1250, label: 'Teaching / Tutoring' },
  { id: 1251, label: 'Translation' },
  { id: 1252, label: 'Sign Language' },

  // Health & Wellness
  { id: 1300, label: 'Nutrition / Dietetics' },
  { id: 1301, label: 'Personal Training' },
  { id: 1302, label: 'Therapy / Counseling' },
  { id: 1303, label: 'Massage Therapy' },
]

// ── Lookup maps ─────────────────────────────────────────────────────

/** ID → Tag for quick label lookups */
export const HOBBY_BY_ID = new Map(HOBBY_TAGS.map(t => [t.id, t]))
export const SKILL_BY_ID = new Map(SKILL_TAGS.map(t => [t.id, t]))

/** Label lookups for both */
export function getTagLabel(id: number): string {
  return HOBBY_BY_ID.get(id)?.label ?? SKILL_BY_ID.get(id)?.label ?? `#${id}`
}

// ── Packing: uint16[] → bytes32 (big-endian, sorted, deduped, max 16) ──

/**
 * Pack up to 16 uint16 tag IDs into a bytes32 hex string.
 * IDs are deduped, sorted ascending, zero-padded to 16 slots.
 */
export function packTagIds(ids: number[]): `0x${string}` {
  const unique = [...new Set(ids)].filter(id => id > 0 && id <= 0xFFFF)
  unique.sort((a, b) => a - b)
  const slots = unique.slice(0, 16)

  // Pad to 16 slots
  while (slots.length < 16) slots.push(0)

  // Big-endian uint16 per slot → 32 bytes
  let hex = '0x'
  for (const id of slots) {
    hex += id.toString(16).padStart(4, '0')
  }
  return hex as `0x${string}`
}

/**
 * Unpack a bytes32 hex string into an array of non-zero uint16 tag IDs.
 */
export function unpackTagIds(hex: string): number[] {
  if (!hex || hex === '0x' + '0'.repeat(64)) return []

  // Strip 0x prefix
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex
  if (raw.length !== 64) return []

  const ids: number[] = []
  for (let i = 0; i < 64; i += 4) {
    const val = parseInt(raw.slice(i, i + 4), 16)
    if (val > 0) ids.push(val)
  }
  return ids
}

// ── Conversion helpers for UI ───────────────────────────────────────

/** Convert tag ID array to comma-separated string (for ProfileInput storage) */
export function tagIdsToString(ids: number[]): string {
  return ids.join(',')
}

/** Convert comma-separated string back to tag ID array */
export function stringToTagIds(s: string | undefined): number[] {
  if (!s) return []
  return s.split(',').map(Number).filter(id => id > 0)
}

/** Convert tag ID array to MultiSelectOption value strings */
export function tagIdsToValues(ids: number[]): string[] {
  return ids.map(String)
}

/** Convert MultiSelectOption value strings to tag ID array */
export function valuesToTagIds(values: string[]): number[] {
  return values.map(Number).filter(id => id > 0)
}

/** Convert tag array to MultiSelectOption[] for the dropdown */
export function tagsToOptions(tags: Tag[]): { value: string; label: string }[] {
  return tags.map(t => ({ value: String(t.id), label: t.label }))
}
