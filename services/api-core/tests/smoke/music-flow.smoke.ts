/**
 * Smoke test for music publish flow:
 *   start -> preflight
 *
 * Optional full flow:
 *   start -> preflight -> anchor -> metadata -> register
 *
 * Note:
 *   Self verification step uses mock proof data and is intended for local/dev mode
 *   (`SELF_MOCK_PASSPORT=true` or development environment).
 *
 * Usage examples:
 *   bun run tests/smoke/music-flow.smoke.ts
 *   API_BASE=https://api-core.dotheaven.org bun run tests/smoke/music-flow.smoke.ts
 *
 * Optional env:
 *   TEST_USER_ADDRESS=0x...
 *   PUBLISH_TYPE=original|derivative|cover
 *   PARENT_IP_IDS=0xabc...,0xdef...          (required for derivative/cover)
 *   LICENSE_TERMS_IDS=1,2                    (required for derivative/cover)
 *   FINALIZE_PERMANENT=true                  (run anchor+metadata+register steps)
 */

type MusicPublishType = 'original' | 'derivative' | 'cover'

const API_BASE = (process.env.API_BASE || process.env.API_CORE_URL || 'http://localhost:8787').replace(/\/+$/, '')
const TEST_USER_ADDRESS = (process.env.TEST_USER_ADDRESS || '0x1234567890abcdef1234567890abcdef12345678').toLowerCase()
const PUBLISH_TYPE = ((process.env.PUBLISH_TYPE || 'original').toLowerCase() as MusicPublishType)
const FINALIZE_PERMANENT = process.env.FINALIZE_PERMANENT === 'true'

function assertAddress(value: string, label: string): string {
  const normalized = value.toLowerCase().trim()
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    throw new Error(`${label} must be a lowercase 0x-prefixed address`)
  }
  return normalized
}

function parseCsvStrings(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

function parseCsvIntStrings(raw: string | undefined): string[] {
  const values = parseCsvStrings(raw)
  for (const value of values) {
    if (!/^\d+$/.test(value)) {
      throw new Error(`LICENSE_TERMS_IDS must contain only integers; got "${value}"`)
    }
  }
  return values
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; json: any }> {
  const res = await fetch(url, init)
  const text = await res.text()
  let parsed: any = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { raw: text }
  }
  return { status: res.status, json: parsed }
}

async function ensureSelfVerified(userAddress: string): Promise<void> {
  const identity = await fetchJson(`${API_BASE}/api/self/identity/${userAddress}`)
  if (identity.status === 200) {
    console.log('Self identity already verified')
    return
  }
  if (identity.status !== 404) {
    throw new Error(`Failed to query Self identity: status=${identity.status} payload=${JSON.stringify(identity.json)}`)
  }

  console.log('Creating Self verification session...')
  const sessionResp = await fetchJson(`${API_BASE}/api/self/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userAddress }),
  })
  if (sessionResp.status !== 200 || !sessionResp.json?.sessionId) {
    throw new Error(`Failed to create Self session: status=${sessionResp.status} payload=${JSON.stringify(sessionResp.json)}`)
  }

  const sessionId = String(sessionResp.json.sessionId)
  console.log(`Self session: ${sessionId}`)

  const verifyResp = await fetchJson(`${API_BASE}/api/self/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Must stay as plain session id because backend parser currently splits on ":" only.
      userContextData: sessionId,
      // Required by current /api/self/verify D1 bind path.
      attestationId: 1,
      proof: {
        a: ['1', '2'],
        b: [['1', '2'], ['3', '4']],
        c: ['5', '6'],
      },
      publicSignals: ['1'],
    }),
  })

  if (verifyResp.status !== 200 || verifyResp.json?.result !== true) {
    throw new Error(`Self verify failed: status=${verifyResp.status} payload=${JSON.stringify(verifyResp.json)}`)
  }
  console.log('Self verification complete')
}

