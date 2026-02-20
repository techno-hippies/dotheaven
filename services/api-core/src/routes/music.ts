import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import {
  AbiCoder,
  Contract,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  getAddress,
  id as keccakId,
  keccak256 as keccak256Hex,
} from 'ethers'
import type {
  Env,
  MusicPublishJobRow,
  MusicPublishType,
  MusicUploadBanRow,
  UserIdentityRow,
} from '../types'

type MusicVariables = {
  userAddress: string
}

const app = new Hono<{ Bindings: Env; Variables: MusicVariables }>()

const DEFAULT_AGENT_URL = 'https://load-s3-agent.load.network'
const DEFAULT_GATEWAY_URL = 'https://gateway.s3-node-1.load.network'
const DEFAULT_ARWEAVE_GATEWAY = 'https://arweave.net'
const DEFAULT_STORY_RPC_URL = 'https://aeneid.storyrpc.io'
const DEFAULT_STORY_CHAIN_ID = 1315
const DEFAULT_STORY_LICENSE_ATTACHMENT_WORKFLOWS = '0xcC2E862bCee5B6036Db0de6E06Ae87e524a79fd8'
const DEFAULT_STORY_DERIVATIVE_WORKFLOWS = '0x9e2d496f72C547C2C535B167e06ED8729B374a4f'
const DEFAULT_STORY_IP_ASSET_REGISTRY = '0x77319B4031e6eF1250907aa00018B8B1c67a244b'
const DEFAULT_STORY_LICENSE_REGISTRY = '0x529a750E02d8E2f15649c13D69a465286a780e24'
const DEFAULT_STORY_ROYALTY_POLICY_LAP = '0xBe54FB168b3c982b7AaE60dB6CF75Bd8447b390E'
const DEFAULT_STORY_WIP_TOKEN = '0x1514000000000000000000000000000000000000'
const DEFAULT_STORY_SPG_NFT_CONTRACT = '0xb1764abf89e6a151ea27824612145ef89ed70a73'
const DEFAULT_STORY_PIL_LICENSE_TEMPLATE = '0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316'
const DEFAULT_TEMPO_RPC_URL = 'https://rpc.moderato.tempo.xyz'
const DEFAULT_TEMPO_CHAIN_ID = 42431
const DEFAULT_TEMPO_SCROBBLE_V4 = '0xe00e82086480E61AaC8d5ad8B05B56A582dD0000'
const DEFAULT_TEMPO_CONTENT_REGISTRY = '0x2A3beA895AE5bb4415c436155cbA15a97ACc2C77'
const DEFAULT_TEMPO_TX_WAIT_TIMEOUT_MS = 45_000
const ERC721_TRANSFER_TOPIC = keccakId('Transfer(address,address,uint256)')
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB (Worker-safe ceiling for v1)
const MAX_COVER_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_LYRICS_BYTES = 256 * 1024 // 256KB
const MAX_UPLOAD_TAGS = 50
const DAILY_UPLOAD_BYTES_LIMIT = 500 * 1024 * 1024 // 500MB per verified user/day
const DAILY_PUBLISH_COUNT_LIMIT = 20

const ALLOWED_AUDIO_CONTENT_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/flac',
  'audio/ogg',
  'audio/aac',
  'audio/m4a',
  'audio/mp4',
  'audio/x-wav',
  'audio/webm',
])

const STORY_LICENSE_ATTACHMENT_ABI = [
  `function mintAndRegisterIpAndAttachPILTerms(
    address spgNftContract,
    address recipient,
    (string ipMetadataURI, bytes32 ipMetadataHash, string nftMetadataURI, bytes32 nftMetadataHash) ipMetadata,
    ((bool transferable, address royaltyPolicy, uint256 defaultMintingFee, uint256 expiration, bool commercialUse, bool commercialAttribution, address commercializerChecker, bytes commercializerCheckerData, uint32 commercialRevShare, uint256 commercialRevCeiling, bool derivativesAllowed, bool derivativesAttribution, bool derivativesApproval, bool derivativesReciprocal, uint256 derivativeRevCeiling, address currency, string uri) terms, (bool isSet, uint256 mintingFee, address licensingHook, bytes hookData, uint32 commercialRevShare, bool disabled, uint32 expectMinimumGroupRewardShare, address expectGroupRewardPool) licensingConfig)[] licenseTermsData,
    bool allowDuplicates
  ) external returns (address ipId, uint256 tokenId, uint256[] licenseTermsIds)`,
]

const STORY_IP_ASSET_REGISTRY_ABI = [
  'function ipId(uint256 chainId, address tokenContract, uint256 tokenId) view returns (address)',
]

const STORY_DERIVATIVE_WORKFLOWS_ABI = [
  `function mintAndRegisterIpAndMakeDerivative(
    address spgNftContract,
    (address[] parentIpIds, address licenseTemplate, uint256[] licenseTermsIds, bytes royaltyContext, uint256 maxMintingFee, uint32 maxRts, uint32 maxRevenueShare) derivData,
    (string ipMetadataURI, bytes32 ipMetadataHash, string nftMetadataURI, bytes32 nftMetadataHash) ipMetadata,
    address recipient,
    bool allowDuplicates
  ) external returns (address ipId, uint256 tokenId)`,
]

const STORY_LICENSE_REGISTRY_ABI = [
  'function getAttachedLicenseTermsCount(address ipId) view returns (uint256)',
  'function getAttachedLicenseTerms(address ipId, uint256 index) view returns (address, uint256)',
]

const TEMPO_SCROBBLE_V4_ABI = [
  'function isRegistered(bytes32 trackId) view returns (bool)',
  'function registerTracksBatch(uint8[] kinds, bytes32[] payloads, string[] titles, string[] artists, string[] albums, uint32[] durations)',
  'function setTrackCoverBatch(bytes32[] trackIds, string[] coverCids)',
  'function getTrack(bytes32 trackId) view returns (string title, string artist, string album, uint8 kind, bytes32 payload, uint64 registeredAt, string coverCid, uint32 durationSec)',
]

const TEMPO_CONTENT_REGISTRY_ABI = [
  'function registerContentFor(address contentOwner, bytes32 trackId, address datasetOwner, bytes pieceCid, uint8 algo) returns (bytes32 contentId)',
  'function getContent(bytes32 contentId) view returns (address owner, address datasetOwner, bytes pieceCid, uint8 algo, uint64 createdAt, bool active)',
]

const ABI_CODER = AbiCoder.defaultAbiCoder()

function normalizeAddress(address: string): string | null {
  const clean = address.toLowerCase().trim()
  if (!/^0x[a-f0-9]{40}$/.test(clean)) return null
  return clean
}

function generateJobId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const suffix = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `music_${suffix}`
}

function parsePublishType(raw: string | null): MusicPublishType | null {
  if (!raw) return null
  if (raw === 'original' || raw === 'derivative' || raw === 'cover') return raw
  return null
}

function isLikelyAudioContentType(contentType: string): boolean {
  if (ALLOWED_AUDIO_CONTENT_TYPES.has(contentType)) return true
  return contentType.startsWith('audio/')
}

function isLikelyImageContentType(contentType: string): boolean {
  return contentType.startsWith('image/')
}

function extractUploadId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const candidate = (payload as Record<string, unknown>).id
    ?? (payload as Record<string, unknown>).dataitem_id
    ?? (payload as Record<string, unknown>).dataitemId
    ?? ((payload as Record<string, unknown>).result as Record<string, unknown> | undefined)?.id
    ?? ((payload as Record<string, unknown>).result as Record<string, unknown> | undefined)?.dataitem_id
    ?? ((payload as Record<string, unknown>).result as Record<string, unknown> | undefined)?.dataitemId

  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

function dataitemIdFromArRef(ref: string | null | undefined): string | null {
  if (!ref) return null
  const trimmed = ref.trim()
  if (!trimmed.startsWith('ar://')) return null
  const id = trimmed.slice('ar://'.length).trim()
  return id || null
}

function asOptionalString(value: string | File | null): string | null {
  return typeof value === 'string' ? value : null
}

function asOptionalPositiveInt(raw: string | null): number | null {
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null
  return n
}

function safeJsonParse(raw: string | null): unknown | null {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function parseJsonStringArray(raw: string | null): string[] | null {
  const parsed = safeJsonParse(raw)
  if (!Array.isArray(parsed)) return null
  const out: string[] = []
  for (const value of parsed) {
    if (typeof value !== 'string') return null
    out.push(value)
  }
  return out
}

function parseLicenseTermsIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  for (const value of raw) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
      out.push(String(value))
      continue
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      out.push(value.trim())
      continue
    }
    return null
  }
  return out
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value)
}

function isBytes32Hex(value: string): boolean {
  return /^0x[a-f0-9]{64}$/.test(value)
}

function isHexBytes(value: string): boolean {
  return /^0x(?:[a-fA-F0-9]{2})*$/.test(value)
}

function normalizeTrackComponent(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ')
}

function computeMetaTrackId(title: string, artist: string, album: string): { trackId: string; payload: string } {
  const payload = keccak256Hex(
    ABI_CODER.encode(
      ['string', 'string', 'string'],
      [normalizeTrackComponent(title), normalizeTrackComponent(artist), normalizeTrackComponent(album)],
    ),
  )
  const trackId = keccak256Hex(
    ABI_CODER.encode(['uint8', 'bytes32'], [3, payload]),
  )
  return { trackId, payload }
}

function computeContentId(trackId: string, owner: string): string {
  return keccak256Hex(ABI_CODER.encode(['bytes32', 'address'], [trackId, owner]))
}

function parsePieceCidBytes(value: string): Uint8Array {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('pieceCid is required')
  if (/^0x[0-9a-fA-F]*$/.test(trimmed)) {
    const hex = trimmed.slice(2)
    if (hex.length % 2 !== 0) throw new Error('pieceCid hex value must have even length')
    const out = new Uint8Array(hex.length / 2)
    for (let i = 0; i < out.length; i++) {
      out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    }
    return out
  }
  return new TextEncoder().encode(trimmed)
}

function parseDurationSeconds(raw: unknown, fallback: number | null): number {
  const candidate = raw === undefined ? fallback : raw
  if (candidate === null || candidate === undefined || candidate === '') return 0
  const n = Number(candidate)
  if (!Number.isInteger(n) || n < 0 || n > 4_294_967_295) {
    throw new Error('durationS must be an integer between 0 and 4294967295')
  }
  return n
}

function contentEntryActive(value: unknown): boolean {
  if (Array.isArray(value)) return Boolean(value[5])
  if (value && typeof value === 'object' && 'active' in value) {
    return Boolean((value as { active: unknown }).active)
  }
  return false
}

