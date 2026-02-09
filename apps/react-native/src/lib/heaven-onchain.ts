/**
 * Heaven On-chain Helpers for React Native
 *
 * Ports key functions from the web app's registry.ts, profile.ts, records.ts
 * to work via the Lit WebView bridge instead of direct litClient calls.
 *
 * Flow: RN → LitBridge.sendRequest() → WebView → litClient.executeJs()
 */

import { createPublicClient, http, parseAbi, keccak256, encodePacked, toBytes, defineChain } from 'viem';
import type { LitBridge } from '../services/LitBridge';
import {
  MEGA_RPC,
  REGISTRY_V1,
  RECORDS_V1,
  PROFILE_V2,
  HEAVEN_NODE,
  ZERO_HASH,
} from './heaven-constants';

// ── Contract addresses (from @heaven/core) ─────────────────────────

export { REGISTRY_V1, RECORDS_V1, PROFILE_V2, HEAVEN_NODE };

// ── Lit Action CIDs ────────────────────────────────────────────────

const HEAVEN_CLAIM_NAME_CID = 'QmQztQzc3tfZCwyyxXC9N9fK8bimiMWaaYapkJufHLjgg7';
const HEAVEN_SET_PROFILE_CID = 'QmWNyRKDjPUvG5RDinyep76Cyqr2zEKm9shUg6uJLzrUKS';
const HEAVEN_SET_RECORDS_CID = 'QmRhWGzCWYiDhbKSZ5Z9gmv5sr6nBTk5u8kAnM7YAKZ2sk';

// ── Chain + client ─────────────────────────────────────────────────

const megaTestnetV2 = defineChain({
  id: 6343,
  name: 'Mega Testnet V2',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [MEGA_RPC] },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
});

const registryAbi = parseAbi([
  'function available(bytes32 parentNode, string calldata label) external view returns (bool)',
  'function primaryName(address) external view returns (string label, bytes32 parentNode)',
  'function primaryNode(address) external view returns (bytes32)',
]);

const profileAbi = parseAbi([
  'function nonces(address user) external view returns (uint256)',
]);

const recordsAbi = parseAbi([
  'function nonces(bytes32 node) external view returns (uint256)',
]);

let _client: ReturnType<typeof createPublicClient> | null = null;

function getClient() {
  if (!_client) {
    _client = createPublicClient({
      chain: megaTestnetV2,
      transport: http(megaTestnetV2.rpcUrls.default.http[0]),
    });
  }
  return _client;
}

// ── Enum mappings (minimal set for onboarding) ─────────────────────

const GENDER_TO_NUM: Record<string, number> = {
  '': 0, woman: 1, man: 2, 'non-binary': 3, 'trans-woman': 4, 'trans-man': 5, intersex: 6, other: 7,
};

// ── Public API ─────────────────────────────────────────────────────

/**
 * Compute the ENS-compatible node (namehash) for a .heaven subname.
 * node = keccak256(abi.encodePacked(HEAVEN_NODE, keccak256(label)))
 */
export function computeNode(label: string): `0x${string}` {
  const labelHash = keccak256(toBytes(label));
  return keccak256(encodePacked(['bytes32', 'bytes32'], [HEAVEN_NODE, labelHash]));
}

/**
 * Check if a .heaven name is available (direct RPC, no Lit needed)
 */
export async function checkNameAvailable(label: string): Promise<boolean> {
  const client = getClient();
  return client.readContract({
    address: REGISTRY_V1,
    abi: registryAbi,
    functionName: 'available',
    args: [HEAVEN_NODE, label],
  });
}

/**
 * Reverse lookup: address → primary name label.
 * Returns null if no valid primary name.
 */
export async function getPrimaryName(address: `0x${string}`): Promise<{ label: string; node: `0x${string}` } | null> {
  const client = getClient();
  const [label, parentNode] = await client.readContract({
    address: REGISTRY_V1,
    abi: registryAbi,
    functionName: 'primaryName',
    args: [address],
  });
  if (!label) return null;

  const labelHash = keccak256(toBytes(label));
  const node = keccak256(encodePacked(['bytes32', 'bytes32'], [parentNode, labelHash]));
  return { node, label };
}

export interface RegisterResult {
  success: boolean;
  txHash?: string;
  tokenId?: string;
  node?: string;
  label?: string;
  error?: string;
}