async function main() {
  if (PUBLISH_TYPE !== 'original' && PUBLISH_TYPE !== 'derivative' && PUBLISH_TYPE !== 'cover') {
    throw new Error(`Unsupported PUBLISH_TYPE=${PUBLISH_TYPE}`)
  }
  assertAddress(TEST_USER_ADDRESS, 'TEST_USER_ADDRESS')

  const parentIpIds = parseCsvStrings(process.env.PARENT_IP_IDS).map((value) => assertAddress(value, 'PARENT_IP_IDS entry'))
  const licenseTermsIds = parseCsvIntStrings(process.env.LICENSE_TERMS_IDS)

  if ((PUBLISH_TYPE === 'derivative' || PUBLISH_TYPE === 'cover') && (parentIpIds.length === 0 || licenseTermsIds.length === 0)) {
    throw new Error('PARENT_IP_IDS and LICENSE_TERMS_IDS are required for derivative/cover smoke tests')
  }

  console.log('=== Music Flow Smoke Test ===')
  console.log(`API_BASE=${API_BASE}`)
  console.log(`TEST_USER_ADDRESS=${TEST_USER_ADDRESS}`)
  console.log(`PUBLISH_TYPE=${PUBLISH_TYPE}`)
  console.log(`FINALIZE_PERMANENT=${FINALIZE_PERMANENT}`)

  const health = await fetchJson(`${API_BASE}/health`)
  if (health.status !== 200) {
    throw new Error(`Health check failed: status=${health.status} payload=${JSON.stringify(health.json)}`)
  }
  console.log('Health check ok')

  await ensureSelfVerified(TEST_USER_ADDRESS)

  // Tiny deterministic bytes for the smoke upload.
  const uploadBytes = new TextEncoder().encode(`heaven-music-smoke-${Date.now()}`)
  const audioSha256 = await sha256Hex(uploadBytes)
  const idempotencyKey = `music-smoke-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`

  const startForm = new FormData()
  startForm.append('file', new Blob([uploadBytes], { type: 'audio/mpeg' }), 'smoke.mp3')
  startForm.append('publishType', PUBLISH_TYPE)
  startForm.append('contentType', 'audio/mpeg')
  startForm.append('durationS', '4')
  startForm.append('fingerprint', `smoke-fingerprint-${Date.now()}`)
  startForm.append('audioSha256', audioSha256)
  startForm.append('idempotencyKey', idempotencyKey)

  console.log('POST /api/music/publish/start')
  const started = await fetchJson(`${API_BASE}/api/music/publish/start`, {
    method: 'POST',
    headers: {
      'X-User-Address': TEST_USER_ADDRESS,
      'Idempotency-Key': idempotencyKey,
    },
    body: startForm,
  })
  if (started.status !== 200 || !started.json?.job?.jobId) {
    throw new Error(`publish/start failed: status=${started.status} payload=${JSON.stringify(started.json)}`)
  }

  const jobId = String(started.json.job.jobId)
  console.log(`jobId=${jobId}`)

  console.log('POST /api/music/preflight')
  const preflightBody: Record<string, unknown> = {
    jobId,
    publishType: PUBLISH_TYPE,
    fingerprint: `smoke-fingerprint-${Date.now()}`,
    durationS: 4,
  }
  if (PUBLISH_TYPE !== 'original') {
    preflightBody.parentIpIds = parentIpIds
    preflightBody.licenseTermsIds = licenseTermsIds
  }

  const preflight = await fetchJson(`${API_BASE}/api/music/preflight`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Address': TEST_USER_ADDRESS,
    },
    body: JSON.stringify(preflightBody),
  })
  if (preflight.status !== 200) {
    throw new Error(`preflight failed: status=${preflight.status} payload=${JSON.stringify(preflight.json)}`)
  }
  if (preflight.json?.job?.status !== 'policy_passed') {
    throw new Error(`preflight did not pass policy: status=${preflight.json?.job?.status} payload=${JSON.stringify(preflight.json)}`)
  }

  if (!FINALIZE_PERMANENT) {
    console.log('Music staged preflight flow complete')
    console.log(JSON.stringify({
      jobId,
      status: preflight.json?.job?.status,
      stagedDataitemId: preflight.json?.job?.upload?.stagedDataitemId,
      stagedGatewayUrl: preflight.json?.job?.upload?.stagedGatewayUrl,
    }, null, 2))
    return
  }

  console.log('POST /api/music/publish/:jobId/anchor')
  const anchor = await fetchJson(`${API_BASE}/api/music/publish/${encodeURIComponent(jobId)}/anchor`, {
    method: 'POST',
    headers: { 'X-User-Address': TEST_USER_ADDRESS },
  })
  if (anchor.status !== 200) {
    throw new Error(`anchor failed: status=${anchor.status} payload=${JSON.stringify(anchor.json)}`)
  }
  if (anchor.json?.job?.status !== 'anchored' && anchor.json?.job?.status !== 'registering' && anchor.json?.job?.status !== 'registered') {
    throw new Error(`anchor did not reach anchored state: payload=${JSON.stringify(anchor.json)}`)
  }

  console.log('POST /api/music/publish/:jobId/metadata')
  const ipMetadataJson = {
    jobId,
    publishType: PUBLISH_TYPE,
    title: 'Smoke Test Song',
    artist: 'Smoke Tester',
    version: 'smoke-test',
  }
  const nftMetadataJson = {
    name: 'Smoke Test Song NFT',
    description: `Smoke test registration for ${jobId}`,
  }

  const metadata = await fetchJson(`${API_BASE}/api/music/publish/${encodeURIComponent(jobId)}/metadata`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Address': TEST_USER_ADDRESS,
    },
    body: JSON.stringify({
      ipMetadataJson,
      nftMetadataJson,
    }),
  })
  if (metadata.status !== 200) {
    throw new Error(`metadata anchor failed: status=${metadata.status} payload=${JSON.stringify(metadata.json)}`)
  }

  const ipMetadataURI = String(metadata.json?.ipMetadataURI || '')
  const ipMetadataHash = String(metadata.json?.ipMetadataHash || '')
  const nftMetadataURI = String(metadata.json?.nftMetadataURI || '')
  const nftMetadataHash = String(metadata.json?.nftMetadataHash || '')
  if (!ipMetadataURI || !ipMetadataHash || !nftMetadataURI || !nftMetadataHash) {
    throw new Error(`metadata anchor missing required fields: payload=${JSON.stringify(metadata.json)}`)
  }

  console.log('POST /api/music/publish/:jobId/metadata (idempotency retry)')
  const metadataRetry = await fetchJson(`${API_BASE}/api/music/publish/${encodeURIComponent(jobId)}/metadata`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Address': TEST_USER_ADDRESS,
    },
    body: JSON.stringify({
      ipMetadataJson,
      nftMetadataJson,
    }),
  })
  if (metadataRetry.status !== 200) {
    throw new Error(`metadata retry failed: status=${metadataRetry.status} payload=${JSON.stringify(metadataRetry.json)}`)
  }
  if (String(metadataRetry.json?.ipMetadataURI || '') !== ipMetadataURI
    || String(metadataRetry.json?.ipMetadataHash || '') !== ipMetadataHash
    || String(metadataRetry.json?.nftMetadataURI || '') !== nftMetadataURI
    || String(metadataRetry.json?.nftMetadataHash || '') !== nftMetadataHash) {
    throw new Error(`metadata retry was not idempotent: first=${JSON.stringify(metadata.json)} retry=${JSON.stringify(metadataRetry.json)}`)
  }

  console.log('POST /api/music/publish/:jobId/register')

  const registerBody: Record<string, unknown> = {
    recipient: TEST_USER_ADDRESS,
    ipMetadataURI,
    ipMetadataHash,
    nftMetadataURI,
    nftMetadataHash,
    commercialRevShare: 10,
    defaultMintingFee: '0',
    allowDuplicates: true,
  }

  if (PUBLISH_TYPE !== 'original') {
    registerBody.parentIpIds = parentIpIds
    registerBody.licenseTermsIds = licenseTermsIds
    if (process.env.LICENSE_TEMPLATE) registerBody.licenseTemplate = process.env.LICENSE_TEMPLATE
    if (process.env.ROYALTY_CONTEXT) registerBody.royaltyContext = process.env.ROYALTY_CONTEXT
    if (process.env.MAX_MINTING_FEE) registerBody.maxMintingFee = process.env.MAX_MINTING_FEE
    if (process.env.MAX_RTS) registerBody.maxRts = Number(process.env.MAX_RTS)
    if (process.env.MAX_REVENUE_SHARE) registerBody.maxRevenueShare = Number(process.env.MAX_REVENUE_SHARE)
  }

  const register = await fetchJson(`${API_BASE}/api/music/publish/${encodeURIComponent(jobId)}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Address': TEST_USER_ADDRESS,
    },
    body: JSON.stringify(registerBody),
  })

  if (register.status !== 200) {
    throw new Error(`register failed: status=${register.status} payload=${JSON.stringify(register.json)}`)
  }
  if (register.json?.job?.status !== 'registered') {
    throw new Error(`register did not reach registered state: payload=${JSON.stringify(register.json)}`)
  }

  console.log('Music publish flow complete')
  console.log(JSON.stringify({
    jobId,
    status: register.json?.job?.status,
    storyTxHash: register.json?.job?.registration?.storyTxHash,
    storyIpId: register.json?.job?.registration?.storyIpId,
    storyTokenId: register.json?.job?.registration?.storyTokenId,
  }, null, 2))
}

main().catch((error) => {
  console.error('Music flow smoke test failed:')
  console.error(error)
  process.exit(1)
})
