/**
 * Content Crypto — AES-256-GCM encryption/decryption for Filecoin content.
 *
 * Encryption (upload):
 *   1. Generate random AES-256-GCM key (32 bytes)
 *   2. Encrypt audio binary with AES key (Web Crypto, no base64)
 *   3. Encrypt the AES key with Lit (contract-gated access condition on Base)
 *   4. Build header: [keyLen][litCiphertext][hashLen][dataToEncryptHash][algo][ivLen][iv][...encrypted audio...]
 *   5. Return combined blob for Synapse upload + metadata for content-register-v1
 *
 * Decryption (playback):
 *   1. Parse header from fetched blob
 *   2. Client-side litClient.decrypt() recovers AES key — Lit BLS nodes enforce
 *      canAccess() on Base ContentAccessMirror during threshold decryption
 *   3. Decrypt audio with AES key via Web Crypto
 *   4. Return plaintext audio bytes
 *
 * Header format (binary, big-endian):
 *   [4 bytes: litCiphertextLen]
 *   [litCiphertextLen bytes: Lit-encrypted AES key ciphertext (UTF-8)]
 *   [4 bytes: dataToEncryptHashLen]
 *   [dataToEncryptHashLen bytes: Lit dataToEncryptHash (UTF-8)]
 *   [1 byte: algo (1 = AES_GCM_256)]
 *   [1 byte: ivLen]
 *   [ivLen bytes: IV]
 *   [4 bytes: audioLen (encrypted audio length, excludes any trailing padding)]
 *   [audioLen bytes: AES-GCM encrypted audio]
 *   [optional trailing padding bytes]
 *
 * Access condition architecture:
 * The AES key is Lit-encrypted with a contract-gated access condition that calls
 * ContentAccessMirror.canAccess(user, contentId) on Base. This avoids IPFS CID
 * pinning dependencies — action CIDs can rotate freely without affecting decryption.
 * The mirror contract is immutable and sovereign: owners always have access.
 */

import { getLitClient } from './lit/client'
import type { PKPAuthContext } from './lit'
import { keccak256, encodeAbiParameters, type Hex } from 'viem'

// ── Constants ──────────────────────────────────────────────────────────

/** Encryption algorithm ID stored on-chain in ContentRegistry */
export const ALGO_AES_GCM_256 = 1

/** AES-GCM IV size in bytes */
const IV_BYTES = 12

/** AES key size in bytes */
const KEY_BYTES = 32

/** ContentRegistry address on MegaETH testnet */
export const CONTENT_REGISTRY = '0x9ca08C2D2170A43ecfA12AB35e06F2E1cEEB4Ef2'

/** ContentAccessMirror address on Base Sepolia (Lit access condition target) */
export const CONTENT_ACCESS_MIRROR = '0xd4D3baB38a11D72e36F49a73D50Dbdc3c1Aa4e9A'

/** Lit chain identifier for Base Sepolia */
const LIT_CHAIN = 'baseSepolia'

// ── Content ID ────────────────────────────────────────────────────────

/**
 * Compute contentId = keccak256(abi.encode(bytes32 trackId, address owner)).
 * Matches the on-chain ContentRegistry.computeContentId().
 */
export function computeContentId(trackId: string, owner: string): string {
  if (!isBytes32Hex(trackId)) {
    throw new Error(`Invalid trackId: expected 0x-prefixed bytes32 hex, got "${trackId}"`)
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    throw new Error(`Invalid owner: expected 0x-prefixed address, got "${owner}"`)
  }
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'address' }],
      [trackId as Hex, owner as `0x${string}`],
    ),
  ).toLowerCase()
}

/** Validate that a string looks like a 0x-prefixed bytes32 hex */
function isBytes32Hex(v: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(v)
}

// ── Types ──────────────────────────────────────────────────────────────

export interface EncryptedContent {
  /** Combined blob: header + encrypted audio, ready for Synapse upload */
  blob: Uint8Array
  /** Lit-encrypted AES key metadata (for header reconstruction if needed) */
  litCiphertext: string
  litDataToEncryptHash: string
  /** Access control conditions used for Lit encryption */
  accessControlConditions: any[]
  /** Raw IV used for AES-GCM (12 bytes) */
  iv: Uint8Array
}

export interface ContentHeader {
  litCiphertext: string
  litDataToEncryptHash: string
  algo: number
  iv: Uint8Array
  /** Length of encrypted audio in bytes (excludes trailing padding) */
  audioLen: number
  /** Byte offset where encrypted audio starts */
  audioOffset: number
}

