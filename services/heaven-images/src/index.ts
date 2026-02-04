/**
 * Heaven Images Service
 *
 * Cloudflare Worker for image pipeline:
 * 1. POST /upload - Upload image with safety check + optional anime conversion
 * 2. POST /watermark - Apply multi-layer watermark to image for photo reveals
 *
 * This offloads heavy lifting from Lit Actions.
 */

import {
  generateFullOverlay,
  generateCornerStamp,
  generateTiledMicrotext,
  formatViewerLabel,
  formatWatermarkCode,
  u8ToArrayBuffer,
} from './lib/watermark'

export interface Env {
  FILEBASE_API_KEY: string
  OPENROUTER_API_KEY: string
  FAL_API_KEY: string
  WATERMARK_SECRET?: string
  IMAGES: {
    input(data: ArrayBuffer | Uint8Array): ImageTransformer
  }
}

interface ImageTransformer {
  transform(options: Record<string, unknown>): ImageTransformer
  draw(overlay: ImageTransformer, options: { left: number; top: number; opacity: number }): ImageTransformer
  output(options: { format: string; quality?: number }): Promise<{ response(): Response }>
  info(): Promise<{ width: number; height: number }>
}

// ── Constants ───────────────────────────────────────────────────────

const SAFETY_CHECK_MODEL = 'google/gemini-2.0-flash-001'
const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux-2/klein/9b/edit'
const FAL_ANIME_PROMPT =
  'Convert this photo into a high-quality anime illustration style. ' +
  'Maintain the composition, pose, and scene but render everything in anime art style. ' +
  'All faces must be fully anonymized into anime characters — no photorealistic features.'

const FILEBASE_BUCKET = 'heaven-posts'
const FILEBASE_ENDPOINT = 's3.filebase.com'
const FILEBASE_REGION = 'us-east-1'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// ── Helpers ─────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ success: false, error: message }, status)
}

// ── SHA-256 + HMAC ──────────────────────────────────────────────────

async function sha256Bytes(data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const buffer = data instanceof Uint8Array
    ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
    : data
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return new Uint8Array(hashBuffer)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const hash = await sha256Bytes(encoder.encode(message))
  return bytesToHex(hash)
}

async function sha256HexFromBuffer(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const hash = await sha256Bytes(buffer)
  return bytesToHex(hash)
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<Uint8Array> {
  const keyBuffer = key instanceof Uint8Array
    ? (key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer)
    : key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
  return new Uint8Array(sig)
}

async function hmacHex(key: ArrayBuffer | Uint8Array, message: string): Promise<string> {
  const sig = await hmacSha256(key, message)
  return bytesToHex(sig)
}

async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<Uint8Array> {
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + secretKey), dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  return hmacSha256(kService, 'aws4_request')
}

// ── Filebase S3 Upload ──────────────────────────────────────────────

