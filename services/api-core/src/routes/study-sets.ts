import { Hono } from 'hono'
import { Contract, JsonRpcProvider, Wallet, getAddress } from 'ethers'
import type { Env } from '../types'
import {
  StudySetValidationError,
  generateStudySetWithOpenRouter,
  type GeniusReferentInput,
} from '../lib/study-set-generator'
import {
  arweaveGatewayBaseFromEnv,
  createLoadBlobStore,
  loadGatewayBaseFromEnv,
} from '../lib/blob-store'

const app = new Hono<{ Bindings: Env }>()

const MAX_LYRICS_BYTES = 256 * 1024
const MAX_REFERENTS = 48
const MAX_STUDY_SET_BYTES = 768 * 1024
const GENERATION_LOCK_TTL_SECONDS = 120
const DEFAULT_TEMPO_CHAIN_ID = 42431
const DEFAULT_TEMPO_RPC_URL = 'https://rpc.moderato.tempo.xyz'
const DEFAULT_TEMPO_SCROBBLE_V4 = '0xe00e82086480E61AaC8d5ad8B05B56A582dD0000'
const DEFAULT_GENIUS_API_URL = 'https://api.genius.com'
const DEFAULT_GENIUS_PUBLIC_API_URL = 'https://genius.com/api'

const CANONICAL_LYRICS_REGISTRY_ABI = [
  'function getLyrics(bytes32 trackId) view returns (string lyricsRef, bytes32 lyricsHash, uint32 version, address submitter, uint64 timestamp)',
]

const STUDY_SET_REGISTRY_ABI = [
  'function getStudySet(bytes32 trackId, string lang, uint8 version) view returns (string studySetRef, bytes32 studySetHash, address submitter, uint64 createdAt, bool exists)',
  'function credits(address user) view returns (uint256)',
  'function CREDITS_PER_FULFILL() view returns (uint256)',
  'function fulfillFromCredit(address user, bytes32 trackId, string lang, uint8 version, string studySetRef, bytes32 studySetHash) returns (bytes32 studySetKey)',
]

const SCROBBLE_V4_ABI = [
  'function isRegistered(bytes32 trackId) view returns (bool)',
  'function getTrack(bytes32 trackId) view returns (string title, string artist, string album, uint8 kind, bytes32 payload, uint64 registeredAt, string coverCid, uint32 durationSec)',
]

type DebugGenerateBody = {
  trackId?: unknown
  title?: unknown
  artist?: unknown
  language?: unknown
  lyrics?: unknown
  lyricsRef?: unknown
  geniusSongId?: unknown
  geniusReferents?: unknown
  model?: unknown
  translationCount?: unknown
  triviaCount?: unknown
  sayItBackCount?: unknown
}

type GenerateBody = {
  trackId?: unknown
  language?: unknown
  version?: unknown
  model?: unknown
  translationCount?: unknown
  triviaCount?: unknown
  sayItBackCount?: unknown
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asOptionalInt(value: unknown): number | undefined {
  if (value == null) return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.floor(n)
  }
  return undefined
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isBytes32Hex(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value)
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

function normalizeWalletAddress(address: string): string | null {
  const clean = address.trim()
  if (!isAddress(clean)) return null
  try {
    return getAddress(clean)
  } catch {
    return null
  }
}

function parseVersion(raw: unknown): number {
  if (raw == null) return 1
  const parsed = asOptionalInt(raw)
  if (parsed == null || parsed < 1 || parsed > 255) {
    throw new Error('version must be an integer in [1, 255]')
  }
  return parsed
}

function computeGenerationLockKey(trackId: string, language: string, version: number): string {
  return `${trackId.toLowerCase()}:${language.toLowerCase()}:${version}`
}

async function acquireGenerationLock(params: {
  env: Env
  lockKey: string
  ownerWallet: string
}): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  await params.env.DB.prepare(`
    DELETE FROM study_set_generation_locks
    WHERE expires_at <= ?
  `).bind(now).run()

  const inserted = await params.env.DB.prepare(`
    INSERT OR IGNORE INTO study_set_generation_locks (
      lock_key,
      owner_wallet,
      created_at,
      expires_at
    ) VALUES (?, ?, ?, ?)
  `).bind(
    params.lockKey,
    params.ownerWallet,
    now,
    now + GENERATION_LOCK_TTL_SECONDS,
  ).run()

  return Number(inserted.meta?.changes ?? 0) === 1
}

async function releaseGenerationLock(params: {
  env: Env
  lockKey: string
  ownerWallet: string
}): Promise<void> {
  await params.env.DB.prepare(`
    DELETE FROM study_set_generation_locks
    WHERE lock_key = ? AND owner_wallet = ?
  `).bind(params.lockKey, params.ownerWallet).run()
}