function extractTrackCover(value: unknown): string {
  if (Array.isArray(value)) {
    const cover = value[6]
    return typeof cover === 'string' ? cover : ''
  }
  if (value && typeof value === 'object' && 'coverCid' in value) {
    const cover = (value as { coverCid: unknown }).coverCid
    return typeof cover === 'string' ? cover : ''
  }
  return ''
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

async function waitForTxReceiptWithTimeout<T extends { wait: () => Promise<unknown>; hash?: string }>(
  tx: T,
  timeoutMs: number,
  label: string,
): Promise<{ hash: string | undefined }> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}_tx_wait_timeout`)), timeoutMs)
  })
  try {
    const receipt = await Promise.race([tx.wait(), timeout]) as { hash?: string } | null
    return { hash: receipt?.hash || tx.hash }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256HexBytes(data: Uint8Array): Promise<string> {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return sha256Hex(copy.buffer)
}

async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text }
  }
}

async function uploadToLoadStaging(params: {
  apiKey: string
  agentUrl: string
  gatewayUrl: string
  file: File
  contentType: string
  tags: Array<{ key: string; value: string }>
}): Promise<{
  dataitemId: string
  gatewayUrl: string
  payload: unknown
}> {
  const form = new FormData()
  form.append('file', params.file, params.file.name || 'upload.bin')
  form.append('content_type', params.contentType)
  form.append('tags', JSON.stringify(params.tags))

  const res = await fetch(`${params.agentUrl}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.apiKey}` },
    body: form,
  })
  const payload = await parseJsonResponse(res)
  if (!res.ok) {
    throw new Error(`load_upload_failed:${res.status}:${JSON.stringify(payload)}`)
  }

  const id = extractUploadId(payload)
  if (!id) {
    throw new Error(`load_upload_missing_id:${JSON.stringify(payload)}`)
  }

  return {
    dataitemId: id,
    gatewayUrl: `${params.gatewayUrl}/resolve/${id}`,
    payload,
  }
}

function extractMintedTokenId(logs: Array<{ address: string; topics: readonly string[] }>, spgNftContract: string): string | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== spgNftContract.toLowerCase()) continue
    if (!Array.isArray(log.topics) || log.topics.length < 4) continue
    if (log.topics[0] !== ERC721_TRANSFER_TOPIC) continue
    const fromTopic = log.topics[1]
    if (typeof fromTopic !== 'string' || fromTopic.length < 66) continue
    const from = `0x${fromTopic.slice(26)}`
    if (from.toLowerCase() !== ZeroAddress.toLowerCase()) continue
    return BigInt(log.topics[3]).toString()
  }
  return null
}

interface AnchoredJsonResult {
  dataitemId: string
  ref: string
  ls3GatewayUrl: string
  arweaveUrl: string
  arweaveAvailable: boolean
  payloadHash: string
}

function normalizeJsonPayload(value: unknown, fieldName: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) throw new Error(`${fieldName} must be a non-empty JSON string`)
    try {
      return JSON.stringify(JSON.parse(trimmed))
    } catch {
      throw new Error(`${fieldName} must be valid JSON`)
    }
  }
  if (value === null || value === undefined) {
    throw new Error(`${fieldName} is required`)
  }
  try {
    return JSON.stringify(value)
  } catch {
    throw new Error(`${fieldName} must be JSON-serializable`)
  }
}

async function uploadAndAnchorJson(
  params: {
    apiKey: string
    agentUrl: string
    gatewayUrl: string
    jobId: string
    metadataType: 'ip' | 'nft'
    payloadJson: string
  },
): Promise<AnchoredJsonResult> {
  const payloadBytes = new TextEncoder().encode(params.payloadJson)
  const payloadHash = await sha256HexBytes(payloadBytes)
  const tags = JSON.stringify([
    { key: 'App-Name', value: 'Heaven' },
    { key: 'Upload-Source', value: 'music-metadata' },
    { key: 'Music-Job-Id', value: params.jobId },
    { key: 'Music-Metadata-Type', value: params.metadataType },
    { key: 'Content-Type', value: 'application/json' },
  ])

  const uploadForm = new FormData()
  uploadForm.append(
    'file',
    new File([payloadBytes], `${params.metadataType}-metadata.json`, { type: 'application/json' }),
  )
  uploadForm.append('content_type', 'application/json')
  uploadForm.append('tags', tags)

  const uploadResp = await fetch(`${params.agentUrl}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.apiKey}` },
    body: uploadForm,
  })
  const uploadPayload = await parseJsonResponse(uploadResp)
  if (!uploadResp.ok) {
    throw new Error(`load_upload_failed:${uploadResp.status}:${JSON.stringify(uploadPayload)}`)
  }
  const id = extractUploadId(uploadPayload)
  if (!id) {
    throw new Error(`load_upload_missing_id:${JSON.stringify(uploadPayload)}`)
  }

  const postResp = await fetch(`${params.agentUrl}/post/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.apiKey}` },
  })
  const postPayload = await parseJsonResponse(postResp)
  if (!postResp.ok) {
    throw new Error(`load_post_failed:${postResp.status}:${JSON.stringify(postPayload)}`)
  }

  const arweaveUrl = `${DEFAULT_ARWEAVE_GATEWAY}/${id}`
  let arweaveAvailable = false
  try {
    const head = await fetch(arweaveUrl, { method: 'HEAD' })
    arweaveAvailable = head.ok
  } catch {
    arweaveAvailable = false
  }

  return {
    dataitemId: id,
    ref: `ar://${id}`,
    ls3GatewayUrl: `${params.gatewayUrl}/resolve/${id}`,
    arweaveUrl,
    arweaveAvailable,
    payloadHash: `0x${payloadHash}`,
  }
}

interface StoryRegisterPayload {
  recipient: string
  ipMetadataURI: string
  ipMetadataHash: string
  nftMetadataURI: string
  nftMetadataHash: string
  commercialRevShare: number
  defaultMintingFee: string
  allowDuplicates: boolean
}

interface StoryRegisterResult {
  txHash: string
  blockNumber: string
  ipId: string
  tokenId: string
  licenseTermsIds: string[]
}

interface StoryRegisterDerivativePayload {
  recipient: string
  ipMetadataURI: string
  ipMetadataHash: string
  nftMetadataURI: string
  nftMetadataHash: string
  parentIpIds: string[]
  licenseTermsIds: string[]
  licenseTemplate: string
  royaltyContext: string
  maxMintingFee: string
  maxRts: number
  maxRevenueShare: number
  allowDuplicates: boolean
}

interface StoryConfig {
  sponsorPk: string
  rpcUrl: string
  chainId: number
  spgNftContract: string
  workflows: string
  derivativeWorkflows: string
  ipAssetRegistry: string
  licenseRegistry: string
  royaltyPolicyLap: string
  wipToken: string
}

async function registerStoryOriginal(
  config: StoryConfig,
  payload: StoryRegisterPayload,
): Promise<StoryRegisterResult> {
  const provider = new JsonRpcProvider(config.rpcUrl)
  const signer = new Wallet(config.sponsorPk as `0x${string}`, provider)

  const workflows = new Contract(config.workflows, STORY_LICENSE_ATTACHMENT_ABI, signer)
  const tx = await workflows.mintAndRegisterIpAndAttachPILTerms(
    config.spgNftContract,
    payload.recipient,
    {
      ipMetadataURI: payload.ipMetadataURI,
      ipMetadataHash: payload.ipMetadataHash,
      nftMetadataURI: payload.nftMetadataURI,
      nftMetadataHash: payload.nftMetadataHash,
    },
    [{
      terms: {
        transferable: true,
        royaltyPolicy: config.royaltyPolicyLap,
        defaultMintingFee: BigInt(payload.defaultMintingFee),
        expiration: 0n,
        commercialUse: true,
        commercialAttribution: true,
        commercializerChecker: ZeroAddress,
        commercializerCheckerData: '0x',
        commercialRevShare: payload.commercialRevShare * 1_000_000,
        commercialRevCeiling: 0n,
        derivativesAllowed: true,
        derivativesAttribution: true,
        derivativesApproval: false,
        derivativesReciprocal: true,
        derivativeRevCeiling: 0n,
        currency: config.wipToken,
        uri: '',
      },
      licensingConfig: {
        isSet: false,
        mintingFee: 0n,
        licensingHook: ZeroAddress,
        hookData: '0x',
        commercialRevShare: 0,
        disabled: false,
        expectMinimumGroupRewardShare: 0,
        expectGroupRewardPool: ZeroAddress,
      },
    }],
    payload.allowDuplicates,
  )

  const receipt = await tx.wait(1)
  if (!receipt || receipt.status !== 1) {
    throw new Error('Story registration transaction reverted')
  }

  const tokenId = extractMintedTokenId(receipt.logs, config.spgNftContract)
  if (!tokenId) {
    throw new Error('Story registration succeeded but minted tokenId was not found in logs')
  }

  const ipAssetRegistry = new Contract(config.ipAssetRegistry, STORY_IP_ASSET_REGISTRY_ABI, provider)
  const rawIpId = await ipAssetRegistry.ipId(BigInt(config.chainId), config.spgNftContract, BigInt(tokenId))
  const ipId = getAddress(String(rawIpId))

  const licenseRegistry = new Contract(config.licenseRegistry, STORY_LICENSE_REGISTRY_ABI, provider)
  const attachedCount = await licenseRegistry.getAttachedLicenseTermsCount(ipId)
  const count = Number(attachedCount)
  const licenseTermsIds: string[] = []
  for (let i = 0; i < count; i++) {
    const tuple = await licenseRegistry.getAttachedLicenseTerms(ipId, BigInt(i))
    licenseTermsIds.push(BigInt(tuple[1]).toString())
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber.toString(),
    ipId,
    tokenId,
    licenseTermsIds,
  }
}

