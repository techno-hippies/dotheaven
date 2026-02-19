/**
 * Meal API
 *
 * Endpoints:
 * - POST /analyze - Upload photo, AI analysis, IPFS pin, EAS attestation
 * - GET /history - Get user's meal history
 *
 * Flow:
 * 1. Android app captures meal photo
 * 2. Photo saved locally, WorkManager syncs when online
 * 3. Worker receives photo via multipart upload
 * 4. Worker pins photo to Filebase IPFS (heaven-food bucket)
 * 5. Worker calls OpenRouter with glm-4.6v for AI analysis
 * 6. Worker pins analysis JSON to IPFS
 * 7. Worker creates EAS attestation
 * 8. Returns CIDs + analysis + attestation UID
 */

import { Hono } from 'hono'
import type { Env } from '../types'
import { createMealAttestation, createMealCaloriesAttestation, MEAL_PHOTO_SCHEMA } from '../lib/eas'

const app = new Hono<{ Bindings: Env }>()

// ============================================================================
// AWS Signature V4 helpers for Filebase S3 API (same as scrobble.ts)
// ============================================================================

async function sha256Hex(message: string | ArrayBuffer): Promise<string> {
  const data = typeof message === 'string' ? new TextEncoder().encode(message) : message
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Bytes(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256(key: ArrayBuffer | string, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? encoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

async function hmacHex(key: ArrayBuffer | string, message: string): Promise<string> {
  const sig = await hmacSha256(key, message)
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256('AWS4' + secretKey, dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  return hmacSha256(kService, 'aws4_request')
}

/**
 * Pin binary to Filebase IPFS via S3 PUT
 * Returns the CID from the x-amz-meta-cid header
 */
async function pinBinaryToFilebase(
  accessKey: string,
  secretKey: string,
  bucket: string,
  data: ArrayBuffer,
  fileName: string,
  contentType: string
): Promise<string> {
  const endpoint = 's3.filebase.com'
  const region = 'us-east-1'
  const service = 's3'

  const date = new Date()
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  const canonicalUri = `/${bucket}/${fileName}`
  const payloadHash = await sha256Bytes(data)

  const canonicalHeaders =
    [`host:${endpoint}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`].join('\n') + '\n'
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')

  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [algorithm, amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n')

  const signingKey = await getSigningKey(secretKey, dateStamp, region, service)
  const signature = await hmacHex(signingKey, stringToSign)

  const authHeader = [
    `${algorithm} Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ')

  const response = await fetch(`https://${endpoint}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Content-Type': contentType,
    },
    body: data,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Filebase upload failed: ${response.status} ${text}`)
  }

  const cid = response.headers.get('x-amz-meta-cid')
  if (!cid) {
    throw new Error('No CID returned from Filebase')
  }

  return cid
}

/**
 * Pin JSON to Filebase IPFS
 */
async function pinJsonToFilebase(
  accessKey: string,
  secretKey: string,
  bucket: string,
  json: string,
  fileName: string
): Promise<string> {
  const encoder = new TextEncoder()
  return pinBinaryToFilebase(accessKey, secretKey, bucket, encoder.encode(json).buffer, fileName, 'application/json')
}

// ============================================================================
// Types
// ============================================================================

interface FoodItem {
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

interface MealAnalysisResult {
  rejected?: boolean
  reason?: 'face_detected' | 'pii_detected'
  description: string  // e.g., "Burger, fries, Coke"
  items: FoodItem[]
  totals: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
}

interface MealAnalyzeResponse {
  success: boolean
  rejected?: boolean
  reason?: string
  photoCid?: string
  animeCid?: string
  analysisCid?: string
  description?: string
  items?: FoodItem[]
  totals?: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
  attestationUid?: string
  txHash?: string
  error?: string
}

// ============================================================================
// Auth middleware (same pattern as scrobble.ts)
// ============================================================================

const mealAuthMiddleware = async (c: any, next: any) => {
  // Dev mode: allow X-User-Address header for testing
  if (c.env.ENVIRONMENT === 'development') {
    const devAddress = c.req.header('X-User-Address')
    if (devAddress) {
      c.set('userAddress' as never, devAddress.toLowerCase())
      return next()
    }
  }

  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'User not authenticated' }, 401)
  }

  const token = authHeader.slice(7)
  try {
    if (c.env.ENVIRONMENT === 'development') {
      const parts = token.split('.')
      if (parts.length !== 3) throw new Error('Invalid token format')
      const payload = JSON.parse(atob(parts[1])) as { address: string }
      if (!payload.address) throw new Error('Missing address in token')
      c.set('userAddress' as never, payload.address.toLowerCase())
    } else {
      return c.json({ success: false, error: 'Production auth not implemented' }, 501)
    }
  } catch (err) {
    console.error('[JWT Error]', err)
    return c.json({ success: false, error: 'Invalid token' }, 401)
  }

  return next()
}

app.use('/analyze', mealAuthMiddleware)
app.use('/anime', mealAuthMiddleware)

// ============================================================================
// DeepInfra Speech-to-Text
// ============================================================================

const DEEPINFRA_STT_URL = 'https://api.deepinfra.com/v1/inference/mistralai/Voxtral-Small-24B-2507'

interface DeepInfraSTTResponse {
  text: string
  segments?: Array<{ id: number; start: number; end: number; text: string }>
  language?: string
}

/**
 * Transcribe audio using DeepInfra Voxtral
 */
async function transcribeAudio(
  apiKey: string,
  audioFile: File
): Promise<string> {
  const formData = new FormData()
  // Pass the File object directly - preserves name and type from the upload
  formData.append('audio', audioFile)

  const response = await fetch(DEEPINFRA_STT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[DeepInfra STT] API error:', response.status, errorText)
    throw new Error(`STT failed: ${response.status} - ${errorText}`)
  }

  const result = await response.json() as DeepInfraSTTResponse
  const transcript = result.text?.trim()
  if (!transcript) {
    throw new Error('No transcript returned from STT')
  }

  console.log(`[DeepInfra STT] Transcript: "${transcript}"`)
  return transcript
}

// ============================================================================
// OpenRouter AI Analysis
// ============================================================================

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Example JSON structure for the AI prompt
const EXAMPLE_ANALYSIS = {
  description: "Oat latte with almond milk",
  items: [
    { name: "Oat latte with almond milk (16oz)", calories: 180, protein_g: 3, carbs_g: 28, fat_g: 6 }
  ],
  totals: { calories: 180, protein_g: 3, carbs_g: 28, fat_g: 6 }
}

async function analyzeWithOpenRouter(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  transcript: string | null
): Promise<MealAnalysisResult> {
  const safetyBlock = `SAFETY CHECK (do this FIRST):
Look for ANY of the following in the image:
- Human faces (even partial, blurry, or in background)
- Human body parts: hands, fingers, arms, skin, legs, feet
- Identifiable text showing personal info (names, addresses, license plates, ID cards, credit cards)
- Computer/phone screens showing personal information
- Any other personally identifiable information (PII)

The image should contain ONLY food, plates, bowls, utensils, napkins, table surfaces, and beverages. Nothing else.

If ANY body parts are detected (face, hands, fingers, arms, etc.), return ONLY:
{"rejected": true, "reason": "face_detected"}

If ANY PII/personal text is detected, return ONLY:
{"rejected": true, "reason": "pii_detected"}`

  const analysisBlock = transcript
    ? `If the image is safe (food only, no faces or PII), analyze the food.

The user described this meal in their own words: "${transcript}"

CRITICAL RULES:
- ONLY include food items the user explicitly mentioned. Do NOT add items you see in the photo that the user didn't mention.
- If the user said "yogurt with oatmeal", do NOT add a coffee just because you see a mug in the photo.
- The user's voice description is the SOLE source of truth for WHAT they are logging. The photo is ONLY used to estimate portion sizes of the items they mentioned.

Return:
- "description": A SHORT, concise label for the meal (2-6 words, like a menu item). Based ONLY on what the user said. Examples: "Yogurt with oatmeal", "Oat latte with almond milk", "Chicken Caesar salad".
- "items": An array of ONLY the food items the user mentioned, each with name, calories, protein_g, carbs_g, fat_g
- "totals": Sum of all items' macros`
    : `If the image is safe (food only, no faces or PII), analyze the food and return:
- "description": A brief description of the meal (e.g., "Burger with fries and Coke")
- "items": An array of individual food items, each with name, calories, protein_g, carbs_g, fat_g
- "totals": Sum of all items' macros`

  const systemPrompt = `You are a nutrition analyst with a safety-first approach. First check for privacy issues, then analyze the food.

${safetyBlock}

${analysisBlock}

Example food analysis output:
${JSON.stringify(EXAMPLE_ANALYSIS, null, 2)}

IMPORTANT:
- Return ONLY valid JSON, no markdown or explanation
- REJECT if there are ANY faces or PII - err on the side of caution
- List each food item separately (e.g., burger and fries are separate items)
- Estimate reasonable portion sizes based on the image
- Use integer values for all numbers`

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://heaven.computer',
      'X-Title': 'Heaven Meal Tracker'
    },
    body: JSON.stringify({
      model: 'bytedance-seed/seed-1.6-flash',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: systemPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      temperature: 0.3,  // Lower for more consistent output
      max_tokens: 1000
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[OpenRouter] API error:', response.status, errorText)
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`)
  }

  const result = await response.json() as {
    choices: Array<{ message: { content: string } }>
  }

  const content = result.choices[0]?.message?.content
  if (!content) {
    throw new Error('No content in OpenRouter response')
  }

  // Parse JSON from response (handle potential markdown wrapping)
  let jsonStr = content.trim()
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7)
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3)
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3)
  }
  jsonStr = jsonStr.trim()

  try {
    const parsed = JSON.parse(jsonStr) as MealAnalysisResult

    // Check if rejected (face/PII detected)
    if (parsed.rejected) {
      return parsed
    }

    // Validate food analysis structure
    if (!parsed.description || !Array.isArray(parsed.items) || !parsed.totals) {
      throw new Error('Invalid response structure')
    }

    return parsed
  } catch (err) {
    console.error('[OpenRouter] Failed to parse response:', content)
    throw new Error('Failed to parse AI response as JSON')
  }
}

// ============================================================================
// POST /analyze - Upload photo and analyze
// ============================================================================

app.post('/analyze', async (c) => {
  const userAddress = c.get('userAddress' as never) as string
  if (!userAddress) {
    return c.json({ success: false, error: 'User not authenticated' } as MealAnalyzeResponse, 401)
  }

  // Check required env vars
  const { FILEBASE_FOOD_ACCESS_KEY, FILEBASE_FOOD_SECRET_KEY, FILEBASE_FOOD_BUCKET, OPENROUTER_API_KEY, DEEPINFRA_API_KEY } = c.env as Env & {
    FILEBASE_FOOD_ACCESS_KEY?: string
    FILEBASE_FOOD_SECRET_KEY?: string
    FILEBASE_FOOD_BUCKET?: string
    OPENROUTER_API_KEY?: string
    DEEPINFRA_API_KEY?: string
  }

  if (!FILEBASE_FOOD_ACCESS_KEY || !FILEBASE_FOOD_SECRET_KEY || !FILEBASE_FOOD_BUCKET) {
    console.error('[Meal] Missing Filebase food credentials')
    return c.json({ success: false, error: 'Server misconfiguration (Filebase)' } as MealAnalyzeResponse, 500)
  }

  if (!OPENROUTER_API_KEY) {
    console.error('[Meal] Missing OpenRouter API key')
    return c.json({ success: false, error: 'Server misconfiguration (OpenRouter)' } as MealAnalyzeResponse, 500)
  }

  // Parse multipart form
  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch (err) {
    console.error('[Meal] Failed to parse form data:', err)
    return c.json({ success: false, error: 'Invalid multipart form data' } as MealAnalyzeResponse, 400)
  }

  const photoFile = formData.get('photo') as File | null
  const audioFile = formData.get('audio') as File | null
  const capturedAtStr = formData.get('capturedAt') as string | null

  if (!photoFile) {
    return c.json({ success: false, error: 'Missing photo file' } as MealAnalyzeResponse, 400)
  }

  const capturedAt = capturedAtStr ? parseInt(capturedAtStr, 10) : Math.floor(Date.now() / 1000)

  // Transcribe audio if provided
  let transcript: string | null = null
  if (audioFile && DEEPINFRA_API_KEY) {
    try {
      console.log(`[Meal] Transcribing audio: name=${audioFile.name}, size=${audioFile.size}, type=${audioFile.type}`)
      transcript = await transcribeAudio(DEEPINFRA_API_KEY, audioFile)
      console.log(`[Meal] STT success: "${transcript}"`)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[Meal] STT error:', errMsg)
      return c.json({ success: false, error: `Voice transcription failed: ${errMsg}` } as MealAnalyzeResponse, 500)
    }
  } else if (audioFile && !DEEPINFRA_API_KEY) {
    console.warn('[Meal] Audio provided but DEEPINFRA_API_KEY not configured')
    return c.json({ success: false, error: 'Voice memo not supported (missing API key)' } as MealAnalyzeResponse, 500)
  } else {
    console.log(`[Meal] No audio file in request (audioFile=${!!audioFile})`)
  }

  // Validate file type
  const mimeType = photoFile.type
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    return c.json({ success: false, error: 'Invalid image type (must be JPEG, PNG, or WebP)' } as MealAnalyzeResponse, 400)
  }

  // Validate file size (max 10MB)
  if (photoFile.size > 10 * 1024 * 1024) {
    return c.json({ success: false, error: 'Image too large (max 10MB)' } as MealAnalyzeResponse, 400)
  }

  const now = Math.floor(Date.now() / 1000)
  const userPrefix = userAddress.slice(2, 10)

  // Read and resize photo (max 512px square, saves storage + API costs)
  const rawBytes = await photoFile.arrayBuffer()
  let photoBytes: ArrayBuffer
  let finalMimeType = 'image/webp'

  try {
    const resized = await c.env.IMAGES
      .input(rawBytes)
      .transform({ width: 512, height: 512, fit: 'cover' })
      .output({ format: 'image/webp', quality: 85 })

    const resizedResponse = resized.response()
    photoBytes = await resizedResponse.arrayBuffer()
    console.log(`[Meal] Resized photo: ${rawBytes.byteLength} -> ${photoBytes.byteLength} bytes`)
  } catch (err) {
    console.error('[Meal] Resize failed, using original:', err)
    photoBytes = rawBytes
    finalMimeType = mimeType
  }

  // 1. Upload photo to Filebase IPFS
  let photoCid: string
  try {
    const photoFileName = `meal-${userPrefix}-${capturedAt}.webp`
    photoCid = await pinBinaryToFilebase(
      FILEBASE_FOOD_ACCESS_KEY,
      FILEBASE_FOOD_SECRET_KEY,
      FILEBASE_FOOD_BUCKET,
      photoBytes,
      photoFileName,
      finalMimeType
    )
    console.log(`[Meal] Photo pinned: ${photoCid}`)
  } catch (err) {
    console.error('[Meal] Filebase photo upload error:', err)
    return c.json({ success: false, error: 'Failed to upload photo to IPFS' } as MealAnalyzeResponse, 500)
  }

  // 2. AI analysis with OpenRouter (includes face/PII check)
  console.log(`[Meal] Calling OpenRouter with transcript=${transcript ? `"${transcript}"` : 'null'}`)
  let analysis: MealAnalysisResult
  try {
    // Convert to base64 for OpenRouter (chunked to avoid stack overflow)
    const bytes = new Uint8Array(photoBytes)
    let base64 = ''
    const chunkSize = 32768
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
      base64 += String.fromCharCode.apply(null, chunk as unknown as number[])
    }
    base64 = btoa(base64)
    analysis = await analyzeWithOpenRouter(OPENROUTER_API_KEY, base64, finalMimeType, transcript)

    // Check if rejected for face/PII
    if (analysis.rejected) {
      console.log(`[Meal] REJECTED: ${analysis.reason}`)
      return c.json({
        success: false,
        rejected: true,
        reason: analysis.reason,
        error: analysis.reason === 'face_detected'
          ? 'Photo contains body parts (face/hands) - retake with only food and plateware visible'
          : 'Photo contains personal information - retake with only food and plateware visible'
      } as MealAnalyzeResponse, 400)
    }

    console.log(`[Meal] Analysis complete: ${analysis.description} (${analysis.items.length} items)`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[Meal] OpenRouter analysis error:', errMsg)
    return c.json({
      success: false,
      photoCid,  // Return photo CID even if analysis fails
      error: `AI analysis failed: ${errMsg}`
    } as MealAnalyzeResponse, 500)
  }

  // 3. Pin analysis JSON to IPFS
  let analysisCid: string
  try {
    const analysisData = {
      version: 3,
      user: userAddress,
      photoCid,
      capturedAt,
      analyzedAt: now,
      transcript: transcript || undefined,
      ...analysis
    }
    const analysisJson = JSON.stringify(analysisData)
    const analysisFileName = `meal-analysis-${userPrefix}-${capturedAt}.json`
    analysisCid = await pinJsonToFilebase(
      FILEBASE_FOOD_ACCESS_KEY,
      FILEBASE_FOOD_SECRET_KEY,
      FILEBASE_FOOD_BUCKET,
      analysisJson,
      analysisFileName
    )
    console.log(`[Meal] Analysis pinned: ${analysisCid}`)
  } catch (err) {
    console.error('[Meal] Filebase analysis upload error:', err)
    // Non-fatal, continue without analysis CID
    analysisCid = ''
  }

  // 4. Store in D1 (optional, for history)
  try {
    await c.env.DB.prepare(`
      INSERT INTO meal_photos (user_address, photo_cid, analysis_cid, description,
        total_calories, total_protein, total_carbs, total_fat, captured_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userAddress,
      photoCid,
      analysisCid || null,
      analysis.description,
      analysis.totals.calories,
      analysis.totals.protein_g,
      analysis.totals.carbs_g,
      analysis.totals.fat_g,
      capturedAt,
      now
    ).run()
  } catch (err) {
    console.error('[Meal] D1 error (non-fatal):', err)
  }

  // 5. Create EAS attestation (if configured)
  let attestationUid: string | undefined
  let txHash: string | undefined

  const { BASE_SEPOLIA_RELAY_PK, BASE_SEPOLIA_RPC } = c.env
  if (BASE_SEPOLIA_RELAY_PK && BASE_SEPOLIA_RPC) {
    try {
      // 1. Base attestation: MealPhotoV1 (capturedTs, source=0 phone, photoCid)
      const result = await createMealAttestation(
        BASE_SEPOLIA_RELAY_PK,
        BASE_SEPOLIA_RPC,
        userAddress,
        capturedAt,
        0, // source: Phone
        photoCid
      )
      attestationUid = result.uid
      txHash = result.txHash
      console.log(`[Meal] MealPhotoV1 attestation: ${attestationUid}`)

      // 2. Extension attestation: MealCaloriesV1 (references base via refUID)
      const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000'
      if (attestationUid && attestationUid !== zeroHash && analysis.totals && analysisCid) {
        try {
          const calResult = await createMealCaloriesAttestation(
            BASE_SEPOLIA_RELAY_PK,
            BASE_SEPOLIA_RPC,
            userAddress,
            attestationUid,
            analysis.totals.calories || 0,
            analysis.totals.protein_g || 0,
            analysis.totals.carbs_g || 0,
            analysis.totals.fat_g || 0,
            8000, // 80% confidence (basis points)
            analysisCid
          )
          console.log(`[Meal] MealCaloriesV1 extension: ${calResult.uid}`)
        } catch (extErr) {
          console.error('[Meal] MealCaloriesV1 extension error (non-fatal):', extErr)
        }
      }

      // Update D1 with attestation UID
      try {
        await c.env.DB.prepare(`
          UPDATE meal_photos SET attestation_uid = ?, tx_hash = ? WHERE photo_cid = ?
        `).bind(attestationUid, txHash, photoCid).run()
      } catch (dbErr) {
        console.error('[Meal] D1 attestation update error (non-fatal):', dbErr)
      }
    } catch (err) {
      console.error('[Meal] EAS attestation error (non-fatal):', err)
    }
  } else {
    console.warn('[Meal] EAS disabled: missing relay credentials')
  }

  return c.json({
    success: true,
    photoCid,
    analysisCid: analysisCid || undefined,
    description: analysis.description,
    items: analysis.items,
    totals: analysis.totals,
    attestationUid,
    txHash
  } as MealAnalyzeResponse)
})

// ============================================================================
// GET /history - Get user's meal history
// ============================================================================

app.get('/history', async (c) => {
  // Dev mode auth
  let userAddress: string | undefined
  if (c.env.ENVIRONMENT === 'development') {
    userAddress = c.req.header('X-User-Address')?.toLowerCase()
  }

  if (!userAddress) {
    return c.json({ error: 'User not authenticated' }, 401)
  }

  const rows = await c.env.DB.prepare(`
    SELECT photo_cid, analysis_cid, description, total_calories, total_protein,
           total_carbs, total_fat, captured_at, attestation_uid
    FROM meal_photos
    WHERE user_address = ?
    ORDER BY captured_at DESC
    LIMIT 100
  `).bind(userAddress).all()

  const meals = (rows.results ?? []).map((row: Record<string, unknown>) => ({
    photoCid: row.photo_cid,
    analysisCid: row.analysis_cid,
    description: row.description,
    calories: row.total_calories,
    protein: row.total_protein,
    carbs: row.total_carbs,
    fat: row.total_fat,
    capturedAt: row.captured_at,
    attestationUid: row.attestation_uid
  }))

  return c.json({ meals })
})

// ============================================================================
// POST /anime - Convert a meal photo to anime style (separate from analysis)
// ============================================================================

app.post('/anime', async (c) => {
  const userAddress = c.get('userAddress' as never) as string
  if (!userAddress) {
    return c.json({ success: false, error: 'User not authenticated' }, 401)
  }

  const FAL_KEY = (c.env as Env & { FAL_KEY?: string }).FAL_KEY
  if (!FAL_KEY) {
    return c.json({ success: false, error: 'Anime conversion not configured' }, 500)
  }

  const { FILEBASE_FOOD_ACCESS_KEY, FILEBASE_FOOD_SECRET_KEY, FILEBASE_FOOD_BUCKET } = c.env as Env & {
    FILEBASE_FOOD_ACCESS_KEY?: string
    FILEBASE_FOOD_SECRET_KEY?: string
    FILEBASE_FOOD_BUCKET?: string
  }

  if (!FILEBASE_FOOD_ACCESS_KEY || !FILEBASE_FOOD_SECRET_KEY || !FILEBASE_FOOD_BUCKET) {
    return c.json({ success: false, error: 'Server misconfiguration (Filebase)' }, 500)
  }

  // Expect JSON body with photoCid
  const body = await c.req.json<{ photoCid: string }>()
  if (!body.photoCid) {
    return c.json({ success: false, error: 'Missing photoCid' }, 400)
  }

  const photoCid = body.photoCid

  // Fetch photo from IPFS gateway
  console.log(`[Meal/Anime] Fetching photo: ${photoCid}`)
  const photoResponse = await fetch(`https://ipfs.filebase.io/ipfs/${photoCid}`)
  if (!photoResponse.ok) {
    return c.json({ success: false, error: `Failed to fetch photo from IPFS: ${photoResponse.status}` }, 500)
  }

  const photoBytes = await photoResponse.arrayBuffer()
  const contentType = photoResponse.headers.get('content-type') || 'image/webp'

  // Build base64 data URI
  const b = new Uint8Array(photoBytes)
  let s = ''
  const cs = 32768
  for (let i = 0; i < b.length; i += cs) {
    const chunk = b.subarray(i, Math.min(i + cs, b.length))
    s += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  const imageDataUri = `data:${contentType};base64,${btoa(s)}`

  // Call fal.ai FLUX.2 edit
  console.log('[Meal/Anime] Calling fal.ai FLUX.2 edit...')
  const falResponse = await fetch('https://fal.run/fal-ai/flux-2/edit', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: 'Convert this photo to anime in the style of Studio Ghibli. Maintain all details, composition, and colors faithfully.',
      image_urls: [imageDataUri],
      image_size: { width: 512, height: 512 },
      num_images: 1,
      guidance_scale: 7.0,
      num_inference_steps: 28,
      enable_safety_checker: false,
      output_format: 'webp',
    }),
  })

  if (!falResponse.ok) {
    const errText = await falResponse.text()
    console.error(`[Meal/Anime] fal.ai error: ${errText.slice(0, 200)}`)
    return c.json({ success: false, error: `Anime conversion failed: ${falResponse.status}` }, 500)
  }

  const falResult = await falResponse.json() as { images: Array<{ url: string }> }

  if (!falResult?.images || falResult.images.length === 0) {
    return c.json({ success: false, error: 'No images returned from conversion' }, 500)
  }

  // Download the anime image
  const animeResponse = await fetch(falResult.images[0].url)
  if (!animeResponse.ok) {
    return c.json({ success: false, error: `Failed to download anime result: ${animeResponse.status}` }, 500)
  }
  const animeBytes = await animeResponse.arrayBuffer()

  // Pin anime version to IPFS
  const userPrefix = userAddress.slice(2, 10)
  const now = Math.floor(Date.now() / 1000)
  const animeFileName = `meal-anime-${userPrefix}-${now}.webp`
  const animeCid = await pinBinaryToFilebase(
    FILEBASE_FOOD_ACCESS_KEY,
    FILEBASE_FOOD_SECRET_KEY,
    FILEBASE_FOOD_BUCKET,
    animeBytes,
    animeFileName,
    'image/webp'
  )
  console.log(`[Meal/Anime] Pinned: ${animeCid}`)

  return c.json({ success: true, animeCid })
})

export default app