function dataitemIdFromArRef(ref: string): string | null {
  const trimmed = ref.trim()
  if (!trimmed.startsWith('ar://')) return null
  const id = trimmed.slice('ar://'.length).trim()
  return id || null
}

function dataitemIdFromLs3Ref(ref: string): string | null {
  const trimmed = ref.trim()
  if (!trimmed.startsWith('ls3://')) return null
  const id = trimmed.slice('ls3://'.length).trim()
  return id || null
}

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
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

function normalizeLooseMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

type GeniusSearchResponse = {
  response?: {
    hits?: Array<{
      result?: {
        id?: unknown
        title?: unknown
        primary_artist?: { name?: unknown }
      }
    }>
    sections?: Array<{
      type?: unknown
      hits?: Array<{
        result?: {
          id?: unknown
          title?: unknown
          primary_artist?: { name?: unknown }
        }
      }>
    }>
  }
}

type GeniusReferentsResponse = {
  response?: {
    referents?: Array<{
      fragment?: unknown
      classification?: unknown
      annotations?: Array<{
        body?: { plain?: unknown }
        votes_total?: unknown
        url?: unknown
      }>
    }>
  }
}

function extractGeniusSearchHits(payload: GeniusSearchResponse): Array<{
  result?: {
    id?: unknown
    title?: unknown
    primary_artist?: { name?: unknown }
  }
}> {
  const directHits = payload?.response?.hits
  if (Array.isArray(directHits) && directHits.length > 0) return directHits

  const sections = payload?.response?.sections
  if (!Array.isArray(sections)) return []
  for (const section of sections) {
    if (section?.type !== 'song') continue
    if (Array.isArray(section.hits) && section.hits.length > 0) return section.hits
  }
  return []
}

async function resolveGeniusSongId(apiKey: string, title: string, artist: string): Promise<number | null> {
  const query = encodeURIComponent(`${artist} ${title}`)
  const privateRes = await fetch(`${DEFAULT_GENIUS_API_URL}/search?q=${query}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  let payload: GeniusSearchResponse | null = null
  if (privateRes.ok) {
    payload = await parseJsonResponse(privateRes) as GeniusSearchResponse
  } else {
    const publicRes = await fetch(`${DEFAULT_GENIUS_PUBLIC_API_URL}/search/song?q=${query}`)
    if (!publicRes.ok) {
      throw new Error(`genius_search_failed:${privateRes.status}:${publicRes.status}`)
    }
    payload = await parseJsonResponse(publicRes) as GeniusSearchResponse
  }

  const hits = extractGeniusSearchHits(payload)

  const normalizedTitle = normalizeLooseMatch(title)
  const normalizedArtist = normalizeLooseMatch(artist)
  let fallback: number | null = null

  for (const hit of hits.slice(0, 8)) {
    const id = Number(hit?.result?.id)
    if (!Number.isInteger(id) || id <= 0) continue
    if (fallback === null) fallback = id

    const hitTitle = normalizeLooseMatch(String(hit?.result?.title ?? ''))
    const hitArtist = normalizeLooseMatch(String(hit?.result?.primary_artist?.name ?? ''))
    const titleMatch = hitTitle.includes(normalizedTitle) || normalizedTitle.includes(hitTitle)
    const artistMatch = hitArtist.includes(normalizedArtist) || normalizedArtist.includes(hitArtist)
    if (titleMatch && artistMatch) return id
  }

  return fallback
}

async function fetchGeniusReferents(apiKey: string, geniusSongId: number): Promise<GeniusReferentInput[]> {
  const privateRes = await fetch(`${DEFAULT_GENIUS_API_URL}/referents?song_id=${geniusSongId}&per_page=50&text_format=plain`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  let payload: GeniusReferentsResponse = {}

  if (privateRes.ok) {
    payload = await parseJsonResponse(privateRes) as GeniusReferentsResponse
  } else {
    const publicRes = await fetch(`${DEFAULT_GENIUS_PUBLIC_API_URL}/referents?song_id=${geniusSongId}&per_page=50&text_format=plain`)
    if (!publicRes.ok) {
      throw new Error(`genius_referents_failed:${privateRes.status}:${publicRes.status}`)
    }
    payload = await parseJsonResponse(publicRes) as GeniusReferentsResponse
  }

  const referents: GeniusReferentInput[] = []
  for (const row of payload?.response?.referents ?? []) {
    const fragment = asString(row?.fragment)
    const annotationRow = (row?.annotations ?? []).find((ann: { body?: { plain?: unknown } }) => asString(ann?.body?.plain))
    const annotation = asString(annotationRow?.body?.plain)
    if (!fragment || !annotation) continue

    const classification = asString(row?.classification)?.toLowerCase() ?? undefined
    const votesTotalRaw = annotationRow?.votes_total
    const votesTotal = typeof votesTotalRaw === 'number' && Number.isFinite(votesTotalRaw)
      ? Math.floor(votesTotalRaw)
      : undefined

    referents.push({
      fragment,
      annotation,
      classification,
      votesTotal,
      url: asString(annotationRow?.url) ?? undefined,
    })
    if (referents.length >= MAX_REFERENTS) break
  }

  return referents
}

async function stageStudySetPack(params: {
  env: Env
  trackId: string
  language: string
  promptHash: string
  pack: unknown
}): Promise<{
  dataitemId: string
  ls3Ref: string
  ls3GatewayUrl: string
  arweaveRef: string
  arweaveUrl: string
  arweaveAvailable: boolean
  payloadHash: string
  uploadPayload: unknown
  postPayload: unknown
}> {
  if (!params.env.LOAD_S3_AGENT_API_KEY?.trim()) {
    throw new Error('load_stage_not_configured')
  }

  const packJson = JSON.stringify(params.pack)
  const packBytes = new TextEncoder().encode(packJson)
  if (packBytes.byteLength > MAX_STUDY_SET_BYTES) {
    throw new Error(`study_set_pack_too_large:${packBytes.byteLength}`)
  }

  const payloadHash = `0x${await sha256HexBytes(packBytes)}`
  const tags = JSON.stringify([
    { key: 'App-Name', value: 'Heaven' },
    { key: 'Upload-Source', value: 'study-set-generate' },
    { key: 'Study-Track-Id', value: params.trackId },
    { key: 'Study-Language', value: params.language },
    { key: 'Study-Prompt-Hash', value: params.promptHash },
    { key: 'Content-Type', value: 'application/json' },
  ])
  const blobStore = createLoadBlobStore(params.env)
  const staged = await blobStore.put({
    file: new File([packBytes], `study-set-${params.language}.json`, { type: 'application/json' }),
    contentType: 'application/json',
    tags,
  })
  const anchored = await blobStore.anchor(staged.id)

  return {
    dataitemId: staged.id,
    ls3Ref: `ls3://${staged.id}`,
    ls3GatewayUrl: staged.gatewayUrl,
    arweaveRef: anchored.ref,
    arweaveUrl: anchored.arweaveUrl,
    arweaveAvailable: anchored.arweaveAvailable,
    payloadHash,
    uploadPayload: staged.payload,
    postPayload: anchored.payload,
  }
}

