import type { ProfileInput } from '@heaven/ui'

/**
 * Heaven Profile - Set on-chain profile via Lit Action (gasless)
 *
 * The sponsor PKP pays gas on MegaETH. User signs an EIP-191 message
 * authorizing the profile update. Nonce-based replay protection.
 */

import { createPublicClient, http, parseAbi, keccak256 } from 'viem'
import { packTagIds, unpackTagIds } from '@heaven/ui'
import { megaTestnetV2 } from '../chains'
import { getLitClient } from '../lit/client'
import { HEAVEN_SET_PROFILE_CID } from '../lit/action-cids'
import type { PKPAuthContext } from '../lit/types'

const PROFILE_V1 = '0x0A6563122cB3515ff678A918B5F31da9b1391EA3' as const

const profileAbi = parseAbi([
  'function nonces(address user) external view returns (uint256)',
  'struct Profile { uint8 profileVersion; bool exists; uint8 age; uint16 heightCm; bytes2 nationality; bytes2 nativeLanguage; uint8 friendsOpenToMask; uint80 learningLanguagesPacked; bytes32 locationCityId; bytes32 schoolId; bytes32 skillsCommit; bytes32 hobbiesCommit; bytes32 nameHash; uint256 packed; string displayName; string photoURI; }',
  'function getProfile(address user) external view returns (Profile)',
])

function getClient() {
  return createPublicClient({
    chain: megaTestnetV2,
    transport: http(megaTestnetV2.rpcUrls.default.http[0]),
  })
}

// ────────────────────────────────────────────────────────────────
// Enum Mappings (UI string ↔ contract number)
// ────────────────────────────────────────────────────────────────

// Gender
export const GENDER_TO_NUM: Record<string, number> = {
  '': 0,
  woman: 1,
  man: 2,
  'non-binary': 3,
  'trans-woman': 4,
  'trans-man': 5,
  intersex: 6,
  other: 7,
}
export const NUM_TO_GENDER: Record<number, string> = Object.fromEntries(
  Object.entries(GENDER_TO_NUM).map(([k, v]) => [v, k])
)

// Relocate
export const RELOCATE_TO_NUM: Record<string, number> = { '': 0, no: 1, maybe: 2, yes: 3 }
export const NUM_TO_RELOCATE = Object.fromEntries(
  Object.entries(RELOCATE_TO_NUM).map(([k, v]) => [v, k])
)

// Degree
export const DEGREE_TO_NUM: Record<string, number> = {
  '': 0,
  'no-degree': 1,
  'high-school': 2,
  associate: 3,
  bachelor: 4,
  master: 5,
  doctorate: 6,
  professional: 7,
  bootcamp: 8,
  other: 9,
}
export const NUM_TO_DEGREE = Object.fromEntries(
  Object.entries(DEGREE_TO_NUM).map(([k, v]) => [v, k])
)

// FieldBucket
export const FIELD_TO_NUM: Record<string, number> = {
  '': 0,
  'computer-science': 1,
  engineering: 2,
  'math-stats': 3,
  'physical-sciences': 4,
  biology: 5,
  'medicine-health': 6,
  business: 7,
  economics: 8,
  law: 9,
  'social-sciences': 10,
  psychology: 11,
  'arts-design': 12,
  humanities: 13,
  education: 14,
  communications: 15,
  other: 16,
}
export const NUM_TO_FIELD = Object.fromEntries(
  Object.entries(FIELD_TO_NUM).map(([k, v]) => [v, k])
)

// Profession
export const PROFESSION_TO_NUM: Record<string, number> = {
  '': 0,
  'software-engineer': 1,
  product: 2,
  design: 3,
  data: 4,
  sales: 5,
  marketing: 6,
  operations: 7,
  founder: 8,
  student: 9,
  other: 10,
}
export const NUM_TO_PROFESSION = Object.fromEntries(
  Object.entries(PROFESSION_TO_NUM).map(([k, v]) => [v, k])
)

// Industry
export const INDUSTRY_TO_NUM: Record<string, number> = {
  '': 0,
  technology: 1,
  finance: 2,
  healthcare: 3,
  education: 4,
  manufacturing: 5,
  retail: 6,
  media: 7,
  government: 8,
  nonprofit: 9,
  other: 10,
}
export const NUM_TO_INDUSTRY = Object.fromEntries(
  Object.entries(INDUSTRY_TO_NUM).map(([k, v]) => [v, k])
)

