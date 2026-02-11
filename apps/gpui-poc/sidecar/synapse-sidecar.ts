/**
 * Synapse sidecar (NDJSON over stdin/stdout)
 *
 * Minimal surface for GPUI integration:
 * - health
 * - storage.status
 * - storage.depositAndApprove
 * - storage.preflight
 * - storage.upload
 * - content.encryptUploadRegister
 * - storage.reset
 *
 * Run:
 *   bun apps/gpui-poc/sidecar/synapse-sidecar.ts
 *
 * Request format (one JSON object per line):
 *   {"id":"1","method":"health","params":{}}
 *
 * Response format:
 *   {"id":"1","result":{...}}
 *   {"id":"1","error":{"message":"..."}}
 */

import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ethers } from 'ethers'
import { Synapse, RPC_URLS } from '@filoz/synapse-sdk'
import { createLitClient } from '@lit-protocol/lit-client'
import { createAuthManager, storagePlugins, ViemAccountAuthenticator } from '@lit-protocol/auth'
import { nagaDev, nagaTest } from '@lit-protocol/networks'
import { privateKeyToAccount } from 'viem/accounts'

type FilecoinNetwork = 'mainnet' | 'calibration'

const rawFilecoinNetwork = (
  process.env.HEAVEN_FIL_NETWORK ||
  process.env.HEAVEN_FILECOIN_NETWORK ||
  'calibration'
)
  .trim()
  .toLowerCase()
const filecoinNetwork: FilecoinNetwork =
  rawFilecoinNetwork === 'mainnet' ? 'mainnet' : 'calibration'
const FIL_RPC = RPC_URLS[filecoinNetwork].http
const warmStorageOverride = process.env.HEAVEN_WARM_STORAGE_ADDRESS?.trim() || null
const USDFC_DECIMALS = 18
const EPOCHS_PER_DAY = 2880n
const DEFAULT_MAX_LOCKUP_EPOCHS = EPOCHS_PER_DAY * 30n
const ALGO_AES_GCM_256 = 1
const DEFAULT_UPLOAD_TIMEOUT_MS = 15 * 60 * 1000
const DEFAULT_REGISTER_TIMEOUT_MS = 2 * 60 * 1000
const DEFAULT_SPONSOR_PKP_ADDRESS = '0xF2a9Ea42e5eD701AE5E7532d4217AE94D3F03455'
const DEFAULT_SPONSOR_PKP_PUBLIC_KEY =
  '04fb425233a6b6c7628c42570d074d53fc7b4211464c9fc05f84a0f15f7d10cc2b149a2fca26f69539310b0ee129577b9d368015f207ce8719e5ef9040e340a0a5'
const SPONSOR_PKP_ADDRESS = (
  process.env.HEAVEN_SPONSOR_PKP_ADDRESS ||
  DEFAULT_SPONSOR_PKP_ADDRESS
).trim() as `0x${string}`
const SPONSOR_PKP_PUBLIC_KEY = (
  process.env.HEAVEN_SPONSOR_PKP_PUBLIC_KEY ||
  DEFAULT_SPONSOR_PKP_PUBLIC_KEY
)
  .trim()
const SPONSOR_PKP_PUBLIC_KEY_HEX = SPONSOR_PKP_PUBLIC_KEY.startsWith('0x')
  ? SPONSOR_PKP_PUBLIC_KEY
  : `0x${SPONSOR_PKP_PUBLIC_KEY}`
const CONTENT_ACCESS_MIRROR =
  process.env.HEAVEN_CONTENT_ACCESS_MIRROR || '0x4dD375b09160d09d4C33312406dFFAFb3f8A5035'
const LIT_CHAIN = process.env.HEAVEN_LIT_CHAIN || 'baseSepolia'
const CONTENT_REGISTER_V1_CID_BY_NETWORK: Record<string, string> = {
  'naga-dev': 'QmcyVkadHqJnFDhkrAPu4UjyPtYBbcLKqfMuYoHJnaQvde',
  'naga-test': 'QmdPHymWEbh4H8zBEhup9vWpCPwR5hTLK2Kb3H8hcjDga1',
}
const CONTENT_REGISTER_V2_CID_BY_NETWORK: Record<string, string> = {
  'naga-dev': '',
  'naga-test': '',
}
const CONTENT_REGISTER_V2_LOCAL_PATH = '../../../lit-actions/features/music/content-register-v2.js'

type ContentRegisterActionSpec =
  | { mode: 'ipfs'; value: string; source: string }
  | { mode: 'code'; value: string; source: string }

type Json = Record<string, unknown>

interface RpcRequest {
  id: string | number
  method: string
  params?: Json
}

interface PkpInfo {
  publicKey: string
  ethAddress: `0x${string}`
  tokenId?: string
}

interface AuthData {
  authMethodType: number
  authMethodId: string
  accessToken: unknown
  [key: string]: unknown
}

interface SidecarAuthInput {
  pkp: PkpInfo
  authData: AuthData
}

type CachedContext = {
  key: string
  synapse: Synapse
  diagnostics: {
    chainId: number
    warmStorageAddress: string
    paymentsAddress: string
    pdpVerifierAddress: string
  }
}

let cachedSynapse: CachedContext | null = null
let cachedAuthContext: { key: string; authContext: any } | null = null
let cachedSponsorAuthContext: { key: string; authContext: any } | null = null
let litClientSingleton: Awaited<ReturnType<typeof createLitClient>> | null = null
let authManagerSingleton: ReturnType<typeof createAuthManager> | null = null
let sponsorAuthManagerSingleton: ReturnType<typeof createAuthManager> | null = null
let cachedContentRegisterAction: ContentRegisterActionSpec | null = null

