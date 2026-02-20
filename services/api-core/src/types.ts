import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'

// Cloudflare Images binding type (not in @cloudflare/workers-types yet)
// Docs: https://developers.cloudflare.com/images/transform-images/bindings/
export interface ImagesBinding {
  input(source: ReadableStream | ArrayBuffer | Blob): ImageTransformer
}

export interface ImageTransformer {
  transform(options: ImageTransformOptions): ImageTransformer
  // draw() takes an ImageTransformer (overlay image) and positioning options
  draw(overlay: ImageTransformer, options?: DrawPositionOptions): ImageTransformer
  output(options: ImageOutputOptions): Promise<ImageOutputResult>
  info(): Promise<ImageInfo>
}

export interface ImageTransformOptions {
  // Resize options
  width?: number
  height?: number
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad'
  gravity?: 'auto' | 'center' | 'top' | 'bottom' | 'left' | 'right' | 'face' | { x: number; y: number }

  // Trim/crop - can specify edges to remove OR absolute window
  // Applied BEFORE resizing
  trim?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
    width?: number
    height?: number
  }

  // Metadata handling
  metadata?: 'keep' | 'copyright' | 'none'

  // Other transforms
  rotate?: 90 | 180 | 270
  blur?: number  // 1-250
  sharpen?: number  // 0-10
}

// Draw positioning options (second arg to .draw())
export interface DrawPositionOptions {
  opacity?: number      // 0-1
  repeat?: boolean | 'x' | 'y'  // Tile watermark
  top?: number
  right?: number
  bottom?: number
  left?: number
  width?: number
  height?: number
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad'
  gravity?: 'auto' | 'center' | 'top' | 'bottom' | 'left' | 'right' | string
}

export interface ImageOutputOptions {
  format: 'image/avif' | 'image/webp' | 'image/jpeg' | 'image/png' | 'image/json'
  quality?: number  // 1-100
}

export interface ImageOutputResult {
  response(): Response
  image(): ReadableStream
  contentType(): string
}

export interface ImageInfo {
  format: string
  fileSize: number
  width: number
  height: number
}

export interface Env {
  DB: D1Database
  ENVIRONMENT: string
  DNS_SHARED_SECRET?: string  // Required for /api/names/dns/resolve
  CLAIM_START_SECRET?: string // Required to call /api/claim/start outside local dev

  // Filebase S3 credentials for IPFS pinning (scrobbles)
  FILEBASE_ACCESS_KEY?: string
  FILEBASE_SECRET_KEY?: string
  FILEBASE_BUCKET?: string

  // Filebase S3 credentials for food photos (separate bucket)
  FILEBASE_FOOD_ACCESS_KEY?: string
  FILEBASE_FOOD_SECRET_KEY?: string
  FILEBASE_FOOD_BUCKET?: string

  // OpenRouter for study-set generation
  OPENROUTER_API_KEY?: string
  // Optional model override for study-set generation
  OPENROUTER_STUDY_MODEL?: string
  // Genius API key for server-side referent resolution in study-set generation
  GENIUS_API_KEY?: string

  // DeepInfra API key for speech-to-text (Voxtral)
  DEEPINFRA_API_KEY?: string

  // fal.ai API key for anime generation
  FAL_KEY?: string

  // HMAC secret for watermark fingerprints
  WATERMARK_SECRET?: string

  // Base Sepolia relay wallet for EAS attestations
  BASE_SEPOLIA_RELAY_PK?: string
  BASE_SEPOLIA_RPC?: string

  // Story relay wallet + contract config (music publish registration)
  STORY_SPONSOR_PRIVATE_KEY?: string
  PRIVATE_KEY?: string // Compatibility fallback to existing relay key naming
  STORY_RPC_URL?: string
  STORY_CHAIN_ID?: string
  STORY_SPG_NFT_CONTRACT?: string
  STORY_LICENSE_ATTACHMENT_WORKFLOWS?: string
  STORY_DERIVATIVE_WORKFLOWS?: string
  STORY_IP_ASSET_REGISTRY?: string
  STORY_LICENSE_REGISTRY?: string
  STORY_ROYALTY_POLICY_LAP?: string
  STORY_WIP_TOKEN?: string
  STORY_PIL_LICENSE_TEMPLATE?: string