// RelationshipStatus
export const RELATIONSHIP_TO_NUM: Record<string, number> = {
  '': 0,
  single: 1,
  'in-relationship': 2,
  married: 3,
  divorced: 4,
  separated: 5,
  widowed: 6,
  'its-complicated': 7,
}
export const NUM_TO_RELATIONSHIP = Object.fromEntries(
  Object.entries(RELATIONSHIP_TO_NUM).map(([k, v]) => [v, k])
)

// Sexuality
export const SEXUALITY_TO_NUM: Record<string, number> = {
  '': 0,
  straight: 1,
  gay: 2,
  lesbian: 3,
  bisexual: 4,
  pansexual: 5,
  asexual: 6,
  queer: 7,
  questioning: 8,
  other: 9,
}
export const NUM_TO_SEXUALITY = Object.fromEntries(
  Object.entries(SEXUALITY_TO_NUM).map(([k, v]) => [v, k])
)

// Ethnicity
export const ETHNICITY_TO_NUM: Record<string, number> = {
  '': 0,
  white: 1,
  black: 2,
  'east-asian': 3,
  'south-asian': 4,
  'southeast-asian': 5,
  'middle-eastern-north-african': 6,
  'hispanic-latinao': 7,
  'native-american-indigenous': 8,
  'pacific-islander': 9,
  mixed: 10,
  other: 11,
}
export const NUM_TO_ETHNICITY = Object.fromEntries(
  Object.entries(ETHNICITY_TO_NUM).map(([k, v]) => [v, k])
)

// DatingStyle
export const DATING_STYLE_TO_NUM: Record<string, number> = {
  '': 0,
  monogamous: 1,
  'non-monogamous': 2,
  'open-relationship': 3,
  polyamorous: 4,
  other: 5,
}
export const NUM_TO_DATING_STYLE = Object.fromEntries(
  Object.entries(DATING_STYLE_TO_NUM).map(([k, v]) => [v, k])
)

// Children
export const CHILDREN_TO_NUM: Record<string, number> = {
  '': 0,
  none: 1,
  'has-children': 2,
}
export const NUM_TO_CHILDREN = Object.fromEntries(
  Object.entries(CHILDREN_TO_NUM).map(([k, v]) => [v, k])
)

// WantsChildren
export const WANTS_CHILDREN_TO_NUM: Record<string, number> = {
  '': 0,
  no: 1,
  yes: 2,
  'open-to-it': 3,
  unsure: 4,
}
export const NUM_TO_WANTS_CHILDREN = Object.fromEntries(
  Object.entries(WANTS_CHILDREN_TO_NUM).map(([k, v]) => [v, k])
)

// Drinking
export const DRINKING_TO_NUM: Record<string, number> = {
  '': 0,
  never: 1,
  rarely: 2,
  socially: 3,
  often: 4,
}
export const NUM_TO_DRINKING = Object.fromEntries(
  Object.entries(DRINKING_TO_NUM).map(([k, v]) => [v, k])
)

// Smoking
export const SMOKING_TO_NUM: Record<string, number> = {
  '': 0,
  no: 1,
  socially: 2,
  yes: 3,
  vape: 4,
}
export const NUM_TO_SMOKING = Object.fromEntries(
  Object.entries(SMOKING_TO_NUM).map(([k, v]) => [v, k])
)

// Drugs
export const DRUGS_TO_NUM: Record<string, number> = { '': 0, never: 1, sometimes: 2, often: 3 }
export const NUM_TO_DRUGS = Object.fromEntries(
  Object.entries(DRUGS_TO_NUM).map(([k, v]) => [v, k])
)

// LookingFor
export const LOOKING_FOR_TO_NUM: Record<string, number> = {
  '': 0,
  friendship: 1,
  casual: 2,
  serious: 3,
  'long-term': 4,
  marriage: 5,
  'not-sure': 6,
  other: 7,
}
export const NUM_TO_LOOKING_FOR = Object.fromEntries(
  Object.entries(LOOKING_FOR_TO_NUM).map(([k, v]) => [v, k])
)

// Religion
export const RELIGION_TO_NUM: Record<string, number> = {
  '': 0,
  agnostic: 1,
  atheist: 2,
  buddhist: 3,
  christian: 4,
  hindu: 5,
  jewish: 6,
  muslim: 7,
  sikh: 8,
  spiritual: 9,
  other: 10,
}
export const NUM_TO_RELIGION = Object.fromEntries(
  Object.entries(RELIGION_TO_NUM).map(([k, v]) => [v, k])
)

