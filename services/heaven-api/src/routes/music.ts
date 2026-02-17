import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { Contract, JsonRpcProvider, Wallet, ZeroAddress, getAddress, id as keccakId } from 'ethers'
import type {
  Env,
  MusicPublishJobRow,
  MusicPublishType,
  MusicUploadBanRow,
  UserIdentityRow,
} from '../types'

type MusicVariables = {
  userPkp: string
}

const app = new Hono<{ Bindings: Env; Variables: MusicVariables }>()

const DEFAULT_AGENT_URL = 'https://load-s3-agent.load.network'
const DEFAULT_GATEWAY_URL = 'https://gateway.s3-node-1.load.network'
const DEFAULT_ARWEAVE_GATEWAY = 'https://arweave.net'
const DEFAULT_STORY_RPC_URL = 'https://aeneid.storyrpc.io'
const DEFAULT_STORY_CHAIN_ID = 1315
const DEFAULT_STORY_LICENSE_ATTACHMENT_WORKFLOWS = '0xcC2E862bCee5B6036Db0de6E06Ae87e524a79fd8'
const DEFAULT_STORY_IP_ASSET_REGISTRY = '0x77319B4031e6eF1250907aa00018B8B1c67a244b'
const DEFAULT_STORY_LICENSE_REGISTRY = '0x529a750E02d8E2f15649c13D69a465286a780e24'
const DEFAULT_STORY_ROYALTY_POLICY_LAP = '0xBe54FB168b3c982b7AaE60dB6CF75Bd8447b390E'
const DEFAULT_STORY_WIP_TOKEN = '0x1514000000000000000000000000000000000000'
const DEFAULT_STORY_SPG_NFT_CONTRACT = '0xb1764abf89e6a151ea27824612145ef89ed70a73'
const ERC721_TRANSFER_TOPIC = keccakId('Transfer(address,address,uint256)')
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB (Worker-safe ceiling for v1)
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

const STORY_LICENSE_REGISTRY_ABI = [
  'function getAttachedLicenseTermsCount(address ipId) view returns (uint256)',
  'function getAttachedLicenseTerms(address ipId, uint256 index) view returns (address, uint256)',
]

function normalizePkpAddress(address: string): string | null {
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

function asErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text }
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

