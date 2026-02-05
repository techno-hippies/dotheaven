/**
 * AA Client — builds ERC-4337 UserOps for ScrobbleV4 and submits
 * via the AA gateway's two-step handshake.
 *
 * Replaces Lit Action V3 scrobble path with Account Abstraction.
 */

import {
  type Address,
  type Hex,
  encodeFunctionData,
  encodeAbiParameters,
  keccak256,
  hashMessage,
  pad,
  toHex,
  concat,
  toBytes,
  recoverAddress,
  createPublicClient,
  http,
} from 'viem'
import type { PKPInfo, PKPAuthContext } from './lit'
import { getLitClient } from './lit/client'

// ── Config ────────────────────────────────────────────────────────────────

const DEFAULT_RPC = 'https://carrot.megaeth.com/rpc'
const AA_RPC_URL = import.meta.env.VITE_AA_RPC_URL ?? DEFAULT_RPC

// Deployed contracts
const ENTRYPOINT = (import.meta.env.VITE_AA_ENTRYPOINT ??
  '0x0000000071727De22E5E9d8BAf0edAc6f37da032') as Address
const FACTORY = '0xF78E2a3187DB720F738a5477f42dCAEF4fec10dB' as Address
const SCROBBLE_V4 = '0x1D23Ad1c20ce54224fEffe8c2E112296C321451E' as Address

// Gateway URL (configurable via env var for EigenCompute deployment)
const GATEWAY_URL = import.meta.env.VITE_AA_GATEWAY_URL ?? 'http://127.0.0.1:3337'
const GATEWAY_API_KEY = import.meta.env.VITE_AA_GATEWAY_KEY ?? ''

// Gas params for MegaEVM
const VERIFICATION_GAS_LIMIT = 2_000_000n
const CALL_GAS_LIMIT = 2_000_000n
const MAX_PRIORITY_FEE = 1_000_000n // 0.001 gwei
const MAX_FEE = 2_000_000n
const PRE_VERIFICATION_GAS = 100_000n

// ── ABIs ──────────────────────────────────────────────────────────────────

const factoryAbi = [{
  name: 'getAddress', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'owner', type: 'address' }, { name: 'salt', type: 'uint256' }],
  outputs: [{ type: 'address' }],
}] as const

const executeAbi = [{
  name: 'execute', type: 'function',
  inputs: [
    { name: 'dest', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'func', type: 'bytes' },
  ],
  outputs: [],
}] as const

const accountAbi = [{
  name: 'owner', type: 'function', stateMutability: 'view',
  inputs: [],
  outputs: [{ type: 'address' }],
}] as const

const scrobbleAbi = [{
  name: 'registerAndScrobbleBatch', type: 'function',
  inputs: [
    { name: 'user', type: 'address' },
    { name: 'regKinds', type: 'uint8[]' },
    { name: 'regPayloads', type: 'bytes32[]' },
    { name: 'titles', type: 'string[]' },
    { name: 'artists', type: 'string[]' },
    { name: 'albums', type: 'string[]' },
    { name: 'durations', type: 'uint32[]' },
    { name: 'trackIds', type: 'bytes32[]' },
    { name: 'timestamps', type: 'uint64[]' },
  ],
  outputs: [],
}, {
  name: 'scrobbleBatch', type: 'function',
  inputs: [
    { name: 'user', type: 'address' },
    { name: 'trackIds', type: 'bytes32[]' },
    { name: 'timestamps', type: 'uint64[]' },
  ],
  outputs: [],
}] as const

const entryPointAbi = [{
  name: 'getNonce', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'sender', type: 'address' }, { name: 'key', type: 'uint192' }],
  outputs: [{ type: 'uint256' }],
}, {
  name: 'getUserOpHash', type: 'function', stateMutability: 'view',
  inputs: [{
    name: 'userOp', type: 'tuple', components: [
      { name: 'sender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'initCode', type: 'bytes' },
      { name: 'callData', type: 'bytes' },
      { name: 'accountGasLimits', type: 'bytes32' },
      { name: 'preVerificationGas', type: 'uint256' },
      { name: 'gasFees', type: 'bytes32' },
      { name: 'paymasterAndData', type: 'bytes' },
      { name: 'signature', type: 'bytes' },
    ],
  }],
  outputs: [{ type: 'bytes32' }],
}] as const

