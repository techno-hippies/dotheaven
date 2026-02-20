/**
 * Filebase S3-compatible IPFS Pinning
 *
 * Filebase provides S3 API that automatically pins to IPFS.
 * Upload returns the IPFS CID in the response headers.
 *
 * Bucket: heaven-photos
 * Region: us-east-1 (standard for Filebase)
 */

interface FilebaseConfig {
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

interface PinResult {
  cid: string
  key: string
  ipfsUrl: string
  gatewayUrl: string
}

/**
 * Parse Filebase credentials from combined key format
 * Format: "ACCESS_KEY_ID:SECRET_ACCESS_KEY:BUCKET"
 */
export function parseFilebaseKey(combinedKey: string): FilebaseConfig {
  const parts = combinedKey.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid Filebase key format. Expected ACCESS_KEY_ID:SECRET_ACCESS_KEY:BUCKET')
  }
  return {
    accessKeyId: parts[0],
    secretAccessKey: parts[1],
    bucket: parts[2],
  }
}

/**
 * Generate AWS Signature V4 for Filebase S3 API
 */
async function signRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body: ArrayBuffer | null,
  config: FilebaseConfig
): Promise<Record<string, string>> {
  const region = 'us-east-1'
  const service = 's3'
  const host = `${config.bucket}.s3.filebase.com`

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  // Canonical request components
  const canonicalUri = path
  const canonicalQueryString = ''

  // Hash the payload
  const payloadHash = body
    ? await sha256Hex(body)
    : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' // empty string hash

  // Required headers
  const signedHeaders: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...headers,
  }

  // Build canonical headers string (sorted, lowercase keys)
  const sortedHeaderKeys = Object.keys(signedHeaders).sort()
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k.toLowerCase()}:${signedHeaders[k].trim()}`)
    .join('\n') + '\n'
  const signedHeadersStr = sortedHeaderKeys.map((k) => k.toLowerCase()).join(';')

  // Canonical request
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeadersStr,
    payloadHash,
  ].join('\n')

  // String to sign
  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join('\n')

  // Signing key
  const kDate = await hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  const kSigning = await hmacSha256(kService, 'aws4_request')

  // Signature
  const signature = await hmacSha256Hex(kSigning, stringToSign)

  // Authorization header
  const authorization = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`

  return {
    ...signedHeaders,
    Authorization: authorization,
  }
}

/**
 * Pin a file to IPFS via Filebase S3 API
 */
export async function pinToFilebase(
  data: ArrayBuffer,
  filename: string,
  contentType: string,
  filebaseKey: string
): Promise<PinResult> {
  const config = parseFilebaseKey(filebaseKey)
  const key = filename // e.g., "anime/0x1234.../1.webp"
  const path = `/${key}`
  const host = `${config.bucket}.s3.filebase.com`

  const headers = await signRequest(
    'PUT',
    path,
    {
      'Content-Type': contentType,
      'Content-Length': data.byteLength.toString(),
    },
    data,
    config
  )

  const response = await fetch(`https://${host}${path}`, {
    method: 'PUT',
    headers,
    body: data,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Filebase upload failed: ${response.status} ${errorText}`)
  }

  // Filebase returns CID in x-amz-meta-cid header
  const cid = response.headers.get('x-amz-meta-cid')
  if (!cid) {
    throw new Error('Filebase did not return CID in response headers')
  }

  return {
    cid,
    key,
    ipfsUrl: `ipfs://${cid}`,
    gatewayUrl: `https://ipfs.filebase.io/ipfs/${cid}`,
  }
}

/**
 * Pin multiple files and return all CIDs
 */
export async function pinTilesToFilebase(
  tiles: Array<{ data: ArrayBuffer; slot: number }>,
  userId: string,
  filebaseKey: string
): Promise<PinResult[]> {
  const results: PinResult[] = []

  for (const tile of tiles) {
    const filename = `anime/${userId}/${tile.slot}.webp`
    const result = await pinToFilebase(tile.data, filename, 'image/webp', filebaseKey)
    results.push(result)
    console.log(`[Filebase] Pinned tile ${tile.slot}: ${result.cid}`)
  }

  return results
}

// ============================================================================
// Crypto helpers
// ============================================================================

async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  let buffer: ArrayBuffer
  if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data).buffer as ArrayBuffer
  } else if (data instanceof Uint8Array) {
    buffer = data.buffer as ArrayBuffer
  } else {
    buffer = data
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256(key: ArrayBuffer | string, message: string): Promise<ArrayBuffer> {
  const keyBuffer = typeof key === 'string' ? new TextEncoder().encode(key) : key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
}

async function hmacSha256Hex(key: ArrayBuffer, message: string): Promise<string> {
  const sig = await hmacSha256(key, message)
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
