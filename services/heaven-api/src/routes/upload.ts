/**
 * Upload Routes — Presigned URL generation for client-side Filebase uploads
 *
 * Flow:
 * 1. Client POSTs to /api/upload/presign with file metadata (slots, content types, sizes)
 * 2. Worker generates presigned S3 PUT URLs (short-lived, scoped to one object each)
 * 3. Client uploads directly to Filebase using presigned URLs (no secrets in browser)
 * 4. Client reads CID from `x-amz-meta-cid` response header (requires CORS on bucket)
 *
 * Alternative: Client calls /api/upload/complete/:key after upload, worker does HEAD to get CID
 */

import { Hono } from 'hono'
import type { Env } from '../types'
import { parseFilebaseKey } from '../lib/filebase'

const app = new Hono<{ Bindings: Env }>()

// ── Config ──────────────────────────────────────────────────────────

const REGION = 'us-east-1'
const SERVICE = 's3'
const HOST = 's3.filebase.com'
const PRESIGN_EXPIRY_SECONDS = 600 // 10 minutes

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_CONTENT_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/flac', 'audio/ogg', 'audio/aac', 'audio/m4a',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm',
])

// ── Presign endpoint ────────────────────────────────────────────────

interface PresignSlot {
  slot: string       // e.g. "audio", "instrumental", "cover", "canvas"
  contentType: string
  size: number       // bytes
}

interface PresignRequest {
  slots: PresignSlot[]
}

interface PresignedSlot {
  slot: string
  url: string
  key: string        // S3 object key (needed for complete endpoint)
}

app.post('/presign', async (c) => {
  const filebaseKey = c.env.FILEBASE_SONGS_KEY
  if (!filebaseKey) {
    return c.json({ error: 'Upload not configured' }, 500)
  }

  const body = await c.req.json<PresignRequest>()
  if (!body.slots || !Array.isArray(body.slots) || body.slots.length === 0) {
    return c.json({ error: 'slots array required' }, 400)
  }
  if (body.slots.length > 6) {
    return c.json({ error: 'Max 6 slots per request' }, 400)
  }

  const config = parseFilebaseKey(filebaseKey)
  const prefix = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const results: PresignedSlot[] = []

  for (const slot of body.slots) {
    if (!ALLOWED_CONTENT_TYPES.has(slot.contentType)) {
      return c.json({ error: `Unsupported content type: ${slot.contentType}` }, 400)
    }
    if (slot.size > MAX_FILE_SIZE) {
      return c.json({ error: `File too large for slot ${slot.slot}: ${slot.size} > ${MAX_FILE_SIZE}` }, 400)
    }

    const ext = slot.contentType.split('/')[1] || 'bin'
    const key = `${prefix}-${slot.slot}.${ext}`
    const url = await generatePresignedPutUrl(config.accessKeyId, config.secretAccessKey, config.bucket, key, slot.contentType, PRESIGN_EXPIRY_SECONDS)

    results.push({ slot: slot.slot, url, key })
  }

  return c.json({ slots: results })
})

// ── Complete endpoint (get CID after upload) ────────────────────────

app.get('/complete/:key{.+}', async (c) => {
  const filebaseKey = c.env.FILEBASE_SONGS_KEY
  if (!filebaseKey) {
    return c.json({ error: 'Upload not configured' }, 500)
  }

  const key = c.req.param('key')
  const config = parseFilebaseKey(filebaseKey)

  // HEAD the object to read the CID
  const cid = await headObjectForCid(config.accessKeyId, config.secretAccessKey, config.bucket, key)
  if (!cid) {
    return c.json({ error: 'Object not found or CID not available yet' }, 404)
  }

  return c.json({ cid, gatewayUrl: `https://ipfs.filebase.io/ipfs/${cid}` })
})

// ── AWS Signature V4 presigned URL generation ───────────────────────

async function generatePresignedPutUrl(
  accessKey: string,
  secretKey: string,
  bucket: string,
  key: string,
  contentType: string,
  expiresIn: number,
): Promise<string> {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`
  const credential = `${accessKey}/${credentialScope}`

  const canonicalUri = `/${bucket}/${key}`

  // Query string params for presigned URL (sorted alphabetically)
  const queryParams: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Content-Type', contentType],
    ['X-Amz-Credential', credential],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', expiresIn.toString()],
    ['X-Amz-SignedHeaders', 'content-type;host'],
  ]
  queryParams.sort((a, b) => a[0].localeCompare(b[0]))
  const canonicalQueryString = queryParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')

  const canonicalHeaders = `content-type:${contentType}\nhost:${HOST}\n`
  const signedHeaders = 'content-type;host'

  // For presigned URLs, payload is UNSIGNED-PAYLOAD
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  const signingKey = await getSigningKey(secretKey, dateStamp)
  const signature = await hmacHex(signingKey, stringToSign)

  return `https://${HOST}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`
}

// ── HEAD object to read CID ─────────────────────────────────────────

async function headObjectForCid(
  accessKey: string,
  secretKey: string,
  bucket: string,
  key: string,
): Promise<string | null> {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`

  const canonicalUri = `/${bucket}/${key}`
  const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

  const canonicalHeaders = `host:${HOST}\nx-amz-content-sha256:${emptyHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = [
    'HEAD', canonicalUri, '', canonicalHeaders, signedHeaders, emptyHash,
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest),
  ].join('\n')

  const signingKey = await getSigningKey(secretKey, dateStamp)
  const signature = await hmacHex(signingKey, stringToSign)

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const resp = await fetch(`https://${HOST}${canonicalUri}`, {
    method: 'HEAD',
    headers: {
      Authorization: authorization,
      'x-amz-content-sha256': emptyHash,
      'x-amz-date': amzDate,
    },
  })

  if (!resp.ok) return null
  return resp.headers.get('x-amz-meta-cid')
}

// ── Crypto helpers ──────────────────────────────────────────────────

const enc = new TextEncoder()

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(data))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(key: ArrayBuffer, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(msg))
}

async function hmacHex(key: ArrayBuffer, msg: string): Promise<string> {
  const sig = await hmac(key, msg)
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function getSigningKey(secretKey: string, dateStamp: string): Promise<ArrayBuffer> {
  const kDate = await hmac(enc.encode('AWS4' + secretKey), dateStamp)
  const kRegion = await hmac(kDate, REGION)
  const kService = await hmac(kRegion, SERVICE)
  return hmac(kService, 'aws4_request')
}

export default app
