/**
 * Community — fetches member profiles from the dotheaven-profiles subgraph.
 *
 * Each profile is denormalized in the subgraph (all enums unpacked, languages packed).
 * Display strings (bio, avatar, location label) come from RecordsV1 text records,
 * resolved via RPC after the subgraph query.
 */

import type { CommunityCardProps, VerificationState } from '@heaven/ui'
import { unpackLanguages } from '@heaven/ui'
import { getPrimaryName, getPrimaryNode, getTextRecord } from './registry'
import { resolveAvatarUri } from './avatar-resolver'
import { NUM_TO_GENDER, GENDER_TO_NUM } from './profile'

const PROFILES_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-profiles/1.0.0/gn'

const ACTIVITY_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/9.0.0/gn'

const MEGAETH_RPC = 'https://carrot.megaeth.com/rpc'
const VERIFICATION_MIRROR = (import.meta.env.VITE_VERIFICATION_MIRROR_MEGAETH ?? '') as string

// ── Types ──────────────────────────────────────────────────────────

interface ProfileGQL {
  id: string               // address (lowercase hex)
  displayName: string
  photoURI: string
  age: number
  nationality: string      // bytes2 hex
  languagesPacked: string  // uint256 decimal string
  locationCityId: string   // bytes32 hex
  gender: number
  lookingFor: number
  profession: number
  relocate: number
  createdAt: string
  updatedAt: string
}

export interface CommunityMember extends CommunityCardProps {
  address: string
  bio?: string
  topArtists?: string[]
  locationCityId: string
  createdAt: number
  updatedAt: number
}

// ── Subgraph query ─────────────────────────────────────────────────

export interface FetchMembersOpts {
  first?: number
  skip?: number
  locationCityId?: string
  /** Filter by gender (matches contract enum number) */
  gender?: string
  /** Filter by native language (code, e.g. "en") — client-side filter */
  nativeLanguage?: string
  /** Filter by learning language (code, e.g. "es") — client-side filter */
  learningLanguage?: string
  /** Filter to only verified users — client-side filter */
  verified?: boolean
}

export async function fetchCommunityMembers(
  opts: FetchMembersOpts = {},
): Promise<CommunityMember[]> {
  const first = opts.first ?? 100 // Fetch more to allow client-side filtering
  const skip = opts.skip ?? 0

  // Build where clause — subgraph can only filter on indexed fields
  const conditions: string[] = []
  if (opts.locationCityId) {
    conditions.push(`locationCityId: "${opts.locationCityId}"`)
  }
  // Gender can be filtered at subgraph level (it's indexed)
  if (opts.gender) {
    const genderNum = GENDER_TO_NUM[opts.gender]
    if (genderNum !== undefined && genderNum > 0) {
      conditions.push(`gender: ${genderNum}`)
    }
  }
  const where = conditions.length > 0
    ? `where: { ${conditions.join(', ')} }`
    : ''

  const query = `{
    profiles(
      ${where}
      orderBy: updatedAt
      orderDirection: desc
      first: ${first}
      skip: ${skip}
    ) {
      id
      displayName
      photoURI
      age
      nationality
      languagesPacked
      locationCityId
      gender
      lookingFor
      profession
      relocate
      createdAt
      updatedAt
    }
  }`

  const res = await fetch(PROFILES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Profiles subgraph query failed: ${res.status}`)
  const json = await res.json()

  const profiles: ProfileGQL[] = json.data?.profiles ?? []
  if (profiles.length === 0) return []

  // Resolve display info, top artists, and verification in parallel
  const addresses = profiles.map((p) => p.id.toLowerCase())
  const [topArtistsMap, verifiedMap] = await Promise.all([
    fetchTopArtistsBatch(addresses),
    fetchVerificationBatch(addresses),
  ])

  let members = await Promise.all(
    profiles.map((p) => resolveProfileToMember(p, topArtistsMap, verifiedMap)),
  )

  // Client-side filtering for language and verification
  // (These require unpacking languagesPacked which isn't efficient at subgraph level)

  if (opts.nativeLanguage) {
    const targetLang = opts.nativeLanguage.toLowerCase()
    members = members.filter((m) =>
      m.languages?.some((l) => l.code === targetLang && l.proficiency === 7)
    )
  }

  if (opts.learningLanguage) {
    const targetLang = opts.learningLanguage.toLowerCase()
    members = members.filter((m) =>
      m.languages?.some((l) => l.code === targetLang && l.proficiency > 0 && l.proficiency < 7)
    )
  }

  if (opts.verified) {
    members = members.filter((m) => m.verified === 'verified')
  }

  return members
}

// ── Resolution helpers ─────────────────────────────────────────────

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'

async function resolveProfileToMember(
  p: ProfileGQL,
  topArtistsMap: Map<string, string[]>,
  verifiedMap: Map<string, boolean>,
): Promise<CommunityMember> {
  const addr = p.id.toLowerCase() as `0x${string}`

  // Unpack languages from the raw uint256
  const languages = unpackLanguages(p.languagesPacked)

  // Resolve heaven name + text records (bio, avatar) in parallel
  let name = p.displayName || shortenAddress(p.id)
  let bio: string | undefined
  let avatarUrl: string | undefined

  try {
    const primaryName = await getPrimaryName(addr)
    if (primaryName?.label) {
      name = primaryName.label
    }

    // If we have a heaven name, load text records
    const node = await getPrimaryNode(addr)
    if (node && node !== ZERO_HASH) {
      const [desc, avatar] = await Promise.all([
        getTextRecord(node as `0x${string}`, 'description').catch(() => ''),
        getTextRecord(node as `0x${string}`, 'avatar').catch(() => ''),
      ])
      bio = desc || undefined
      if (avatar) {
        const resolved = await resolveAvatarUri(avatar).catch(() => null)
        avatarUrl = resolved ?? undefined
      }
    }
  } catch {
    // Degrade gracefully — use displayName and no avatar
  }

  // Fallback: photoURI from contract
  if (!avatarUrl && p.photoURI) {
    avatarUrl = p.photoURI.startsWith('ipfs://')
      ? `https://heaven.myfilebase.com/ipfs/${p.photoURI.slice(7)}`
      : p.photoURI
  }

  // Gender abbreviation (M/F/NB/TW/TM/IX/O)
  const genderKey = NUM_TO_GENDER[p.gender] ?? ''
  let gender: string | undefined
  if (genderKey === 'man') gender = 'M'
  else if (genderKey === 'woman') gender = 'F'
  else if (genderKey === 'non-binary') gender = 'NB'
  else if (genderKey === 'trans-woman') gender = 'TW'
  else if (genderKey === 'trans-man') gender = 'TM'
  else if (genderKey === 'intersex') gender = 'IX'
  else if (genderKey === 'other') gender = 'O'

  // Verification state
  const isVerified = verifiedMap.get(addr)
  const verified: VerificationState = isVerified ? 'verified' : 'none'

  return {
    address: p.id,
    name,
    avatarUrl,
    bio,
    languages,
    age: p.age > 0 ? p.age : undefined,
    gender,
    topArtists: topArtistsMap.get(addr),
    verified,
    locationCityId: p.locationCityId,
    createdAt: parseInt(p.createdAt),
    updatedAt: parseInt(p.updatedAt),
  }
}

