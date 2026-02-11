/**
 * Community data layer — fetches member profiles from dotheaven-profiles subgraph.
 * Port of apps/frontend/src/lib/heaven/community.ts (read-only).
 */

import { createPublicClient, http, parseAbi } from 'viem';
import {
  MEGA_RPC,
  IPFS_GATEWAY,
  PROFILES_ENDPOINT,
  REGISTRY_V1,
  RECORDS_V1,
  ZERO_HASH,
  toGenderAbbr,
  bytes2ToCode,
  resolveIpfsOrHttpUri,
} from './heaven-constants';

// ── Constants ─────────────────────────────────────────────────────

const registryAbi = parseAbi([
  'function primaryName(address) external view returns (string label, bytes32 parentNode)',
  'function primaryNode(address) external view returns (bytes32)',
]);

const recordsAbi = parseAbi([
  'function text(bytes32 node, string calldata key) external view returns (string)',
]);

// Singleton RPC client
let _client: ReturnType<typeof createPublicClient> | null = null;
function getClient() {
  if (!_client) {
    _client = createPublicClient({ transport: http(MEGA_RPC) });
  }
  return _client;
}

// ── Types ─────────────────────────────────────────────────────────

interface ProfileGQL {
  id: string;
  displayName: string;
  photoURI: string;
  age: number;
  nationality: string;
  locationCityId: string;
  gender: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityMember {
  address: string;
  name: string;
  avatarUrl?: string;
  nationalityCode?: string;
  age?: number;
  gender?: string;
  location?: string;
  bio?: string;
  locationCityId: string;
}

// ── Subgraph query ─────────────────────────────────────────────

/** Gender string → subgraph enum number */
const GENDER_TO_NUM: Record<string, number> = {
  woman: 1, man: 2, 'non-binary': 3, 'trans-woman': 4,
  'trans-man': 5, intersex: 6, other: 7,
};

export interface FetchMembersOpts {
  first?: number;
  skip?: number;
  locationCityId?: string;
  /** Gender filter key (e.g. "woman", "man") — subgraph-level */
  gender?: string;
}

export async function fetchCommunityMembers(
  opts: FetchMembersOpts = {},
): Promise<CommunityMember[]> {
  const first = opts.first ?? 50;
  const skip = opts.skip ?? 0;

  const conditions: string[] = [];
  if (opts.locationCityId) {
    conditions.push(`locationCityId: "${opts.locationCityId}"`);
  }
  if (opts.gender && GENDER_TO_NUM[opts.gender]) {
    conditions.push(`gender: ${GENDER_TO_NUM[opts.gender]}`);
  }
  const where =
    conditions.length > 0 ? `where: { ${conditions.join(', ')} }` : '';

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
      locationCityId
      gender
      createdAt
      updatedAt
    }
  }`;

  const res = await fetch(PROFILES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Profiles subgraph query failed: ${res.status}`);
  const json = await res.json();

  const profiles: ProfileGQL[] = json.data?.profiles ?? [];
  if (profiles.length === 0) return [];

  return Promise.all(profiles.map(resolveProfileToMember));
}

// ── Resolution ──────────────────────────────────────────────────

async function resolveProfileToMember(
  p: ProfileGQL,
): Promise<CommunityMember> {
  const addr = p.id.toLowerCase() as `0x${string}`;

  // Gender abbreviation
  const gender = toGenderAbbr(p.gender);

  // Nationality
  const nationalityCode = bytes2ToCode(p.nationality);

  // Resolve heaven name + text records
  let name = p.displayName || shortenAddress(p.id);
  let bio: string | undefined;
  let avatarUrl: string | undefined;
  let location: string | undefined;

  try {
    const client = getClient();
    const [label] = await client.readContract({
      address: REGISTRY_V1,
      abi: registryAbi,
      functionName: 'primaryName',
      args: [addr],
    });

    if (label) {
      name = label;

      const node = await client.readContract({
        address: REGISTRY_V1,
        abi: registryAbi,
        functionName: 'primaryNode',
        args: [addr],
      });

      if (node && node !== ZERO_HASH) {
        const [desc, avatar, loc] = await Promise.all([
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
              args: [node, 'avatar'],
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
        bio = desc || undefined;
        location = loc || undefined;
        if (avatar) {
          avatarUrl = resolveAvatarUri(avatar);
        }
      }
    }
  } catch {
    // Degrade gracefully
  }

  // Fallback: photoURI from contract
  if (!avatarUrl && p.photoURI) {
    avatarUrl = p.photoURI.startsWith('ipfs://')
      ? `${IPFS_GATEWAY}${p.photoURI.slice(7)}`
      : p.photoURI;
  }

  return {
    address: p.id,
    name,
    avatarUrl,
    nationalityCode,
    bio,
    location,
    age: p.age > 0 ? p.age : undefined,
    gender,
    locationCityId: p.locationCityId,
  };
}

function resolveAvatarUri(uri: string): string | undefined {
  return resolveIpfsOrHttpUri(uri);
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ── User location lookup ────────────────────────────────────────

export async function fetchUserLocationCityId(
  userAddress: string,
): Promise<string | null> {
  const addr = userAddress.toLowerCase();
  const query = `{
    profile(id: "${addr}") {
      locationCityId
    }
  }`;

  try {
    const res = await fetch(PROFILES_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const loc = json.data?.profile?.locationCityId;
    if (!loc || loc === ZERO_HASH) return null;
    return loc;
  } catch {
    return null;
  }
}