async function registerStoryDerivative(
  config: StoryConfig,
  payload: StoryRegisterDerivativePayload,
): Promise<StoryRegisterResult> {
  const provider = new JsonRpcProvider(config.rpcUrl)
  const signer = new Wallet(config.sponsorPk as `0x${string}`, provider)
  const derivativeWorkflows = new Contract(config.derivativeWorkflows, STORY_DERIVATIVE_WORKFLOWS_ABI, signer)

  const tx = await derivativeWorkflows.mintAndRegisterIpAndMakeDerivative(
    config.spgNftContract,
    {
      parentIpIds: payload.parentIpIds,
      licenseTemplate: payload.licenseTemplate,
      licenseTermsIds: payload.licenseTermsIds.map((value) => BigInt(value)),
      royaltyContext: payload.royaltyContext,
      maxMintingFee: BigInt(payload.maxMintingFee),
      maxRts: payload.maxRts,
      maxRevenueShare: payload.maxRevenueShare,
    },
    {
      ipMetadataURI: payload.ipMetadataURI,
      ipMetadataHash: payload.ipMetadataHash,
      nftMetadataURI: payload.nftMetadataURI,
      nftMetadataHash: payload.nftMetadataHash,
    },
    payload.recipient,
    payload.allowDuplicates,
  )

  const receipt = await tx.wait(1)
  if (!receipt || receipt.status !== 1) {
    throw new Error('Story derivative registration transaction reverted')
  }

  const tokenId = extractMintedTokenId(receipt.logs, config.spgNftContract)
  if (!tokenId) {
    throw new Error('Story derivative registration succeeded but minted tokenId was not found in logs')
  }

  const ipAssetRegistry = new Contract(config.ipAssetRegistry, STORY_IP_ASSET_REGISTRY_ABI, provider)
  const rawIpId = await ipAssetRegistry.ipId(BigInt(config.chainId), config.spgNftContract, BigInt(tokenId))
  const ipId = getAddress(String(rawIpId))

  const licenseRegistry = new Contract(config.licenseRegistry, STORY_LICENSE_REGISTRY_ABI, provider)
  const attachedCount = await licenseRegistry.getAttachedLicenseTermsCount(ipId)
  const count = Number(attachedCount)
  const licenseTermsIds: string[] = []
  for (let i = 0; i < count; i++) {
    const tuple = await licenseRegistry.getAttachedLicenseTerms(ipId, BigInt(i))
    licenseTermsIds.push(BigInt(tuple[1]).toString())
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber.toString(),
    ipId,
    tokenId,
    licenseTermsIds,
  }
}

function serializeJob(row: MusicPublishJobRow) {
  return {
    jobId: row.job_id,
    userAddress: row.user_address,
    status: row.status,
    publishType: row.publish_type,
    idempotencyKey: row.idempotency_key,
    upload: {
      fileName: row.file_name,
      contentType: row.content_type,
      fileSize: row.file_size,
      audioSha256: row.audio_sha256,
      fingerprint: row.fingerprint,
      durationS: row.duration_s,
      stagedDataitemId: row.staged_dataitem_id,
      stagedGatewayUrl: row.staged_gateway_url,
      cover: {
        stagedDataitemId: row.cover_staged_dataitem_id,
        stagedGatewayUrl: row.cover_staged_gateway_url,
        contentType: row.cover_content_type,
        fileSize: row.cover_file_size,
      },
      lyrics: {
        stagedDataitemId: row.lyrics_staged_dataitem_id,
        stagedGatewayUrl: row.lyrics_staged_gateway_url,
        sha256: row.lyrics_sha256,
        bytes: row.lyrics_bytes,
      },
    },
    policy: {
      decision: row.policy_decision,
      reasonCode: row.policy_reason_code,
      reason: row.policy_reason,
      parentIpIds: parseJsonStringArray(row.parent_ip_ids_json),
      licenseTermsIds: parseJsonStringArray(row.license_terms_ids_json),
    },
    anchor: {
      dataitemId: row.anchored_dataitem_id,
      ref: row.arweave_ref,
      arweaveUrl: row.arweave_url,
      arweaveAvailable: !!row.arweave_available,
    },
    metadata: {
      status: row.metadata_status,
      error: row.metadata_error,
      ip: {
        uri: row.ip_metadata_uri,
        hash: row.ip_metadata_hash,
        dataitemId: row.ip_metadata_dataitem_id || dataitemIdFromArRef(row.ip_metadata_uri),
      },
      nft: {
        uri: row.nft_metadata_uri,
        hash: row.nft_metadata_hash,
        dataitemId: row.nft_metadata_dataitem_id || dataitemIdFromArRef(row.nft_metadata_uri),
      },
    },
    registration: {
      storyTxHash: row.story_tx_hash,
      storyIpId: row.story_ip_id,
      storyTokenId: row.story_token_id,
      storyLicenseTermsIds: parseJsonStringArray(row.story_license_terms_ids_json),
      storyBlockNumber: row.story_block_number,
      megaethTxHash: row.megaeth_tx_hash,
      tempoTxHash: row.megaeth_tx_hash,
    },
    error: row.error_code || row.error_message
      ? { code: row.error_code, message: row.error_message }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function requireMusicAccess(
  c: Context<{ Bindings: Env; Variables: MusicVariables }>,
  next: Next,
) {
  const userAddress = normalizeAddress(c.req.header('X-User-Address') || '')
  if (!userAddress) {
    return c.json({ error: 'Missing or invalid X-User-Address header' }, 401)
  }

  const identity = await c.env.DB.prepare(`
    SELECT * FROM user_identity WHERE user_address = ?
  `).bind(userAddress).first<UserIdentityRow>()

  if (!identity) {
    return c.json({ error: 'Self.xyz verification required for music upload/publish' }, 403)
  }

  const now = Math.floor(Date.now() / 1000)
  const ban = await c.env.DB.prepare(`
    SELECT * FROM music_upload_bans
    WHERE user_address = ? AND active = 1
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(userAddress, now).first<MusicUploadBanRow>()

  if (ban) {
    return c.json({
      error: 'Upload access blocked',
      reasonCode: ban.reason_code,
      reason: ban.reason,
    }, 403)
  }

  c.set('userAddress', userAddress)
  await next()
}

app.get('/health', (c) => c.json({ ok: true }))

app.use('/preflight', requireMusicAccess)
app.use('/publish/*', requireMusicAccess)

// Stage upload only. This endpoint intentionally does not anchor to Arweave.
app.post('/publish/start', async (c) => {
  const userAddress = c.get('userAddress')
  const apiKey = c.env.LOAD_S3_AGENT_API_KEY
  if (!apiKey) {
    return c.json({ error: 'Music upload not configured (LOAD_S3_AGENT_API_KEY)' }, 500)
  }

  const form = await c.req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return c.json({ error: 'Missing file form field' }, 400)
  }
  if (!file.size) {
    return c.json({ error: 'File is empty' }, 400)
  }
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: `File too large: ${file.size} > ${MAX_FILE_SIZE}` }, 400)
  }

  const now = Math.floor(Date.now() / 1000)
  const dayStart = now - 24 * 60 * 60
  const usage = await c.env.DB.prepare(`
    SELECT
      COUNT(*) AS publish_count,
      COALESCE(SUM(file_size), 0) AS total_bytes
    FROM music_publish_jobs
    WHERE user_address = ? AND created_at >= ?
  `).bind(userAddress, dayStart).first<{ publish_count: number; total_bytes: number }>()

  const publishCount = Number(usage?.publish_count ?? 0)
  const totalBytes = Number(usage?.total_bytes ?? 0)
  if (publishCount >= DAILY_PUBLISH_COUNT_LIMIT) {
    return c.json({
      error: 'Daily publish limit exceeded',
      limit: DAILY_PUBLISH_COUNT_LIMIT,
    }, 429)
  }
  if (totalBytes + file.size > DAILY_UPLOAD_BYTES_LIMIT) {
    return c.json({
      error: 'Daily upload bytes limit exceeded',
      limitBytes: DAILY_UPLOAD_BYTES_LIMIT,
      usedBytes: totalBytes,
    }, 429)
  }

  const contentType = asOptionalString(form.get('contentType')) || file.type || 'application/octet-stream'
  if (!isLikelyAudioContentType(contentType)) {
    return c.json({ error: `Unsupported audio content type: ${contentType}` }, 400)
  }

  const publishTypeInput = (asOptionalString(form.get('publishType')) || '').toLowerCase().trim()
  const publishType = publishTypeInput ? parsePublishType(publishTypeInput) : null
  if (publishTypeInput && !publishType) {
    return c.json({ error: 'publishType must be original, derivative, or cover' }, 400)
  }

  const idempotencyRaw = (c.req.header('Idempotency-Key') || asOptionalString(form.get('idempotencyKey')) || '').trim()
  const idempotencyKey = idempotencyRaw ? idempotencyRaw.slice(0, 128) : null
  if (idempotencyKey) {
    const existing = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs
      WHERE user_address = ? AND idempotency_key = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(userAddress, idempotencyKey).first<MusicPublishJobRow>()
    if (existing) {
      return c.json({ existing: true, job: serializeJob(existing) })
    }
  }

  const durationS = asOptionalPositiveInt(asOptionalString(form.get('durationS')))
  const durationRaw = asOptionalString(form.get('durationS'))
  if (durationRaw && !durationS) {
    return c.json({ error: 'durationS must be a positive integer when provided' }, 400)
  }

  const fingerprint = (asOptionalString(form.get('fingerprint')) || '').trim().slice(0, 32_000) || null
  const audioSha256Raw = (asOptionalString(form.get('audioSha256')) || '').trim().toLowerCase()
  if (audioSha256Raw && !isSha256Hex(audioSha256Raw)) {
    return c.json({ error: 'audioSha256 must be a 64-character lowercase hex string' }, 400)
  }
  const audioSha256 = audioSha256Raw || null
  if (publishType === 'original' && !audioSha256) {
    return c.json({ error: 'audioSha256 is required for original publishType' }, 400)
  }

  const tagsRaw = asOptionalString(form.get('tags')) || '[]'
  let tags: string
  try {
    const parsed = JSON.parse(tagsRaw)
    if (!Array.isArray(parsed)) throw new Error('tags must be an array')
    if (parsed.length > MAX_UPLOAD_TAGS) {
      return c.json({ error: `tags must contain at most ${MAX_UPLOAD_TAGS} entries` }, 400)
    }
    tags = JSON.stringify(parsed)
  } catch {
    return c.json({ error: 'tags must be valid JSON array' }, 400)
  }

  const agentUrl = (c.env.LOAD_S3_AGENT_URL || DEFAULT_AGENT_URL).replace(/\/+$/, '')
  const gatewayUrl = (c.env.LOAD_GATEWAY_URL || DEFAULT_GATEWAY_URL).replace(/\/+$/, '')
  const upstreamForm = new FormData()
  upstreamForm.append('file', file, file.name || 'upload.bin')
  upstreamForm.append('content_type', contentType)
  upstreamForm.append('tags', tags)

  const uploadResp = await fetch(`${agentUrl}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: upstreamForm,
  })

  const uploadPayload = await parseJsonResponse(uploadResp)
  if (!uploadResp.ok) {
    return c.json({
      error: 'Load agent upload failed',
      status: uploadResp.status,
      payload: uploadPayload,
    }, 502)
  }

  const stagedDataitemId = extractUploadId(uploadPayload)
  if (!stagedDataitemId) {
    return c.json({ error: 'Upload succeeded but no dataitem id returned', payload: uploadPayload }, 502)
  }

  const stagedGatewayUrl = `${gatewayUrl}/resolve/${stagedDataitemId}`
  const jobId = generateJobId()

  await c.env.DB.prepare(`
    INSERT INTO music_publish_jobs (
      job_id, user_address, status, publish_type, idempotency_key,
      file_name, content_type, file_size, audio_sha256, fingerprint, duration_s,
      staged_dataitem_id, staged_gateway_url, staged_payload_json,
      created_at, updated_at
    ) VALUES (?, ?, 'staged', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    jobId,
    userAddress,
    publishType,
    idempotencyKey,
    file.name || null,
    contentType,
    file.size,
    audioSha256,
    fingerprint,
    durationS,
    stagedDataitemId,
    stagedGatewayUrl,
    JSON.stringify(uploadPayload),
    now,
    now,
  ).run()

  const row = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ?
  `).bind(jobId).first<MusicPublishJobRow>()

  if (!row) {
    return c.json({ error: 'Failed to load created job' }, 500)
  }

  return c.json({
    existing: false,
    job: serializeJob(row),
  })
})