// ── Types ─────────────────────────────────────────────────────────────────

interface UserOp {
  sender: Address
  nonce: Hex
  initCode: Hex
  callData: Hex
  accountGasLimits: Hex
  preVerificationGas: Hex
  gasFees: Hex
  paymasterAndData: Hex
  signature: Hex
}

export interface ScrobbleTrack {
  artist: string
  title: string
  album: string | null
  mbid: string | null
  ipId: string | null
  playedAtSec: number
  duration: number  // seconds
}

export interface AASubmitResult {
  userOpHash: string
  sender: Address
}

// ── Helpers ───────────────────────────────────────────────────────────────

function packUints(high128: bigint, low128: bigint): Hex {
  return pad(toHex((high128 << 128n) | low128), { size: 32 })
}

function normalizeString(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Compute trackId = keccak256(abi.encode(uint8(kind), bytes32(payload)))
 * Mirrors the on-chain logic in ScrobbleV4._registerOne().
 */
function computeTrackId(
  kind: number,
  payload: Hex,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint8' }, { type: 'bytes32' }],
      [kind, payload],
    ),
  )
}

export function computeTrackIdForScrobble(track: ScrobbleTrack): Hex {
  const { kind, payload } = deriveTrackKindAndPayload(track)
  return computeTrackId(kind, payload)
}

/**
 * Determine track kind and payload from scrobble metadata.
 * - Kind 1 (MBID): payload = bytes32(bytes16(mbid)) — left-aligned
 * - Kind 2 (ipId): payload = bytes32(uint256(uint160(ipId))) — right-aligned
 * - Kind 3 (meta): payload = keccak256(abi.encode(titleNorm, artistNorm, albumNorm))
 */
function deriveTrackKindAndPayload(
  track: ScrobbleTrack,
): { kind: number; payload: Hex } {
  if (track.mbid) {
    // Kind 1: MBID (MusicBrainz recording ID)
    // Remove dashes, pad to 16 bytes, left-align in bytes32
    const mbidHex = track.mbid.replace(/-/g, '')
    const payload = pad(`0x${mbidHex}` as Hex, { size: 32, dir: 'right' })
    return { kind: 1, payload }
  }

  if (track.ipId) {
    // Kind 2: Story Protocol IP ID (address)
    const payload = pad(track.ipId as Hex, { size: 32 })
    return { kind: 2, payload }
  }

  // Kind 3: metadata hash
  const payload = keccak256(
    encodeAbiParameters(
      [{ type: 'string' }, { type: 'string' }, { type: 'string' }],
      [
        normalizeString(track.title),
        normalizeString(track.artist),
        normalizeString(track.album ?? ''),
      ],
    ),
  )
  return { kind: 3, payload }
}

// ── PKP signing for UserOp hash ───────────────────────────────────────────

const SIG_SCHEME = (import.meta.env.VITE_AA_SIG_SCHEME ?? 'eip191').toLowerCase()

/**
 * Sign a userOpHash using the user's PKP via Lit Protocol.
 *
 * SimpleAccount._validateSignature expects:
 *   ECDSA.recover(toEthSignedMessageHash(userOpHash), signature)
 *
 * We manually compute the EIP-191 hash (hashMessage), then pass the
 * resulting 32-byte digest to signAndCombineEcdsa for a raw ECDSA sign.
 * This matches the proven pattern used by all other Lit Actions in the codebase.
 */
