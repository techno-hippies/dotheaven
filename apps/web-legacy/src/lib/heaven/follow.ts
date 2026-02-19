/**
 * Follow — on-chain follow/unfollow via FollowV1 on MegaETH.
 *
 * RPC reads: follow state + counts (cheap, no subgraph needed).
 * Mutations: Lit Action → sponsor PKP broadcasts followFor()/unfollowFor().
 * Subgraph queries: follower/following lists for list pages.
 */

import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { FOLLOW_V1, SUBGRAPH_MUSIC_SOCIAL, SUBGRAPH_PROFILES } from '@heaven/core'
import { megaTestnetV2 } from '../chains'
import { getLitClient } from '../lit/client'
import { FOLLOW_V1_CID } from '../lit/action-cids'
import type { PKPAuthContext } from '../lit/types'
import { getPrimaryName } from './registry'
import { resolveAvatarUri } from './avatar-resolver'

const followAbi = parseAbi([
  'function follows(address, address) external view returns (bool)',
  'function followerCount(address) external view returns (uint256)',
  'function followingCount(address) external view returns (uint256)',
  'function getFollowCounts(address user) external view returns (uint256 followers, uint256 following)',
])

function getClient() {
  return createPublicClient({
    chain: megaTestnetV2,
    transport: http(megaTestnetV2.rpcUrls.default.http[0]),
  })
}

// ── RPC Reads ────────────────────────────────────────────────────

/** Check if viewer follows target (direct RPC, no subgraph) */
export async function getFollowState(viewer: Address, target: Address): Promise<boolean> {
  const client = getClient()
  return client.readContract({
    address: FOLLOW_V1 as Address,
    abi: followAbi,
    functionName: 'follows',
    args: [viewer, target],
  })
}

/** Get follower + following counts (direct RPC, no subgraph) */
export async function getFollowCounts(user: Address): Promise<{
  followers: number
  following: number
}> {
  const client = getClient()
  const [followers, following] = await client.readContract({
    address: FOLLOW_V1 as Address,
    abi: followAbi,
    functionName: 'getFollowCounts',
    args: [user],
  })
  return {
    followers: Number(followers),
    following: Number(following),
  }
}

// ── Mutations (via Lit Action) ───────────────────────────────────

export interface FollowResult {
  success: boolean
  txHash?: string
  error?: string
}

/** Follow or unfollow a target address via Lit Action + sponsor PKP */
export async function toggleFollow(
  targetAddress: string,
  action: 'follow' | 'unfollow',
  signMessage: (message: string) => Promise<string>,
  authContext: PKPAuthContext,
  pkpPublicKey: string,
): Promise<FollowResult> {
  const litClient = await getLitClient()

  const timestamp = Date.now()
  const nonce = Math.random().toString(36).slice(2)

  // Sign authorization message
  const message = `heaven:follow:${targetAddress}:${action}:${timestamp}:${nonce}`
  const signature = await signMessage(message)

  const result = await litClient.executeJs({
    ipfsId: FOLLOW_V1_CID,
    authContext,
    jsParams: {
      userPkpPublicKey: pkpPublicKey,
      targetAddress,
      action,
      signature,
      timestamp,
      nonce,
    },
  })

  const response = JSON.parse(result.response as string)
  return {
    success: response.success,
    txHash: response.txHash,
    error: response.error,
  }
}

// ── Subgraph Queries (for list pages) ────────────────────────────

interface FollowGQL {
  follower: string
  followee: string
  blockTimestamp: string
}

export interface FollowListMember {
  address: string
  name: string
  handle: string
  avatarUrl?: string
  nationalityCode?: string
  followedAt: number
}