interface StoryConfig {
  sponsorPk: string
  rpcUrl: string
  chainId: number
  spgNftContract: string
  workflows: string
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

function serializeJob(row: MusicPublishJobRow) {
  return {
    jobId: row.job_id,
    userPkp: row.user_pkp,
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
    registration: {
      storyTxHash: row.story_tx_hash,
      storyIpId: row.story_ip_id,
      storyTokenId: row.story_token_id,
      storyLicenseTermsIds: parseJsonStringArray(row.story_license_terms_ids_json),
      storyBlockNumber: row.story_block_number,
      megaethTxHash: row.megaeth_tx_hash,
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
  const userPkp = normalizePkpAddress(c.req.header('X-User-Pkp') || '')
  if (!userPkp) {
    return c.json({ error: 'Missing or invalid X-User-Pkp header' }, 401)
  }

  const identity = await c.env.DB.prepare(`
    SELECT * FROM user_identity WHERE user_pkp = ?
  `).bind(userPkp).first<UserIdentityRow>()

  if (!identity) {
    return c.json({ error: 'Self.xyz verification required for music upload/publish' }, 403)
  }

  const now = Math.floor(Date.now() / 1000)
  const ban = await c.env.DB.prepare(`
    SELECT * FROM music_upload_bans
    WHERE user_pkp = ? AND active = 1
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(userPkp, now).first<MusicUploadBanRow>()

  if (ban) {
    return c.json({
      error: 'Upload access blocked',
      reasonCode: ban.reason_code,
      reason: ban.reason,
    }, 403)
  }

  c.set('userPkp', userPkp)
  await next()
}

app.get('/health', (c) => c.json({ ok: true }))

app.use('/preflight', requireMusicAccess)
app.use('/publish/*', requireMusicAccess)

// Stage upload only. This endpoint intentionally does not anchor to Arweave.
app.post('/publish/start', async (c) => {
  const userPkp = c.get('userPkp')
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
    WHERE user_pkp = ? AND created_at >= ?
  `).bind(userPkp, dayStart).first<{ publish_count: number; total_bytes: number }>()

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
      WHERE user_pkp = ? AND idempotency_key = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(userPkp, idempotencyKey).first<MusicPublishJobRow>()
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
      job_id, user_pkp, status, publish_type, idempotency_key,
      file_name, content_type, file_size, audio_sha256, fingerprint, duration_s,
      staged_dataitem_id, staged_gateway_url, staged_payload_json,
      created_at, updated_at
    ) VALUES (?, ?, 'staged', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    jobId,
    userPkp,
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

interface MusicPreflightRequest {
  jobId: string
  publishType?: MusicPublishType
  fingerprint?: string
  durationS?: number
  parentIpIds?: string[]
  licenseTermsIds?: Array<string | number>
}

app.post('/preflight', async (c) => {
  const userPkp = c.get('userPkp')

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
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_pkp = ?
  `).bind(jobId, userPkp).first<MusicPublishJobRow>()
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
    WHERE job_id = ? AND user_pkp = ?
  `).bind(checkingNow, jobId, userPkp).run()

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
              if (duplicateHashRows.length > 0) {
                status = 'manual_review'
                policyDecision = 'manual_review'
                policyReasonCode = 'duplicate_hash_match'
                policyReason = 'Existing track with matching audio hash found; manual review required'
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
  } else if (parentIpIds.length !== licenseTermsIds.length) {
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
    WHERE job_id = ? AND user_pkp = ?
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
    userPkp,
  ).run()

  const updated = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_pkp = ?
  `).bind(jobId, userPkp).first<MusicPublishJobRow>()

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
  const userPkp = c.get('userPkp')
  const jobId = c.req.param('jobId')

  const row = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_pkp = ?
  `).bind(jobId, userPkp).first<MusicPublishJobRow>()

  if (!row) {
    return c.json({ error: 'Job not found' }, 404)
  }

  return c.json({ job: serializeJob(row) })
})

// Explicit anchor step: only after preflight passes.
app.post('/publish/:jobId/anchor', async (c) => {
  const userPkp = c.get('userPkp')
  const jobId = c.req.param('jobId')

  const apiKey = c.env.LOAD_S3_AGENT_API_KEY
  if (!apiKey) {
    return c.json({ error: 'Arweave anchor not configured (LOAD_S3_AGENT_API_KEY)' }, 500)
  }

  const row = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_pkp = ?
  `).bind(jobId, userPkp).first<MusicPublishJobRow>()

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
    WHERE job_id = ? AND user_pkp = ? AND status = 'policy_passed'
  `).bind(now, jobId, userPkp).run()
  const lockChanges = Number(lock.meta?.changes ?? 0)
  if (lockChanges !== 1) {
    const latest = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_pkp = ?
    `).bind(jobId, userPkp).first<MusicPublishJobRow>()
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
      WHERE job_id = ? AND user_pkp = ?
    `).bind(`LS3 post failed (status ${postResp.status})`, failNow, jobId, userPkp).run()

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
    WHERE job_id = ? AND user_pkp = ?
  `).bind(
    row.staged_dataitem_id,
    `ar://${row.staged_dataitem_id}`,
    arweaveUrl,
    arweaveAvailable ? 1 : 0,
    JSON.stringify(postPayload),
    doneNow,
    jobId,
    userPkp,
  ).run()

  const updated = await c.env.DB.prepare(`
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_pkp = ?
  `).bind(jobId, userPkp).first<MusicPublishJobRow>()

  if (!updated) {
    return c.json({ error: 'Failed to load anchored job' }, 500)
  }

  return c.json({ job: serializeJob(updated) })
})

interface StoryRegisterRequestBody {
  recipient?: string
  ipMetadataURI?: string
  ipMetadataHash?: string
  nftMetadataURI?: string
  nftMetadataHash?: string
  commercialRevShare?: number
  defaultMintingFee?: string | number
  allowDuplicates?: boolean
}