// Pets
export const PETS_TO_NUM: Record<string, number> = {
  '': 0,
  'no-pets': 1,
  'has-pets': 2,
  'wants-pets': 3,
  allergic: 4,
}
export const NUM_TO_PETS = Object.fromEntries(
  Object.entries(PETS_TO_NUM).map(([k, v]) => [v, k])
)

// Diet
export const DIET_TO_NUM: Record<string, number> = {
  '': 0,
  omnivore: 1,
  vegetarian: 2,
  vegan: 3,
  pescatarian: 4,
  halal: 5,
  kosher: 6,
  other: 7,
}
export const NUM_TO_DIET = Object.fromEntries(
  Object.entries(DIET_TO_NUM).map(([k, v]) => [v, k])
)

// ISO 639-1 language code → bytes2 hex
function langToBytes2(lang: string): string {
  if (!lang || lang.length < 2) return '0x0000'
  const code = lang.slice(0, 2).toUpperCase()
  const hex = code.charCodeAt(0).toString(16).padStart(2, '0')
    + code.charCodeAt(1).toString(16).padStart(2, '0')
  return '0x' + hex
}

// bytes2 hex → 2-char code (uppercase for nationality, lowercase for language)
function bytes2ToCode(hex: string, uppercase = false): string | undefined {
  if (!hex || hex === '0x0000') return undefined
  const n = parseInt(hex, 16)
  if (!n) return undefined
  const c1 = String.fromCharCode((n >> 8) & 0xff)
  const c2 = String.fromCharCode(n & 0xff)
  const code = c1 + c2
  return uppercase ? code.toUpperCase() : code.toLowerCase()
}

// Decode learningLanguagesPacked uint80 → first language code (bits 79..64)
function decodeLearningLanguage(packed: bigint | string): string | undefined {
  const n = BigInt(packed)
  if (n === 0n) return undefined
  const val = Number((n >> 64n) & 0xFFFFn)
  if (!val) return undefined
  const c1 = String.fromCharCode((val >> 8) & 0xff)
  const c2 = String.fromCharCode(val & 0xff)
  return (c1 + c2).toLowerCase()
}

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'

/** Parse a comma-separated string of tag IDs into a clean, deduped, sorted array (max 16) */
export function parseTagCsv(csv?: string): number[] {
  if (!csv) return []
  const ids = csv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => Number(s))
    .filter(n => Number.isInteger(n) && n > 0 && n <= 0xFFFF)
  return [...new Set(ids)].sort((a, b) => a - b).slice(0, 16)
}

/** Convert a string to bytes32: pass through if already hex, otherwise keccak256 hash it */
function toBytes32(value: string | undefined): `0x${string}` {
  if (!value) return ZERO_HASH as `0x${string}`
  if (value.startsWith('0x') && value.length === 66) return value as `0x${string}`
  return keccak256(new TextEncoder().encode(value))
}

export type { ProfileInput } from '@heaven/ui'

export interface SetProfileResult {
  success: boolean
  txHash?: string
  blockNumber?: number
  user?: string
  profileHash?: string
  error?: string
}

/**
 * Build the profileInput object matching the contract's ProfileInput struct.
 */