async function fetchRefBytes(ref: string, env: Env): Promise<{ bytes: Uint8Array; fetchedFrom: string }> {
  const gatewayUrl = loadGatewayBaseFromEnv(env)
  const arweaveGateway = arweaveGatewayBaseFromEnv()
  const arId = dataitemIdFromArRef(ref)
  const ls3Id = dataitemIdFromLs3Ref(ref)

  const candidates: string[] = []
  if (arId) {
    candidates.push(`${arweaveGateway}/${arId}`)
    candidates.push(`${gatewayUrl}/resolve/${arId}`)
  } else if (ls3Id) {
    candidates.push(`${gatewayUrl}/resolve/${ls3Id}`)
  } else {
    throw new Error(`Unsupported ref scheme: ${ref}`)
  }

  let lastStatus: number | null = null
  for (const url of candidates) {
    const response = await fetch(url)
    if (!response.ok) {
      lastStatus = response.status
      continue
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength === 0) {
      throw new Error(`Resolved ref payload is empty at ${url}`)
    }

    return { bytes, fetchedFrom: url }
  }

  throw new Error(`Failed to fetch ref ${ref} (status: ${lastStatus ?? 'unknown'})`)
}

async function fetchCanonicalLyrics(lyricsRef: string, env: Env): Promise<{ lyrics: string; sha256: string; fetchedFrom: string }> {
  const { bytes, fetchedFrom } = await fetchRefBytes(lyricsRef, env)
  // Canonical hash: SHA-256 over exact raw UTF-8 bytes as fetched from storage (no normalization).
  const lyrics = new TextDecoder().decode(bytes)
  const sha256 = `0x${await sha256HexBytes(bytes)}`
  return { lyrics, sha256, fetchedFrom }
}

async function fetchStudySetPack(
  studySetRef: string,
  expectedHash: string,
  env: Env,
): Promise<{ pack: unknown; fetchedFrom: string; actualHash: string; bytes: number }> {
  const { bytes, fetchedFrom } = await fetchRefBytes(studySetRef, env)
  const actualHash = `0x${await sha256HexBytes(bytes)}`
  if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error(`study_set_hash_mismatch:${expectedHash}:${actualHash}`)
  }

  const text = new TextDecoder().decode(bytes)
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    throw new Error('study_set_json_parse_failed')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('study_set_json_invalid')
  }

  return {
    pack: parsed,
    fetchedFrom,
    actualHash,
    bytes: bytes.byteLength,
  }
}