async function signUserOpHash(
  userOpHash: Hex,
  pkpInfo: PKPInfo,
  authContext: PKPAuthContext,
): Promise<Hex> {
  const litClient = await getLitClient()

  const useEip191 = SIG_SCHEME !== 'raw'

  // Apply EIP-191 prefix: keccak256("\x19Ethereum Signed Message:\n32" + userOpHash)
  // viem's hashMessage with raw bytes applies the personal sign prefix correctly.
  const ethSignedHash = useEip191 ? hashMessage({ raw: userOpHash }) : userOpHash

  if (import.meta.env.DEV) {
    console.log(`[AA] Sig scheme: ${useEip191 ? 'eip191' : 'raw'}`)
    console.log(`[AA] userOpHash (raw): ${userOpHash}`)
    console.log(`[AA] ethSignedHash (EIP-191): ${ethSignedHash}`)
  }

  // Convert to byte array for Lit
  const toSign = Array.from(toBytes(ethSignedHash))

  // Use signEcdsa for reliable signature extraction (r, s, recoveryId)
  const litActionCode = `(async () => {
    const toSign = new Uint8Array(jsParams.toSign);
    await Lit.Actions.signEcdsa({
      toSign,
      publicKey: jsParams.publicKey,
      sigName: "sig",
    });
  })();`

  const result = await litClient.executeJs({
    code: litActionCode,
    authContext,
    jsParams: {
      toSign,
      publicKey: pkpInfo.publicKey,
    },
  })

  const strip0x = (hex: string): string => (hex.startsWith('0x') ? hex.slice(2) : hex)

  const sig = result.signatures?.sig as any
  if (!sig) {
    const responseStr = typeof result.response === 'string'
      ? result.response.replace(/^"/, '').replace(/"$/, '')
      : ''
    throw new Error(
      `No signature returned from PKP for userOpHash (response=${responseStr || 'empty'})`,
    )
  }

  if (import.meta.env.DEV) {
    console.log('[AA] Raw Lit sig object:', JSON.stringify(sig))
  }

  // Extract r, s (each 32 bytes = 64 hex chars) and recovery id
  let r: string
  let s: string
  let recid: number

  if (sig.r && sig.s) {
    r = strip0x(sig.r).padStart(64, '0')
    s = strip0x(sig.s).padStart(64, '0')
    recid = Number(sig.recid ?? sig.recoveryId ?? 0)
  } else if (sig.signature) {
    const sigHex = strip0x(sig.signature)
    r = sigHex.slice(0, 64)
    s = sigHex.slice(64, 128)
    // signature field is r+s (128 chars), recid is separate
    recid = Number(sig.recid ?? sig.recoveryId ?? 0)
  } else {
    throw new Error(`Unknown Lit signature format: ${JSON.stringify(sig)}`)
  }

  // v = 27 + recid (recid is 0 or 1)
  const v = recid >= 27 ? recid : recid + 27
  const vHex = v.toString(16).padStart(2, '0')
  const signature = `0x${r}${s}${vHex}` as Hex

  if (import.meta.env.DEV) {
    console.log(`[AA] Signature: r=${r.slice(0,8)}... s=${s.slice(0,8)}... v=${v} (recid=${recid})`)
    console.log(`[AA] Full signature (${strip0x(signature).length / 2} bytes): ${signature.slice(0, 20)}...`)
    try {
      const recovered = await recoverAddress({ hash: ethSignedHash, signature })
      console.log(`[AA] Recovered signer: ${recovered} (expected pkp=${pkpInfo.ethAddress})`)
      if (recovered.toLowerCase() !== pkpInfo.ethAddress.toLowerCase()) {
        console.error(`[AA] MISMATCH! Recovered ${recovered} !== PKP ${pkpInfo.ethAddress}`)
      }
    } catch (err) {
      console.warn('[AA] Failed to recover signer for debug:', err)
    }
  }

  return signature
}

// ── Main API ──────────────────────────────────────────────────────────────

const rpcClient = createPublicClient({ transport: http(AA_RPC_URL) })

type GatewayHealth = {
  ok?: boolean
  chainId?: number
  entryPoint?: Address
  factory?: Address
  paymaster?: Address
  rpcUrl?: string
  bundlerUrl?: string
}

let cachedGatewayHealth: GatewayHealth | null = null

async function getGatewayHealth(): Promise<GatewayHealth | null> {
  if (cachedGatewayHealth) return cachedGatewayHealth
  try {
    const res = await fetch(`${GATEWAY_URL}/health`)
    if (!res.ok) return null
    const data = await res.json()
    cachedGatewayHealth = data as GatewayHealth
    return cachedGatewayHealth
  } catch {
    return null
  }
}

function gatewayHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (GATEWAY_API_KEY) {
    headers['authorization'] = `Bearer ${GATEWAY_API_KEY}`
  }
  return headers
}

/**
 * Get the user's SimpleAccount address (deterministic from factory + PKP address).
 */
