/**
 * Profile data layer (read-only) — fetches profile data from ProfileV2 + RecordsV1.
 * Reuses viem client pattern from posts.ts / heaven-onchain.ts.
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { getPrimaryName } from './heaven-onchain';
import {
  MEGA_RPC,
  PROFILE_V2,
  FOLLOW_V1,
  REGISTRY_V1,
  RECORDS_V1,
  ZERO_HASH,
  toGenderAbbr,
  bytes2ToCode,
  resolveIpfsOrHttpUri,
} from './heaven-constants';

// ── Constants ─────────────────────────────────────────────────────

const profileAbi = parseAbi([
  'function getProfile(address user) external view returns (uint8 profileVersion, string displayName, bytes32 nameHash, uint8 age, uint8 heightCm, bytes2 nationality, uint256 languagesPacked, uint8 friendsOpenToMask, bytes32 locationCityId, bytes32 schoolId, bytes32 skillsCommit, bytes32 hobbiesCommit, string photoURI, uint8 gender, uint8 relocate, uint8 degree, uint8 fieldBucket, uint8 profession, uint8 industry, uint8 relationshipStatus, uint8 sexuality, uint8 ethnicity, uint8 datingStyle, uint8 children, uint8 wantsChildren, uint8 drinking, uint8 smoking, uint8 drugs, uint8 lookingFor, uint8 religion, uint8 pets, uint8 diet)',
]);

const recordsAbi = parseAbi([
  'function text(bytes32 node, string calldata key) external view returns (string)',
]);

const followAbi = parseAbi([
  'function followerCount(address user) external view returns (uint256)',
  'function followingCount(address user) external view returns (uint256)',
]);

const registryAbi = parseAbi([
  'function primaryNode(address) external view returns (bytes32)',
]);

// ── Singleton client ────────────────────────────────────────────

let _client: ReturnType<typeof createPublicClient> | null = null;
function getClient() {
  if (!_client) {
    _client = createPublicClient({ transport: http(MEGA_RPC) });
  }
  return _client;
}

// ── Types ─────────────────────────────────────────────────────────

export interface ProfileData {
  name: string;
  handle?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  nationalityCode?: string;
  age?: number;
  gender?: string;
  followerCount: number;
  followingCount: number;
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Fetch a user's full display profile (read-only).
 * Combines ProfileV2 struct + RecordsV1 text records + FollowV1 counts.
 */
export async function fetchProfile(
  address: `0x${string}`,
): Promise<ProfileData> {
  const client = getClient();

  // Fetch profile struct + primary name + follow counts in parallel
  const [profileResult, primaryName, followCounts] = await Promise.all([
    client
      .readContract({
        address: PROFILE_V2,
        abi: profileAbi,
        functionName: 'getProfile',
        args: [address],
      })
      .catch(() => null),
    getPrimaryName(address).catch(() => null),
    getFollowCounts(address),
  ]);

  let name = shortenAddress(address);
  let handle: string | undefined;
  let age: number | undefined;
  let gender: string | undefined;
  let nationalityCode: string | undefined;

  if (profileResult) {
    // profileResult is a tuple matching the ABI
    const [
      , // profileVersion
      displayName,
      , // nameHash
      ageVal,
      , // heightCm
      nationality,
      , // languagesPacked
      , // friendsOpenToMask
      , // locationCityId
      , // schoolId
      , // skillsCommit
      , // hobbiesCommit
      , // photoURI
      genderVal,
    ] = profileResult;

    if (displayName) name = displayName;
    if (ageVal > 0) age = ageVal;

    gender = toGenderAbbr(genderVal);

    // nationality is bytes2, comes as hex string from viem
    const natHex = typeof nationality === 'string' ? nationality : `0x${Number(nationality).toString(16).padStart(4, '0')}`;
    nationalityCode = bytes2ToCode(natHex);
  }

  if (primaryName?.label) {
    name = primaryName.label;
    handle = `${primaryName.label}.heaven`;
  }

  // Fetch text records (avatar, bio, location) if we have a heaven name
  let avatarUrl: string | undefined;
  let bio: string | undefined;
  let location: string | undefined;

  try {
    const node = await client.readContract({
      address: REGISTRY_V1,
      abi: registryAbi,
      functionName: 'primaryNode',
      args: [address],
    });

    if (node && node !== ZERO_HASH) {
      const [avatar, desc, loc] = await Promise.all([
        client
          .readContract({
            address: RECORDS_V1,
            abi: recordsAbi,
            functionName: 'text',
            args: [node, 'avatar'],
          })
          .catch(() => ''),
        client
          .readContract({
            address: RECORDS_V1,
            abi: recordsAbi,
            functionName: 'text',
            args: [node, 'description'],
          })
          .catch(() => ''),
        client
          .readContract({
            address: RECORDS_V1,
            abi: recordsAbi,
            functionName: 'text',
            args: [node, 'heaven.location'],
          })
          .catch(() => ''),
      ]);
      if (avatar) avatarUrl = resolveAvatarUri(avatar);
      bio = desc || undefined;
      location = loc || undefined;
    }
  } catch {
    // Degrade gracefully
  }

  return {
    name,
    handle,
    avatarUrl,
    bio,
    location,
    nationalityCode,
    age,
    gender,
    ...followCounts,
  };
}

/**
 * Fetch follower + following counts from FollowV1 contract.
 */
export async function getFollowCounts(
  address: `0x${string}`,
): Promise<{ followerCount: number; followingCount: number }> {
  try {
    const client = getClient();
    const [followers, following] = await Promise.all([
      client.readContract({
        address: FOLLOW_V1,
        abi: followAbi,
        functionName: 'followerCount',
        args: [address],
      }),
      client.readContract({
        address: FOLLOW_V1,
        abi: followAbi,
        functionName: 'followingCount',
        args: [address],
      }),
    ]);
    return {
      followerCount: Number(followers),
      followingCount: Number(following),
    };
  } catch {
    return { followerCount: 0, followingCount: 0 };
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function resolveAvatarUri(uri: string): string | undefined {
  return resolveIpfsOrHttpUri(uri);
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
