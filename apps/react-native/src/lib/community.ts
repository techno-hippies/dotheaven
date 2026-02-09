/**
 * Community data layer — fetches member profiles from dotheaven-profiles subgraph.
 * Port of apps/frontend/src/lib/heaven/community.ts (read-only).
 */

import { createPublicClient, http, parseAbi } from 'viem';

// ── Constants ─────────────────────────────────────────────────────

const PROFILES_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-profiles/1.0.0/gn';

const IPFS_GATEWAY = 'https://heaven.myfilebase.com/ipfs/';

const REGISTRY_V1 = '0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2' as const;
const RECORDS_V1 = '0x80D1b5BBcfaBDFDB5597223133A404Dc5379Baf3' as const;
const MEGA_RPC = 'https://carrot.megaeth.com/rpc';

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

// ── Gender mapping ──────────────────────────────────────────────

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

function bytes2ToCode(hex: string): string | undefined {
  if (!hex || hex === '0x0000') return undefined;
  const n = parseInt(hex, 16);
  if (!n) return undefined;
  const c1 = String.fromCharCode((n >> 8) & 0xff);
  const c2 = String.fromCharCode(n & 0xff);
  return (c1 + c2).toUpperCase();
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

export interface FetchMembersOpts {
  first?: number;
  skip?: number;
  locationCityId?: string;
}

const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

export async function fetchCommunityMembers(
  opts: FetchMembersOpts = {},
): Promise<CommunityMember[]> {
  const first = opts.first ?? 50;
  const skip = opts.skip ?? 0;

  const conditions: string[] = [];
  if (opts.locationCityId) {
    conditions.push(`locationCityId: "${opts.locationCityId}"`);
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
  const genderKey = NUM_TO_GENDER[p.gender] ?? '';
  const gender = GENDER_ABBR[genderKey];

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
  if (!uri) return undefined;
  if (uri.startsWith('ipfs://')) return `${IPFS_GATEWAY}${uri.slice(7)}`;
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  return undefined;
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