  // Tempo relay wallet + contract config (music finalize registration)
  TEMPO_RPC_URL?: string
  TEMPO_CHAIN_ID?: string
  TEMPO_SPONSOR_PRIVATE_KEY?: string
  TEMPO_OPERATOR_PRIVATE_KEY?: string
  TEMPO_NAME_REGISTRY_V2?: string
  TEMPO_PREMIUM_NAME_STORE_V2?: string
  NAMES_PRIMARY_NODE?: string
  NAMES_SECONDARY_NODE?: string
  TEMPO_HEAVEN_NODE?: string
  TEMPO_PIRATE_NODE?: string
  TEMPO_POLICY_SIGNER_PRIVATE_KEY?: string
  TEMPO_POLICY_SIGNER_ADDRESS?: string
  NAMES_PERMIT_TTL_SECONDS?: string
  NAMES_POW_TTL_SECONDS?: string
  NAMES_POW_DIFFICULTY_HEX?: string
  NAMES_LONG_WALLET_LIMIT_10M?: string
  NAMES_LONG_IP_LIMIT_10M?: string
  NAMES_LONG_DEVICE_LIMIT_10M?: string
  TEMPO_SCROBBLE_V4?: string
  TEMPO_CONTENT_REGISTRY?: string
  TEMPO_CANONICAL_LYRICS_REGISTRY?: string
  TEMPO_STUDY_SET_REGISTRY?: string
  TEMPO_TX_WAIT_TIMEOUT_MS?: string

  // R2 buckets for photo pipeline
  R2_RAW: R2Bucket      // Temporary upload storage
  R2_ORIG: R2Bucket     // Sanitized originals (EXIF stripped)
  R2_ANIME: R2Bucket    // Anime grid + tiles
  R2_REVEAL: R2Bucket   // Per-viewer watermarked variants
  R2_WM: R2Bucket       // Per-viewer watermark tiles

  // Images binding for transforms
  IMAGES: ImagesBinding

  // Filebase IPFS pinning (format: ACCESS_KEY_ID:SECRET_ACCESS_KEY:BUCKET)
  FILEBASE_KEY?: string

  // Filebase songs bucket (audio, instrumental, cover uploads)
  FILEBASE_SONGS_KEY?: string

  // Filebase canvas videos bucket (separate bucket for video content)
  FILEBASE_CANVAS_KEY?: string

  // Load S3 agent upload credentials/config
  LOAD_S3_AGENT_API_KEY?: string
  LOAD_S3_AGENT_URL?: string
  LOAD_GATEWAY_URL?: string

  // Privy wallet proxy (gas sponsorship)
  PRIVY_APP_ID?: string
  PRIVY_APP_SECRET?: string

  // Self.xyz verification
  APP_SCOPE?: string               // Generic app scope identifier
  APP_DISPLAY_NAME?: string        // Generic display name in verification deeplink
  APP_DEEPLINK_SCHEME?: string     // Custom callback scheme (e.g. appname)
  APP_NULLIFIER_NAMESPACE?: string // Namespace seed for nullifier derivation
  SELF_SCOPE?: string              // Scope identifier for Self verification
  SELF_ENDPOINT?: string           // Public URL for /api/self/verify (Self relayer calls this)
  SELF_MOCK_PASSPORT?: string      // "true" for testnet, "false" for mainnet

  // Scrobble resolver
  RESOLVER_KV?: KVNamespace        // Cache for MusicBrainz/AcoustID lookups
  MB_USER_AGENT?: string           // User-Agent for MusicBrainz API
  ACOUSTID_CLIENT_KEY?: string     // AcoustID API client key
  ENABLE_MB_FALLBACK_SEARCH?: string // "true" to enable text search fallback
}

// Database row types
export interface UserRow {
  address: string
  created_at: number
  last_active_at: number | null
  directory_tier: 'handoff' | 'claimed' | 'verified'
}

export interface ShadowProfileRow {
  id: string
  source: string
  source_url: string | null
  display_name: string | null
  bio: string | null
  age_bucket: number | null
  gender_identity: number | null
  location: string | null
  photos_json: string | null
  anime_cid: string | null
  survey_cid: string | null
  featured_rank: number
  created_at: number
  updated_at: number
  claimed_address: string | null
  claimed_at: number | null
}