app.post('/publish/:jobId/artifacts/stage', async (c) => {
  const userAddress = c.get('userAddress')
  const jobId = c.req.param('jobId')
  const apiKey = c.env.LOAD_S3_AGENT_API_KEY
  if (!apiKey) {
    return c.json({ error: 'Music artifact upload not configured (LOAD_S3_AGENT_API_KEY)' }, 500)
  }

  const row = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
  `).bind(jobId, userAddress).first<MusicPublishJobRow>()
  if (!row) {
    return c.json({ error: 'Job not found' }, 404)
  }

  if (row.status === 'anchoring' || row.status === 'anchored' || row.status === 'registering' || row.status === 'registered') {
    return c.json({ error: `Cannot stage artifacts from status ${row.status}`, job: serializeJob(row) }, 409)
  }

  const form = await c.req.formData()
  const coverField = form.get('cover')
  if (coverField !== null && !(coverField instanceof File)) {
    return c.json({ error: 'cover must be a file when provided' }, 400)
  }
  const coverFile = coverField instanceof File ? coverField : null
  const coverContentType = (asOptionalString(form.get('coverContentType')) || coverFile?.type || 'application/octet-stream').trim()

  const lyricsRaw = asOptionalString(form.get('lyricsText'))
  const lyricsText = lyricsRaw ?? ''
  const lyricsProvided = lyricsRaw !== null && lyricsText.trim().length > 0

  if (!coverFile && !lyricsProvided) {
    return c.json({ error: 'At least one artifact is required (cover and/or lyricsText)' }, 400)
  }

  if (coverFile) {
    if (!coverFile.size) {
      return c.json({ error: 'Cover file is empty' }, 400)
    }
    if (coverFile.size > MAX_COVER_FILE_SIZE) {
      return c.json({ error: `Cover file too large: ${coverFile.size} > ${MAX_COVER_FILE_SIZE}` }, 400)
    }
    if (!isLikelyImageContentType(coverContentType)) {
      return c.json({ error: `Unsupported cover content type: ${coverContentType}` }, 400)
    }
  }

  const lyricsBytes = lyricsProvided ? new TextEncoder().encode(lyricsText) : null
  if (lyricsBytes && lyricsBytes.byteLength > MAX_LYRICS_BYTES) {
    return c.json({ error: `lyricsText too large: ${lyricsBytes.byteLength} > ${MAX_LYRICS_BYTES}` }, 400)
  }

  const coverAlreadyStaged = !!row.cover_staged_dataitem_id && !!row.cover_staged_gateway_url
  const lyricsAlreadyStaged = !!row.lyrics_staged_dataitem_id && !!row.lyrics_staged_gateway_url
  if ((!coverFile || coverAlreadyStaged) && (!lyricsProvided || lyricsAlreadyStaged)) {
    return c.json({ cached: true, job: serializeJob(row) })
  }

  const agentUrl = (c.env.LOAD_S3_AGENT_URL || DEFAULT_AGENT_URL).replace(/\/+$/, '')
  const gatewayUrl = (c.env.LOAD_GATEWAY_URL || DEFAULT_GATEWAY_URL).replace(/\/+$/, '')

  let coverUpload: Awaited<ReturnType<typeof uploadToLoadStaging>> | null = null
  let lyricsUpload: Awaited<ReturnType<typeof uploadToLoadStaging>> | null = null
  let lyricsSha256 = row.lyrics_sha256
  let lyricsByteLength = row.lyrics_bytes

  try {
    if (coverFile && !coverAlreadyStaged) {
      coverUpload = await uploadToLoadStaging({
        apiKey,
        agentUrl,
        gatewayUrl,
        file: coverFile,
        contentType: coverContentType,
        tags: [
          { key: 'App-Name', value: 'Heaven' },
          { key: 'Upload-Source', value: 'music-artifact-stage' },
          { key: 'Music-Job-Id', value: jobId },
          { key: 'Music-Artifact-Type', value: 'cover' },
          { key: 'Content-Type', value: coverContentType },
        ],
      })
    }

    if (lyricsBytes && !lyricsAlreadyStaged) {
      lyricsSha256 = `0x${await sha256HexBytes(lyricsBytes)}`
      lyricsByteLength = lyricsBytes.byteLength
      const lyricsFile = new File([lyricsBytes], 'lyrics.txt', { type: 'text/plain; charset=utf-8' })
      lyricsUpload = await uploadToLoadStaging({
        apiKey,
        agentUrl,
        gatewayUrl,
        file: lyricsFile,
        contentType: 'text/plain; charset=utf-8',
        tags: [
          { key: 'App-Name', value: 'Heaven' },
          { key: 'Upload-Source', value: 'music-artifact-stage' },
          { key: 'Music-Job-Id', value: jobId },
          { key: 'Music-Artifact-Type', value: 'lyrics' },
          { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
        ],
      })
    }
  } catch (error) {
    return c.json({
      error: 'Artifact staging failed',
      details: asErrorMessage(error),
    }, 502)
  }

  const now = Math.floor(Date.now() / 1000)
  await c.env.DB.prepare(`
    UPDATE music_publish_jobs
    SET cover_staged_dataitem_id = ?,
        cover_staged_gateway_url = ?,
        cover_content_type = ?,
        cover_file_size = ?,
        cover_staged_payload_json = ?,
        lyrics_staged_dataitem_id = ?,
        lyrics_staged_gateway_url = ?,
        lyrics_sha256 = ?,
        lyrics_bytes = ?,
        lyrics_staged_payload_json = ?,
        updated_at = ?
    WHERE job_id = ? AND user_address = ?
  `).bind(
    coverUpload?.dataitemId ?? row.cover_staged_dataitem_id,
    coverUpload?.gatewayUrl ?? row.cover_staged_gateway_url,
    coverUpload ? coverContentType : row.cover_content_type,
    coverUpload ? coverFile?.size ?? row.cover_file_size : row.cover_file_size,
    coverUpload ? JSON.stringify(coverUpload.payload) : row.cover_staged_payload_json,
    lyricsUpload?.dataitemId ?? row.lyrics_staged_dataitem_id,
    lyricsUpload?.gatewayUrl ?? row.lyrics_staged_gateway_url,
    lyricsSha256,
    lyricsByteLength,
    lyricsUpload ? JSON.stringify(lyricsUpload.payload) : row.lyrics_staged_payload_json,
    now,
    jobId,
    userAddress,
  ).run()

  const updated = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
  `).bind(jobId, userAddress).first<MusicPublishJobRow>()
  if (!updated) {
    return c.json({ error: 'Failed to load artifact-staged job' }, 500)
  }

  return c.json({
    cached: false,
    artifacts: {
      cover: {
        uploaded: !!coverUpload,
        stagedDataitemId: updated.cover_staged_dataitem_id,
        stagedGatewayUrl: updated.cover_staged_gateway_url,
      },
      lyrics: {
        uploaded: !!lyricsUpload,
        stagedDataitemId: updated.lyrics_staged_dataitem_id,
        stagedGatewayUrl: updated.lyrics_staged_gateway_url,
        sha256: updated.lyrics_sha256,
        bytes: updated.lyrics_bytes,
      },
    },
    job: serializeJob(updated),
  })
})

interface MusicPreflightRequest {
  jobId: string
  publishType?: MusicPublishType
  fingerprint?: string
  durationS?: number
  parentIpIds?: string[]
  licenseTermsIds?: Array<string | number>
}