export async function getAccountAddress(userAddress: Address): Promise<Address> {
  return await rpcClient.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: 'getAddress',
    args: [userAddress, 0n],
  }) as Address
}

/**
 * Submit scrobbles via AA gateway.
 *
 * Flow:
 * 1. Derive sender (SimpleAccount address)
 * 2. Check if account deployed, build initCode if needed
 * 3. Build inner calldata (registerAndScrobbleBatch on ScrobbleV4)
 * 4. Build unsigned UserOp
 * 5. POST /quotePaymaster → get paymasterAndData
 * 6. Compute userOpHash from EntryPoint
 * 7. Sign userOpHash with PKP
 * 8. POST /sendUserOp → forward to bundler
 */
export async function submitScrobbleViaAA(
  tracks: ScrobbleTrack[],
  userAddress: Address,
  pkpInfo: PKPInfo,
  authContext: PKPAuthContext,
): Promise<AASubmitResult> {
  if (import.meta.env.DEV) {
    console.log(`[AA] RPC: ${AA_RPC_URL}`)
    console.log(`[AA] Gateway: ${GATEWAY_URL}`)
    console.log(`[AA] EntryPoint: ${ENTRYPOINT}`)
  }

  const gatewayHealth = await getGatewayHealth()
  if (import.meta.env.DEV && gatewayHealth?.chainId) {
    console.log(`[AA] Gateway chainId: ${gatewayHealth.chainId}`)
  }

  if (gatewayHealth?.entryPoint) {
    if (gatewayHealth.entryPoint.toLowerCase() !== ENTRYPOINT.toLowerCase()) {
      throw new Error(
        `AA config mismatch: gateway entryPoint ${gatewayHealth.entryPoint} != client ${ENTRYPOINT}. ` +
        `Set VITE_AA_ENTRYPOINT to match.`,
      )
    }
  }

  if (gatewayHealth?.chainId) {
    const rpcChainId = await rpcClient.getChainId()
    if (import.meta.env.DEV) {
      console.log(`[AA] RPC chainId: ${rpcChainId}`)
    }
    if (rpcChainId !== gatewayHealth.chainId) {
      throw new Error(
        `AA chain mismatch: gateway chainId ${gatewayHealth.chainId} != RPC chainId ${rpcChainId}. ` +
        `Set VITE_AA_RPC_URL to the same chain as the AA gateway/bundler.`,
      )
    }
  }

  console.log(`[AA] Submitting ${tracks.length} scrobble(s) for ${userAddress}`)

  // 1. Derive sender
  const sender = await getAccountAddress(userAddress)
  console.log(`[AA] Sender (SimpleAccount): ${sender}`)

  // 2. Check if account deployed
  const code = await rpcClient.getCode({ address: sender })
  const needsInit = !code || code === '0x'

  let initCode: Hex = '0x'
  if (needsInit) {
    const createAccountCalldata = encodeFunctionData({
      abi: [{ name: 'createAccount', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'salt', type: 'uint256' }], outputs: [{ type: 'address' }] }],
      functionName: 'createAccount',
      args: [userAddress, 0n],
    })
    initCode = concat([FACTORY, createAccountCalldata])
    console.log('[AA] Account not deployed — will create via initCode')
  } else if (import.meta.env.DEV) {
    try {
      const owner = await rpcClient.readContract({
        address: sender,
        abi: accountAbi,
        functionName: 'owner',
      }) as Address
      console.log(`[AA] Account owner: ${owner}`)
      if (owner.toLowerCase() !== userAddress.toLowerCase()) {
        throw new Error(
          `SimpleAccount owner mismatch: owner=${owner} user=${userAddress}. ` +
          `Likely signing with the wrong key.`,
        )
      }
    } catch (err) {
      console.warn('[AA] Failed to read account owner (non-fatal):', err)
    }
  }

  // 3. Get nonce
  const nonce = await rpcClient.readContract({
    address: ENTRYPOINT,
    abi: entryPointAbi,
    functionName: 'getNonce',
    args: [sender, 0n],
  })

  // 4. Build inner calldata
  const regKinds: number[] = []
  const regPayloads: Hex[] = []
  const titles: string[] = []
  const artists: string[] = []
  const albums: string[] = []
  const durations: number[] = []
  const trackIds: Hex[] = []
  const timestamps: bigint[] = []

  for (const track of tracks) {
    const { kind, payload } = deriveTrackKindAndPayload(track)
    const trackId = computeTrackId(kind, payload)

    regKinds.push(kind)
    regPayloads.push(payload)
    titles.push(track.title)
    artists.push(track.artist)
    albums.push(track.album ?? '')
    durations.push(Math.floor(track.duration))
    trackIds.push(trackId)
    timestamps.push(BigInt(track.playedAtSec))
  }

  const innerCalldata = encodeFunctionData({
    abi: scrobbleAbi,
    functionName: 'registerAndScrobbleBatch',
    args: [userAddress, regKinds, regPayloads, titles, artists, albums, durations, trackIds, timestamps],
  })

  // 5. Build outer calldata: execute(ScrobbleV4, 0, innerCalldata)
  const callData = encodeFunctionData({
    abi: executeAbi,
    functionName: 'execute',
    args: [SCROBBLE_V4, 0n, innerCalldata],
  })

  // 6. Pack gas params
  const accountGasLimits = packUints(VERIFICATION_GAS_LIMIT, CALL_GAS_LIMIT)
  const gasFees = packUints(MAX_PRIORITY_FEE, MAX_FEE)

  // 7. Build unsigned UserOp
  const userOp: UserOp = {
    sender,
    nonce: toHex(nonce),
    initCode,
    callData,
    accountGasLimits,
    preVerificationGas: toHex(PRE_VERIFICATION_GAS),
    gasFees,
    paymasterAndData: '0x' as Hex,
    signature: '0x' as Hex,
  }

  // 8. POST /quotePaymaster
  console.log('[AA] Requesting paymaster quote...')
  const quoteRes = await fetch(`${GATEWAY_URL}/quotePaymaster`, {
    method: 'POST',
    headers: gatewayHeaders(),
    body: JSON.stringify({ userOp }),
  })

  if (!quoteRes.ok) {
    const err = await quoteRes.json().catch(() => ({ error: 'unknown' }))
    throw new Error(`Paymaster quote failed: ${err.error || quoteRes.statusText}`)
  }

  const quoteData = await quoteRes.json() as {
    paymasterAndData: Hex
    validUntil: number
    validAfter: number
  }

  // 9. Attach paymasterAndData
  userOp.paymasterAndData = quoteData.paymasterAndData

  // 10. Compute userOpHash from EntryPoint
  const userOpHash = await rpcClient.readContract({
    address: ENTRYPOINT,
    abi: entryPointAbi,
    functionName: 'getUserOpHash',
    args: [{
      sender: userOp.sender,
      nonce: BigInt(userOp.nonce),
      initCode: userOp.initCode,
      callData: userOp.callData,
      accountGasLimits: userOp.accountGasLimits as `0x${string}`,
      preVerificationGas: BigInt(userOp.preVerificationGas),
      gasFees: userOp.gasFees as `0x${string}`,
      paymasterAndData: userOp.paymasterAndData,
      signature: '0x',
    }],
  }) as Hex

  console.log(`[AA] userOpHash: ${userOpHash}`)

  // 11. Sign with PKP
  console.log('[AA] Signing userOpHash with PKP...')
  const signature = await signUserOpHash(userOpHash, pkpInfo, authContext)
  userOp.signature = signature

  // 12. POST /sendUserOp
  console.log('[AA] Sending signed UserOp to gateway...')
  const sendRes = await fetch(`${GATEWAY_URL}/sendUserOp`, {
    method: 'POST',
    headers: gatewayHeaders(),
    body: JSON.stringify({ userOp, userOpHash }),
  })

  const sendData = await sendRes.json() as { userOpHash?: string; error?: string; detail?: any }
  if (!sendRes.ok || sendData.error) {
    const detail = sendData.detail ? `: ${JSON.stringify(sendData.detail)}` : ''
    throw new Error(`sendUserOp failed: ${sendData.error || sendRes.statusText}${detail}`)
  }

  console.log(`[AA] Submitted! userOpHash: ${sendData.userOpHash}`)
  return { userOpHash: sendData.userOpHash!, sender }
}
