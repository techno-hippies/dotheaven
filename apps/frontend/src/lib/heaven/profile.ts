/**
 * Heaven Profile - Set on-chain profile via Lit Action (gasless)
 *
 * The sponsor PKP pays gas on MegaETH. User signs an EIP-191 message
 * authorizing the profile update. Nonce-based replay protection.
 */

import { createPublicClient, http, parseAbi, encodeAbiParameters, keccak256 } from 'viem'
import { megaTestnetV2 } from '../chains'
import { getLitClient } from '../lit/client'
import type { PKPAuthContext } from '../lit/types'

const PROFILE_V1 = '0x0A6563122cB3515ff678A918B5F31da9b1391EA3' as const

const profileAbi = parseAbi([
  'function nonces(address user) external view returns (uint256)',
])

const SET_PROFILE_ACTION_URL = import.meta.env.VITE_HEAVEN_SET_PROFILE_ACTION_CID
  ? `https://ipfs.filebase.io/ipfs/${import.meta.env.VITE_HEAVEN_SET_PROFILE_ACTION_CID}`
  : null

let _cachedActionCode: string | null = null

async function getSetProfileActionCode(): Promise<string> {
  if (_cachedActionCode) return _cachedActionCode

  if (SET_PROFILE_ACTION_URL) {
    const res = await fetch(SET_PROFILE_ACTION_URL)
    if (!res.ok) throw new Error(`Failed to fetch set-profile action: ${res.status}`)
    _cachedActionCode = await res.text()
    return _cachedActionCode
  }

  const res = await fetch('/lit-actions/heaven-set-profile-v1.js')
  if (res.ok) {
    _cachedActionCode = await res.text()
    return _cachedActionCode
  }

  throw new Error(
    'Heaven set-profile action not available. Set VITE_HEAVEN_SET_PROFILE_ACTION_CID or serve the action file locally.'
  )
}

function getClient() {
  return createPublicClient({
    chain: megaTestnetV2,
    transport: http(megaTestnetV2.rpcUrls.default.http[0]),
  })
}

// Gender string from UI → contract enum value
const GENDER_MAP: Record<string, number> = {
  '': 0, // Unset
  woman: 1,
  man: 2,
  'non-binary': 3,
  other: 7,
}

// ISO 639-1 language code → bytes2 hex
function langToBytes2(lang: string): string {
  if (!lang || lang.length < 2) return '0x0000'
  const code = lang.slice(0, 2).toUpperCase()
  const hex = code.charCodeAt(0).toString(16).padStart(2, '0')
    + code.charCodeAt(1).toString(16).padStart(2, '0')
  return '0x' + hex
}

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'

export interface ProfileBasicsInput {
  displayName?: string
  age?: number | null
  gender?: string
  nativeLanguage?: string
  targetLanguage?: string
  locationCityId?: string
}

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
 * Only basics fields are populated; everything else defaults to 0/empty.
 */
function buildProfileInput(basics: ProfileBasicsInput) {
  // Pack target language into learningLanguagesPacked (first slot of 5 x bytes2)
  // uint80 = 5 x uint16, left-to-right: [0]=bits 79..64, [1]=63..48, ...
  let learningLanguagesPacked = 0
  if (basics.targetLanguage) {
    const code = basics.targetLanguage.slice(0, 2).toUpperCase()
    const val = (code.charCodeAt(0) << 8) | code.charCodeAt(1)
    learningLanguagesPacked = val * (2 ** 64) // shift to bits 79..64
  }

  return {
    profileVersion: 1,
    displayName: basics.displayName || '',
    nameHash: ZERO_HASH,
    age: basics.age || 0,
    heightCm: 0,
    nationality: '0x0000',
    nativeLanguage: langToBytes2(basics.nativeLanguage || ''),
    learningLanguagesPacked,
    friendsOpenToMask: 0,
    locationCityId: basics.locationCityId || ZERO_HASH,
    schoolId: ZERO_HASH,
    skillsCommit: ZERO_HASH,
    hobbiesCommit: ZERO_HASH,
    photoURI: '',
    gender: GENDER_MAP[basics.gender || ''] ?? 0,
    relocate: 0,
    degree: 0,
    fieldBucket: 0,
    profession: 0,
    industry: 0,
    relationshipStatus: 0,
    sexuality: 0,
    ethnicity: 0,
    datingStyle: 0,
    children: 0,
    wantsChildren: 0,
    drinking: 0,
    smoking: 0,
    drugs: 0,
    lookingFor: 0,
    religion: 0,
    pets: 0,
    diet: 0,
  }
}