app.post('/preflight', async (c) => {
  const userAddress = c.get('userAddress')

  let body: MusicPreflightRequest
  try {
    body = await c.req.json<MusicPreflightRequest>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const jobId = body.jobId?.trim()
  if (!jobId) {
    return c.json({ error: 'jobId is required' }, 400)
  }

  const row = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
  `).bind(jobId, userAddress).first<MusicPublishJobRow>()
  if (!row) {
    return c.json({ error: 'Job not found' }, 404)
  }

  if (row.status === 'anchoring' || row.status === 'anchored' || row.status === 'registering' || row.status === 'registered') {
    return c.json({ error: `Cannot run preflight from status ${row.status}`, job: serializeJob(row) }, 409)
  }

  const publishType = body.publishType || row.publish_type
  if (!publishType) {
    return c.json({ error: 'publishType is required (original, derivative, cover)' }, 400)
  }

  const fingerprint = typeof body.fingerprint === 'string'
    ? body.fingerprint.trim().slice(0, 32_000)
    : row.fingerprint

  const durationS = typeof body.durationS === 'number' && Number.isInteger(body.durationS) && body.durationS > 0
    ? body.durationS
    : row.duration_s

  let parentIpIds = parseJsonStringArray(row.parent_ip_ids_json) || []
  if (body.parentIpIds !== undefined) {
    if (!Array.isArray(body.parentIpIds) || !body.parentIpIds.every((value) => typeof value === 'string')) {
      return c.json({ error: 'parentIpIds must be an array of strings' }, 400)
    }
    parentIpIds = body.parentIpIds.map((value) => value.trim().toLowerCase())
  }

  let licenseTermsIds = parseJsonStringArray(row.license_terms_ids_json) || []
  if (body.licenseTermsIds !== undefined) {
    const parsed = parseLicenseTermsIds(body.licenseTermsIds)
    if (!parsed) {
      return c.json({ error: 'licenseTermsIds must be an array of positive integers (string or number)' }, 400)
    }
    licenseTermsIds = parsed
  }

  if (parentIpIds.some((value) => !isAddress(value))) {
    return c.json({ error: 'parentIpIds must contain valid 0x-prefixed addresses' }, 400)
  }

  // Mark in-flight checks only after basic request validation passes.
  const checkingNow = Math.floor(Date.now() / 1000)
  await c.env.DB.prepare(`
    UPDATE music_publish_jobs
    SET status = 'checking', updated_at = ?
    WHERE job_id = ? AND user_address = ?
  `).bind(checkingNow, jobId, userAddress).run()

  const duplicateHashRows: Array<{
    job_id: string
    status: string
    arweave_ref: string | null
  }> = []

  let hashDuplicateCheck = 'skipped_not_original'
  let status: MusicPublishJobRow['status'] = 'policy_passed'
  let policyDecision: MusicPublishJobRow['policy_decision'] = 'pass'
  let policyReasonCode: string | null = null
  let policyReason: string | null = null

  if (publishType === 'original') {
    if (!row.audio_sha256) {
      hashDuplicateCheck = 'skipped_missing_audio_sha256'
      status = 'rejected'
      policyDecision = 'reject'
      policyReasonCode = 'missing_audio_sha256'
      policyReason = 'Original publish requires audioSha256'
    } else if (!row.staged_gateway_url) {
      hashDuplicateCheck = 'skipped_missing_staged_gateway'
      status = 'rejected'
      policyDecision = 'reject'
      policyReasonCode = 'missing_staged_gateway'
      policyReason = 'Missing staged gateway URL; cannot verify hash'
    } else {
      try {
        const stagedResp = await fetch(row.staged_gateway_url)
        if (!stagedResp.ok) {
          hashDuplicateCheck = 'failed_unavailable'
          status = 'staged'
          policyDecision = 'pending'
          policyReasonCode = 'hash_verification_unavailable'
          policyReason = `Could not fetch staged file for hash verification (status ${stagedResp.status}); retry preflight`
        } else {
          const stagedBytes = await stagedResp.arrayBuffer()
          if (stagedBytes.byteLength > MAX_FILE_SIZE) {
            hashDuplicateCheck = 'failed_staged_too_large'
            status = 'rejected'
            policyDecision = 'reject'
            policyReasonCode = 'staged_file_too_large'
            policyReason = `Staged file exceeds max size (${stagedBytes.byteLength} > ${MAX_FILE_SIZE})`
          } else {
            const serverHash = await sha256Hex(stagedBytes)
            if (serverHash !== row.audio_sha256) {
              hashDuplicateCheck = 'failed_mismatch'
              status = 'rejected'
              policyDecision = 'reject'
              policyReasonCode = 'hash_mismatch'
              policyReason = 'Server hash of staged file does not match audioSha256'
            } else {
              hashDuplicateCheck = 'performed'
              const matches = await c.env.DB.prepare(`
                SELECT job_id, status, arweave_ref
                FROM music_publish_jobs
                WHERE audio_sha256 = ?
                  AND job_id != ?
                  AND status IN ('policy_passed', 'anchoring', 'anchored', 'registering', 'registered')
                ORDER BY updated_at DESC
                LIMIT 5
              `).bind(row.audio_sha256, row.job_id).all<{
                job_id: string
                status: string
                arweave_ref: string | null
              }>()
              duplicateHashRows.push(...matches.results)
              // Softened: duplicate hash is informational only — don't block upload
              if (duplicateHashRows.length > 0) {
                hashDuplicateCheck = 'warn_duplicate_found'
              }
              if (
                !row.cover_staged_dataitem_id
                || !row.cover_staged_gateway_url
                || !row.lyrics_staged_dataitem_id
                || !row.lyrics_staged_gateway_url
              ) {
                status = 'manual_review'
                policyDecision = 'manual_review'
                policyReasonCode = 'missing_staged_artifacts'
                policyReason = 'Missing staged cover/lyrics artifacts for original publish'
              } else if (!fingerprint) {
                status = 'manual_review'
                policyDecision = 'manual_review'
                policyReasonCode = 'fingerprint_missing'
                policyReason = 'No fingerprint provided for original publish'
              }
            }
          }
        }
      } catch {
        hashDuplicateCheck = 'failed_unavailable'
        status = 'staged'
        policyDecision = 'pending'
        policyReasonCode = 'hash_verification_unavailable'
        policyReason = 'Could not fetch staged file for hash verification; retry preflight'
      }
    }
  } else if ((publishType === 'derivative' || publishType === 'cover') && (parentIpIds.length === 0 || licenseTermsIds.length === 0)) {
    status = 'rejected'
    policyDecision = 'reject'
    policyReasonCode = 'parent_link_required'
    policyReason = 'Derivative/cover publish requires parentIpIds and licenseTermsIds'
  } else if ((publishType === 'derivative' || publishType === 'cover') && parentIpIds.length !== licenseTermsIds.length) {
    status = 'rejected'
    policyDecision = 'reject'
    policyReasonCode = 'parent_terms_mismatch'
    policyReason = 'parentIpIds and licenseTermsIds must have the same length'
  }

  const now = Math.floor(Date.now() / 1000)
  await c.env.DB.prepare(`
    UPDATE music_publish_jobs
    SET status = ?,
        publish_type = ?,
        fingerprint = ?,
        duration_s = ?,
        parent_ip_ids_json = ?,
        license_terms_ids_json = ?,
        policy_decision = ?,
        policy_reason_code = ?,
        policy_reason = ?,
        updated_at = ?
    WHERE job_id = ? AND user_address = ?
  `).bind(
    status,
    publishType,
    fingerprint || null,
    durationS ?? null,
    JSON.stringify(parentIpIds),
    JSON.stringify(licenseTermsIds),
    policyDecision,
    policyReasonCode,
    policyReason,
    now,
    jobId,
    userAddress,
  ).run()

  const updated = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
  `).bind(jobId, userAddress).first<MusicPublishJobRow>()

  if (!updated) {
    return c.json({ error: 'Failed to load updated job' }, 500)
  }

  const responsePayload = {
    job: serializeJob(updated),
    checks: {
      hashDuplicate: hashDuplicateCheck,
      acoustid: 'deferred_not_implemented',
    },
    duplicateCandidates: duplicateHashRows.map((candidate) => ({
      jobId: candidate.job_id,
      status: candidate.status,
      arweaveRef: candidate.arweave_ref,
    })),
  }

  if (policyReasonCode === 'hash_verification_unavailable') {
    return c.json(
      {
        error: 'Hash verification unavailable; retry preflight',
        ...responsePayload,
      },
      502,
    )
  }

  return c.json(responsePayload)
})