export interface LikeRow {
  id: number
  liker_address: string
  target_type: 'user' | 'shadow'
  target_id: string
  created_at: number
}

export interface MatchRow {
  id: number
  user1: string
  user2: string
  created_at: number
}

// API types
export interface CandidateProfile {
  targetType: 'shadow' | 'user'
  targetId: string
  displayName: string
  bio: string | null
  ageBucket: number | null
  genderIdentity: number | null
  location: string | null
  avatarUrl: string | null
  claimedAddress: string | null
}

export interface CandidatesResponse {
  candidates: CandidateProfile[]
  meta: {
    candidateSetRoot: string  // Merkle root placeholder for V0.5
    nonce: number
    expiry: number
    maxLikes: number
  }
}

export interface LikeRequest {
  viewerAddress: string
  targetType: 'shadow' | 'user'
  targetId: string
}

export interface LikeResponse {
  success: boolean
  mutual: boolean
  peerAddress?: string
  matchId?: number
  error?: string
}

export interface MatchProfile {
  peerAddress: string
  displayName: string | null
  avatarUrl: string | null
  matchedAt: number
}

export interface MatchesResponse {
  matches: MatchProfile[]
}

// ============================================================================
// Heaven Names Registry Types
// ============================================================================

export interface HeavenNameRow {
  label: string
  label_display: string | null
  owner_address: string
  status: 'active' | 'expired'
  registered_at: number
  expires_at: number
  grace_ends_at: number
  profile_cid: string | null
  created_at: number
  updated_at: number
}

export interface HeavenReservedRow {
  label: string
  reason: string | null
  created_at: number
}

export interface HeavenNonceRow {
  nonce: string
  owner_address: string
  used_at: number | null
  expires_at: number
  created_at: number
}

// ============================================================================
// Scrobble Batch Types
// ============================================================================

export interface ScrobbleBatchRow {
  id: number
  user_address: string
  cid: string
  track_count: number
  start_ts: number
  end_ts: number
  created_at: number
}

export interface ScrobbleTrack {
  artist: string
  title: string
  album?: string | null
  duration_ms?: number | null    // milliseconds
  playedAt: number
  source?: string

  // Optional enriched fields (dormant until Android sends them)
  embedded?: {
    mb_recording_id?: string  // MusicBrainz recording MBID
    isrc?: string             // International Standard Recording Code
  }
  fingerprint?: string        // Chromaprint fingerprint
}

export interface ScrobbleSubmitRequest {
  tracks: ScrobbleTrack[]
}

export interface ScrobbleSubmitResponse {
  success: boolean
  cid?: string
  count?: number
  startTs?: number
  endTs?: number
  attestationUid?: string  // EAS attestation UID (on-chain)
  txHash?: string          // Transaction hash
  error?: string
}

// ============================================================================
// Photo Pipeline Types
// ============================================================================

export interface UserPhotoRow {
  photo_id: string
  user_id: string
  slot: number
  orig_key: string
  created_at: number
}

export interface AnimeAssetsRow {
  user_id: string
  grid_key: string
  tile1_key: string
  tile2_key: string
  tile3_key: string
  tile4_key: string
  fal_request_id: string | null
  created_at: number
  updated_at: number
}

export interface PhotoAccessRow {
  access_id: string
  match_id: string
  photo_id: string
  owner_user_id: string
  viewer_user_id: string
  viewer_wallet_full: string
  viewer_wallet_short: string
  fingerprint_code: string
  wm_tile_key: string | null
  variant_key: string | null
  created_at: number
}

export interface PhotoSourceTokenRow {
  token_hash: string
  photo_id: string
  expires_at: number
  created_at: number
}

export interface PhotoJobRow {
  job_id: string
  user_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  step: string | null
  error_message: string | null
  photo_ids_json: string | null
  anime_tiles_json: string | null
  fal_request_id: string | null
  created_at: number
  updated_at: number
}

// API request/response types

export interface PhotoPipelineResponse {
  success: boolean
  jobId?: string           // If async (202)
  photoIds?: string[]      // 4 photo IDs for reveal later
  animeTiles?: string[]    // 4 tile URLs via API (when done)
  ipfsTiles?: string[]     // 4 IPFS CIDs (ipfs://Qm...)
  ipfsGatewayTiles?: string[] // 4 gateway URLs for easy access
  error?: string
}

