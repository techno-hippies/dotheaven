/**
 * Heaven On-chain Helpers for React Native
 *
 * Ports key functions from the web app's registry.ts, profile.ts, records.ts
 * to work via the Lit WebView bridge instead of direct litClient calls.
 *
 * Flow: RN → LitBridge.sendRequest() → WebView → litClient.executeJs()
 */

import { createPublicClient, http, parseAbi, keccak256, encodePacked, encodeAbiParameters, toBytes, defineChain } from 'viem';
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

// CIDs must match lit-actions/cids/dev.json (naga-dev network)
const HEAVEN_CLAIM_NAME_CID = 'QmQB5GsQVaNbD8QS8zcXkjBMAZUjpADfbcWVaPgL3PygSA';
const HEAVEN_SET_PROFILE_CID = 'QmUJnDz9Q92bSLvNQMLyPDNSkw69MA3fpYsSCnAeMAJtuy';
const HEAVEN_SET_RECORDS_CID = 'QmaXJcjGbPWQ1ypKnQB3vfnDwaQ1NLEGFmN3t7gQisw9g5';

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

// ── Enum mappings ─────────────────────────────────────────────────

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
 * The Lit Action signs internally via signAndCombineEcdsa.
 */
export async function registerHeavenName(
  label: string,
  recipientAddress: `0x${string}`,
  bridge: LitBridge,
  pkpPublicKey: string,
  signMessage: (message: string) => Promise<string>,
): Promise<RegisterResult> {
  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1_000_000_000);

  // Pre-sign the EIP-191 message from the frontend (same as SolidJS web app).
  // This avoids signAndCombineEcdsa inside the Lit Action which is unreliable
  // with WebAuthn auth contexts.
  const message = `heaven:register:${label}:${recipientAddress}:${timestamp}:${nonce}`;
  const signature = await signMessage(message);

  const execResult = await bridge.sendRequest('executeLitAction', {
    ipfsId: HEAVEN_CLAIM_NAME_CID,
    jsParams: {
      recipient: recipientAddress,
      label,
      userPkpPublicKey: pkpPublicKey,
      timestamp,
      nonce,
      signature,
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
 * Pack up to 8 LanguageEntry into a decimal string for ProfileV2.
 * Layout: 8 x 32-bit slots from MSB.
 * Each slot: [langCode:16][proficiency:8][reserved:8]
 * Must match packages/ui/src/data/languages.ts packLanguages().
 */
export function packLanguages(entries: Array<{ code: string; proficiency: number }>): string {
  let packed = BigInt(0);
  const slots = entries.slice(0, 8);
  for (let i = 0; i < slots.length; i++) {
    const { code, proficiency } = slots[i];
    const upper = code.slice(0, 2).toUpperCase();
    const langCode = (upper.charCodeAt(0) << 8) | upper.charCodeAt(1);
    if (!langCode) continue;
    const slotVal = BigInt(((langCode & 0xffff) << 16) | ((proficiency & 0xff) << 8));
    const shift = BigInt((7 - i) * 32);
    packed |= slotVal << shift;
  }
  return packed.toString();
}

export interface SetProfileData {
  age?: number;
  gender?: string;         // string key like 'woman' (for onboarding compat)
  genderNum?: number;      // numeric enum value (for edit profile)
  heightCm?: number;
  languages?: Array<{ code: string; proficiency: number }>;
  relocate?: number;
  degree?: number;
  fieldBucket?: number;
  profession?: number;
  industry?: number;
  relationshipStatus?: number;
  sexuality?: number;
  ethnicity?: number;
  datingStyle?: number;
  children?: number;
  wantsChildren?: number;
  drinking?: number;
  smoking?: number;
  drugs?: number;
  lookingFor?: number;
  religion?: number;
  pets?: number;
  diet?: number;
}

/**
 * Set user's on-chain profile via Lit Action (gasless).
 * Pre-signs the EIP-191 message from frontend to avoid signAndCombineEcdsa
 * inside the Lit Action (unreliable with WebAuthn auth via WebView bridge).
 */
export async function setProfile(
  data: SetProfileData,
  userAddress: `0x${string}`,
  bridge: LitBridge,
  pkpPublicKey: string,
  signMessage: (message: string) => Promise<string>,
): Promise<SetProfileResult> {
  const client = getClient();

  // Fetch on-chain nonce for replay protection
  const nonce = await client.readContract({
    address: PROFILE_V2,
    abi: profileAbi,
    functionName: 'nonces',
    args: [userAddress],
  });

  const languagesPacked = data.languages?.length ? packLanguages(data.languages) : '0';
  const genderVal = data.genderNum ?? (GENDER_TO_NUM[data.gender || ''] ?? 0);

  const profileInput = {
    profileVersion: 2,
    displayName: '',
    nameHash: ZERO_HASH,
    age: data.age || 0,
    heightCm: data.heightCm || 0,
    nationality: '0x0000',
    languagesPacked,
    friendsOpenToMask: 0,
    locationCityId: ZERO_HASH,
    schoolId: ZERO_HASH,
    skillsCommit: ZERO_HASH,
    hobbiesCommit: ZERO_HASH,
    photoURI: '',
    gender: genderVal,
    relocate: data.relocate || 0,
    degree: data.degree || 0,
    fieldBucket: data.fieldBucket || 0,
    profession: data.profession || 0,
    industry: data.industry || 0,
    relationshipStatus: data.relationshipStatus || 0,
    sexuality: data.sexuality || 0,
    ethnicity: data.ethnicity || 0,
    datingStyle: data.datingStyle || 0,
    children: data.children || 0,
    wantsChildren: data.wantsChildren || 0,
    drinking: data.drinking || 0,
    smoking: data.smoking || 0,
    drugs: data.drugs || 0,
    lookingFor: data.lookingFor || 0,
    religion: data.religion || 0,
    pets: data.pets || 0,
    diet: data.diet || 0,
  };

  // Compute profileHash = keccak256(abi.encode(profileTuple))
  // Must match the Lit Action's encoding exactly (tuple encoding)
  const profileTuple = [
    profileInput.profileVersion,
    profileInput.displayName,
    profileInput.nameHash,
    profileInput.age,
    profileInput.heightCm,
    profileInput.nationality,
    BigInt(profileInput.languagesPacked),
    profileInput.friendsOpenToMask,
    profileInput.locationCityId,
    profileInput.schoolId,
    profileInput.skillsCommit,
    profileInput.hobbiesCommit,
    profileInput.photoURI,
    profileInput.gender,
    profileInput.relocate,
    profileInput.degree,
    profileInput.fieldBucket,
    profileInput.profession,
    profileInput.industry,
    profileInput.relationshipStatus,
    profileInput.sexuality,
    profileInput.ethnicity,
    profileInput.datingStyle,
    profileInput.children,
    profileInput.wantsChildren,
    profileInput.drinking,
    profileInput.smoking,
    profileInput.drugs,
    profileInput.lookingFor,
    profileInput.religion,
    profileInput.pets,
    profileInput.diet,
  ] as const;

  const profileEncoded = encodeAbiParameters(
    [{ type: 'tuple', components: [
      { type: 'uint8', name: 'profileVersion' },
      { type: 'string', name: 'displayName' },
      { type: 'bytes32', name: 'nameHash' },
      { type: 'uint8', name: 'age' },
      { type: 'uint16', name: 'heightCm' },
      { type: 'bytes2', name: 'nationality' },
      { type: 'uint256', name: 'languagesPacked' },
      { type: 'uint8', name: 'friendsOpenToMask' },
      { type: 'bytes32', name: 'locationCityId' },
      { type: 'bytes32', name: 'schoolId' },
      { type: 'bytes32', name: 'skillsCommit' },
      { type: 'bytes32', name: 'hobbiesCommit' },
      { type: 'string', name: 'photoURI' },
      { type: 'uint8', name: 'gender' },
      { type: 'uint8', name: 'relocate' },
      { type: 'uint8', name: 'degree' },
      { type: 'uint8', name: 'fieldBucket' },
      { type: 'uint8', name: 'profession' },
      { type: 'uint8', name: 'industry' },
      { type: 'uint8', name: 'relationshipStatus' },
      { type: 'uint8', name: 'sexuality' },
      { type: 'uint8', name: 'ethnicity' },
      { type: 'uint8', name: 'datingStyle' },
      { type: 'uint8', name: 'children' },
      { type: 'uint8', name: 'wantsChildren' },
      { type: 'uint8', name: 'drinking' },
      { type: 'uint8', name: 'smoking' },
      { type: 'uint8', name: 'drugs' },
      { type: 'uint8', name: 'lookingFor' },
      { type: 'uint8', name: 'religion' },
      { type: 'uint8', name: 'pets' },
      { type: 'uint8', name: 'diet' },
    ]}],
    [profileTuple],
  );
  const profileHash = keccak256(profileEncoded);

  const message = `heaven:profile:${userAddress.toLowerCase()}:${profileHash}:${Number(nonce)}`;
  const signature = await signMessage(message);

  const execResult = await bridge.sendRequest('executeLitAction', {
    ipfsId: HEAVEN_SET_PROFILE_CID,
    jsParams: {
      user: userAddress,
      userPkpPublicKey: pkpPublicKey,
      profileInput,
      nonce: Number(nonce),
      signature,
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
 * Pre-signs the EIP-191 message from frontend to avoid signAndCombineEcdsa
 * inside the Lit Action (unreliable with WebAuthn auth via WebView bridge).
 */
export async function setTextRecord(
  node: string,
  key: string,
  value: string,
  bridge: LitBridge,
  pkpPublicKey: string,
  signMessage: (message: string) => Promise<string>,
): Promise<SetTextRecordResult> {
  const client = getClient();

  const nonce = await client.readContract({
    address: RECORDS_V1,
    abi: recordsAbi,
    functionName: 'nonces',
    args: [node as `0x${string}`],
  });

  // heaven:records:{node}:{key}:{valueHash}:{nonce}
  const valueHash = keccak256(toBytes(value));
  const message = `heaven:records:${node.toLowerCase()}:${key}:${valueHash}:${Number(nonce)}`;
  const signature = await signMessage(message);

  const execResult = await bridge.sendRequest('executeLitAction', {
    ipfsId: HEAVEN_SET_RECORDS_CID,
    jsParams: {
      node,
      userPkpPublicKey: pkpPublicKey,
      nonce: Number(nonce),
      key,
      value,
      signature,
    },
  }, 120000);

  const response = JSON.parse(execResult.response as string);
  return response as SetTextRecordResult;
}