// ABI type definition for ProfileInput tuple (matches contract struct order)
const PROFILE_INPUT_ABI = [
  {
    type: 'tuple',
    components: [
      { name: 'profileVersion', type: 'uint8' },
      { name: 'displayName', type: 'string' },
      { name: 'nameHash', type: 'bytes32' },
      { name: 'age', type: 'uint8' },
      { name: 'heightCm', type: 'uint16' },
      { name: 'nationality', type: 'bytes2' },
      { name: 'nativeLanguage', type: 'bytes2' },
      { name: 'learningLanguagesPacked', type: 'uint80' },
      { name: 'friendsOpenToMask', type: 'uint8' },
      { name: 'locationCityId', type: 'bytes32' },
      { name: 'schoolId', type: 'bytes32' },
      { name: 'skillsCommit', type: 'bytes32' },
      { name: 'hobbiesCommit', type: 'bytes32' },
      { name: 'photoURI', type: 'string' },
      { name: 'gender', type: 'uint8' },
      { name: 'relocate', type: 'uint8' },
      { name: 'degree', type: 'uint8' },
      { name: 'fieldBucket', type: 'uint8' },
      { name: 'profession', type: 'uint8' },
      { name: 'industry', type: 'uint8' },
      { name: 'relationshipStatus', type: 'uint8' },
      { name: 'sexuality', type: 'uint8' },
      { name: 'ethnicity', type: 'uint8' },
      { name: 'datingStyle', type: 'uint8' },
      { name: 'children', type: 'uint8' },
      { name: 'wantsChildren', type: 'uint8' },
      { name: 'drinking', type: 'uint8' },
      { name: 'smoking', type: 'uint8' },
      { name: 'drugs', type: 'uint8' },
      { name: 'lookingFor', type: 'uint8' },
      { name: 'religion', type: 'uint8' },
      { name: 'pets', type: 'uint8' },
      { name: 'diet', type: 'uint8' },
    ],
  },
] as const

/**
 * Compute keccak256(abi.encode(profileInput)) matching contract + Lit Action.
 */
function computeProfileHash(profileInput: ReturnType<typeof buildProfileInput>): `0x${string}` {
  const encoded = encodeAbiParameters(PROFILE_INPUT_ABI, [
    {
      profileVersion: profileInput.profileVersion,
      displayName: profileInput.displayName,
      nameHash: profileInput.nameHash as `0x${string}`,
      age: profileInput.age,
      heightCm: profileInput.heightCm,
      nationality: profileInput.nationality as `0x${string}`,
      nativeLanguage: profileInput.nativeLanguage as `0x${string}`,
      learningLanguagesPacked: BigInt(profileInput.learningLanguagesPacked),
      friendsOpenToMask: profileInput.friendsOpenToMask,
      locationCityId: profileInput.locationCityId as `0x${string}`,
      schoolId: profileInput.schoolId as `0x${string}`,
      skillsCommit: profileInput.skillsCommit as `0x${string}`,
      hobbiesCommit: profileInput.hobbiesCommit as `0x${string}`,
      photoURI: profileInput.photoURI,
      gender: profileInput.gender,
      relocate: profileInput.relocate,
      degree: profileInput.degree,
      fieldBucket: profileInput.fieldBucket,
      profession: profileInput.profession,
      industry: profileInput.industry,
      relationshipStatus: profileInput.relationshipStatus,
      sexuality: profileInput.sexuality,
      ethnicity: profileInput.ethnicity,
      datingStyle: profileInput.datingStyle,
      children: profileInput.children,
      wantsChildren: profileInput.wantsChildren,
      drinking: profileInput.drinking,
      smoking: profileInput.smoking,
      drugs: profileInput.drugs,
      lookingFor: profileInput.lookingFor,
      religion: profileInput.religion,
      pets: profileInput.pets,
      diet: profileInput.diet,
    },
  ])
  return keccak256(encoded)
}

/**
 * Set user's on-chain profile via Lit Action (gasless).
 *
 * Flow:
 * 1. Fetch on-chain nonce for replay protection
 * 2. Build profileInput from basics data
 * 3. Compute profileHash = keccak256(abi.encode(profileInput))
 * 4. User's PKP signs EIP-191: "heaven:profile:{user}:{profileHash}:{nonce}"
 * 5. Execute Lit Action → sponsor PKP broadcasts upsertProfileFor()
 */
export async function setProfile(
  basics: ProfileBasicsInput,
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
  const profileInput = buildProfileInput(basics)

  // 3. Compute profile hash
  const profileHash = await computeProfileHash(profileInput)

  // 4. Sign EIP-191 authorization message
  const message = `heaven:profile:${userAddress.toLowerCase()}:${profileHash}:${nonce}`

  const signResult = await litClient.executeJs({
    code: `(async () => {
      const sigShare = await Lit.Actions.ethPersonalSignMessageEcdsa({
        message: jsParams.message,
        publicKey: jsParams.publicKey,
        sigName: "sig",
      });
    })();`,
    authContext,
    jsParams: {
      message,
      publicKey: pkpPublicKey,
    },
  })

  if (!signResult.signatures?.sig) {
    throw new Error('Failed to sign profile authorization')
  }

  const sig = signResult.signatures.sig
  const sigHex = sig.signature.startsWith('0x') ? sig.signature.slice(2) : sig.signature
  const v = (sig.recoveryId + 27).toString(16).padStart(2, '0')
  const signature = `0x${sigHex}${v}`

  // 5. Execute the set-profile action
  const actionCode = await getSetProfileActionCode()

  const result = await litClient.executeJs({
    code: actionCode,
    authContext,
    jsParams: {
      user: userAddress,
      profileInput,
      signature,
      nonce: Number(nonce),
    },
  })

  const response = JSON.parse(result.response as string)
  return response as SetProfileResult
}

export { PROFILE_V1 }