export interface PhotoJobStatusResponse {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  step?: string
  photoIds?: string[]
  animeTiles?: string[]
  ipfsTiles?: string[]
  ipfsGatewayTiles?: string[]
  error?: string
}

export interface PhotoRevealResponse {
  success: boolean
  imageUrl?: string        // Signed URL or data URL
  error?: string
}

// ============================================================================
// Self.xyz Verification Types
// ============================================================================

export interface SelfVerificationRow {
  session_id: string
  user_address: string
  status: 'pending' | 'verified' | 'failed' | 'expired'
  date_of_birth: string | null
  age: number | null
  nationality: string | null
  attestation_id: number | null
  proof_hash: string | null
  verified_at: number | null
  created_at: number
  expires_at: number
  failure_reason: string | null
}

export interface UserIdentityRow {
  user_address: string
  date_of_birth: string
  age_at_verification: number
  nationality: string
  identity_nullifier_hash: string | null
  verification_session_id: string
  verified_at: number
  created_at: number
  updated_at: number
}

// API request/response types

export interface SelfSessionRequest {
  userAddress: string
}

export interface SelfSessionResponse {
  sessionId: string
  deeplinkUrl: string
  expiresAt: number
}

export interface SelfVerifyRequest {
  attestationId: number
  proof: {
    a: string[]
    b: string[][]
    c: string[]
  }
  publicSignals: string[]
  userContextData: string  // Contains sessionId
}

export interface SelfVerifyResponse {
  status: 'success' | 'error'
  result?: boolean
  reason?: string
}

export interface SelfSessionStatusResponse {
  status: 'pending' | 'verified' | 'failed' | 'expired'
  age?: number
  nationality?: string
  verifiedAt?: number
  reason?: string
}

// ============================================================================
// Music Publish Pipeline Types
// ============================================================================

export type MusicPublishStatus =
  | 'staged'
  | 'checking'
  | 'policy_passed'
  | 'manual_review'
  | 'rejected'
  | 'anchoring'
  | 'anchored'
  | 'registering'
  | 'registered'
  | 'failed'

export type MusicPublishType = 'original' | 'derivative' | 'cover'

export interface MusicPublishJobRow {
  job_id: string
  user_address: string
  status: MusicPublishStatus
  publish_type: MusicPublishType | null
  idempotency_key: string | null
  file_name: string | null
  content_type: string | null
  file_size: number | null
  audio_sha256: string | null
  fingerprint: string | null
  duration_s: number | null
  staged_dataitem_id: string | null
  staged_gateway_url: string | null
  staged_payload_json: string | null
  cover_staged_dataitem_id: string | null
  cover_staged_gateway_url: string | null
  cover_content_type: string | null
  cover_file_size: number | null
  cover_staged_payload_json: string | null
  lyrics_staged_dataitem_id: string | null
  lyrics_staged_gateway_url: string | null
  lyrics_sha256: string | null
  lyrics_bytes: number | null
  lyrics_staged_payload_json: string | null
  policy_decision: 'pending' | 'pass' | 'reject' | 'manual_review'
  policy_reason_code: string | null
  policy_reason: string | null
  parent_ip_ids_json: string | null
  license_terms_ids_json: string | null
  anchored_dataitem_id: string | null
  arweave_ref: string | null
  arweave_url: string | null
  arweave_available: number
  anchor_payload_json: string | null
  metadata_status: 'none' | 'anchoring' | 'anchored' | 'failed'
  metadata_error: string | null
  ip_metadata_uri: string | null
  ip_metadata_hash: string | null
  ip_metadata_dataitem_id: string | null
  nft_metadata_uri: string | null
  nft_metadata_hash: string | null
  nft_metadata_dataitem_id: string | null
  story_tx_hash: string | null
  story_ip_id: string | null
  story_token_id: string | null
  story_license_terms_ids_json: string | null
  story_block_number: string | null
  megaeth_tx_hash: string | null
  error_code: string | null
  error_message: string | null
  created_at: number
  updated_at: number
}