function buildProfileInput(data: ProfileInput) {
  // Pack target language into learningLanguagesPacked (first slot of 5 x bytes2)
  // uint80 = 5 x uint16, left-to-right: [0]=bits 79..64, [1]=63..48, ...
  let learningLanguagesPacked: string | number = data.learningLanguagesPacked ? String(data.learningLanguagesPacked) : '0'
  if (data.targetLanguage && !data.learningLanguagesPacked) {
    const code = data.targetLanguage.slice(0, 2).toUpperCase()
    const val = (code.charCodeAt(0) << 8) | code.charCodeAt(1)
    learningLanguagesPacked = (BigInt(val) << 64n).toString() as any // shift to bits 79..64; string for ethers v5 BigNumber compat
  }

  // schoolId: zeroed out — plaintext stored in RecordsV1 only (no on-chain use yet)
  const schoolId = ZERO_HASH

  // Pack hobby/skill tag IDs into bytes32
  const hobbyIds = parseTagCsv(data.hobbiesCommit)
  const skillIds = parseTagCsv(data.skillsCommit)
  const hobbiesPacked = hobbyIds.length ? packTagIds(hobbyIds) : ZERO_HASH as `0x${string}`
  const skillsPacked = skillIds.length ? packTagIds(skillIds) : ZERO_HASH as `0x${string}`

  // photoURI is deprecated; avatar is stored in RecordsV1 only.
  const photoURI = ''

  return {
    profileVersion: 1,
    displayName: data.displayName || '',
    nameHash: (data.nameHash as `0x${string}`) || ZERO_HASH,
    age: data.age || 0,
    heightCm: data.heightCm || 0,
    nationality: langToBytes2(data.nationality || ''),
    nativeLanguage: langToBytes2(data.nativeLanguage || ''),
    learningLanguagesPacked,
    friendsOpenToMask: data.friendsOpenToMask || 0,
    locationCityId: toBytes32(data.locationCityId),
    schoolId: schoolId as `0x${string}`,
    skillsCommit: skillsPacked,
    hobbiesCommit: hobbiesPacked,
    photoURI,
    gender: GENDER_TO_NUM[data.gender || ''] ?? 0,
    relocate: RELOCATE_TO_NUM[data.relocate || ''] ?? 0,
    degree: DEGREE_TO_NUM[data.degree || ''] ?? 0,
    fieldBucket: FIELD_TO_NUM[data.fieldBucket || ''] ?? 0,
    profession: PROFESSION_TO_NUM[data.profession || ''] ?? 0,
    industry: INDUSTRY_TO_NUM[data.industry || ''] ?? 0,
    relationshipStatus: RELATIONSHIP_TO_NUM[data.relationshipStatus || ''] ?? 0,
    sexuality: SEXUALITY_TO_NUM[data.sexuality || ''] ?? 0,
    ethnicity: ETHNICITY_TO_NUM[data.ethnicity || ''] ?? 0,
    datingStyle: DATING_STYLE_TO_NUM[data.datingStyle || ''] ?? 0,
    children: CHILDREN_TO_NUM[data.children || ''] ?? 0,
    wantsChildren: WANTS_CHILDREN_TO_NUM[data.wantsChildren || ''] ?? 0,
    drinking: DRINKING_TO_NUM[data.drinking || ''] ?? 0,
    smoking: SMOKING_TO_NUM[data.smoking || ''] ?? 0,
    drugs: DRUGS_TO_NUM[data.drugs || ''] ?? 0,
    lookingFor: LOOKING_FOR_TO_NUM[data.lookingFor || ''] ?? 0,
    religion: RELIGION_TO_NUM[data.religion || ''] ?? 0,
    pets: PETS_TO_NUM[data.pets || ''] ?? 0,
    diet: DIET_TO_NUM[data.diet || ''] ?? 0,
  }
}

/**
 * Fetch user's on-chain profile from ProfileV1 contract.
 */