/**
 * Fetch the current user's locationCityId from the profiles subgraph.
 * Returns the bytes32 hex, or null if no profile / no location set.
 */
export async function fetchUserLocationCityId(
  userAddress: string,
): Promise<string | null> {
  const addr = userAddress.toLowerCase()
  const query = `{
    profile(id: "${addr}") {
      locationCityId
    }
  }`

  try {
    const res = await fetch(PROFILES_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const loc = json.data?.profile?.locationCityId
    if (!loc || loc === ZERO_HASH) return null
    return loc
  } catch {
    return null
  }
}

// ── Top artists (from activity subgraph) ───────────────────────────

/**
 * Fetch top artists for a batch of users from the activity subgraph.
 * Returns map of address → top 3 artist names.
 */
async function fetchTopArtistsBatch(
  addresses: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  if (addresses.length === 0) return result

  // Query recent scrobbles for all addresses in one go
  const addrList = addresses.map((a) => `"${a}"`).join(',')
  const query = `{
    scrobbles(
      where: { user_in: [${addrList}] }
      orderBy: timestamp
      orderDirection: desc
      first: 1000
    ) {
      user
      track {
        id
        artist
      }
    }
  }`

  try {
    const res = await fetch(ACTIVITY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) return result
    const json = await res.json()
    const scrobbles: Array<{ user: string; track: { id: string; artist: string } }> =
      json.data?.scrobbles ?? []

    // Group by user, count artist occurrences
    const userArtists = new Map<string, Map<string, number>>()
    for (const s of scrobbles) {
      const user = s.user.toLowerCase()
      const artist = s.track?.artist
      if (!artist) continue
      if (!userArtists.has(user)) userArtists.set(user, new Map())
      const counts = userArtists.get(user)!
      counts.set(artist, (counts.get(artist) ?? 0) + 1)
    }

    // Extract top 3 per user
    for (const [user, counts] of userArtists) {
      const sorted = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([artist]) => artist)
      if (sorted.length > 0) result.set(user, sorted)
    }
  } catch {
    // Degrade gracefully — no top artists
  }

  return result
}

// ── Verification (MegaETH mirror) ─────────────────────────────────

/**
 * Batch-check verification status from the MegaETH VerificationMirror.
 * Uses eth_call with verifiedAt(address) for each address.
 */
async function fetchVerificationBatch(
  addresses: string[],
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>()
  if (!VERIFICATION_MIRROR || addresses.length === 0) return result

  // verifiedAt(address) selector
  const selector = '0xdd612c2e'

  try {
    const calls = addresses.map(async (addr) => {
      const paddedAddr = addr.slice(2).padStart(64, '0')
      const data = selector + paddedAddr
      const res = await fetch(MEGAETH_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to: VERIFICATION_MIRROR, data }, 'latest'],
        }),
      })
      if (!res.ok) return
      const json = await res.json()
      const val = json.result
      if (val && val !== '0x' && val !== '0x' + '0'.repeat(64)) {
        const ts = parseInt(val, 16)
        if (ts > 0) result.set(addr.toLowerCase(), true)
      }
    })
    await Promise.all(calls)
  } catch {
    // Degrade gracefully — no verification badges
  }

  return result
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}
