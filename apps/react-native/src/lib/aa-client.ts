/**
 * AA Client — builds ERC-4337 UserOps for ScrobbleV4 and submits
 * via the AA gateway's two-step handshake.
 *
 * React Native port of apps/frontend/src/lib/aa-client.ts.
 * PKP signing goes through the LitBridge WebView instead of direct Lit client.
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
  createPublicClient,
  http,
} from 'viem'
import { MEGA_RPC } from './heaven-constants'
import type { LitBridge } from '../services/LitBridge'

// ── Config ────────────────────────────────────────────────────────────────

const ENTRYPOINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as Address
const FACTORY = '0xB66BF4066F40b36Da0da34916799a069CBc79408' as Address
const SCROBBLE_V4 = '0xBcD4EbBb964182ffC5EA03FF70761770a326Ccf1' as Address

// Gateway URL — same as web frontend .env
const AA_GATEWAY_URL = 'http://34.168.65.48:3337'
const AA_GATEWAY_KEY = ''

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

function computeTrackId(kind: number, payload: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint8' }, { type: 'bytes32' }],
      [kind, payload],
    ),
  )
}

function deriveTrackKindAndPayload(
  track: ScrobbleTrack,
): { kind: number; payload: Hex } {
  if (track.mbid) {
    const mbidHex = track.mbid.replace(/-/g, '')
    const payload = pad(`0x${mbidHex}` as Hex, { size: 32, dir: 'right' })
    return { kind: 1, payload }
  }

  if (track.ipId) {
    const payload = pad(track.ipId as Hex, { size: 32 })
    return { kind: 2, payload }
  }

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

// ── PKP signing via LitBridge WebView ─────────────────────────────────────

/**
 * Sign a userOpHash using the user's PKP via the LitBridge WebView.
 *
 * SimpleAccount._validateSignature expects:
 *   ECDSA.recover(toEthSignedMessageHash(userOpHash), signature)
 *
 * We compute the EIP-191 hash, then pass it to signEcdsa via the bridge.
 */
async function signUserOpHash(
  userOpHash: Hex,
  pkpPublicKey: string,
  bridge: LitBridge,
): Promise<Hex> {
  // Apply EIP-191 prefix
  const ethSignedHash = hashMessage({ raw: userOpHash })

  // Convert to byte array for Lit
  const toSign = Array.from(toBytes(ethSignedHash))

  // Inline Lit Action for raw ECDSA signing
  const litActionCode = `(async () => {
    const toSign = new Uint8Array(jsParams.toSign);
    await Lit.Actions.signEcdsa({
      toSign,
      publicKey: jsParams.publicKey,
      sigName: "sig",
    });
  })();`

  const result = await bridge.sendRequest('executeLitAction', {
    code: litActionCode,
    jsParams: {
      toSign,
      publicKey: pkpPublicKey,
    },
  }, 120_000)

  console.log('[AA] Lit Action result:', JSON.stringify(result, null, 2))

  const strip0x = (hex: string): string => (hex?.startsWith('0x') ? hex.slice(2) : hex || '')

  const sig = result.signatures?.sig as any
  if (!sig) {
    const responseStr = typeof result.response === 'string'
      ? result.response.replace(/^"/, '').replace(/"$/, '')
      : ''
    throw new Error(
      `No signature returned from PKP for userOpHash (response=${responseStr || 'empty'})`,
    )
  }

  console.log('[AA] Signature object:', JSON.stringify(sig, null, 2))

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
    recid = Number(sig.recid ?? sig.recoveryId ?? 0)
  } else {
    throw new Error(`Unknown Lit signature format: ${JSON.stringify(sig)}`)
  }

  const v = recid >= 27 ? recid : recid + 27
  const vHex = v.toString(16).padStart(2, '0')
  return `0x${r}${s}${vHex}` as Hex
}

// ── Main API ──────────────────────────────────────────────────────────────

const rpcClient = createPublicClient({ transport: http(MEGA_RPC) })

type GatewayHealth = {
  ok?: boolean
  chainId?: number
  entryPoint?: Address
}

let cachedGatewayHealth: GatewayHealth | null = null

async function getGatewayHealth(): Promise<GatewayHealth | null> {
  if (cachedGatewayHealth) return cachedGatewayHealth
  try {
    const res = await fetch(`${AA_GATEWAY_URL}/health`)
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
  if (AA_GATEWAY_KEY) {
    headers['authorization'] = `Bearer ${AA_GATEWAY_KEY}`
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
 */
export async function submitScrobbleViaAA(
  tracks: ScrobbleTrack[],
  userAddress: Address,
  pkpPublicKey: string,
  bridge: LitBridge,
): Promise<AASubmitResult> {
  const gatewayHealth = await getGatewayHealth()

  if (gatewayHealth?.entryPoint) {
    if (gatewayHealth.entryPoint.toLowerCase() !== ENTRYPOINT.toLowerCase()) {
      throw new Error(
        `AA config mismatch: gateway entryPoint ${gatewayHealth.entryPoint} != client ${ENTRYPOINT}`,
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
  const quoteRes = await fetch(`${AA_GATEWAY_URL}/quotePaymaster`, {
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

  // 11. Sign with PKP via LitBridge
  console.log('[AA] Signing userOpHash with PKP...')
  const signature = await signUserOpHash(userOpHash, pkpPublicKey, bridge)
  userOp.signature = signature

  // 12. POST /sendUserOp
  console.log('[AA] Sending signed UserOp to gateway...')
  const sendRes = await fetch(`${AA_GATEWAY_URL}/sendUserOp`, {
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