export async function getProfile(userAddress: `0x${string}`): Promise<ProfileInput | null> {
  const client = getClient()

  try {
    const profile = (await client.readContract({
      address: PROFILE_V1,
      abi: profileAbi,
      functionName: 'getProfile',
      args: [userAddress],
    })) as {
      profileVersion: number
      exists: boolean
      age: number
      heightCm: number
      nationality: `0x${string}`
      nativeLanguage: `0x${string}`
      friendsOpenToMask: number
      learningLanguagesPacked: bigint
      locationCityId: `0x${string}`
      schoolId: `0x${string}`
      skillsCommit: `0x${string}`
      hobbiesCommit: `0x${string}`
      nameHash: `0x${string}`
      packed: bigint
      displayName: string
      photoURI: string
    }

    if (!profile.exists) {
      return null
    }

    // Helper to extract enum from packed uint256
    const getByte = (packed: bigint, offset: number): number => {
      const shift = BigInt(offset) * 8n
      return Number((packed >> shift) & 0xFFn)
    }

    // Unpack enums from packed field
    const packed = profile.packed as bigint
    const gender = getByte(packed, 0)
    const relocate = getByte(packed, 1)
    const degree = getByte(packed, 2)
    const fieldBucket = getByte(packed, 3)
    const profession = getByte(packed, 4)
    const industry = getByte(packed, 5)
    const relationshipStatus = getByte(packed, 6)
    const sexuality = getByte(packed, 7)
    const ethnicity = getByte(packed, 8)
    const datingStyle = getByte(packed, 9)
    const children = getByte(packed, 10)
    const wantsChildren = getByte(packed, 11)
    const drinking = getByte(packed, 12)
    const smoking = getByte(packed, 13)
    const drugs = getByte(packed, 14)
    const lookingFor = getByte(packed, 15)
    const religion = getByte(packed, 16)
    const pets = getByte(packed, 17)
    const diet = getByte(packed, 18)

    return {
      displayName: profile.displayName || undefined,
      nameHash: profile.nameHash !== ZERO_HASH ? profile.nameHash : undefined,
      age: profile.age || undefined,
      heightCm: profile.heightCm || undefined,
      gender: NUM_TO_GENDER[gender] || undefined,
      nationality: bytes2ToCode(profile.nationality, true),  // uppercase: "AF", "US"
      nativeLanguage: bytes2ToCode(profile.nativeLanguage),  // lowercase: "en", "fr"
      // locationCityId is an on-chain hash; plaintext comes from RecordsV1 text records
      locationCityId: undefined,
      relocate: NUM_TO_RELOCATE[relocate] || undefined,
      degree: NUM_TO_DEGREE[degree] || undefined,
      fieldBucket: NUM_TO_FIELD[fieldBucket] || undefined,
      profession: NUM_TO_PROFESSION[profession] || undefined,
      industry: NUM_TO_INDUSTRY[industry] || undefined,
      relationshipStatus: NUM_TO_RELATIONSHIP[relationshipStatus] || undefined,
      sexuality: NUM_TO_SEXUALITY[sexuality] || undefined,
      ethnicity: NUM_TO_ETHNICITY[ethnicity] || undefined,
      datingStyle: NUM_TO_DATING_STYLE[datingStyle] || undefined,
      children: NUM_TO_CHILDREN[children] || undefined,
      wantsChildren: NUM_TO_WANTS_CHILDREN[wantsChildren] || undefined,
      drinking: NUM_TO_DRINKING[drinking] || undefined,
      smoking: NUM_TO_SMOKING[smoking] || undefined,
      drugs: NUM_TO_DRUGS[drugs] || undefined,
      lookingFor: NUM_TO_LOOKING_FOR[lookingFor] || undefined,
      religion: NUM_TO_RELIGION[religion] || undefined,
      pets: NUM_TO_PETS[pets] || undefined,
      diet: NUM_TO_DIET[diet] || undefined,
      targetLanguage: decodeLearningLanguage(profile.learningLanguagesPacked),
      learningLanguagesPacked: profile.learningLanguagesPacked.toString() as any,
      friendsOpenToMask: profile.friendsOpenToMask,
      // Unpack tag IDs from bytes32 → comma-separated ID strings for UI multi-select
      skillsCommit: unpackTagIds(profile.skillsCommit).join(', ') || undefined,
      hobbiesCommit: unpackTagIds(profile.hobbiesCommit).join(', ') || undefined,
    }
  } catch (error) {
    console.error('Failed to fetch profile:', error)
    return null
  }
}

/**
 * Set user's on-chain profile via Lit Action (gasless).
 *
 * Flow:
 * 1. Fetch on-chain nonce for replay protection
 * 2. Build profileInput from profile data
 * 3. Compute profileHash = keccak256(abi.encode(profileInput))
 * 4. User's PKP signs EIP-191: "heaven:profile:{user}:{profileHash}:{nonce}"
 * 5. Execute Lit Action → sponsor PKP broadcasts upsertProfileFor()
 */
export async function setProfile(
  data: ProfileInput,
  userAddress: `0x${string}`,
  authContext: PKPAuthContext,
  pkpPublicKey: string,
): Promise<SetProfileResult> {
  const litClient = await getLitClient()

  // 1. Fetch on-chain nonce
  const client = getClient()
  const nonce = await client.readContract({
    address: PROFILE_V1,
    abi: profileAbi,
    functionName: 'nonces',
    args: [userAddress],
  })

  // 2. Build profile input
  const profileInput = buildProfileInput(data)

  // 3. Single executeJs: action signs with user's PKP + sponsor PKP broadcasts
  const result = await litClient.executeJs({
    ipfsId: HEAVEN_SET_PROFILE_CID,
    authContext,
    jsParams: {
      user: userAddress,
      userPkpPublicKey: pkpPublicKey,
      profileInput,
      nonce: Number(nonce),
    },
  })

  const response = JSON.parse(result.response as string)
  return response as SetProfileResult
}

export { PROFILE_V1 }