/** Fetch followers of an address from subgraph */
export async function fetchFollowers(
  address: string,
  opts: { first?: number; skip?: number } = {},
): Promise<FollowListMember[]> {
  const first = opts.first ?? 50
  const skip = opts.skip ?? 0
  const addr = address.toLowerCase()

  const query = `{
    follows(
      where: { followee: "${addr}", active: true }
      orderBy: blockTimestamp
      orderDirection: desc
      first: ${first}
      skip: ${skip}
    ) {
      follower
      followee
      blockTimestamp
    }
  }`

  const res = await fetch(SUBGRAPH_MUSIC_SOCIAL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) return []
  const json = await res.json()
  const follows: FollowGQL[] = json.data?.follows ?? []

  const addresses = follows.map((f) => f.follower)
  const nationalityMap = await fetchNationalities(addresses)

  return Promise.all(follows.map((f) =>
    resolveFollowMember(f.follower, parseInt(f.blockTimestamp), nationalityMap)
  ))
}

/** Fetch users that an address follows from subgraph */
export async function fetchFollowing(
  address: string,
  opts: { first?: number; skip?: number } = {},
): Promise<FollowListMember[]> {
  const first = opts.first ?? 50
  const skip = opts.skip ?? 0
  const addr = address.toLowerCase()

  const query = `{
    follows(
      where: { follower: "${addr}", active: true }
      orderBy: blockTimestamp
      orderDirection: desc
      first: ${first}
      skip: ${skip}
    ) {
      follower
      followee
      blockTimestamp
    }
  }`

  const res = await fetch(SUBGRAPH_MUSIC_SOCIAL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) return []
  const json = await res.json()
  const follows: FollowGQL[] = json.data?.follows ?? []

  const addresses = follows.map((f) => f.followee)
  const nationalityMap = await fetchNationalities(addresses)

  return Promise.all(follows.map((f) =>
    resolveFollowMember(f.followee, parseInt(f.blockTimestamp), nationalityMap)
  ))
}

// ── Nationality Batch Query ─────────────────────────────────────

/** Batch-fetch nationalities from profiles subgraph. Returns map of lowercase address → alpha-2 code. */
async function fetchNationalities(addresses: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (addresses.length === 0) return map

  const ids = addresses.map((a) => `"${a.toLowerCase()}"`).join(', ')
  const query = `{
    profiles(where: { id_in: [${ids}] }) {
      id
      nationality
    }
  }`

  try {
    const res = await fetch(SUBGRAPH_PROFILES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) return map
    const json = await res.json()
    const profiles: { id: string; nationality: string }[] = json.data?.profiles ?? []

    for (const p of profiles) {
      const code = bytes2ToAlpha2(p.nationality)
      if (code) map.set(p.id.toLowerCase(), code)
    }
  } catch {
    // non-critical — just no flags
  }

  return map
}

/** Convert bytes2 hex (e.g. "0x5553") to uppercase alpha-2 country code (e.g. "US") */
function bytes2ToAlpha2(hex: string): string | undefined {
  if (!hex || hex === '0x0000' || hex === '0x00') return undefined
  const n = parseInt(hex, 16)
  if (!n) return undefined
  const c1 = String.fromCharCode((n >> 8) & 0xff)
  const c2 = String.fromCharCode(n & 0xff)
  return (c1 + c2).toUpperCase()
}

// ── Resolution ───────────────────────────────────────────────────

async function resolveFollowMember(
  address: string,
  followedAt: number,
  nationalityMap: Map<string, string>,
): Promise<FollowListMember> {
  const checksumAddr = address as Address

  let name = ''
  let handle = ''
  let avatarUrl: string | undefined

  try {
    const primary = await getPrimaryName(checksumAddr)
    if (primary) {
      name = primary.label
      handle = primary.label
    }
  } catch {
    // no heaven name
  }

  if (!name) {
    handle = `${address.slice(0, 6)}...${address.slice(-4)}`
    name = handle
  }

  try {
    avatarUrl = await resolveAvatarUri(checksumAddr) ?? undefined
  } catch {
    // no avatar
  }

  const nationalityCode = nationalityMap.get(address.toLowerCase())

  return { address, name, handle, avatarUrl, nationalityCode, followedAt }
}