// ── Encryption ─────────────────────────────────────────────────────────

/**
 * Encrypt audio bytes for Filecoin upload.
 *
 * The AES key is encrypted with Lit using a contract-gated access condition:
 * ContentAccessMirror.canAccess(:userAddress, contentId) on Base.
 * This means any user who passes canAccess() can decrypt — no IPFS CID dependency.
 *
 * @param audio - Raw audio bytes
 * @param contentId - bytes32 hex string (bound into the encrypted payload for key-content binding)
 * @param authContext - Lit PKP auth context for encrypting the AES key
 * @returns EncryptedContent with combined blob ready for Synapse upload
 */
export async function encryptAudio(
  audio: Uint8Array,
  contentId: string,
  authContext: PKPAuthContext,
): Promise<EncryptedContent> {
  // Validate contentId format (must be bytes32 hex)
  if (!isBytes32Hex(contentId)) {
    throw new Error(`Invalid contentId format: expected 0x-prefixed bytes32 hex, got "${contentId}"`)
  }
  if (!CONTENT_ACCESS_MIRROR) {
    throw new Error('CONTENT_ACCESS_MIRROR not set — deploy ContentAccessMirror first')
  }

  // 1. Generate random AES-256-GCM key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — we need raw bytes to encrypt with Lit
    ['encrypt'],
  )
  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key))

  // 2. Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))

  // 3. Encrypt audio with AES-GCM
  const encryptedAudio = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, audio),
  )

  // 4. Encrypt the AES key with Lit (contract-gated condition on Base)
  //    Payload is JSON with contentId binding + base64-encoded key (safe for string round-trip)
  const keyBase64 = btoa(String.fromCharCode(...rawKey))
  const payload = JSON.stringify({ contentId: contentId.toLowerCase(), key: keyBase64 })

  // Contract-gated: Lit nodes call canAccess(:userAddress, contentId) on Base
  const accessControlConditions = [
    {
      conditionType: 'evmContract',
      contractAddress: CONTENT_ACCESS_MIRROR,
      chain: LIT_CHAIN,
      functionName: 'canAccess',
      functionParams: [':userAddress', contentId.toLowerCase()],
      functionAbi: {
        type: 'function' as const,
        name: 'canAccess',
        stateMutability: 'view' as const,
        inputs: [
          { type: 'address', name: 'user', internalType: 'address' },
          { type: 'bytes32', name: 'contentId', internalType: 'bytes32' },
        ],
        outputs: [
          { type: 'bool', name: '', internalType: 'bool' },
        ],
      },
      returnValueTest: { key: '', comparator: '=', value: 'true' },
    },
  ]

  const litClient = await getLitClient()
  const { ciphertext, dataToEncryptHash } = await litClient.encrypt({
    unifiedAccessControlConditions: accessControlConditions,
    dataToEncrypt: new TextEncoder().encode(payload),
    authContext,
  })

  // 5. Build header + combine
  const blob = buildBlob(ciphertext, dataToEncryptHash, iv, encryptedAudio)

  // Zero the raw key
  rawKey.fill(0)

  return {
    blob,
    litCiphertext: ciphertext,
    litDataToEncryptHash: dataToEncryptHash,
    accessControlConditions,
    iv,
  }
}

// ── Decryption ─────────────────────────────────────────────────────────

/**
 * Parse the header from an encrypted content blob.
 * Does NOT decrypt — just extracts metadata needed to call the decrypt Lit Action.
 */