/**
 * Register a .heaven name via Lit Action (gasless).
 *
 * 1. Sign message with PKP via bridge (signMessage)
 * 2. Execute Lit Action via bridge (executeLitAction)
 */
export async function registerHeavenName(
  label: string,
  recipientAddress: `0x${string}`,
  bridge: LitBridge,
  pkpPublicKey: string,
): Promise<RegisterResult> {
  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1_000_000_000);

  // Execute Lit Action — it signs internally via signAndCombineEcdsa
  const execResult = await bridge.sendRequest('executeLitAction', {
    ipfsId: HEAVEN_CLAIM_NAME_CID,
    jsParams: {
      recipient: recipientAddress,
      label,
      userPkpPublicKey: pkpPublicKey,
      timestamp,
      nonce,
    },
  }, 120000);

  const response = JSON.parse(execResult.response as string);
  return response as RegisterResult;
}

export interface SetProfileResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Set user's on-chain profile via Lit Action (gasless).
 * Simplified for onboarding — only sets age, gender, languages.
 */
export async function setProfile(
  data: { age?: number; gender?: string; nativeLanguage?: string; learningLanguage?: string },
  userAddress: `0x${string}`,
  bridge: LitBridge,
  pkpPublicKey: string,
): Promise<SetProfileResult> {
  const client = getClient();

  // Fetch on-chain nonce for replay protection
  const nonce = await client.readContract({
    address: PROFILE_V2,
    abi: profileAbi,
    functionName: 'nonces',
    args: [userAddress],
  });

  // Build minimal profile input
  // Pack languages: native (proficiency 7) + learning (proficiency 1)
  // Each entry: 16 bits lang code + 8 bits proficiency, packed into uint256
  let languagesPacked = '0';
  const langEntries: Array<{ code: string; proficiency: number }> = [];
  if (data.nativeLanguage) {
    langEntries.push({ code: data.nativeLanguage, proficiency: 7 });
  }
  if (data.learningLanguage) {
    langEntries.push({ code: data.learningLanguage, proficiency: 1 });
  }
  if (langEntries.length > 0) {
    // Pack languages into uint256: each entry is 24 bits (16 lang + 8 prof)
    // Big-endian from high bits
    let packed = BigInt(0);
    for (let i = 0; i < langEntries.length && i < 8; i++) {
      const { code, proficiency } = langEntries[i];
      const c1 = code.toUpperCase().charCodeAt(0);
      const c2 = code.toUpperCase().charCodeAt(1);
      const langCode = (c1 << 8) | c2;
      const entry = BigInt((langCode << 8) | proficiency);
      const shift = BigInt((7 - i) * 24);
      packed |= entry << shift;
    }
    languagesPacked = packed.toString();
  }

  const profileInput = {
    profileVersion: 2,
    displayName: '',
    nameHash: ZERO_HASH,
    age: data.age || 0,
    heightCm: 0,
    nationality: '0x0000',
    languagesPacked,
    friendsOpenToMask: 0,
    locationCityId: ZERO_HASH,
    schoolId: ZERO_HASH,
    skillsCommit: ZERO_HASH,
    hobbiesCommit: ZERO_HASH,
    photoURI: '',
    gender: GENDER_TO_NUM[data.gender || ''] ?? 0,
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
  };

  const execResult = await bridge.sendRequest('executeLitAction', {
    ipfsId: HEAVEN_SET_PROFILE_CID,
    jsParams: {
      user: userAddress,
      userPkpPublicKey: pkpPublicKey,
      profileInput,
      nonce: Number(nonce),
    },
  }, 120000);

  const response = JSON.parse(execResult.response as string);
  return response as SetProfileResult;
}

export interface SetTextRecordResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Set a text record on a .heaven name via Lit Action (gasless).
 */
export async function setTextRecord(
  node: string,
  key: string,
  value: string,
  bridge: LitBridge,
  pkpPublicKey: string,
): Promise<SetTextRecordResult> {
  const client = getClient();

  const nonce = await client.readContract({
    address: RECORDS_V1,
    abi: recordsAbi,
    functionName: 'nonces',
    args: [node as `0x${string}`],
  });

  const execResult = await bridge.sendRequest('executeLitAction', {
    ipfsId: HEAVEN_SET_RECORDS_CID,
    jsParams: {
      node,
      userPkpPublicKey: pkpPublicKey,
      nonce: Number(nonce),
      key,
      value,
    },
  }, 120000);

  const response = JSON.parse(execResult.response as string);
  return response as SetTextRecordResult;
}