app.get('/publish/:jobId', async (c) => {
  const userAddress = c.get('userAddress')
  const jobId = c.req.param('jobId')

  const row = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
  `).bind(jobId, userAddress).first<MusicPublishJobRow>()

  if (!row) {
    return c.json({ error: 'Job not found' }, 404)
  }

  return c.json({ job: serializeJob(row) })
})

interface TempoFinalizeRequestBody {
  title?: string
  artist?: string
  album?: string
  durationS?: number
  pieceCid?: string
  datasetOwner?: string
  algo?: number
}

app.post('/publish/:jobId/finalize', async (c) => {
  const userAddress = c.get('userAddress')
  const jobId = c.req.param('jobId')

  const sponsorPk = c.env.TEMPO_SPONSOR_PRIVATE_KEY || c.env.STORY_SPONSOR_PRIVATE_KEY || c.env.PRIVATE_KEY
  if (!sponsorPk) {
    console.error('[Music/Finalize] Missing TEMPO_SPONSOR_PRIVATE_KEY (or PRIVATE_KEY fallback)')
    return c.json({ error: 'Tempo finalize is not configured' }, 500)
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(sponsorPk.trim())) {
    console.error('[Music/Finalize] TEMPO_SPONSOR_PRIVATE_KEY has invalid format')
    return c.json({ error: 'Tempo finalize is not configured' }, 500)
  }

  const operatorPk = (c.env.TEMPO_OPERATOR_PRIVATE_KEY || sponsorPk).trim()
  if (!/^0x[a-fA-F0-9]{64}$/.test(operatorPk)) {
    console.error('[Music/Finalize] TEMPO_OPERATOR_PRIVATE_KEY has invalid format')
    return c.json({ error: 'Tempo finalize is not configured' }, 500)
  }

  const tempoChainIdRaw = c.env.TEMPO_CHAIN_ID
  const tempoChainId = tempoChainIdRaw ? Number(tempoChainIdRaw) : DEFAULT_TEMPO_CHAIN_ID
  if (!Number.isInteger(tempoChainId) || tempoChainId <= 0) {
    return c.json({ error: `Invalid TEMPO_CHAIN_ID: ${tempoChainIdRaw}` }, 500)
  }

  const tempoRpcUrl = (c.env.TEMPO_RPC_URL || DEFAULT_TEMPO_RPC_URL).trim()
  const scrobbleAddressRaw = (c.env.TEMPO_SCROBBLE_V4 || DEFAULT_TEMPO_SCROBBLE_V4).trim()
  const contentRegistryAddressRaw = (c.env.TEMPO_CONTENT_REGISTRY || DEFAULT_TEMPO_CONTENT_REGISTRY).trim()
  const tempoTxWaitTimeoutRaw = c.env.TEMPO_TX_WAIT_TIMEOUT_MS
  const tempoTxWaitTimeoutMs = tempoTxWaitTimeoutRaw ? Number(tempoTxWaitTimeoutRaw) : DEFAULT_TEMPO_TX_WAIT_TIMEOUT_MS
  if (!Number.isInteger(tempoTxWaitTimeoutMs) || tempoTxWaitTimeoutMs < 1_000 || tempoTxWaitTimeoutMs > 300_000) {
    return c.json({ error: `Invalid TEMPO_TX_WAIT_TIMEOUT_MS: ${tempoTxWaitTimeoutRaw}` }, 500)
  }

  if (!isAddress(scrobbleAddressRaw)) {
    return c.json({ error: `Invalid TEMPO_SCROBBLE_V4 address: ${scrobbleAddressRaw}` }, 500)
  }
  if (!isAddress(contentRegistryAddressRaw)) {
    return c.json({ error: `Invalid TEMPO_CONTENT_REGISTRY address: ${contentRegistryAddressRaw}` }, 500)
  }

  const row = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
  `).bind(jobId, userAddress).first<MusicPublishJobRow>()

  if (!row) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const hasTempoFinalizeEvidence = !!row.megaeth_tx_hash

  if (row.status === 'registered' && hasTempoFinalizeEvidence) {
    return c.json({
      job: serializeJob(row),
      registration: {
        cached: true,
        tempoTxHash: row.megaeth_tx_hash,
      },
    })
  }
  if (row.status === 'registering') {
    return c.json({
      error: 'Finalize already in progress',
      job: serializeJob(row),
    }, 409)
  }
  if (row.status !== 'policy_passed' && row.status !== 'anchored' && row.status !== 'registered') {
    return c.json({ error: `Job must be policy_passed or anchored before finalize (current=${row.status})`, job: serializeJob(row) }, 409)
  }

  let body: TempoFinalizeRequestBody
  try {
    body = await c.req.json<TempoFinalizeRequestBody>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const title = (body.title || '').trim()
  const artist = (body.artist || '').trim()
  const album = (body.album || '').trim()
  if (!title) return c.json({ error: 'title is required' }, 400)
  if (!artist) return c.json({ error: 'artist is required' }, 400)
  if (utf8ByteLength(title) > 128) return c.json({ error: 'title exceeds 128-byte UTF-8 contract limit' }, 400)
  if (utf8ByteLength(artist) > 128) return c.json({ error: 'artist exceeds 128-byte UTF-8 contract limit' }, 400)
  if (utf8ByteLength(album) > 128) return c.json({ error: 'album exceeds 128-byte UTF-8 contract limit' }, 400)

  let durationS: number
  try {
    durationS = parseDurationSeconds(body.durationS, row.duration_s)
  } catch (error) {
    return c.json({ error: asErrorMessage(error) }, 400)
  }

  const pieceCid = (body.pieceCid || row.staged_dataitem_id || '').trim()
  if (!pieceCid) {
    return c.json({ error: 'pieceCid is required (missing staged_dataitem_id)' }, 409)
  }

  let pieceCidBytes: Uint8Array
  try {
    pieceCidBytes = parsePieceCidBytes(pieceCid)
  } catch (error) {
    return c.json({ error: asErrorMessage(error) }, 400)
  }
  if (!pieceCidBytes.length) return c.json({ error: 'pieceCid is empty' }, 400)
  if (pieceCidBytes.length > 128) return c.json({ error: 'pieceCid exceeds 128-byte on-chain limit' }, 400)

  const datasetOwner = normalizeAddress((body.datasetOwner || userAddress).trim())
  if (!datasetOwner) {
    return c.json({ error: 'datasetOwner must be a valid 0x address when provided' }, 400)
  }

  const algo = body.algo === undefined ? 1 : Number(body.algo)
  if (!Number.isInteger(algo) || algo <= 0 || algo > 255) {
    return c.json({ error: 'algo must be an integer between 1 and 255' }, 400)
  }

  const previousStatus = row.status
  const lockNow = Math.floor(Date.now() / 1000)
  const lock = await c.env.DB.prepare(`
    UPDATE music_publish_jobs
    SET status = 'registering',
        updated_at = ?
    WHERE job_id = ? AND user_address = ? AND status IN ('policy_passed', 'anchored', 'registered')
  `).bind(lockNow, jobId, userAddress).run()
  const lockChanges = Number(lock.meta?.changes ?? 0)
  if (lockChanges !== 1) {
    const latest = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
    `).bind(jobId, userAddress).first<MusicPublishJobRow>()
    if (!latest) {
      return c.json({ error: 'Job not found after finalize lock attempt' }, 404)
    }
    if (latest.status === 'registered' && latest.megaeth_tx_hash) {
      return c.json({
        job: serializeJob(latest),
        registration: {
          cached: true,
          tempoTxHash: latest.megaeth_tx_hash,
        },
      })
    }
    return c.json({
      error: `Finalize lock not acquired (current=${latest.status})`,
      job: serializeJob(latest),
    }, 409)
  }

  const scrobbleAddress = getAddress(scrobbleAddressRaw)
  const contentRegistryAddress = getAddress(contentRegistryAddressRaw)

  try {
    const provider = new JsonRpcProvider(tempoRpcUrl, tempoChainId)
    const sponsorWallet = new Wallet(sponsorPk.trim(), provider)
    const operatorWallet = new Wallet(operatorPk, provider)
    const scrobbleContract = new Contract(scrobbleAddress, TEMPO_SCROBBLE_V4_ABI, operatorWallet)
    const contentRegistryContract = new Contract(contentRegistryAddress, TEMPO_CONTENT_REGISTRY_ABI, sponsorWallet)

    const { trackId, payload } = computeMetaTrackId(title, artist, album)
    const contentId = computeContentId(trackId, userAddress)

    let trackRegistered = false
    let contentRegistered = false
    let coverSet = false
    let scrobbleTxHash: string | null = null
    let contentTxHash: string | null = null
    let coverTxHash: string | null = null

    const registered = await scrobbleContract.isRegistered(trackId) as boolean
    if (!registered) {
      try {
        const tx = await scrobbleContract.registerTracksBatch(
          [3],
          [payload],
          [title],
          [artist],
          [album],
          [durationS],
        )
        const receipt = await waitForTxReceiptWithTimeout(tx, tempoTxWaitTimeoutMs, 'scrobble_register')
        scrobbleTxHash = receipt.hash || tx.hash
        trackRegistered = true
      } catch (error) {
        const retryRegistered = await scrobbleContract.isRegistered(trackId) as boolean
        if (!retryRegistered) throw error
      }
    }

    // Best-effort cover write so New Releases/profile cards can render artwork.
    // This should not block publish finalization if the cover write races or times out.
    const stagedCoverId = (row.cover_staged_dataitem_id || '').trim()
    const coverRef = stagedCoverId ? `ls3://${stagedCoverId}` : null
    if (coverRef && coverRef.length <= 128) {
      try {
        const tx = await scrobbleContract.setTrackCoverBatch([trackId], [coverRef])
        const receipt = await waitForTxReceiptWithTimeout(tx, tempoTxWaitTimeoutMs, 'track_cover_set')
        coverTxHash = receipt.hash || tx.hash
        coverSet = true
      } catch {
        try {
          const trackState = await scrobbleContract.getTrack(trackId)
          coverSet = extractTrackCover(trackState).trim().length > 0
        } catch {
          coverSet = false
        }
      }
    }

    const contentState = await contentRegistryContract.getContent(contentId)
    if (!contentEntryActive(contentState)) {
      try {
        const tx = await contentRegistryContract.registerContentFor(
          userAddress,
          trackId,
          datasetOwner,
          pieceCidBytes,
          algo,
        )
        const receipt = await waitForTxReceiptWithTimeout(tx, tempoTxWaitTimeoutMs, 'content_register')
        contentTxHash = receipt.hash || tx.hash
        contentRegistered = true
      } catch (error) {
        const retryState = await contentRegistryContract.getContent(contentId)
        if (!contentEntryActive(retryState)) throw error
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const tempoTxHash = contentTxHash || scrobbleTxHash || row.megaeth_tx_hash
    await c.env.DB.prepare(`
      UPDATE music_publish_jobs
      SET status = 'registered',
          megaeth_tx_hash = ?,
          error_code = NULL,
          error_message = NULL,
          updated_at = ?
      WHERE job_id = ? AND user_address = ?
    `).bind(
      tempoTxHash,
      now,
      jobId,
      userAddress,
    ).run()

    const updated = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
    `).bind(jobId, userAddress).first<MusicPublishJobRow>()

    if (!updated) {
      return c.json({ error: 'Failed to load finalized job' }, 500)
    }

    return c.json({
      job: serializeJob(updated),
      registration: {
        chainId: tempoChainId,
        trackId,
        trackPayload: payload,
        contentId,
        pieceCid,
        datasetOwner,
        algo,
        durationS,
        scrobbleTxHash,
        contentTxHash,
        coverTxHash,
        tempoTxHash,
        trackRegistered,
        contentRegistered,
        coverSet,
        coverRef,
      },
    })
  } catch (error) {
    const now = Math.floor(Date.now() / 1000)
    const message = asErrorMessage(error).slice(0, 1024)
    await c.env.DB.prepare(`
      UPDATE music_publish_jobs
      SET status = ?,
          error_code = 'tempo_finalize_failed',
          error_message = ?,
          updated_at = ?
      WHERE job_id = ? AND user_address = ?
    `).bind(previousStatus, message, now, jobId, userAddress).run()

    const latest = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
    `).bind(jobId, userAddress).first<MusicPublishJobRow>()

    return c.json({
      error: 'Tempo finalize failed',
      details: message,
      job: latest ? serializeJob(latest) : null,
    }, 502)
  }
})

// Explicit anchor step: only after preflight passes.
app.post('/publish/:jobId/anchor', async (c) => {
  const userAddress = c.get('userAddress')
  const jobId = c.req.param('jobId')

  const apiKey = c.env.LOAD_S3_AGENT_API_KEY
  if (!apiKey) {
    return c.json({ error: 'Arweave anchor not configured (LOAD_S3_AGENT_API_KEY)' }, 500)
  }

  const row = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
  `).bind(jobId, userAddress).first<MusicPublishJobRow>()

  if (!row) {
    return c.json({ error: 'Job not found' }, 404)
  }

  if (row.status === 'anchoring' || row.status === 'anchored' || row.status === 'registering' || row.status === 'registered') {
    return c.json({ job: serializeJob(row) })
  }

  if (row.status !== 'policy_passed') {
    return c.json({ error: `Job must be policy_passed before anchor (current=${row.status})` }, 409)
  }

  if (!row.staged_dataitem_id) {
    return c.json({ error: 'Missing staged dataitem id; cannot anchor' }, 409)
  }

  const now = Math.floor(Date.now() / 1000)
  const lock = await c.env.DB.prepare(`
    UPDATE music_publish_jobs SET status = 'anchoring', updated_at = ?
    WHERE job_id = ? AND user_address = ? AND status = 'policy_passed'
  `).bind(now, jobId, userAddress).run()
  const lockChanges = Number(lock.meta?.changes ?? 0)
  if (lockChanges !== 1) {
    const latest = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
    `).bind(jobId, userAddress).first<MusicPublishJobRow>()
    if (!latest) {
      return c.json({ error: 'Job not found after lock attempt' }, 404)
    }
    return c.json(
      {
        error: `Anchor lock not acquired (current=${latest.status})`,
        job: serializeJob(latest),
      },
      409,
    )
  }

  const agentUrl = (c.env.LOAD_S3_AGENT_URL || DEFAULT_AGENT_URL).replace(/\/+$/, '')
  const postResp = await fetch(`${agentUrl}/post/${encodeURIComponent(row.staged_dataitem_id)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  const postPayload = await parseJsonResponse(postResp)
  if (!postResp.ok) {
    const failNow = Math.floor(Date.now() / 1000)
    await c.env.DB.prepare(`
      UPDATE music_publish_jobs
      SET status = 'policy_passed',
          error_code = 'anchor_failed',
          error_message = ?,
          updated_at = ?
      WHERE job_id = ? AND user_address = ?
    `).bind(`LS3 post failed (status ${postResp.status})`, failNow, jobId, userAddress).run()

    return c.json({
      error: 'LS3 post-to-arweave failed',
      status: postResp.status,
      payload: postPayload,
    }, 502)
  }

  const arweaveUrl = `${DEFAULT_ARWEAVE_GATEWAY}/${row.staged_dataitem_id}`
  let arweaveAvailable = false
  try {
    const head = await fetch(arweaveUrl, { method: 'HEAD' })
    arweaveAvailable = head.ok
  } catch {
    arweaveAvailable = false
  }

  const doneNow = Math.floor(Date.now() / 1000)
  await c.env.DB.prepare(`
    UPDATE music_publish_jobs
    SET status = 'anchored',
        anchored_dataitem_id = ?,
        arweave_ref = ?,
        arweave_url = ?,
        arweave_available = ?,
        anchor_payload_json = ?,
        error_code = NULL,
        error_message = NULL,
        updated_at = ?
    WHERE job_id = ? AND user_address = ?
  `).bind(
    row.staged_dataitem_id,
    `ar://${row.staged_dataitem_id}`,
    arweaveUrl,
    arweaveAvailable ? 1 : 0,
    JSON.stringify(postPayload),
    doneNow,
    jobId,
    userAddress,
  ).run()

  const updated = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
  `).bind(jobId, userAddress).first<MusicPublishJobRow>()

  if (!updated) {
    return c.json({ error: 'Failed to load anchored job' }, 500)
  }

  return c.json({ job: serializeJob(updated) })
})

interface MusicMetadataAnchorBody {
  ipMetadataJson?: unknown
  nftMetadataJson?: unknown
}

function hasAnchoredMetadata(row: MusicPublishJobRow): boolean {
  return (
    row.metadata_status === 'anchored'
    && !!row.ip_metadata_uri
    && !!row.ip_metadata_hash
    && !!row.nft_metadata_uri
    && !!row.nft_metadata_hash
  )
}

function metadataResponseFromRow(jobId: string, row: MusicPublishJobRow) {
  const ipId = row.ip_metadata_dataitem_id || dataitemIdFromArRef(row.ip_metadata_uri)
  const nftId = row.nft_metadata_dataitem_id || dataitemIdFromArRef(row.nft_metadata_uri)
  return {
    jobId,
    ipMetadataURI: row.ip_metadata_uri,
    ipMetadataHash: row.ip_metadata_hash,
    ipMetadataDataitemId: ipId,
    ipMetadataArweaveUrl: ipId ? `${DEFAULT_ARWEAVE_GATEWAY}/${ipId}` : null,
    ipMetadataArweaveAvailable: !!ipId,
    nftMetadataURI: row.nft_metadata_uri,
    nftMetadataHash: row.nft_metadata_hash,
    nftMetadataDataitemId: nftId,
    nftMetadataArweaveUrl: nftId ? `${DEFAULT_ARWEAVE_GATEWAY}/${nftId}` : null,
    nftMetadataArweaveAvailable: !!nftId,
  }
}

app.post('/publish/:jobId/metadata', async (c) => {
  const userAddress = c.get('userAddress')
  const jobId = c.req.param('jobId')
  const apiKey = c.env.LOAD_S3_AGENT_API_KEY
  if (!apiKey) {
    return c.json({ error: 'Music metadata anchor not configured (LOAD_S3_AGENT_API_KEY)' }, 500)
  }

  const row = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
  `).bind(jobId, userAddress).first<MusicPublishJobRow>()
  if (!row) {
    return c.json({ error: 'Job not found' }, 404)
  }
  if (row.status !== 'anchored' && row.status !== 'registering' && row.status !== 'registered') {
    return c.json({ error: `Job must be anchored before metadata anchor (current=${row.status})`, job: serializeJob(row) }, 409)
  }
  if (hasAnchoredMetadata(row)) {
    return c.json({
      ...metadataResponseFromRow(jobId, row),
      cached: true,
      job: serializeJob(row),
    })
  }

  let body: MusicMetadataAnchorBody
  try {
    body = await c.req.json<MusicMetadataAnchorBody>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  let ipMetadataJson: string
  let nftMetadataJson: string
  try {
    ipMetadataJson = normalizeJsonPayload(body.ipMetadataJson, 'ipMetadataJson')
    nftMetadataJson = normalizeJsonPayload(body.nftMetadataJson, 'nftMetadataJson')
  } catch (error) {
    return c.json({ error: asErrorMessage(error) }, 400)
  }

  const ipBytes = new TextEncoder().encode(ipMetadataJson)
  const nftBytes = new TextEncoder().encode(nftMetadataJson)
  const maxJsonBytes = 256 * 1024
  if (ipBytes.byteLength > maxJsonBytes || nftBytes.byteLength > maxJsonBytes) {
    return c.json({ error: `Metadata payload too large (max ${maxJsonBytes} bytes each)` }, 400)
  }

  const agentUrl = (c.env.LOAD_S3_AGENT_URL || DEFAULT_AGENT_URL).replace(/\/+$/, '')
  const gatewayUrl = (c.env.LOAD_GATEWAY_URL || DEFAULT_GATEWAY_URL).replace(/\/+$/, '')
  const lockNow = Math.floor(Date.now() / 1000)
  const lock = await c.env.DB.prepare(`
    UPDATE music_publish_jobs
    SET metadata_status = 'anchoring',
        metadata_error = NULL,
        updated_at = ?
    WHERE job_id = ? AND user_address = ?
      AND (metadata_status IS NULL OR metadata_status IN ('none', 'failed'))
      AND ip_metadata_uri IS NULL
      AND nft_metadata_uri IS NULL
  `).bind(lockNow, jobId, userAddress).run()
  const lockChanges = Number(lock.meta?.changes ?? 0)
  if (lockChanges !== 1) {
    const latest = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
    `).bind(jobId, userAddress).first<MusicPublishJobRow>()
    if (!latest) {
      return c.json({ error: 'Job not found after metadata lock attempt' }, 404)
    }
    if (hasAnchoredMetadata(latest)) {
      return c.json({
        ...metadataResponseFromRow(jobId, latest),
        cached: true,
        job: serializeJob(latest),
      })
    }
    if (latest.metadata_status === 'anchoring') {
      return c.json({
        error: 'Metadata anchor already in progress',
        job: serializeJob(latest),
      }, 409)
    }
    return c.json({
      error: `Metadata anchor lock not acquired (status=${latest.metadata_status ?? 'unknown'})`,
      job: serializeJob(latest),
    }, 409)
  }

  try {
    const [ipAnchor, nftAnchor] = await Promise.all([
      uploadAndAnchorJson({
        apiKey,
        agentUrl,
        gatewayUrl,
        jobId,
        metadataType: 'ip',
        payloadJson: ipMetadataJson,
      }),
      uploadAndAnchorJson({
        apiKey,
        agentUrl,
        gatewayUrl,
        jobId,
        metadataType: 'nft',
        payloadJson: nftMetadataJson,
      }),
    ])
    const doneNow = Math.floor(Date.now() / 1000)
    await c.env.DB.prepare(`
      UPDATE music_publish_jobs
      SET metadata_status = 'anchored',
          metadata_error = NULL,
          ip_metadata_uri = ?,
          ip_metadata_hash = ?,
          ip_metadata_dataitem_id = ?,
          nft_metadata_uri = ?,
          nft_metadata_hash = ?,
          nft_metadata_dataitem_id = ?,
          updated_at = ?
      WHERE job_id = ? AND user_address = ?
    `).bind(
      ipAnchor.ref,
      ipAnchor.payloadHash,
      ipAnchor.dataitemId,
      nftAnchor.ref,
      nftAnchor.payloadHash,
      nftAnchor.dataitemId,
      doneNow,
      jobId,
      userAddress,
    ).run()

    const updated = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
    `).bind(jobId, userAddress).first<MusicPublishJobRow>()
    if (!updated) {
      return c.json({ error: 'Failed to load metadata-anchored job' }, 500)
    }
    return c.json({
      ...metadataResponseFromRow(jobId, updated),
      cached: false,
      job: serializeJob(updated),
    })
  } catch (error) {
    const failNow = Math.floor(Date.now() / 1000)
    await c.env.DB.prepare(`
      UPDATE music_publish_jobs
      SET metadata_status = 'failed',
          metadata_error = ?,
          updated_at = ?
      WHERE job_id = ? AND user_address = ?
    `).bind(asErrorMessage(error).slice(0, 2048), failNow, jobId, userAddress).run()
    const latest = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
    `).bind(jobId, userAddress).first<MusicPublishJobRow>()
    return c.json({
      error: 'Music metadata anchor failed',
      details: asErrorMessage(error).slice(0, 2048),
      job: latest ? serializeJob(latest) : null,
    }, 502)
  }
})

interface StoryRegisterRequestBody {
  recipient?: string
  ipMetadataURI?: string
  ipMetadataHash?: string
  nftMetadataURI?: string
  nftMetadataHash?: string
  commercialRevShare?: number
  defaultMintingFee?: string | number
  parentIpIds?: string[]
  licenseTermsIds?: Array<string | number>
  licenseTemplate?: string
  royaltyContext?: string
  maxMintingFee?: string | number
  maxRts?: number
  maxRevenueShare?: number
  allowDuplicates?: boolean
}

app.post('/publish/:jobId/register', async (c) => {
  const userAddress = c.get('userAddress')
  const jobId = c.req.param('jobId')

  const sponsorPk = c.env.STORY_SPONSOR_PRIVATE_KEY || c.env.PRIVATE_KEY
  if (!sponsorPk) {
    console.error('[Music/Register] Missing sponsor private key (STORY_SPONSOR_PRIVATE_KEY or PRIVATE_KEY)')
    return c.json({ error: 'Story registration is not configured' }, 500)
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(sponsorPk.trim())) {
    console.error('[Music/Register] Sponsor private key has invalid format')
    return c.json({ error: 'Story registration is not configured' }, 500)
  }

  const row = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
  `).bind(jobId, userAddress).first<MusicPublishJobRow>()

  if (!row) {
    return c.json({ error: 'Job not found' }, 404)
  }

  if (row.status === 'registering' || row.status === 'registered') {
    return c.json({ job: serializeJob(row) })
  }

  if (row.status !== 'anchored') {
    return c.json({ error: `Job must be anchored before register (current=${row.status})`, job: serializeJob(row) }, 409)
  }

  const publishType = row.publish_type ?? 'original'
  if (publishType !== 'original' && publishType !== 'derivative' && publishType !== 'cover') {
    return c.json({ error: `Unsupported publishType for registration: ${publishType}`, job: serializeJob(row) }, 409)
  }

  let body: StoryRegisterRequestBody
  try {
    body = await c.req.json<StoryRegisterRequestBody>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const recipient = normalizeAddress(body.recipient || userAddress)
  if (!recipient) {
    return c.json({ error: 'recipient must be a valid 0x address when provided' }, 400)
  }

  const ipMetadataURI = (body.ipMetadataURI || row.ip_metadata_uri || '').trim()
  const nftMetadataURI = (body.nftMetadataURI || row.nft_metadata_uri || '').trim()
  if (!ipMetadataURI || !nftMetadataURI) {
    return c.json({ error: 'ipMetadataURI and nftMetadataURI are required (body or persisted metadata)' }, 400)
  }

  const ipMetadataHashRaw = (body.ipMetadataHash || row.ip_metadata_hash || '').trim().toLowerCase()
  const nftMetadataHashRaw = (body.nftMetadataHash || row.nft_metadata_hash || '').trim().toLowerCase()
  if (!isBytes32Hex(ipMetadataHashRaw) || !isBytes32Hex(nftMetadataHashRaw)) {
    return c.json({ error: 'ipMetadataHash and nftMetadataHash must be 0x-prefixed 32-byte hex values (body or persisted metadata)' }, 400)
  }

  const rawRevShare = body.commercialRevShare ?? 10
  if (!Number.isInteger(rawRevShare) || rawRevShare < 0 || rawRevShare > 100) {
    return c.json({ error: 'commercialRevShare must be an integer between 0 and 100' }, 400)
  }

  const defaultMintingFee = body.defaultMintingFee === undefined
    ? '0'
    : String(body.defaultMintingFee).trim()
  if (!/^\d+$/.test(defaultMintingFee)) {
    return c.json({ error: 'defaultMintingFee must be a non-negative integer string' }, 400)
  }

  let parentIpIds = parseJsonStringArray(row.parent_ip_ids_json) || []
  if (body.parentIpIds !== undefined) {
    if (!Array.isArray(body.parentIpIds) || !body.parentIpIds.every((value) => typeof value === 'string')) {
      return c.json({ error: 'parentIpIds must be an array of strings' }, 400)
    }
    parentIpIds = body.parentIpIds.map((value) => value.trim())
  }

  let licenseTermsIds = parseJsonStringArray(row.license_terms_ids_json) || []
  if (body.licenseTermsIds !== undefined) {
    const parsed = parseLicenseTermsIds(body.licenseTermsIds)
    if (!parsed) {
      return c.json({ error: 'licenseTermsIds must be an array of positive integers (string or number)' }, 400)
    }
    licenseTermsIds = parsed
  }

  const licenseTemplateRaw = (
    body.licenseTemplate
    || c.env.STORY_PIL_LICENSE_TEMPLATE
    || DEFAULT_STORY_PIL_LICENSE_TEMPLATE
  ).trim()
  const royaltyContext = (body.royaltyContext || '0x').trim()
  const maxMintingFee = body.maxMintingFee === undefined
    ? '0'
    : String(body.maxMintingFee).trim()
  const maxRts = body.maxRts === undefined ? 0 : Number(body.maxRts)
  const maxRevenueShare = body.maxRevenueShare === undefined ? 0 : Number(body.maxRevenueShare)

  if (publishType !== 'original') {
    if (parentIpIds.length === 0 || licenseTermsIds.length === 0) {
      return c.json({ error: 'Derivative/cover registration requires parentIpIds and licenseTermsIds' }, 400)
    }
    if (parentIpIds.length !== licenseTermsIds.length) {
      return c.json({ error: 'parentIpIds and licenseTermsIds must have the same length' }, 400)
    }
    if (parentIpIds.some((value) => !isAddress(value))) {
      return c.json({ error: 'parentIpIds must contain valid 0x-prefixed addresses' }, 400)
    }
    if (!isAddress(licenseTemplateRaw)) {
      return c.json({ error: 'licenseTemplate must be a valid 0x-prefixed address' }, 400)
    }
    if (!isHexBytes(royaltyContext)) {
      return c.json({ error: 'royaltyContext must be a 0x-prefixed hex byte string' }, 400)
    }
    if (!/^\d+$/.test(maxMintingFee)) {
      return c.json({ error: 'maxMintingFee must be a non-negative integer string' }, 400)
    }
    if (!Number.isInteger(maxRts) || maxRts < 0 || maxRts > 4_294_967_295) {
      return c.json({ error: 'maxRts must be an integer between 0 and 4294967295' }, 400)
    }
    if (!Number.isInteger(maxRevenueShare) || maxRevenueShare < 0 || maxRevenueShare > 4_294_967_295) {
      return c.json({ error: 'maxRevenueShare must be an integer between 0 and 4294967295' }, 400)
    }
  }

  const allowDuplicates = body.allowDuplicates !== false

  const storyChainIdRaw = c.env.STORY_CHAIN_ID
  const storyChainId = storyChainIdRaw ? Number(storyChainIdRaw) : DEFAULT_STORY_CHAIN_ID
  if (!Number.isInteger(storyChainId) || storyChainId <= 0) {
    return c.json({ error: `Invalid STORY_CHAIN_ID: ${storyChainIdRaw}` }, 500)
  }

  const lockNow = Math.floor(Date.now() / 1000)
  const lock = await c.env.DB.prepare(`
    UPDATE music_publish_jobs
    SET status = 'registering', updated_at = ?
    WHERE job_id = ? AND user_address = ? AND status = 'anchored'
  `).bind(lockNow, jobId, userAddress).run()
  const lockChanges = Number(lock.meta?.changes ?? 0)
  if (lockChanges !== 1) {
    const latest = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
    `).bind(jobId, userAddress).first<MusicPublishJobRow>()
    if (!latest) {
      return c.json({ error: 'Job not found after register lock attempt' }, 404)
    }
    return c.json({
      error: `Register lock not acquired (current=${latest.status})`,
      job: serializeJob(latest),
    }, 409)
  }

  const config: StoryConfig = {
    sponsorPk: sponsorPk.trim(),
    rpcUrl: c.env.STORY_RPC_URL || DEFAULT_STORY_RPC_URL,
    chainId: storyChainId,
    spgNftContract: c.env.STORY_SPG_NFT_CONTRACT || DEFAULT_STORY_SPG_NFT_CONTRACT,
    workflows: c.env.STORY_LICENSE_ATTACHMENT_WORKFLOWS || DEFAULT_STORY_LICENSE_ATTACHMENT_WORKFLOWS,
    derivativeWorkflows: c.env.STORY_DERIVATIVE_WORKFLOWS || DEFAULT_STORY_DERIVATIVE_WORKFLOWS,
    ipAssetRegistry: c.env.STORY_IP_ASSET_REGISTRY || DEFAULT_STORY_IP_ASSET_REGISTRY,
    licenseRegistry: c.env.STORY_LICENSE_REGISTRY || DEFAULT_STORY_LICENSE_REGISTRY,
    royaltyPolicyLap: c.env.STORY_ROYALTY_POLICY_LAP || DEFAULT_STORY_ROYALTY_POLICY_LAP,
    wipToken: c.env.STORY_WIP_TOKEN || DEFAULT_STORY_WIP_TOKEN,
  }

  try {
    const registration = publishType === 'original'
      ? await registerStoryOriginal(config, {
        recipient,
        ipMetadataURI,
        ipMetadataHash: ipMetadataHashRaw,
        nftMetadataURI,
        nftMetadataHash: nftMetadataHashRaw,
        commercialRevShare: rawRevShare,
        defaultMintingFee,
        allowDuplicates,
      })
      : await registerStoryDerivative(config, {
        recipient,
        ipMetadataURI,
        ipMetadataHash: ipMetadataHashRaw,
        nftMetadataURI,
        nftMetadataHash: nftMetadataHashRaw,
        parentIpIds: parentIpIds.map((value) => getAddress(value)),
        licenseTermsIds,
        licenseTemplate: getAddress(licenseTemplateRaw),
        royaltyContext,
        maxMintingFee,
        maxRts,
        maxRevenueShare,
        allowDuplicates,
      })
    const now = Math.floor(Date.now() / 1000)
    await c.env.DB.prepare(`
      UPDATE music_publish_jobs
      SET status = 'registered',
          story_tx_hash = ?,
          story_ip_id = ?,
          story_token_id = ?,
          story_license_terms_ids_json = ?,
          story_block_number = ?,
          error_code = NULL,
          error_message = NULL,
          updated_at = ?
      WHERE job_id = ? AND user_address = ?
    `).bind(
      registration.txHash,
      registration.ipId,
      registration.tokenId,
      JSON.stringify(registration.licenseTermsIds),
      registration.blockNumber,
      now,
      jobId,
      userAddress,
    ).run()

    const updated = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
    `).bind(jobId, userAddress).first<MusicPublishJobRow>()

    if (!updated) {
      return c.json({ error: 'Failed to load registered job' }, 500)
    }

    return c.json({
      job: serializeJob(updated),
      registration,
    })
  } catch (error) {
    const now = Math.floor(Date.now() / 1000)
    const message = asErrorMessage(error).slice(0, 1024)
    await c.env.DB.prepare(`
      UPDATE music_publish_jobs
      SET status = 'anchored',
          error_code = 'story_register_failed',
          error_message = ?,
          updated_at = ?
      WHERE job_id = ? AND user_address = ?
    `).bind(message, now, jobId, userAddress).run()

    const latest = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_address = ?
    `).bind(jobId, userAddress).first<MusicPublishJobRow>()

    return c.json({
      error: 'Story registration failed',
      details: message,
      job: latest ? serializeJob(latest) : null,
    }, 502)
  }
})

export default app