async function uploadToFilebase(
  apiKey: string,
  content: Uint8Array,
  contentType: string,
  filename: string
): Promise<string> {
  const [accessKey, secretKey] = apiKey.split(':')
  if (!accessKey || !secretKey) throw new Error('Invalid Filebase API key format')

  const bucket = FILEBASE_BUCKET
  const endpoint = FILEBASE_ENDPOINT
  const region = FILEBASE_REGION
  const service = 's3'

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  const payloadHash = await sha256HexFromBuffer(content)
  const canonicalUri = `/${bucket}/${filename}`
  const canonicalHeaders =
    [`host:${endpoint}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`].join(
      '\n'
    ) + '\n'
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  const signingKey = await getSigningKey(secretKey, dateStamp, region, service)
  const signature = await hmacHex(signingKey, stringToSign)

  const authHeader = [
    `${algorithm} Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ')

  // Convert Uint8Array to ArrayBuffer for fetch body
  const bodyBuffer = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer
  const response = await fetch(`https://${endpoint}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Content-Type': contentType,
    },
    body: bodyBuffer,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Filebase upload failed: ${response.status} ${text}`)
  }

  const cid = response.headers.get('x-amz-meta-cid')
  if (!cid) throw new Error('No CID returned from Filebase')

  return cid
}

// ── Safety Check ────────────────────────────────────────────────────

interface SafetyResult {
  safe: boolean
  hasFace: boolean
  isAnime: boolean
  isAdult: boolean
  reason?: string
}

async function contentSafetyCheck(
  openRouterKey: string,
  imageBase64: string,
  contentType: string
): Promise<SafetyResult> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: SAFETY_CHECK_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Analyze this image for content safety and style. Respond with ONLY a JSON object, no other text:\n' +
                '{"safe": true/false, "hasFace": true/false, "isAnime": true/false, "isAdult": true/false, "reason": "..."}\n\n' +
                'Set safe=false if the image contains: CSAM, graphic violence, gore, personal documents (IDs, passports), screens with personal data, or hate symbols.\n' +
                'Set hasFace=true if the image contains a realistic human face or body that could be used for identification.\n' +
                'Set isAnime=true if the image is already an anime, cartoon, illustration, digital art, or non-photographic artwork style. ' +
                'Set isAnime=false if it is a real photograph.\n' +
                'Set isAdult=true if the image is sexually suggestive, contains nudity, lingerie, provocative poses, or other 18+ content. ' +
                'isAdult does NOT mean unsafe — adult content is allowed but age-gated.\n' +
                'Set reason to a brief explanation if safe=false.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${contentType};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 100,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Safety check failed: ${response.status} ${text}`)
  }

  const data = (await response.json()) as { choices: { message: { content: string } }[] }
  const content = data.choices?.[0]?.message?.content || ''

  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = content.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  try {
    return JSON.parse(jsonStr) as SafetyResult
  } catch {
    console.error('Failed to parse safety response:', content)
    return { safe: true, hasFace: false, isAnime: false, isAdult: false }
  }
}

// ── FAL.ai Anime Conversion ─────────────────────────────────────────

async function convertToAnime(
  falKey: string,
  imageBase64: string,
  contentType: string
): Promise<{ base64: string; contentType: string }> {
  const response = await fetch(FAL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: `data:${contentType};base64,${imageBase64}`,
      prompt: FAL_ANIME_PROMPT,
      guidance_scale: 3.5,
      num_inference_steps: 28,
      strength: 0.95,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`FAL conversion failed: ${response.status} ${text}`)
  }

  const data = (await response.json()) as { images: { url: string }[] }
  const resultUrl = data.images?.[0]?.url
  if (!resultUrl) throw new Error('No image returned from FAL')

  const imgResponse = await fetch(resultUrl)
  if (!imgResponse.ok) throw new Error('Failed to fetch FAL result image')

  const imgBuffer = await imgResponse.arrayBuffer()
  const imgBytes = new Uint8Array(imgBuffer)

  let binary = ''
  for (let i = 0; i < imgBytes.length; i++) {
    binary += String.fromCharCode(imgBytes[i])
  }

  return {
    base64: btoa(binary),
    contentType: imgResponse.headers.get('content-type') || 'image/png',
  }
}

// ── Watermark Request Types ─────────────────────────────────────────

interface WatermarkRequest {
  // Image data (base64 encoded)
  imageBase64: string
  imageContentType: string

  // Viewer identification
  viewerAddress: string
  heavenName?: string | null

  // Watermark code (pre-computed HMAC by Lit Action)
  watermarkCode: string

  // Options
  outputWidth?: number
  outputHeight?: number
  layers?: ('overlay' | 'corner' | 'tiled')[]
}

interface WatermarkResponse {
  success: boolean
  imageBase64?: string
  contentType?: string
  viewerLabel?: string
  watermarkCode?: string
  error?: string
}