function parseGeniusReferents(value: unknown): GeniusReferentInput[] {
  if (!Array.isArray(value)) return []

  const referents: GeniusReferentInput[] = []
  for (const row of value.slice(0, MAX_REFERENTS)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const record = row as Record<string, unknown>

    const fragment = asString(record.fragment)
    const annotation = asString(record.annotation)
    if (!fragment || !annotation) continue

    const classificationRaw = asString(record.classification)
    const votesTotalRaw = record.votesTotal
    const votesTotal = typeof votesTotalRaw === 'number' && Number.isFinite(votesTotalRaw)
      ? Math.floor(votesTotalRaw)
      : undefined

    referents.push({
      fragment,
      annotation,
      classification: classificationRaw ?? undefined,
      votesTotal,
      url: asString(record.url) ?? undefined,
    })
  }

  return referents
}

async function resolveExistingStudySet(params: {
  env: Env
  registry: Contract
  trackId: string
  language: string
  version: number
}): Promise<{
  exists: boolean
  studySetRef: string
  studySetHash: string
  submitter: string
  createdAt: number
  pack?: unknown
  fetchedFrom?: string
  bytes?: number
}> {
  const result = await params.registry.getStudySet(params.trackId, params.language, params.version) as [string, string, string, bigint, boolean]
  const studySetRef = (result[0] || '').trim()
  const studySetHash = String(result[1] || '').toLowerCase()
  const submitter = String(result[2] || '')
  const createdAt = Number(result[3] || 0n)
  const exists = Boolean(result[4])

  if (!exists || !studySetRef) {
    return { exists: false, studySetRef, studySetHash, submitter, createdAt }
  }

  const resolved = await fetchStudySetPack(studySetRef, studySetHash, params.env)
  return {
    exists: true,
    studySetRef,
    studySetHash,
    submitter,
    createdAt,
    pack: resolved.pack,
    fetchedFrom: resolved.fetchedFrom,
    bytes: resolved.bytes,
  }
}

app.get('/:trackId', async (c) => {
  const trackId = asString(c.req.param('trackId'))
  if (!trackId || !isBytes32Hex(trackId)) {
    return c.json({
      success: false,
      error: 'trackId must be a 32-byte hex string (0x + 64 hex)',
    }, 400)
  }

  const language = asString(c.req.query('language')) ?? asString(c.req.query('lang'))
  if (!language) {
    return c.json({ success: false, error: 'language (or lang) query param is required' }, 400)
  }

  let version: number
  try {
    version = parseVersion(c.req.query('version') ?? c.req.query('v'))
  } catch (err) {
    return c.json({ success: false, error: asErrorMessage(err) }, 400)
  }

  const registryAddress = c.env.TEMPO_STUDY_SET_REGISTRY?.trim()
  if (!registryAddress) {
    return c.json({
      success: false,
      error: 'Server misconfiguration (TEMPO_STUDY_SET_REGISTRY missing)',
    }, 500)
  }
  if (!isAddress(registryAddress)) {
    return c.json({
      success: false,
      error: 'Server misconfiguration (TEMPO_STUDY_SET_REGISTRY invalid address)',
    }, 500)
  }

  const chainIdRaw = c.env.TEMPO_CHAIN_ID
  const chainId = chainIdRaw ? Number(chainIdRaw) : DEFAULT_TEMPO_CHAIN_ID
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return c.json({ success: false, error: `Invalid TEMPO_CHAIN_ID: ${chainIdRaw}` }, 500)
  }

  try {
    const provider = new JsonRpcProvider(c.env.TEMPO_RPC_URL || DEFAULT_TEMPO_RPC_URL, chainId)
    const registry = new Contract(getAddress(registryAddress), STUDY_SET_REGISTRY_ABI, provider)
    const existing = await resolveExistingStudySet({
      env: c.env,
      registry,
      trackId,
      language,
      version,
    })

    if (!existing.exists || !existing.pack) {
      return c.json({
        success: false,
        code: 'not_found',
        error: 'No study set found for trackId/language/version',
      }, 404)
    }

    return c.json({
      success: true,
      cached: true,
      registry: {
        contract: getAddress(registryAddress),
        trackId,
        language,
        version,
        studySetRef: existing.studySetRef,
        studySetHash: existing.studySetHash,
        submitter: existing.submitter,
        createdAt: existing.createdAt,
      },
      storage: {
        fetchedFrom: existing.fetchedFrom,
        bytes: existing.bytes,
      },
      pack: existing.pack,
    })
  } catch (err) {
    const message = asErrorMessage(err)
    if (message.startsWith('study_set_hash_mismatch:')) {
      const [, expectedHash, actualHash] = message.split(':')
      return c.json({
        success: false,
        code: 'hash_mismatch',
        error: 'On-chain studySetHash does not match fetched payload',
        expectedHash,
        actualHash,
      }, 502)
    }
    return c.json({ success: false, error: `Failed to resolve study set: ${message}` }, 502)
  }
})