app.post('/publish/:jobId/register', async (c) => {
  const userPkp = c.get('userPkp')
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
    SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_pkp = ?
  `).bind(jobId, userPkp).first<MusicPublishJobRow>()

  if (!row) {
    return c.json({ error: 'Job not found' }, 404)
  }

  if (row.status === 'registering' || row.status === 'registered') {
    return c.json({ job: serializeJob(row) })
  }

  if (row.status !== 'anchored') {
    return c.json({ error: `Job must be anchored before register (current=${row.status})`, job: serializeJob(row) }, 409)
  }

  if (row.publish_type !== 'original') {
    return c.json({
      error: `Story register currently supports only original publishType (current=${row.publish_type ?? 'unknown'})`,
      code: 'story_derivative_not_implemented',
      job: serializeJob(row),
    }, 409)
  }

  let body: StoryRegisterRequestBody
  try {
    body = await c.req.json<StoryRegisterRequestBody>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const recipient = normalizePkpAddress(body.recipient || userPkp)
  if (!recipient) {
    return c.json({ error: 'recipient must be a valid 0x address when provided' }, 400)
  }

  const ipMetadataURI = (body.ipMetadataURI || '').trim()
  const nftMetadataURI = (body.nftMetadataURI || '').trim()
  if (!ipMetadataURI || !nftMetadataURI) {
    return c.json({ error: 'ipMetadataURI and nftMetadataURI are required' }, 400)
  }

  const ipMetadataHashRaw = (body.ipMetadataHash || '').trim().toLowerCase()
  const nftMetadataHashRaw = (body.nftMetadataHash || '').trim().toLowerCase()
  if (!isBytes32Hex(ipMetadataHashRaw) || !isBytes32Hex(nftMetadataHashRaw)) {
    return c.json({ error: 'ipMetadataHash and nftMetadataHash must be 0x-prefixed 32-byte hex values' }, 400)
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

  const storyChainIdRaw = c.env.STORY_CHAIN_ID
  const storyChainId = storyChainIdRaw ? Number(storyChainIdRaw) : DEFAULT_STORY_CHAIN_ID
  if (!Number.isInteger(storyChainId) || storyChainId <= 0) {
    return c.json({ error: `Invalid STORY_CHAIN_ID: ${storyChainIdRaw}` }, 500)
  }

  const lockNow = Math.floor(Date.now() / 1000)
  const lock = await c.env.DB.prepare(`
    UPDATE music_publish_jobs
    SET status = 'registering', updated_at = ?
    WHERE job_id = ? AND user_pkp = ? AND status = 'anchored'
  `).bind(lockNow, jobId, userPkp).run()
  const lockChanges = Number(lock.meta?.changes ?? 0)
  if (lockChanges !== 1) {
    const latest = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_pkp = ?
    `).bind(jobId, userPkp).first<MusicPublishJobRow>()
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
    ipAssetRegistry: c.env.STORY_IP_ASSET_REGISTRY || DEFAULT_STORY_IP_ASSET_REGISTRY,
    licenseRegistry: c.env.STORY_LICENSE_REGISTRY || DEFAULT_STORY_LICENSE_REGISTRY,
    royaltyPolicyLap: c.env.STORY_ROYALTY_POLICY_LAP || DEFAULT_STORY_ROYALTY_POLICY_LAP,
    wipToken: c.env.STORY_WIP_TOKEN || DEFAULT_STORY_WIP_TOKEN,
  }

  const registerPayload: StoryRegisterPayload = {
    recipient,
    ipMetadataURI,
    ipMetadataHash: ipMetadataHashRaw,
    nftMetadataURI,
    nftMetadataHash: nftMetadataHashRaw,
    commercialRevShare: rawRevShare,
    defaultMintingFee,
    allowDuplicates: body.allowDuplicates !== false,
  }

  try {
    const registration = await registerStoryOriginal(config, registerPayload)
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
      WHERE job_id = ? AND user_pkp = ?
    `).bind(
      registration.txHash,
      registration.ipId,
      registration.tokenId,
      JSON.stringify(registration.licenseTermsIds),
      registration.blockNumber,
      now,
      jobId,
      userPkp,
    ).run()

    const updated = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_pkp = ?
    `).bind(jobId, userPkp).first<MusicPublishJobRow>()

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
      WHERE job_id = ? AND user_pkp = ?
    `).bind(message, now, jobId, userPkp).run()

    const latest = await c.env.DB.prepare(`
      SELECT * FROM music_publish_jobs WHERE job_id = ? AND user_pkp = ?
    `).bind(jobId, userPkp).first<MusicPublishJobRow>()

    return c.json({
      error: 'Story registration failed',
      details: message,
      job: latest ? serializeJob(latest) : null,
    }, 502)
  }
})

export default app