export function parseHeader(blob: Uint8Array): ContentHeader {
  if (blob.length < 10) {
    throw new Error(`Blob too small to contain a valid header (${blob.length} bytes)`)
  }

  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)
  let offset = 0

  // litCiphertext
  const ctLen = view.getUint32(offset)
  offset += 4
  if (ctLen === 0 || offset + ctLen > blob.length) {
    throw new Error(`Invalid litCiphertext length: ${ctLen}`)
  }
  const litCiphertext = new TextDecoder().decode(blob.subarray(offset, offset + ctLen))
  offset += ctLen

  // dataToEncryptHash
  if (offset + 4 > blob.length) throw new Error('Blob truncated before hashLen')
  const hashLen = view.getUint32(offset)
  offset += 4
  if (hashLen === 0 || offset + hashLen > blob.length) {
    throw new Error(`Invalid dataToEncryptHash length: ${hashLen}`)
  }
  const litDataToEncryptHash = new TextDecoder().decode(blob.subarray(offset, offset + hashLen))
  offset += hashLen

  // algo + ivLen (2 bytes)
  if (offset + 2 > blob.length) throw new Error('Blob truncated before algo/ivLen')
  const algo = blob[offset]
  offset += 1

  // IV
  const ivLen = blob[offset]
  offset += 1
  if (ivLen === 0 || offset + ivLen > blob.length) {
    throw new Error(`Invalid IV length: ${ivLen}`)
  }
  const iv = blob.subarray(offset, offset + ivLen)
  offset += ivLen

  // audioLen
  if (offset + 4 > blob.length) throw new Error('Blob truncated before audioLen')
  const audioLen = view.getUint32(offset)
  offset += 4
  if (audioLen === 0 || offset + audioLen > blob.length) {
    throw new Error(`Invalid audioLen: ${audioLen} (available: ${blob.length - offset})`)
  }

  return { litCiphertext, litDataToEncryptHash, algo, iv, audioLen, audioOffset: offset }
}

/**
 * Decrypt audio bytes from an encrypted content blob.
 *
 * @param blob - Full encrypted blob (header + encrypted audio) fetched from Beam CDN
 * @param decryptedKeyBase64 - Base64-encoded AES key returned by content-decrypt-v1 Lit Action
 * @returns Decrypted audio bytes
 */
export async function decryptAudio(
  blob: Uint8Array,
  decryptedKeyBase64: string,
): Promise<Uint8Array> {
  const header = parseHeader(blob)

  if (header.algo !== ALGO_AES_GCM_256) {
    throw new Error(`Unsupported encryption algorithm: ${header.algo} (expected ${ALGO_AES_GCM_256})`)
  }

  // Convert base64 key back to raw bytes
  const rawKey = Uint8Array.from(atob(decryptedKeyBase64), (c) => c.charCodeAt(0))
  if (rawKey.length !== KEY_BYTES) {
    throw new Error(`Invalid key length: ${rawKey.length}, expected ${KEY_BYTES}`)
  }

  // Import AES key
  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, [
    'decrypt',
  ])

  // Zero the raw key copy
  rawKey.fill(0)

  // Decrypt — use audioLen to exclude trailing padding
  const encryptedAudio = blob.subarray(header.audioOffset, header.audioOffset + header.audioLen)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: header.iv },
    key,
    encryptedAudio,
  )

  return new Uint8Array(decrypted)
}

// ── Beam CDN ───────────────────────────────────────────────────────────

/**
 * Build the Beam CDN URL for a content entry.
 *
 * @param datasetOwner - Address of the Synapse dataset owner (for Beam host)
 * @param pieceCid - Filecoin piece CID
 * @param network - 'calibration' (testnet) or 'mainnet'
 */
export function beamUrl(
  datasetOwner: string,
  pieceCid: string,
  network: 'calibration' | 'mainnet' = 'mainnet',
): string {
  const host = network === 'mainnet' ? 'filbeam.io' : 'calibration.filbeam.io'
  return `https://${datasetOwner}.${host}/${pieceCid}`
}

// ── Internal ───────────────────────────────────────────────────────────

function buildBlob(
  litCiphertext: string,
  dataToEncryptHash: string,
  iv: Uint8Array,
  encryptedAudio: Uint8Array,
): Uint8Array {
  const ctBytes = new TextEncoder().encode(litCiphertext)
  const hashBytes = new TextEncoder().encode(dataToEncryptHash)

  // Header: 4 + ctLen + 4 + hashLen + 1 (algo) + 1 (ivLen) + ivLen + 4 (audioLen)
  const headerSize = 4 + ctBytes.length + 4 + hashBytes.length + 1 + 1 + iv.length + 4
  const total = headerSize + encryptedAudio.length
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)

  let offset = 0

  // litCiphertext
  view.setUint32(offset, ctBytes.length)
  offset += 4
  out.set(ctBytes, offset)
  offset += ctBytes.length

  // dataToEncryptHash
  view.setUint32(offset, hashBytes.length)
  offset += 4
  out.set(hashBytes, offset)
  offset += hashBytes.length

  // algo
  out[offset] = ALGO_AES_GCM_256
  offset += 1

  // IV
  out[offset] = iv.length
  offset += 1
  out.set(iv, offset)
  offset += iv.length

  // audioLen
  view.setUint32(offset, encryptedAudio.length)
  offset += 4

  // Encrypted audio
  out.set(encryptedAudio, offset)

  return out
}