app.post('/generate', async (c) => {
  const apiKey = c.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    return c.json({ success: false, error: 'Server misconfiguration (OPENROUTER_API_KEY missing)' }, 500)
  }

  const canonicalRegistryAddress = c.env.TEMPO_CANONICAL_LYRICS_REGISTRY?.trim()
  if (!canonicalRegistryAddress) {
    return c.json({
      success: false,
      error: 'Server misconfiguration (TEMPO_CANONICAL_LYRICS_REGISTRY missing)',
    }, 500)
  }
  if (!isAddress(canonicalRegistryAddress)) {
    return c.json({
      success: false,
      error: 'Server misconfiguration (TEMPO_CANONICAL_LYRICS_REGISTRY invalid address)',
    }, 500)
  }

  const studySetRegistryAddress = c.env.TEMPO_STUDY_SET_REGISTRY?.trim()
  if (!studySetRegistryAddress) {
    return c.json({
      success: false,
      error: 'Server misconfiguration (TEMPO_STUDY_SET_REGISTRY missing)',
    }, 500)
  }
  if (!isAddress(studySetRegistryAddress)) {
    return c.json({
      success: false,
      error: 'Server misconfiguration (TEMPO_STUDY_SET_REGISTRY invalid address)',
    }, 500)
  }

  const scrobbleAddress = (c.env.TEMPO_SCROBBLE_V4 || DEFAULT_TEMPO_SCROBBLE_V4).trim()
  if (!isAddress(scrobbleAddress)) {
    return c.json({
      success: false,
      error: 'Server misconfiguration (TEMPO_SCROBBLE_V4 invalid address)',
    }, 500)
  }
  if (!c.env.LOAD_S3_AGENT_API_KEY?.trim()) {
    return c.json({
      success: false,
      error: 'Server misconfiguration (LOAD_S3_AGENT_API_KEY missing)',
    }, 500)
  }

  const operatorPk = (c.env.TEMPO_OPERATOR_PRIVATE_KEY || c.env.TEMPO_SPONSOR_PRIVATE_KEY || c.env.PRIVATE_KEY || '').trim()
  if (!/^0x[a-fA-F0-9]{64}$/.test(operatorPk)) {
    return c.json({
      success: false,
      error: 'Server misconfiguration (TEMPO_OPERATOR_PRIVATE_KEY missing/invalid)',
    }, 500)
  }

  const chainIdRaw = c.env.TEMPO_CHAIN_ID
  const chainId = chainIdRaw ? Number(chainIdRaw) : DEFAULT_TEMPO_CHAIN_ID
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return c.json({ success: false, error: `Invalid TEMPO_CHAIN_ID: ${chainIdRaw}` }, 500)
  }

  const userAddress = normalizeWalletAddress(c.req.header('X-User-Address') || '')
  if (!userAddress) {
    return c.json({ success: false, error: 'Missing or invalid X-User-Address header' }, 401)
  }

  let body: GenerateBody
  try {
    body = await c.req.json() as GenerateBody
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const trackId = asString(body.trackId)
  const language = asString(body.language)
  if (!trackId) {
    return c.json({ success: false, error: 'trackId is required' }, 400)
  }
  if (!isBytes32Hex(trackId)) {
    return c.json({ success: false, error: 'trackId must be a 32-byte hex string (0x + 64 hex)' }, 400)
  }
  if (!language) {
    return c.json({ success: false, error: 'language is required' }, 400)
  }
  let version: number
  try {
    version = parseVersion(body.version)
  } catch (err) {
    return c.json({ success: false, error: asErrorMessage(err) }, 400)
  }

  const raw = body as Record<string, unknown>
  const forbiddenFields = ['lyrics', 'title', 'artist', 'geniusSongId', 'geniusReferents']
    .filter((key) => raw[key] !== undefined && raw[key] !== null)
  if (forbiddenFields.length > 0) {
    return c.json({
      success: false,
      error: `Unsupported fields on /generate: ${forbiddenFields.join(', ')}`,
    }, 400)
  }

  const rpcUrl = c.env.TEMPO_RPC_URL || DEFAULT_TEMPO_RPC_URL
  const provider = new JsonRpcProvider(rpcUrl, chainId)
  const canonicalRegistry = new Contract(getAddress(canonicalRegistryAddress), CANONICAL_LYRICS_REGISTRY_ABI, provider)
  const scrobble = new Contract(getAddress(scrobbleAddress), SCROBBLE_V4_ABI, provider)
  const studySetRegistryRead = new Contract(getAddress(studySetRegistryAddress), STUDY_SET_REGISTRY_ABI, provider)

  try {
    const existing = await resolveExistingStudySet({
      env: c.env,
      registry: studySetRegistryRead,
      trackId,
      language,
      version,
    })
    if (existing.exists && existing.pack) {
      return c.json({
        success: true,
        cached: true,
        model: null,
        promptHash: null,
        warnings: [],
        registry: {
          contract: getAddress(studySetRegistryAddress),
          trackId,
          language,
          version,
          studySetRef: existing.studySetRef,
          studySetHash: existing.studySetHash,
          submitter: existing.submitter,
          createdAt: existing.createdAt,
        },
        storage: {
          fetchedFrom: existing.fetchedFrom,
          bytes: existing.bytes,
        },
        pack: existing.pack,
      })
    }
  } catch (err) {
    const message = asErrorMessage(err)
    if (message.startsWith('study_set_hash_mismatch:')) {
      const [, expectedHash, actualHash] = message.split(':')
      return c.json({
        success: false,
        code: 'hash_mismatch',
        error: 'On-chain studySetHash does not match fetched payload',
        expectedHash,
        actualHash,
      }, 502)
    }
    return c.json({ success: false, error: `Failed to resolve existing study set: ${message}` }, 502)
  }

  const generationLockKey = computeGenerationLockKey(trackId, language, version)
  const lockAcquired = await acquireGenerationLock({
    env: c.env,
    lockKey: generationLockKey,
    ownerWallet: userAddress,
  })
  if (!lockAcquired) {
    return c.json({
      success: false,
      code: 'generation_in_flight',
      error: 'A generation request for this track/language/version is already in flight',
      lockKey: generationLockKey,
      retryAfterSeconds: GENERATION_LOCK_TTL_SECONDS,
    }, 409)
  }

  try {
    let availableCredits = 0n
    let requiredCredits = 1n
    try {
      availableCredits = await studySetRegistryRead.credits(userAddress) as bigint
      requiredCredits = await studySetRegistryRead.CREDITS_PER_FULFILL() as bigint
    } catch (err) {
      return c.json({
        success: false,
        error: `Failed to read onchain credits: ${asErrorMessage(err)}`,
      }, 502)
    }

    if (availableCredits < requiredCredits) {
      return c.json({
        success: false,
        code: 'insufficient_credits',
        error: 'Insufficient onchain study-set credits',
        user: userAddress,
        contract: getAddress(studySetRegistryAddress),
        requiredCredits: requiredCredits.toString(),
        availableCredits: availableCredits.toString(),
      }, 402)
    }

    let lyricsRef = ''
    let expectedHash = ''
    let lyricsVersion = 0
    let lyricsSubmitter = ''
    let lyricsTimestamp = 0
    try {
      const result = await canonicalRegistry.getLyrics(trackId) as [string, string, bigint, string, bigint]
      lyricsRef = (result[0] || '').trim()
      expectedHash = (result[1] || '').toLowerCase()
      lyricsVersion = Number(result[2] || 0n)
      lyricsSubmitter = String(result[3] || '')
      lyricsTimestamp = Number(result[4] || 0n)
    } catch (err) {
      const message = asErrorMessage(err)
      return c.json({ success: false, error: `Failed to resolve canonical lyrics: ${message}` }, 502)
    }

    if (!lyricsVersion || !lyricsRef) {
      return c.json({
        success: false,
        code: 'needs_approval',
        error: 'No canonical lyrics found for trackId',
      }, 404)
    }

    let trackTitle = ''
    let trackArtist = ''
    let trackAlbum = ''
    try {
      const registered = Boolean(await scrobble.isRegistered(trackId))
      if (!registered) {
        return c.json({
          success: false,
          code: 'track_not_found',
          error: 'Track is not registered in ScrobbleV4',
        }, 404)
      }

      const trackState = await scrobble.getTrack(trackId) as [string, string, string, bigint, string, bigint, string, bigint]
      trackTitle = (trackState[0] || '').trim()
      trackArtist = (trackState[1] || '').trim()
      trackAlbum = (trackState[2] || '').trim()
    } catch (err) {
      const message = asErrorMessage(err)
      return c.json({ success: false, error: `Failed to resolve canonical track metadata: ${message}` }, 502)
    }
    if (!trackTitle || !trackArtist) {
      return c.json({
        success: false,
        code: 'track_metadata_missing',
        error: 'Canonical track metadata missing title/artist',
      }, 422)
    }

    let lyricsText: string
    let actualHash: string
    let fetchedFrom: string
    try {
      const resolved = await fetchCanonicalLyrics(lyricsRef, c.env)
      lyricsText = resolved.lyrics
      actualHash = resolved.sha256.toLowerCase()
      fetchedFrom = resolved.fetchedFrom
    } catch (err) {
      const message = asErrorMessage(err)
      return c.json({ success: false, error: `Failed to fetch canonical lyrics: ${message}` }, 502)
    }

    if (expectedHash !== actualHash) {
      return c.json({
        success: false,
        code: 'hash_mismatch',
        error: 'Canonical lyrics hash mismatch',
        expectedHash,
        actualHash,
        lyricsRef,
        fetchedFrom,
      }, 502)
    }

    const lyricsBytes = new TextEncoder().encode(lyricsText).byteLength
    if (lyricsBytes > MAX_LYRICS_BYTES) {
      return c.json({ success: false, error: `lyrics too large: ${lyricsBytes} > ${MAX_LYRICS_BYTES}` }, 400)
    }

    const routeWarnings: string[] = []
    let resolvedGeniusSongId: number | null = null
    let geniusReferents: GeniusReferentInput[] = []
    const geniusApiKey = c.env.GENIUS_API_KEY?.trim()
    if (geniusApiKey) {
      try {
        resolvedGeniusSongId = await resolveGeniusSongId(geniusApiKey, trackTitle, trackArtist)
        if (resolvedGeniusSongId) {
          geniusReferents = await fetchGeniusReferents(geniusApiKey, resolvedGeniusSongId)
        } else {
          routeWarnings.push('No Genius song match found for canonical title/artist; trivia may be empty.')
        }
      } catch (err) {
        const message = asErrorMessage(err)
        routeWarnings.push(`Genius resolution failed: ${message}`)
      }
    } else {
      routeWarnings.push('GENIUS_API_KEY not configured; trivia generation from Genius referents is disabled.')
    }

    try {
      const result = await generateStudySetWithOpenRouter(apiKey, {
        trackId,
        title: trackTitle,
        artist: trackArtist,
        language,
        lyrics: lyricsText,
        lyricsRef,
        geniusSongId: resolvedGeniusSongId ? String(resolvedGeniusSongId) : undefined,
        geniusReferents,
        model: asString(body.model) ?? c.env.OPENROUTER_STUDY_MODEL ?? undefined,
        translationCount: asOptionalInt(body.translationCount),
        triviaCount: asOptionalInt(body.triviaCount),
        sayItBackCount: asOptionalInt(body.sayItBackCount),
      })

      let stagedPack: Awaited<ReturnType<typeof stageStudySetPack>>
      try {
        stagedPack = await stageStudySetPack({
          env: c.env,
          trackId,
          language,
          promptHash: result.promptHash,
          pack: result.pack,
        })
      } catch (err) {
        const message = asErrorMessage(err)
        return c.json({
          success: false,
          code: 'staging_failed',
          error: `Failed to stage generated study set: ${message}`,
        }, 502)
      }

      const operatorWallet = new Wallet(operatorPk, provider)
      const studySetRegistryWrite = new Contract(getAddress(studySetRegistryAddress), STUDY_SET_REGISTRY_ABI, operatorWallet)
      let registryTxHash: string | null = null
      let registryBlockNumber: string | null = null
      try {
        const tx = await studySetRegistryWrite.fulfillFromCredit(
          userAddress,
          trackId,
          language,
          version,
          stagedPack.arweaveRef,
          stagedPack.payloadHash,
        )
        registryTxHash = tx.hash
        const receipt = await tx.wait()
        registryBlockNumber = receipt?.blockNumber != null ? receipt.blockNumber.toString() : null
      } catch (err) {
        const message = asErrorMessage(err)
        const lower = message.toLowerCase()

        if (lower.includes('insufficient credits')) {
          return c.json({
            success: false,
            code: 'insufficient_credits',
            error: 'Insufficient onchain study-set credits',
            user: userAddress,
            contract: getAddress(studySetRegistryAddress),
          }, 402)
        }

        if (lower.includes('study set already set')) {
          try {
            const existing = await resolveExistingStudySet({
              env: c.env,
              registry: studySetRegistryRead,
              trackId,
              language,
              version,
            })
            if (existing.exists && existing.pack) {
              return c.json({
                success: true,
                cached: true,
                raceResolved: true,
                model: result.model,
                promptHash: result.promptHash,
                warnings: [...result.warnings, ...routeWarnings, 'Concurrent generate won by another transaction; returned canonical cached pack.'],
                registry: {
                  contract: getAddress(studySetRegistryAddress),
                  trackId,
                  language,
                  version,
                  studySetRef: existing.studySetRef,
                  studySetHash: existing.studySetHash,
                  submitter: existing.submitter,
                  createdAt: existing.createdAt,
                },
                storage: {
                  fetchedFrom: existing.fetchedFrom,
                  bytes: existing.bytes,
                },
                pack: existing.pack,
              })
            }
          } catch (resolveErr) {
            return c.json({
              success: false,
              code: 'race_resolution_failed',
              error: `Race detected but failed to resolve canonical study set: ${asErrorMessage(resolveErr)}`,
            }, 502)
          }
        }

        return c.json({
          success: false,
          code: 'registry_write_failed',
          error: `Failed to register study set onchain: ${message}`,
        }, 502)
      }

      return c.json({
        success: true,
        cached: false,
        model: result.model,
        promptHash: result.promptHash,
        warnings: [...result.warnings, ...routeWarnings],
        canonicalLyrics: {
          lyricsRef,
          lyricsHash: expectedHash,
          version: lyricsVersion,
          submitter: lyricsSubmitter,
          timestamp: lyricsTimestamp,
          fetchedFrom,
        },
        canonicalTrack: {
          title: trackTitle,
          artist: trackArtist,
          album: trackAlbum || null,
          scrobbleAddress,
        },
        genius: {
          songId: resolvedGeniusSongId,
          referentCount: geniusReferents.length,
        },
        storage: {
          dataitemId: stagedPack.dataitemId,
          ls3Ref: stagedPack.ls3Ref,
          ls3GatewayUrl: stagedPack.ls3GatewayUrl,
          arweaveRef: stagedPack.arweaveRef,
          arweaveUrl: stagedPack.arweaveUrl,
          arweaveAvailable: stagedPack.arweaveAvailable,
          payloadHash: stagedPack.payloadHash,
        },
        registry: {
          contract: getAddress(studySetRegistryAddress),
          user: userAddress,
          trackId,
          language,
          version,
          studySetRef: stagedPack.arweaveRef,
          studySetHash: stagedPack.payloadHash,
          txHash: registryTxHash,
          blockNumber: registryBlockNumber,
        },
        counts: {
          total: result.pack.questions.length,
          sayItBack: result.pack.questions.filter((q) => q.type === 'say_it_back').length,
          translationMcq: result.pack.questions.filter((q) => q.type === 'translation_mcq').length,
          triviaMcq: result.pack.questions.filter((q) => q.type === 'trivia_mcq').length,
        },
        pack: result.pack,
      })
    } catch (err) {
      if (err instanceof StudySetValidationError) {
        return c.json({
          success: false,
          error: err.message,
          validationIssues: err.issues,
          rawModelOutput: err.rawOutput ?? null,
        }, 422)
      }

      const message = asErrorMessage(err)
      return c.json({ success: false, error: message }, 500)
    }
  } finally {
    try {
      await releaseGenerationLock({
        env: c.env,
        lockKey: generationLockKey,
        ownerWallet: userAddress,
      })
    } catch (releaseErr) {
      console.warn('[StudySets] Failed to release generation lock', asErrorMessage(releaseErr))
    }
  }
})