export interface MusicUploadBanRow {
  ban_id: number
  user_address: string
  self_nullifier: string | null
  reason_code: string
  reason: string
  evidence_json: string | null
  active: number
  expires_at: number | null
  created_by: string | null
  created_at: number
}

// ============================================================================
// Survey Schema Types (survey.schema.v1)
// ============================================================================

export type SurveyVisibility = 'hidden' | 'matching_only' | 'match_reveal' | 'public'

export type QuestionType = 'single_select' | 'multi_select' | 'number'

export type CompatibilityMode = 'exact' | 'allowed_set' | 'threshold' | 'overlap'

export interface SurveyCategory {
  id: string
  label: string
  order: number
}

export interface MatcherConfig {
  index: boolean
  weight?: number
}

export interface SurveyQuestion {
  qid: string
  categoryId: string
  type: QuestionType
  label: string
  options?: string[]          // for single_select / multi_select
  min?: number                // for number type
  max?: number                // for number type
  defaultVisibility: SurveyVisibility
  dealbreakerAllowed: boolean
  matcher: MatcherConfig
  note?: string
}

export interface DealbrekerExact {
  mode: 'exact'
  config: Record<string, never>
}

export interface DealbreakerAllowedSet {
  mode: 'allowed_set'
  config: { allowed: string[] }
}

export interface DealbreakerThreshold {
  mode: 'threshold'
  config: { min?: number; max?: number; maxDistance?: number }
}

export interface DealbreakerOverlap {
  mode: 'overlap'
  config: { required?: string[]; minOverlap: number }
}

export type DealbreakerValue = DealbrekerExact | DealbreakerAllowedSet | DealbreakerThreshold | DealbreakerOverlap

export interface SurveyAnswer {
  qid: string
  value: string | number | string[]
  visibility: SurveyVisibility
  dealbreaker: DealbreakerValue | null
  updatedAt: number
}

export interface CompatibilityRule {
  qid: string
  mode: CompatibilityMode
  description: string
  config?: {
    minDelta?: number
    maxDelta?: number
    maxDistance?: number
    ordinal?: boolean
    direction?: 'gte' | 'lte'
    minOverlap?: number
    note?: string
  }
}

// Category payload (plaintext before encryption, per envelope.spec.v1.md)
export interface SurveyCategoryPayload {
  category: string
  schema: 'survey.schema.v1'
  answers: SurveyCategoryAnswer[]
}

// Answer as stored in encrypted category payload (compact numeric visibility)
export interface SurveyCategoryAnswer {
  qid: string
  value: string | number | string[]
  visibility: 0 | 1 | 2 | 3   // hidden=0, matching_only=1, match_reveal=2, public=3
  dealbreaker: boolean
  updatedAt: number
}

// Envelope format (stored on IPFS, self-describing)
export interface SurveyEnvelope {
  version: '1.1.0'
  schema: 'survey.schema.v1'
  kdf: {
    algorithm: 'HKDF-SHA256'
    messagePrefix: 'heaven-envelope-v1:derive-master:'
    salt: 'heaven-envelope-v1'
    ikm: 'keccak256(signatureBytes)'
    categoryInfoPrefix: 'cat:'
  }
  enc: {
    aead: 'aes-256-gcm'
    ivBytes: 12
    tagBytes: 16
    aadFormat: string  // "heaven-envelope-v1|schema=survey.schema.v1|cat=<categoryId>"
  }
  categories: Record<string, {
    iv: string        // base64, 12 bytes
    ciphertext: string  // base64
    tag: string       // base64, 16 bytes
  }>
  updatedAt: number
}

// API request/response types

export interface SurveyUpsertRequest {
  answers: SurveyAnswer[]
}

export interface SurveyUpsertResponse {
  success: boolean
  updatedCount: number
  envelopeCid?: string        // New IPFS CID if envelope was re-encrypted
  error?: string
}

export interface SurveyGetResponse {
  answers: SurveyAnswer[]     // Filtered by visibility for the requester
  categoryId?: string         // If requesting a specific category
}

// D1 row for matcher index (denormalized for fast queries)
export interface SurveyAnswerRow {
  user_id: string
  qid: string
  value_json: string          // JSON-encoded value
  visibility: SurveyVisibility
  dealbreaker_json: string | null  // JSON-encoded DealbreakerValue
  updated_at: number
}