const litNetworkName = (process.env.LIT_NETWORK || process.env.VITE_LIT_NETWORK || 'naga-dev').trim()
const litNetwork = litNetworkName === 'naga-test' ? nagaTest : nagaDev
const UPLOAD_TIMEOUT_MS = parseTimeoutMs(process.env.HEAVEN_UPLOAD_TIMEOUT_MS, DEFAULT_UPLOAD_TIMEOUT_MS)
const REGISTER_TIMEOUT_MS = parseTimeoutMs(
  process.env.HEAVEN_REGISTER_TIMEOUT_MS,
  DEFAULT_REGISTER_TIMEOUT_MS,
)

function sidecarLog(scope: string, details: Record<string, unknown> = {}) {
  const payload = {
    ts: new Date().toISOString(),
    scope,
    litNetwork: litNetworkName,
    filecoinNetwork,
    filecoinRpc: FIL_RPC,
    ...details,
  }
  console.error(`[synapse-sidecar] ${JSON.stringify(payload)}`)
}

function parseTimeoutMs(raw: string | undefined, fallbackMs: number): number {
  if (!raw || !raw.trim()) return fallbackMs
  const parsed = Number(raw.trim())
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs
  return Math.floor(parsed)
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function getAuthCacheKey(input: SidecarAuthInput): string {
  return [
    input.pkp.publicKey,
    input.authData.authMethodType,
    input.authData.authMethodId,
    accessTokenCacheKey(input.authData.accessToken),
  ].join(':')
}

function normalizeAccessToken(input: unknown): string {
  if (typeof input === 'string') return input
  if (input == null) return ''
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}

function accessTokenCacheKey(input: unknown): string {
  if (typeof input === 'string') return input
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}

async function getLitClient() {
  if (!litClientSingleton) {
    litClientSingleton = await createLitClient({ network: litNetwork })
  }
  return litClientSingleton
}

function getAuthManager() {
  if (!authManagerSingleton) {
    authManagerSingleton = createAuthManager({
      storage: storagePlugins.localStorageNode({
        appName: 'heaven-sidecar',
        networkName: litNetworkName,
        storagePath: process.env.HEAVEN_SIDECAR_AUTH_PATH || './.heaven-sidecar-auth',
      }),
    })
  }
  return authManagerSingleton
}

function getSponsorAuthManager() {
  if (!sponsorAuthManagerSingleton) {
    sponsorAuthManagerSingleton = createAuthManager({
      storage: storagePlugins.localStorageNode({
        appName: 'heaven-sidecar-sponsor',
        networkName: litNetworkName,
        storagePath:
          process.env.HEAVEN_SIDECAR_SPONSOR_AUTH_PATH || './.heaven-sidecar-sponsor-auth',
      }),
    })
  }
  return sponsorAuthManagerSingleton
}

function requireSponsorPrivateKey(): `0x${string}` {
  const envRaw = (
    process.env.HEAVEN_SPONSOR_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    ''
  ).trim()
  if (envRaw) {
    return (envRaw.startsWith('0x') ? envRaw : `0x${envRaw}`) as `0x${string}`
  }

  const dotenvPaths = [
    resolve(process.cwd(), '../../../lit-actions/.env'),
    resolve(process.cwd(), '../.env'),
    resolve(process.cwd(), '.env'),
  ]
  for (const path of dotenvPaths) {
    try {
      const contents = readFileSync(path, 'utf8')
      const match = contents.match(/^\s*PRIVATE_KEY\s*=\s*([^\r\n#]+)\s*$/m)
      if (match?.[1]) {
        const raw = match[1].trim()
        sidecarLog('sponsor.key.loaded', { source: path })
        return (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`
      }
    } catch {
      // Ignore missing/unreadable fallback files.
    }
  }

  throw new Error(
    'Missing sponsor private key: set HEAVEN_SPONSOR_PRIVATE_KEY or PRIVATE_KEY for sidecar sponsor auth',
  )
}

async function createSponsorPkpAuthContext(): Promise<any> {
  const sponsorKey = `${litNetworkName}:${SPONSOR_PKP_PUBLIC_KEY_HEX}:${SPONSOR_PKP_ADDRESS}`
  if (cachedSponsorAuthContext && cachedSponsorAuthContext.key === sponsorKey) {
    return cachedSponsorAuthContext.authContext
  }

  const litClient = await getLitClient()
  const authManager = getSponsorAuthManager()
  const sponsorAccount = privateKeyToAccount(requireSponsorPrivateKey())
  const authData = await ViemAccountAuthenticator.authenticate(sponsorAccount)
  const authContext = await authManager.createPkpAuthContext({
    authData,
    pkpPublicKey: SPONSOR_PKP_PUBLIC_KEY_HEX,
    authConfig: {
      domain: process.env.HEAVEN_SIDECAR_DOMAIN || 'localhost',
      statement: 'Heaven desktop sponsor content registration',
      expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      resources: [
        ['lit-action-execution', '*'],
        ['pkp-signing', '*'],
        ['access-control-condition-decryption', '*'],
      ],
    },
    litClient,
  })

  cachedSponsorAuthContext = { key: sponsorKey, authContext }
  return authContext
}

async function createPkpAuthContext(input: SidecarAuthInput): Promise<any> {
  const key = getAuthCacheKey(input)
  if (cachedAuthContext && cachedAuthContext.key === key) {
    return cachedAuthContext.authContext
  }

  const litClient = await getLitClient()
  const authManager = getAuthManager()
  const authData = {
    ...input.authData,
    accessToken: normalizeAccessToken(input.authData.accessToken),
  }

  const authContext = await authManager.createPkpAuthContext({
    authData: authData as any,
    pkpPublicKey: input.pkp.publicKey,
    authConfig: {
      domain: process.env.HEAVEN_SIDECAR_DOMAIN || 'localhost',
      statement: 'Heaven desktop storage operations',
      expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      resources: [
        ['lit-action-execution', '*'],
        ['pkp-signing', '*'],
        ['access-control-condition-decryption', '*'],
      ],
    },
    litClient,
  })

  cachedAuthContext = { key, authContext }
  return authContext
}

function parseLitSignature(sig: any): { r: string; s: string; v: number } {
  const v = sig.recid !== undefined ? sig.recid + 27 : sig.recoveryId + 27
  if (sig.signature) {
    const hex = sig.signature.startsWith('0x') ? sig.signature.slice(2) : sig.signature
    return { r: `0x${hex.slice(0, 64)}`, s: `0x${hex.slice(64, 128)}`, v }
  }
  if (sig.r && sig.s) {
    return {
      r: sig.r.startsWith('0x') ? sig.r : `0x${sig.r}`,
      s: sig.s.startsWith('0x') ? sig.s : `0x${sig.s}`,
      v,
    }
  }
  throw new Error(`Unknown Lit signature format: ${JSON.stringify(sig)}`)
}

async function signHash(
  hashBytes: number[],
  publicKey: string,
  authContext: any,
): Promise<{ r: string; s: string; v: number }> {
  const litClient = await getLitClient()
  const code = `(async () => {
    const toSign = new Uint8Array(jsParams.hashBytes);
    await Lit.Actions.signEcdsa({
      toSign,
      publicKey: jsParams.publicKey,
      sigName: "sig",
    });
  })();`

  const result = await litClient.executeJs({
    code,
    authContext,
    jsParams: { hashBytes, publicKey },
  })

  if (!result.signatures?.sig) throw new Error('No signature returned from PKP')
  return parseLitSignature(result.signatures.sig)
}

async function signPersonalMessage(
  message: string,
  publicKey: string,
  authContext: any,
): Promise<string> {
  const litClient = await getLitClient()
  const code = `(async () => {
    await Lit.Actions.ethPersonalSignMessageEcdsa({
      message: jsParams.message,
      publicKey: jsParams.publicKey,
      sigName: "sig",
    });
  })();`

  const result = await litClient.executeJs({
    code,
    authContext,
    jsParams: { message, publicKey },
  })

  if (!result.signatures?.sig) throw new Error('No signature returned from PKP')
  const sig = result.signatures.sig as any
  const vHex = ((sig.recid ?? sig.recoveryId) + 27).toString(16).padStart(2, '0')
  const sigHex = sig.signature.startsWith('0x') ? sig.signature.slice(2) : sig.signature
  return `0x${sigHex}${vHex}`
}

function bytesFromPieceCid(value: string): Uint8Array {
  if (value.startsWith('0x')) return ethers.getBytes(value)
  return new TextEncoder().encode(value)
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

class PKPEthersSigner extends ethers.AbstractSigner {
  private _pkp: PkpInfo
  private _authContext: any

  constructor(pkp: PkpInfo, authContext: any, provider: ethers.Provider) {
    super(provider)
    this._pkp = pkp
    this._authContext = authContext
  }

  async getAddress(): Promise<string> {
    return this._pkp.ethAddress
  }

  connect(provider: ethers.Provider): PKPEthersSigner {
    return new PKPEthersSigner(this._pkp, this._authContext, provider)
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const litClient = await getLitClient()
    const msgStr = typeof message === 'string' ? message : ethers.hexlify(message)
    const code = `(async () => {
      await Lit.Actions.ethPersonalSignMessageEcdsa({
        message: jsParams.message,
        publicKey: jsParams.publicKey,
        sigName: "sig",
      });
    })();`

    const result = await litClient.executeJs({
      code,
      authContext: this._authContext,
      jsParams: { message: msgStr, publicKey: this._pkp.publicKey },
    })

    if (!result.signatures?.sig) throw new Error('No signature returned from PKP')
    const sig = result.signatures.sig as any
    const vHex = ((sig.recid ?? sig.recoveryId) + 27).toString(16).padStart(2, '0')
    const sigHex = sig.signature.startsWith('0x') ? sig.signature.slice(2) : sig.signature
    return `0x${sigHex}${vHex}`
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>,
  ): Promise<string> {
    const hash = ethers.TypedDataEncoder.hash(domain, types, value)
    const hashBytes = Array.from(ethers.getBytes(hash))
    const { r, s, v } = await signHash(hashBytes, this._pkp.publicKey, this._authContext)
    return ethers.Signature.from({ r, s, v }).serialized
  }

  async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
    const txToSign = { ...tx }

    if (txToSign.from === undefined) txToSign.from = this._pkp.ethAddress
    if (txToSign.nonce === undefined && this.provider) {
      txToSign.nonce = await this.provider.getTransactionCount(this._pkp.ethAddress)
    }
    if (txToSign.gasLimit === undefined && this.provider) {
      txToSign.gasLimit = await this.provider.estimateGas({
        ...txToSign,
        from: this._pkp.ethAddress,
      })
    }
    // Force legacy (type 0) — strip EIP-1559 fields and ensure gasPrice is set
    if (txToSign.maxFeePerGas !== undefined || txToSign.maxPriorityFeePerGas !== undefined) {
      if (txToSign.gasPrice === undefined && this.provider) {
        const feeData = await this.provider.getFeeData()
        txToSign.gasPrice = feeData.gasPrice
      }
      delete txToSign.maxFeePerGas
      delete txToSign.maxPriorityFeePerGas
      delete txToSign.accessList
    } else if (txToSign.gasPrice === undefined && this.provider) {
      const feeData = await this.provider.getFeeData()
      txToSign.gasPrice = feeData.gasPrice
    }
    if ((txToSign.chainId === undefined || txToSign.chainId === 0) && this.provider) {
      const network = await this.provider.getNetwork()
      txToSign.chainId = network.chainId
    } else if (txToSign.chainId === undefined || txToSign.chainId === 0) {
      txToSign.chainId = 314n
    }

    txToSign.type = 0

    const { from: _from, ...txWithoutFrom } = txToSign
    const unsignedTx = ethers.Transaction.from(txWithoutFrom as ethers.TransactionLike)
    const txHash = ethers.keccak256(unsignedTx.unsignedSerialized)
    const txHashBytes = Array.from(ethers.getBytes(txHash))

    const { r, s, v } = await signHash(txHashBytes, this._pkp.publicKey, this._authContext)
    const signedTx = ethers.Transaction.from({
      ...txWithoutFrom,
      signature: { r, s, v },
    } as ethers.TransactionLike)

    return signedTx.serialized
  }

  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    const populated = await this.populateTransaction(tx)
    const signedTx = await this.signTransaction(populated)
    if (!this.provider) throw new Error('No provider')
    return this.provider.broadcastTransaction(signedTx)
  }
}

async function getSynapse(input: SidecarAuthInput): Promise<Synapse> {
  const cacheKey = getAuthCacheKey(input)
  if (cachedSynapse && cachedSynapse.key === cacheKey) {
    sidecarLog('synapse.reuse', {
      pkpAddress: input.pkp.ethAddress,
      authMethodType: input.authData.authMethodType,
      authMethodId: input.authData.authMethodId,
      chainId: cachedSynapse.diagnostics.chainId,
      warmStorageAddress: cachedSynapse.diagnostics.warmStorageAddress,
      paymentsAddress: cachedSynapse.diagnostics.paymentsAddress,
      pdpVerifierAddress: cachedSynapse.diagnostics.pdpVerifierAddress,
    })
    return cachedSynapse.synapse
  }

  sidecarLog('synapse.create', {
    pkpAddress: input.pkp.ethAddress,
    authMethodType: input.authData.authMethodType,
    authMethodId: input.authData.authMethodId,
  })

  const authContext = await createPkpAuthContext(input)
  const provider = new ethers.JsonRpcProvider(FIL_RPC)
  const signer = new PKPEthersSigner(input.pkp, authContext, provider)
  const synapse = await Synapse.create({
    signer: signer as any,
    withCDN: true,
    warmStorageAddress: warmStorageOverride ?? undefined,
  })
  const diagnostics = {
    chainId: synapse.getChainId(),
    warmStorageAddress: synapse.getWarmStorageAddress(),
    paymentsAddress: synapse.getPaymentsAddress(),
    pdpVerifierAddress: synapse.getPDPVerifierAddress(),
  }
  sidecarLog('synapse.created', {
    pkpAddress: input.pkp.ethAddress,
    authMethodType: input.authData.authMethodType,
    authMethodId: input.authData.authMethodId,
    warmStorageOverride,
    ...diagnostics,
  })
  cachedSynapse = { key: cacheKey, synapse, diagnostics }
  return synapse
}

function requireAuthInput(params: Json | undefined): SidecarAuthInput {
  if (!params || typeof params !== 'object') {
    throw new Error('Missing params')
  }
  const pkp = params.pkp as PkpInfo | undefined
  const authData = params.authData as AuthData | undefined
  if (!pkp?.publicKey || !pkp?.ethAddress) throw new Error('Missing pkp')
  if (!authData?.authMethodId || authData.authMethodType === undefined) throw new Error('Missing authData')
  return { pkp, authData }
}

function formatUsd(value: string): string {
  const num = parseFloat(value)
  if (Number.isNaN(num) || num === 0) return '$0.00'
  return `$${num.toFixed(2)}`
}

function normalize(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function ensureBytes32Hex(v: string, label: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) {
    throw new Error(`Invalid ${label}: expected 0x-prefixed bytes32 hex, got "${v}"`)
  }
}

function buildTrackId(input: {
  title: string
  artist: string
  album: string
  mbid?: string
  ipId?: string
}): string {
  const abi = ethers.AbiCoder.defaultAbiCoder()
  if (input.mbid) {
    const mbidHex = (`0x${input.mbid.replace(/-/g, '').padEnd(64, '0')}`).toLowerCase()
    return ethers
      .keccak256(abi.encode(['uint8', 'bytes32'], [1, mbidHex]))
      .toLowerCase()
  }

  if (input.ipId) {
    const ipIdAddress = ethers.getAddress(input.ipId)
    const payload = ethers.zeroPadValue(ipIdAddress, 32)
    return ethers
      .keccak256(abi.encode(['uint8', 'bytes32'], [2, payload]))
      .toLowerCase()
  }

  const payload = ethers.keccak256(
    abi.encode(
      ['string', 'string', 'string'],
      [normalize(input.title), normalize(input.artist), normalize(input.album)],
    ),
  )

  return ethers
    .keccak256(abi.encode(['uint8', 'bytes32'], [3, payload]))
    .toLowerCase()
}

function computeContentId(trackId: string, owner: string): string {
  ensureBytes32Hex(trackId, 'trackId')
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    throw new Error(`Invalid owner address: "${owner}"`)
  }
  const abi = ethers.AbiCoder.defaultAbiCoder()
  return ethers
    .keccak256(abi.encode(['bytes32', 'address'], [trackId, owner]))
    .toLowerCase()
}

function inferTitleArtistAlbum(filePath: string): { title: string; artist: string; album: string } {
  const base = filePath.split('/').pop()?.split('\\').pop() || 'Unknown Track'
  const stem = base.replace(/\.[^.]+$/, '').trim()
  const split = stem.split(' - ')
  if (split.length >= 2) {
    const artist = split[0].trim()
    const title = split.slice(1).join(' - ').trim()
    if (artist && title) {
      return { title, artist, album: '' }
    }
  }
  return { title: stem || 'Unknown Track', artist: 'Unknown Artist', album: '' }
}

async function resolvePayload(params: Json | undefined): Promise<{
  payload: Uint8Array
  filePath?: string
}> {
  const bytesBase64 = typeof params?.bytesBase64 === 'string' ? params.bytesBase64 : null
  const filePath = typeof params?.filePath === 'string' ? params.filePath : null

  if (!bytesBase64 && !filePath) {
    throw new Error('Missing payload: provide bytesBase64 or filePath')
  }

  if (bytesBase64) {
    return { payload: new Uint8Array(Buffer.from(bytesBase64, 'base64')) }
  }

  return {
    payload: new Uint8Array(await readFile(filePath!)),
    filePath: filePath!,
  }
}

async function getContentRegisterAction(): Promise<ContentRegisterActionSpec> {
  if (cachedContentRegisterAction) return cachedContentRegisterAction

  const v2Override = process.env.HEAVEN_CONTENT_REGISTER_V2_CID?.trim() || ''
  if (v2Override) {
    cachedContentRegisterAction = {
      mode: 'ipfs',
      value: v2Override,
      source: 'HEAVEN_CONTENT_REGISTER_V2_CID',
    }
    sidecarLog('content.register.action', {
      mode: 'ipfs',
      source: cachedContentRegisterAction.source,
      cid: v2Override,
    })
    return cachedContentRegisterAction
  }

  const v2Mapped = (CONTENT_REGISTER_V2_CID_BY_NETWORK[litNetworkName] || '').trim()
  if (v2Mapped) {
    cachedContentRegisterAction = {
      mode: 'ipfs',
      value: v2Mapped,
      source: `contentRegisterV2Map:${litNetworkName}`,
    }
    sidecarLog('content.register.action', {
      mode: 'ipfs',
      source: cachedContentRegisterAction.source,
      cid: v2Mapped,
    })
    return cachedContentRegisterAction
  }

  const localCodePath = resolve(
    process.cwd(),
    process.env.HEAVEN_CONTENT_REGISTER_V2_CODE_PATH?.trim() || CONTENT_REGISTER_V2_LOCAL_PATH,
  )
  try {
    const code = await readFile(localCodePath, 'utf-8')
    if (code.trim()) {
      cachedContentRegisterAction = {
        mode: 'code',
        value: code,
        source: localCodePath,
      }
      sidecarLog('content.register.action', {
        mode: 'code',
        source: cachedContentRegisterAction.source,
      })
      return cachedContentRegisterAction
    }
  } catch {
    // Fall back to v1 CID for compatibility.
  }

  const v1Override = process.env.HEAVEN_CONTENT_REGISTER_V1_CID?.trim() || ''
  if (v1Override) {
    cachedContentRegisterAction = {
      mode: 'ipfs',
      value: v1Override,
      source: 'HEAVEN_CONTENT_REGISTER_V1_CID',
    }
    sidecarLog('content.register.action', {
      mode: 'ipfs',
      source: cachedContentRegisterAction.source,
      cid: v1Override,
      legacy: true,
    })
    return cachedContentRegisterAction
  }

  const v1Mapped = (CONTENT_REGISTER_V1_CID_BY_NETWORK[litNetworkName] || '').trim()
  if (v1Mapped) {
    cachedContentRegisterAction = {
      mode: 'ipfs',
      value: v1Mapped,
      source: `contentRegisterV1Map:${litNetworkName}`,
    }
    sidecarLog('content.register.action', {
      mode: 'ipfs',
      source: cachedContentRegisterAction.source,
      cid: v1Mapped,
      legacy: true,
    })
    return cachedContentRegisterAction
  }

  throw new Error(
    `Missing content-register action: set HEAVEN_CONTENT_REGISTER_V2_CID, ` +
      `or provide HEAVEN_CONTENT_REGISTER_V2_CODE_PATH, ` +
      `or set HEAVEN_CONTENT_REGISTER_V1_CID (network=${litNetworkName})`,
  )
}

function buildBlob(
  litCiphertext: string,
  dataToEncryptHash: string,
  iv: Uint8Array,
  encryptedAudio: Uint8Array,
): Uint8Array {
  const ctBytes = new TextEncoder().encode(litCiphertext)
  const hashBytes = new TextEncoder().encode(dataToEncryptHash)
  const headerSize = 4 + ctBytes.length + 4 + hashBytes.length + 1 + 1 + iv.length + 4
  const out = new Uint8Array(headerSize + encryptedAudio.length)
  const view = new DataView(out.buffer)

  let offset = 0
  view.setUint32(offset, ctBytes.length)
  offset += 4
  out.set(ctBytes, offset)
  offset += ctBytes.length

  view.setUint32(offset, hashBytes.length)
  offset += 4
  out.set(hashBytes, offset)
  offset += hashBytes.length

  out[offset] = ALGO_AES_GCM_256
  offset += 1
  out[offset] = iv.length
  offset += 1
  out.set(iv, offset)
  offset += iv.length

  view.setUint32(offset, encryptedAudio.length)
  offset += 4
  out.set(encryptedAudio, offset)
  return out
}

async function encryptForUpload(
  sourceBytes: Uint8Array,
  contentId: string,
  authContext: any,
): Promise<Uint8Array> {
  ensureBytes32Hex(contentId, 'contentId')
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt'],
  )
  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encryptedAudio = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, sourceBytes),
  )
  const keyBase64 = Buffer.from(rawKey).toString('base64')
  rawKey.fill(0)

  const litClient = await getLitClient()
  const payload = JSON.stringify({ contentId: contentId.toLowerCase(), key: keyBase64 })
  const unifiedAccessControlConditions = [
    {
      conditionType: 'evmContract',
      contractAddress: CONTENT_ACCESS_MIRROR,
      chain: LIT_CHAIN,
      functionName: 'canAccess',
      functionParams: [':userAddress', contentId.toLowerCase()],
      functionAbi: {
        type: 'function',
        name: 'canAccess',
        stateMutability: 'view',
        inputs: [
          { type: 'address', name: 'user', internalType: 'address' },
          { type: 'bytes32', name: 'contentId', internalType: 'bytes32' },
        ],
        outputs: [{ type: 'bool', name: '', internalType: 'bool' }],
      },
      returnValueTest: { key: '', comparator: '=', value: 'true' },
    },
  ]

  const { ciphertext, dataToEncryptHash } = await (litClient as any).encrypt({
    unifiedAccessControlConditions,
    dataToEncrypt: new TextEncoder().encode(payload),
    authContext,
    chain: LIT_CHAIN,
  })

  return buildBlob(ciphertext, dataToEncryptHash, iv, encryptedAudio)
}

async function ensureUploadReady(
  synapse: Synapse,
  context: { pkpAddress?: string },
  sizeBytes?: number,
): Promise<{ ready: boolean; reason?: string; suggestedDeposit?: string }> {
  sidecarLog('storage.ensure_ready.start', {
    pkpAddress: context.pkpAddress,
    sizeBytes: sizeBytes ?? null,
  })

  let availableFunds = 0n
  try {
    const info = await synapse.payments.accountInfo()
    availableFunds = info.availableFunds
    sidecarLog('storage.account_info', {
      pkpAddress: context.pkpAddress,
      availableFundsRaw: info.availableFunds.toString(),
      lockupRateRaw: info.lockupRate.toString(),
    })
  } catch (err) {
    sidecarLog('storage.account_info.error', {
      pkpAddress: context.pkpAddress,
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      ready: false,
      reason:
        'Unable to read storage balance from Filecoin RPC. Check network/RPC and wallet funding state.',
      suggestedDeposit: '1.00',
    }
  }

  if (availableFunds === 0n) {
    sidecarLog('storage.ensure_ready.empty_balance', {
      pkpAddress: context.pkpAddress,
      availableFundsRaw: '0',
    })
    return {
      ready: false,
      reason: 'Storage balance is empty. Add funds on the Wallet page to enable uploads.',
      suggestedDeposit: '1.00',
    }
  }

  let isApproved = false
  try {
    const storageInfo = await synapse.storage.getStorageInfo()
    isApproved = storageInfo.allowances?.isApproved ?? false
    sidecarLog('storage.allowance', {
      pkpAddress: context.pkpAddress,
      operatorApproved: isApproved,
    })
  } catch (err) {
    sidecarLog('storage.allowance.error', {
      pkpAddress: context.pkpAddress,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  if (!isApproved) {
    return {
      ready: false,
      reason: 'Storage not set up. Add funds on the Wallet page to enable uploads.',
      suggestedDeposit: '1.00',
    }
  }

  if (sizeBytes !== undefined) {
    try {
      const preflight = await synapse.storage.preflightUpload(sizeBytes)
      sidecarLog('storage.preflight', {
        pkpAddress: context.pkpAddress,
        sizeBytes,
        sufficient: preflight.allowanceCheck.sufficient,
        message: preflight.allowanceCheck.message || null,
      })
      if (!preflight.allowanceCheck.sufficient) {
        return {
          ready: false,
          reason:
            preflight.allowanceCheck.message ||
            'Insufficient storage allowance. Add more funds on the Wallet page.',
          suggestedDeposit: '5.00',
        }
      }
    } catch (err) {
      sidecarLog('storage.preflight.error', {
        pkpAddress: context.pkpAddress,
        sizeBytes,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { ready: true }
}

async function storageStatus(params: Json | undefined) {
  const input = requireAuthInput(params)
  const synapse = await getSynapse(input)

  let balanceRaw = 0n
  let lockupRate = 0n
  let accountInfoError: string | null = null
  try {
    const info = await synapse.payments.accountInfo()
    balanceRaw = info.availableFunds
    lockupRate = info.lockupRate
  } catch (err) {
    accountInfoError = err instanceof Error ? err.message : String(err)
    sidecarLog('storage.status.account_info.error', {
      pkpAddress: input.pkp.ethAddress,
      error: accountInfoError,
    })
  }

  let operatorApproved = false
  let storageInfoError: string | null = null
  try {
    const storageInfo = await synapse.storage.getStorageInfo()
    operatorApproved = storageInfo.allowances?.isApproved ?? false
  } catch (err) {
    storageInfoError = err instanceof Error ? err.message : String(err)
    sidecarLog('storage.status.allowance.error', {
      pkpAddress: input.pkp.ethAddress,
      error: storageInfoError,
    })
  }

  const balance = ethers.formatUnits(balanceRaw, USDFC_DECIMALS)
  const epochsPerMonth = EPOCHS_PER_DAY * 30n
  const monthlyCostRaw = lockupRate * epochsPerMonth
  const monthlyCost = ethers.formatUnits(monthlyCostRaw, USDFC_DECIMALS)

  let daysRemaining: number | null = null
  if (lockupRate > 0n) {
    const dailyCost = lockupRate * EPOCHS_PER_DAY
    if (dailyCost > 0n) daysRemaining = Number(balanceRaw / dailyCost)
  }

  sidecarLog('storage.status', {
    pkpAddress: input.pkp.ethAddress,
    balanceRaw: balanceRaw.toString(),
    lockupRateRaw: lockupRate.toString(),
    operatorApproved,
    accountInfoError,
    storageInfoError,
  })

  return {
    balance: formatUsd(balance),
    balanceRaw: balanceRaw.toString(),
    operatorApproved,
    monthlyCost: formatUsd(monthlyCost),
    daysRemaining,
    ready: balanceRaw > 0n && operatorApproved,
    accountInfoError,
    storageInfoError,
  }
}

async function storageDepositAndApprove(params: Json | undefined) {
  const input = requireAuthInput(params)
  const amount = typeof params?.amount === 'string' ? params.amount : null
  if (!amount) throw new Error('Missing amount')

  const synapse = await getSynapse(input)
  const amountWei = ethers.parseUnits(amount, USDFC_DECIMALS)

  let isApproved = false
  try {
    const storageInfo = await synapse.storage.getStorageInfo()
    isApproved = storageInfo.allowances?.isApproved ?? false
  } catch {}

  if (!isApproved) {
    const warmAddr = synapse.getWarmStorageAddress()
    const rateAllowance = ethers.parseUnits('10', USDFC_DECIMALS)
    const lockupAllowance = ethers.parseUnits('100', USDFC_DECIMALS)
    const tx = await synapse.payments.depositWithPermitAndApproveOperator(
      amountWei,
      warmAddr,
      rateAllowance,
      lockupAllowance,
      DEFAULT_MAX_LOCKUP_EPOCHS,
    )
    const receipt = await tx.wait()
    return { txHash: receipt?.hash || tx.hash }
  }

  const tx = await synapse.payments.deposit(amountWei)
  const receipt = await tx.wait()
  return { txHash: receipt?.hash || tx.hash }
}

async function storagePreflight(params: Json | undefined) {
  const input = requireAuthInput(params)
  const sizeBytesRaw = params?.sizeBytes
  const sizeBytes = typeof sizeBytesRaw === 'number' ? sizeBytesRaw : undefined
  const synapse = await getSynapse(input)
  return ensureUploadReady(synapse, { pkpAddress: input.pkp.ethAddress }, sizeBytes)
}

async function storageUpload(params: Json | undefined) {
  const input = requireAuthInput(params)
  const withCDN = params?.withCDN !== false
  const { payload } = await resolvePayload(params)

  const synapse = await getSynapse(input)
  const ready = await ensureUploadReady(
    synapse,
    { pkpAddress: input.pkp.ethAddress },
    payload.length,
  )
  if (!ready.ready) {
    throw new Error(ready.reason || 'Storage not ready')
  }
  const ctx = await synapse.storage.createContext({ withCDN })
  const uploadStartedAt = Date.now()
  sidecarLog('storage.upload.start', {
    pkpAddress: input.pkp.ethAddress,
    sizeBytes: payload.length,
    withCDN,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  })
  const result = await withTimeout(ctx.upload(payload), UPLOAD_TIMEOUT_MS, 'Storage upload')
  sidecarLog('storage.upload.done', {
    pkpAddress: input.pkp.ethAddress,
    sizeBytes: payload.length,
    pieceCid: result.pieceCid.toString(),
    durationMs: Date.now() - uploadStartedAt,
  })
  return {
    pieceCid: result.pieceCid.toString(),
    size: result.size,
    pieceId: result.pieceId ?? null,
  }
}

async function contentEncryptUploadRegister(params: Json | undefined) {
  const input = requireAuthInput(params)
  const withCDN = params?.withCDN !== false
  const authContext = await createPkpAuthContext(input)
  const { payload: sourceBytes, filePath } = await resolvePayload(params)

  const fallback = filePath ? inferTitleArtistAlbum(filePath) : inferTitleArtistAlbum('Unknown Track')
  const title = typeof params?.title === 'string' && params.title.trim() ? params.title.trim() : fallback.title
  const artist =
    typeof params?.artist === 'string' && params.artist.trim()
      ? params.artist.trim()
      : fallback.artist
  const album = typeof params?.album === 'string' ? params.album.trim() : fallback.album
  const mbid = typeof params?.mbid === 'string' && params.mbid.trim() ? params.mbid.trim() : undefined
  const ipId =
    typeof params?.ipId === 'string' && params.ipId.trim() ? ethers.getAddress(params.ipId.trim()) : undefined

  sidecarLog('content.pipeline.start', {
    pkpAddress: input.pkp.ethAddress,
    filePath: filePath || null,
    sourceBytes: sourceBytes.length,
    withCDN,
    mbid: mbid || null,
    ipId: ipId || null,
    uploadTimeoutMs: UPLOAD_TIMEOUT_MS,
    registerTimeoutMs: REGISTER_TIMEOUT_MS,
  })

  const encryptStartedAt = Date.now()
  const trackId = buildTrackId({ title, artist, album, mbid, ipId })
  const contentId = computeContentId(trackId, input.pkp.ethAddress)
  const encryptedBlob = await encryptForUpload(sourceBytes, contentId, authContext)
  sidecarLog('content.encrypt.done', {
    pkpAddress: input.pkp.ethAddress,
    contentId,
    trackId,
    blobBytes: encryptedBlob.length,
    durationMs: Date.now() - encryptStartedAt,
  })

  const synapse = await getSynapse(input)
  const ready = await ensureUploadReady(
    synapse,
    { pkpAddress: input.pkp.ethAddress },
    encryptedBlob.length,
  )
  if (!ready.ready) {
    throw new Error(ready.reason || 'Storage not ready')
  }

  const ctx = await synapse.storage.createContext({ withCDN })
  const uploadStartedAt = Date.now()
  sidecarLog('content.upload.start', {
    pkpAddress: input.pkp.ethAddress,
    contentId,
    blobBytes: encryptedBlob.length,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  })
  const uploadResult = await withTimeout(ctx.upload(encryptedBlob), UPLOAD_TIMEOUT_MS, 'Content upload')
  const pieceCid = uploadResult.pieceCid.toString()
  sidecarLog('content.upload.done', {
    pkpAddress: input.pkp.ethAddress,
    contentId,
    pieceCid,
    uploadSize: uploadResult.size,
    durationMs: Date.now() - uploadStartedAt,
  })

  const contentRegisterAction = await getContentRegisterAction()

  const litClient = await getLitClient()
  const timestamp = Date.now().toString()
  const nonce = crypto.randomUUID()
  const trackId32 = ethers.zeroPadValue(trackId, 32).toLowerCase()
  const pieceCidHash = await sha256Hex(bytesFromPieceCid(pieceCid))
  const registerMessage = `heaven:content:register:${trackId32}:${pieceCidHash}:${input.pkp.ethAddress.toLowerCase()}:${ALGO_AES_GCM_256}:${timestamp}:${nonce}`
  const sigStartedAt = Date.now()
  const userSignature = await signPersonalMessage(registerMessage, input.pkp.publicKey, authContext)
  sidecarLog('content.register.user_sig.done', {
    pkpAddress: input.pkp.ethAddress,
    contentId,
    durationMs: Date.now() - sigStartedAt,
  })

  const sponsorAuthContext = await createSponsorPkpAuthContext()
  sidecarLog('content.register.start', {
    pkpAddress: input.pkp.ethAddress,
    contentId,
    pieceCid,
    sponsorPkpAddress: SPONSOR_PKP_ADDRESS,
    actionMode: contentRegisterAction.mode,
    actionSource: contentRegisterAction.source,
    timeoutMs: REGISTER_TIMEOUT_MS,
  })
  const registerStartedAt = Date.now()
  const executeResult = await withTimeout(
    litClient.executeJs({
      ...(contentRegisterAction.mode === 'ipfs'
        ? { ipfsId: contentRegisterAction.value }
        : { code: contentRegisterAction.value }),
      authContext: sponsorAuthContext,
      jsParams: {
        userPkpPublicKey: input.pkp.publicKey,
        trackId,
        pieceCid,
        datasetOwner: input.pkp.ethAddress,
        signature: userSignature,
        algo: ALGO_AES_GCM_256,
        title,
        artist,
        album,
        timestamp,
        nonce,
      },
    }),
    REGISTER_TIMEOUT_MS,
    'Content registration',
  )

  const response = JSON.parse(executeResult.response as string)
  if (!response.success) {
    sidecarLog('content.register.error', {
      pkpAddress: input.pkp.ethAddress,
      contentId,
      pieceCid,
      error: response.error || 'unknown error',
    })
    throw new Error(`Content register failed: ${response.error || 'unknown error'}`)
  }
  sidecarLog('content.register.done', {
    pkpAddress: input.pkp.ethAddress,
    contentId,
    pieceCid,
    txHash: response.txHash || null,
    durationMs: Date.now() - registerStartedAt,
  })

  return {
    trackId,
    ipId: ipId || null,
    contentId,
    pieceCid,
    blobSize: encryptedBlob.length,
    uploadSize: uploadResult.size,
    registerVersion: response.version || null,
    txHash: response.txHash,
    blockNumber: response.blockNumber,
  }
}

function writeResponse(payload: unknown) {
  try {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code
    if (code === 'EPIPE') {
      // Parent process closed stdout pipe; this is an expected shutdown path.
      process.exit(0)
    }
    throw err
  }
}

function asError(err: unknown): { message: string } {
  if (err instanceof Error) return { message: err.message }
  return { message: String(err) }
}

async function handleRequest(req: RpcRequest) {
  switch (req.method) {
    case 'health':
      return {
        ok: true,
        component: 'synapse-sidecar',
        litNetwork: litNetworkName,
        filecoinNetwork,
        filecoinRpc: FIL_RPC,
        warmStorageOverride,
        cachedSynapse: cachedSynapse?.diagnostics ?? null,
      }
    case 'storage.status':
      return await storageStatus(req.params)
    case 'storage.depositAndApprove':
      return await storageDepositAndApprove(req.params)
    case 'storage.preflight':
      return await storagePreflight(req.params)
    case 'storage.upload':
      return await storageUpload(req.params)
    case 'content.encryptUploadRegister':
      return await contentEncryptUploadRegister(req.params)
    case 'storage.reset':
      cachedSynapse = null
      cachedAuthContext = null
      cachedSponsorAuthContext = null
      return { ok: true }
    default:
      throw new Error(`Unknown method: ${req.method}`)
  }
}

async function main() {
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      process.exit(0)
      return
    }
    throw err
  })

  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let parsed: RpcRequest
    try {
      parsed = JSON.parse(trimmed)
      if (parsed.id === undefined || typeof parsed.method !== 'string') {
        throw new Error('Invalid request shape')
      }
    } catch (err) {
      writeResponse({ id: null, error: asError(err) })
      continue
    }

    try {
      const result = await handleRequest(parsed)
      writeResponse({ id: parsed.id, result })
    } catch (err) {
      writeResponse({ id: parsed.id, error: asError(err) })
    }
  }
}

main().catch((err) => {
  writeResponse({ id: null, error: asError(err) })
  process.exit(1)
})