app.post('/debug-generate', async (c) => {
  const apiKey = c.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    return c.json({ success: false, error: 'Server misconfiguration (OPENROUTER_API_KEY missing)' }, 500)
  }

  let body: DebugGenerateBody
  try {
    body = await c.req.json() as DebugGenerateBody
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const trackId = asString(body.trackId) ?? `debug:${Date.now()}`
  const title = asString(body.title) ?? 'Unknown Title'
  const artist = asString(body.artist) ?? 'Unknown Artist'
  const language = asString(body.language)
  const lyrics = asString(body.lyrics)

  if (!language) {
    return c.json({ success: false, error: 'language is required' }, 400)
  }

  if (!lyrics) {
    return c.json({ success: false, error: 'lyrics is required' }, 400)
  }

  const lyricsBytes = new TextEncoder().encode(lyrics).byteLength
  if (lyricsBytes > MAX_LYRICS_BYTES) {
    return c.json({ success: false, error: `lyrics too large: ${lyricsBytes} > ${MAX_LYRICS_BYTES}` }, 400)
  }

  const geniusReferents = parseGeniusReferents(body.geniusReferents)

  try {
    const result = await generateStudySetWithOpenRouter(apiKey, {
      trackId,
      title,
      artist,
      language,
      lyrics,
      lyricsRef: asString(body.lyricsRef),
      geniusSongId: asString(body.geniusSongId),
      geniusReferents,
      model: asString(body.model) ?? c.env.OPENROUTER_STUDY_MODEL ?? undefined,
      translationCount: asOptionalInt(body.translationCount),
      triviaCount: asOptionalInt(body.triviaCount),
      sayItBackCount: asOptionalInt(body.sayItBackCount),
    })

    return c.json({
      success: true,
      model: result.model,
      promptHash: result.promptHash,
      warnings: result.warnings,
      counts: {
        total: result.pack.questions.length,
        sayItBack: result.pack.questions.filter((q) => q.type === 'say_it_back').length,
        translationMcq: result.pack.questions.filter((q) => q.type === 'translation_mcq').length,
        triviaMcq: result.pack.questions.filter((q) => q.type === 'trivia_mcq').length,
      },
      pack: result.pack,
    })
  } catch (err) {
    if (err instanceof StudySetValidationError) {
      return c.json({
        success: false,
        error: err.message,
        validationIssues: err.issues,
        rawModelOutput: err.rawOutput ?? null,
      }, 422)
    }

    const message = err instanceof Error ? err.message : String(err)
    return c.json({ success: false, error: message }, 500)
  }
})

export default app