// ── Main Handler ────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    const url = new URL(request.url)

    // ════════════════════════════════════════════════════════════════
    // POST /upload - Upload image with safety check
    // ════════════════════════════════════════════════════════════════
    if (request.method === 'POST' && url.pathname === '/upload') {
      try {
        const formData = await request.formData()
        const file = formData.get('image') as File | null
        const skipAiConversion = formData.get('skipAiConversion') === 'true'

        if (!file) {
          return errorResponse('Missing image file')
        }

        const contentType = file.type
        if (!ALLOWED_TYPES.includes(contentType)) {
          return errorResponse(
            `Invalid file type: ${contentType}. Allowed: ${ALLOWED_TYPES.join(', ')}`
          )
        }

        if (file.size > MAX_IMAGE_BYTES) {
          return errorResponse(`File too large: ${file.size} bytes. Max: ${MAX_IMAGE_BYTES}`)
        }

        const arrayBuffer = await file.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)

        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = btoa(binary)

        console.log('[Media] Running safety check...')
        const safety = await contentSafetyCheck(env.OPENROUTER_API_KEY, base64, contentType)

        if (!safety.safe) {
          return errorResponse(`Content rejected: ${safety.reason || 'Failed safety check'}`, 403)
        }

        const needsConversion = !skipAiConversion && !safety.isAnime && safety.hasFace
        let resultBase64 = base64
        let resultContentType = contentType
        let mode: 'direct' | 'ai' = 'direct'

        if (needsConversion) {
          console.log('[Media] Converting to anime style...')
          try {
            const converted = await convertToAnime(env.FAL_API_KEY, base64, contentType)
            resultBase64 = converted.base64
            resultContentType = converted.contentType
            mode = 'ai'
          } catch (err) {
            console.error('[Media] Anime conversion failed, using original:', err)
          }
        }

        console.log('[Media] Uploading to Filebase...')
        const resultBytes = Uint8Array.from(atob(resultBase64), (c) => c.charCodeAt(0))
        const filename = `post-${Date.now()}-${Math.random().toString(36).slice(2)}.${resultContentType.split('/')[1]}`
        const cid = await uploadToFilebase(env.FILEBASE_API_KEY, resultBytes, resultContentType, filename)

        console.log('[Media] Upload complete:', cid)

        return jsonResponse({
          success: true,
          cid,
          mode,
          isAdult: safety.isAdult,
          contentType: resultContentType,
        })
      } catch (err) {
        console.error('[Media] Upload error:', err)
        return errorResponse(err instanceof Error ? err.message : 'Upload failed', 500)
      }
    }

    // ════════════════════════════════════════════════════════════════
    // POST /watermark - Apply watermark to image for photo reveals
    // ════════════════════════════════════════════════════════════════
    if (request.method === 'POST' && url.pathname === '/watermark') {
      try {
        const body = (await request.json()) as WatermarkRequest

        const {
          imageBase64,
          imageContentType,
          viewerAddress,
          heavenName,
          watermarkCode,
          outputWidth = 500,
          outputHeight = 500,
          layers = ['overlay', 'corner'],
        } = body

        if (!imageBase64 || !viewerAddress || !watermarkCode) {
          return errorResponse('Missing required fields: imageBase64, viewerAddress, watermarkCode')
        }

        if (!env.IMAGES) {
          return errorResponse('Images binding not configured', 500)
        }

        console.log(`[Watermark] Processing for ${viewerAddress}, code=${watermarkCode}`)

        // Decode input image
        const imageBytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0))

        // Format viewer label
        const viewerLabel = formatViewerLabel(heavenName || null, viewerAddress)
        const formattedCode = formatWatermarkCode(watermarkCode)

        // Start with resize transform
        let transformChain = env.IMAGES.input(imageBytes.buffer as ArrayBuffer).transform({
          width: outputWidth,
          height: outputHeight,
          fit: 'cover',
        })

        // Layer 1: Full diagonal overlay (primary watermark)
        if (layers.includes('overlay')) {
          console.log('[Watermark] Generating overlay layer...')
          const overlayPng = await generateFullOverlay(viewerLabel, formattedCode, outputWidth, outputHeight)
          const overlayBuffer = u8ToArrayBuffer(overlayPng)
          const overlayInput = env.IMAGES.input(overlayBuffer)
          transformChain = transformChain.draw(overlayInput, {
            left: 0,
            top: 0,
            opacity: 1.0, // PNG has its own alpha
          })
        }

        // Layer 2: Tiled microtext (faint background pattern)
        if (layers.includes('tiled')) {
          console.log('[Watermark] Generating tiled layer...')
          const tiledPng = await generateTiledMicrotext(viewerLabel, formattedCode, outputWidth, outputHeight)
          const tiledBuffer = u8ToArrayBuffer(tiledPng)
          const tiledInput = env.IMAGES.input(tiledBuffer)
          transformChain = transformChain.draw(tiledInput, {
            left: 0,
            top: 0,
            opacity: 1.0,
          })
        }

        // Layer 3: Corner stamp (attribution box)
        if (layers.includes('corner')) {
          console.log('[Watermark] Generating corner stamp...')
          const stampPng = await generateCornerStamp(
            viewerLabel,
            formattedCode,
            new Date().toISOString().split('T')[0]
          )
          const stampBuffer = u8ToArrayBuffer(stampPng)
          const stampInput = env.IMAGES.input(stampBuffer)
          // Position in bottom-right corner with padding
          transformChain = transformChain.draw(stampInput, {
            left: outputWidth - 240 - 10, // stamp width + padding
            top: outputHeight - 78 - 10, // stamp height + padding
            opacity: 1.0,
          })
        }

        // Output as WebP
        const outputResult = await transformChain.output({ format: 'image/webp', quality: 85 })
        const resp = outputResult.response()
        const watermarkedBuffer = await resp.arrayBuffer()

        // Convert to base64
        const watermarkedBytes = new Uint8Array(watermarkedBuffer)
        let binary = ''
        for (let i = 0; i < watermarkedBytes.length; i++) {
          binary += String.fromCharCode(watermarkedBytes[i])
        }
        const watermarkedBase64 = btoa(binary)

        console.log(`[Watermark] Complete: ${watermarkedBuffer.byteLength} bytes`)

        const response: WatermarkResponse = {
          success: true,
          imageBase64: watermarkedBase64,
          contentType: 'image/webp',
          viewerLabel,
          watermarkCode: formattedCode,
        }

        return jsonResponse(response)
      } catch (err) {
        console.error('[Watermark] Error:', err)
        return errorResponse(err instanceof Error ? err.message : 'Watermark failed', 500)
      }
    }

    // ════════════════════════════════════════════════════════════════
    // GET /debug/overlay - Test watermark overlay generation
    // ════════════════════════════════════════════════════════════════
    if (request.method === 'GET' && url.pathname === '/debug/overlay') {
      try {
        const viewer = url.searchParams.get('viewer') || '@alice.heaven'
        const code = url.searchParams.get('code') || 'ABC12XYZ'

        const overlayPng = await generateFullOverlay(viewer, code)
        const buffer = u8ToArrayBuffer(overlayPng)

        return new Response(buffer, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store',
            ...CORS_HEADERS,
          },
        })
      } catch (err) {
        console.error('[DebugOverlay] Error:', err)
        return errorResponse(String(err), 500)
      }
    }

    // ════════════════════════════════════════════════════════════════
    // GET /debug/stamp - Test corner stamp generation
    // ════════════════════════════════════════════════════════════════
    if (request.method === 'GET' && url.pathname === '/debug/stamp') {
      try {
        const viewer = url.searchParams.get('viewer') || '@alice.heaven'
        const code = url.searchParams.get('code') || 'ABC12XYZ'

        const stampPng = await generateCornerStamp(viewer, code)
        const buffer = u8ToArrayBuffer(stampPng)

        return new Response(buffer, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store',
            ...CORS_HEADERS,
          },
        })
      } catch (err) {
        console.error('[DebugStamp] Error:', err)
        return errorResponse(String(err), 500)
      }
    }

    // Health check
    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ status: 'ok' })
    }

    return errorResponse('Not found', 404)
  },
}
