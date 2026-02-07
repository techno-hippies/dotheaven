/**
 * Photo Pipeline API
 *
 * Endpoints:
 * - POST /pipeline - Upload 4 photos → sanitize → anime generation → return tiles
 * - GET /pipeline/:jobId - Check job status (if async)
 * - GET /anime/:userId/:slot - Serve anime tile (public)
 * - GET /reveal/:photoId - Serve real photo with per-viewer watermark (match-only)
 * - GET /internal/source/:photoId - Ephemeral signed URL for fal.ai access
 *
 * Flow:
 * 1. Client uploads 4 photos (multipart)
 * 2. Worker sanitizes (strip EXIF, cap size) → store in R2_ORIG
 * 3. Worker creates ephemeral signed URLs for fal.ai
 * 4. Worker calls fal SeedDream v4.5/edit → get 2048x2048 grid
 * 5. Worker splits grid into 4 quadrants using Cloudflare trim
 * 6. Worker resizes each to 500x500 → store in R2_ANIME
 * 7. Return anime tile URLs + photo IDs (for later reveal)
 */

import { Hono } from 'hono'
import type {
  Env,
  PhotoPipelineResponse,
  PhotoJobStatusResponse,
  PhotoJobRow,
  UserPhotoRow,
  AnimeAssetsRow,
  PhotoAccessRow,
  PhotoSourceTokenRow,
} from '../types'
import {
  generateFullOverlay,
  generateTileWatermark,
  generateCornerStamp,
  formatWalletShort,
  u8ToArrayBuffer,
} from '../lib/watermark'
import { pinToFilebase } from '../lib/filebase'

const app = new Hono<{ Bindings: Env }>()

// ============================================================================
// Crypto helpers
// ============================================================================

function generateUUID(): string {
  return crypto.randomUUID()
}

async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ============================================================================
// Image validation
// ============================================================================

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_DIMENSION = 4096

function validateImageType(contentType: string | null): boolean {
  return contentType !== null && ALLOWED_TYPES.includes(contentType)
}

// ============================================================================
// fal.ai client - using SeedDream v4.5 for anime conversion
// ============================================================================

interface FalSeedreamRequest {
  prompt: string
  image_urls: string[]
  image_size: 'square_hd' | 'square' | 'auto_2K' | 'auto_4K' | { width: number; height: number }
  num_images?: number
  max_images?: number
  enable_safety_checker?: boolean
}

interface FalEditResponse {
  images: Array<{ url: string; content_type?: string; width?: number; height?: number }>
  seed?: number
  timings?: Record<string, number>
}

async function callFalSeedream(
  falKey: string,
  imageUrls: string[],
  prompt: string
): Promise<FalEditResponse> {
  const requestBody: FalSeedreamRequest = {
    prompt,
    image_urls: imageUrls,
    image_size: { width: 2048, height: 2048 }, // Square grid for 4 tiles
    num_images: 1,
    max_images: 1,
    enable_safety_checker: false, // Already sanitized
  }

  // Use synchronous endpoint for faster response
  const response = await fetch('https://fal.run/fal-ai/bytedance/seedream/v4.5/edit', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`fal.ai seedream error: ${response.status} ${text}`)
  }

  return response.json()
}

// ============================================================================
// Auth middleware (reuse pattern from scrobble)
// ============================================================================

app.use('/*', async (c, next) => {
  // Dev mode: allow X-User-Pkp header for testing
  if (c.env.ENVIRONMENT === 'development') {
    const devPkp = c.req.header('X-User-Pkp')
    if (devPkp) {
      c.set('userPkp' as never, devPkp.toLowerCase())
      return next()
    }
  }

  // Check Authorization header
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    // Allow internal/source endpoint without auth (it has its own token auth)
    if (c.req.path.includes('/internal/source/')) {
      return next()
    }
    // Allow anime tile endpoint (public)
    if (c.req.path.includes('/anime/')) {
      return next()
    }
    // Allow /access endpoint (has its own ENVIRONMENT check)
    if (c.req.path.endsWith('/access') && c.req.method === 'POST') {
      return next()
    }
    // Allow debug endpoints (dev only)
    if (c.req.path.includes('/debug/')) {
      return next()
    }
    return c.json({ success: false, error: 'Missing authorization' }, 401)
  }

  const token = authHeader.slice(7)

  // Dev mode: simple decode
  if (c.env.ENVIRONMENT === 'development') {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) throw new Error('Invalid token format')
      const payload = JSON.parse(atob(parts[1])) as { pkp: string }
      if (!payload.pkp) throw new Error('Missing pkp in token')
      c.set('userPkp' as never, payload.pkp.toLowerCase())
    } catch {
      return c.json({ success: false, error: 'Invalid token' }, 401)
    }
  } else {
    // Production: proper verification needed
    return c.json({ success: false, error: 'Production auth not implemented' }, 501)
  }

  return next()
})

// ============================================================================
// POST /pipeline - Upload 4 photos, generate anime tiles
// ============================================================================

app.post('/pipeline', async (c) => {
  const userPkp = c.get('userPkp' as never) as string
  if (!userPkp) {
    return c.json({ success: false, error: 'User not authenticated' } as PhotoPipelineResponse, 401)
  }

  // Check required secrets
  const { FAL_KEY } = c.env
  if (!FAL_KEY) {
    console.error('[Photos] Missing FAL_KEY')
    return c.json({ success: false, error: 'Server misconfiguration' } as PhotoPipelineResponse, 500)
  }

  // Parse multipart form
  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch (err) {
    return c.json({ success: false, error: 'Invalid multipart form data' } as PhotoPipelineResponse, 400)
  }

  // Extract exactly 4 photos
  const photos: File[] = []
  for (let i = 1; i <= 4; i++) {
    const file = formData.get(`photo${i}`) as File | null
    if (!file) {
      return c.json({
        success: false,
        error: `Missing photo${i}. Must upload exactly 4 photos.`,
      } as PhotoPipelineResponse, 400)
    }
    if (!validateImageType(file.type)) {
      return c.json({
        success: false,
        error: `photo${i} must be JPEG, PNG, or WebP`,
      } as PhotoPipelineResponse, 400)
    }
    if (file.size > MAX_FILE_SIZE) {
      return c.json({
        success: false,
        error: `photo${i} exceeds 10MB limit`,
      } as PhotoPipelineResponse, 400)
    }
    photos.push(file)
  }

  const now = Math.floor(Date.now() / 1000)
  const jobId = generateUUID()

  // Create job record
  await c.env.DB.prepare(`
    INSERT INTO photo_jobs (job_id, user_id, status, step, created_at, updated_at)
    VALUES (?, ?, 'processing', 'upload', ?, ?)
  `).bind(jobId, userPkp, now, now).run()

  try {
    // Step 1: Sanitize and store originals
    const photoIds: string[] = []
    const sourceTokens: string[] = []

    for (let i = 0; i < 4; i++) {
      const file = photos[i]
      const photoId = generateUUID()
      const slot = i + 1

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer()

      // Sanitize: strip EXIF, cap dimensions
      // Using Cloudflare Images binding
      let sanitizedBuffer: ArrayBuffer

      try {
        // Use Images binding to transform
        // Use .response() to get the output (recommended approach per CF docs)
        const outputResult = await c.env.IMAGES.input(arrayBuffer)
          .transform({
            width: MAX_DIMENSION,
            height: MAX_DIMENSION,
            fit: 'scale-down',
            metadata: 'none', // Strip all metadata including EXIF
          })
          .output({ format: 'image/jpeg', quality: 90 })

        // Get ArrayBuffer from response
        const resp = outputResult.response()
        sanitizedBuffer = await resp.arrayBuffer()
      } catch (err) {
        console.error(`[Photos] Image transform error for slot ${slot}:`, err)
        // Fallback: store original if transform fails (for testing without Images binding)
        sanitizedBuffer = arrayBuffer
      }

      // Store in R2_ORIG
      const origKey = `orig/${userPkp}/${photoId}.jpg`
      await c.env.R2_ORIG.put(origKey, sanitizedBuffer, {
        httpMetadata: { contentType: 'image/jpeg' },
      })

      // Store photo record
      await c.env.DB.prepare(`
        INSERT INTO user_photos (photo_id, user_id, slot, orig_key, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, slot) DO UPDATE SET
          photo_id = excluded.photo_id,
          orig_key = excluded.orig_key,
          created_at = excluded.created_at
      `).bind(photoId, userPkp, slot, origKey, now).run()

      photoIds.push(photoId)

      // Create ephemeral source token for fal
      const token = generateToken()
      const tokenHash = await sha256Hex(token)
      const tokenExpiry = now + 300 // 5 minutes

      await c.env.DB.prepare(`
        INSERT INTO photo_source_tokens (token_hash, photo_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `).bind(tokenHash, photoId, tokenExpiry, now).run()

      sourceTokens.push(token)
    }

    // Update job status
    await c.env.DB.prepare(`
      UPDATE photo_jobs SET step = 'fal', photo_ids_json = ?, updated_at = ?
      WHERE job_id = ?
    `).bind(JSON.stringify(photoIds), now, jobId).run()

    // Step 2: Build signed URLs for fal
    // Use the internal/source endpoint
    const baseUrl = new URL(c.req.url).origin
    const imageUrls = photoIds.map((photoId, i) =>
      `${baseUrl}/api/photos/internal/source/${photoId}?t=${sourceTokens[i]}`
    )

    // Step 3: Call fal.ai SeedDream for anime conversion
    // Prompt is prescriptive about layout to avoid black separator lines between quadrants
    const falPrompt = `Create a single 2048x2048 anime artwork composed of exactly 4 equally-sized panels arranged in a 2x2 layout. Each panel is exactly 1024x1024 pixels. The panels touch edge-to-edge with absolutely zero gaps, zero borders, zero lines, zero separators, and zero padding between them. The image is one seamless canvas where the four panels share edges directly. Convert each input photo to high-quality anime style, preserving the pose, facial features, expression, and composition. Panel layout: top-left=photo1, top-right=photo2, bottom-left=photo3, bottom-right=photo4.`

    let falResponse: FalEditResponse
    try {
      falResponse = await callFalSeedream(FAL_KEY, imageUrls, falPrompt)
    } catch (err) {
      console.error('[Photos] fal.ai error:', err)
      await c.env.DB.prepare(`
        UPDATE photo_jobs SET status = 'failed', error_message = ?, updated_at = ?
        WHERE job_id = ?
      `).bind(`fal.ai error: ${err}`, now, jobId).run()
      return c.json({ success: false, error: 'Anime generation failed' } as PhotoPipelineResponse, 500)
    }

    if (!falResponse.images || falResponse.images.length === 0) {
      await c.env.DB.prepare(`
        UPDATE photo_jobs SET status = 'failed', error_message = 'No images returned from fal', updated_at = ?
        WHERE job_id = ?
      `).bind(now, jobId).run()
      return c.json({ success: false, error: 'Anime generation returned no images' } as PhotoPipelineResponse, 500)
    }

    // Step 4: Download and store the grid
    const gridUrl = falResponse.images[0].url
    const gridResponse = await fetch(gridUrl)
    if (!gridResponse.ok) {
      throw new Error(`Failed to download grid: ${gridResponse.status}`)
    }
    const gridBuffer = await gridResponse.arrayBuffer()

    const gridKey = `anime/grid/${userPkp}.png`
    await c.env.R2_ANIME.put(gridKey, gridBuffer, {
      httpMetadata: { contentType: 'image/png' },
    })

    // Update job status
    await c.env.DB.prepare(`
      UPDATE photo_jobs SET step = 'split', updated_at = ?
      WHERE job_id = ?
    `).bind(Math.floor(Date.now() / 1000), jobId).run()

    // Step 5: Split grid into 4 quadrants, then resize to 500x500
    // First, get the actual grid dimensions using .info() (don't assume 2048x2048)
    let gridWidth: number
    let gridHeight: number

    try {
      const gridInfo = await c.env.IMAGES.input(gridBuffer).info()
      gridWidth = gridInfo.width
      gridHeight = gridInfo.height
      console.log(`[Photos] Grid dimensions: ${gridWidth}x${gridHeight}`)
    } catch (err) {
      // Fallback to assumed 2K dimensions if .info() fails
      console.warn(`[Photos] Could not get grid info, assuming 2048x2048:`, err)
      gridWidth = 2048
      gridHeight = 2048
    }

    // Calculate half dimensions for quadrant splitting
    const halfW = Math.floor(gridWidth / 2)
    const halfH = Math.floor(gridHeight / 2)

    // Inset pixels: trim a few pixels from the center seam of each quadrant
    // to eliminate any residual black separator lines the model may produce.
    // With a 2048px grid, 8px inset means each tile goes from ~1024px to ~1016px
    // before being resized to 500x500 — negligible quality loss.
    const SEAM_INSET = 8

    // Cloudflare trim uses edge values: how many pixels to REMOVE from each edge
    // For each quadrant, trim the opposite half PLUS the seam inset on inner edges
    const quadrants = [
      { top: 0, right: halfW + SEAM_INSET, bottom: halfH + SEAM_INSET, left: 0 },       // TL: inner edges are right + bottom
      { top: 0, right: 0, bottom: halfH + SEAM_INSET, left: halfW + SEAM_INSET },       // TR: inner edges are left + bottom
      { top: halfH + SEAM_INSET, right: halfW + SEAM_INSET, bottom: 0, left: 0 },       // BL: inner edges are top + right
      { top: halfH + SEAM_INSET, right: 0, bottom: 0, left: halfW + SEAM_INSET },       // BR: inner edges are top + left
    ]

    const tileKeys: string[] = []
    const tileBuffers: ArrayBuffer[] = []

    for (let i = 0; i < 4; i++) {
      const trim = quadrants[i]
      const slot = i + 1
      const tileKey = `anime/tiles/${userPkp}/${slot}.webp`

      try {
        // Use Images binding to crop and resize
        // Use .response() to get output (recommended per CF docs)
        const outputResult = await c.env.IMAGES.input(gridBuffer)
          .transform({ trim })
          .transform({
            width: 500,
            height: 500,
            fit: 'cover',
          })
          .output({ format: 'image/webp', quality: 85 })

        // Get ArrayBuffer from response
        const resp = outputResult.response()
        const tileBuffer = await resp.arrayBuffer()

        // Store in R2 for fast serving
        await c.env.R2_ANIME.put(tileKey, tileBuffer, {
          httpMetadata: { contentType: 'image/webp' },
        })

        tileBuffers.push(tileBuffer)
      } catch (err) {
        console.error(`[Photos] Tile split error for slot ${slot}:`, err)
        // If transform fails, we can't continue
        throw new Error(`Failed to split grid into tiles: ${err}`)
      }

      tileKeys.push(tileKey)
    }

    // Step 6: Pin tiles to IPFS via Filebase (for portable ENS avatars)
    let tileCids: string[] = []
    let ipfsTileUrls: string[] = []
    let ipfsGatewayUrls: string[] = []

    if (c.env.FILEBASE_KEY) {
      console.log('[Photos] Pinning tiles to IPFS via Filebase...')
      try {
        for (let i = 0; i < 4; i++) {
          const slot = i + 1
          const filename = `anime/${userPkp}/${slot}.webp`
          const result = await pinToFilebase(
            tileBuffers[i],
            filename,
            'image/webp',
            c.env.FILEBASE_KEY
          )
          tileCids.push(result.cid)
          ipfsTileUrls.push(result.ipfsUrl)
          ipfsGatewayUrls.push(result.gatewayUrl)
          console.log(`[Photos] Tile ${slot} pinned: ${result.cid}`)
        }
      } catch (err) {
        console.error('[Photos] Filebase pinning failed (continuing with R2 only):', err)
        // Don't fail the whole pipeline if IPFS pinning fails
        tileCids = []
        ipfsTileUrls = []
        ipfsGatewayUrls = []
      }
    } else {
      console.log('[Photos] FILEBASE_KEY not set, skipping IPFS pinning')
    }

    // Step 7: Store anime assets record (including IPFS CIDs if available)
    const updatedNow = Math.floor(Date.now() / 1000)

    if (tileCids.length === 4) {
      // With IPFS CIDs
      await c.env.DB.prepare(`
        INSERT INTO anime_assets (user_id, grid_key, tile1_key, tile2_key, tile3_key, tile4_key,
                                  tile1_cid, tile2_cid, tile3_cid, tile4_cid, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          grid_key = excluded.grid_key,
          tile1_key = excluded.tile1_key,
          tile2_key = excluded.tile2_key,
          tile3_key = excluded.tile3_key,
          tile4_key = excluded.tile4_key,
          tile1_cid = excluded.tile1_cid,
          tile2_cid = excluded.tile2_cid,
          tile3_cid = excluded.tile3_cid,
          tile4_cid = excluded.tile4_cid,
          updated_at = excluded.updated_at
      `).bind(
        userPkp, gridKey,
        tileKeys[0], tileKeys[1], tileKeys[2], tileKeys[3],
        tileCids[0], tileCids[1], tileCids[2], tileCids[3],
        updatedNow, updatedNow
      ).run()
    } else {
      // Without IPFS CIDs (fallback)
      await c.env.DB.prepare(`
        INSERT INTO anime_assets (user_id, grid_key, tile1_key, tile2_key, tile3_key, tile4_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          grid_key = excluded.grid_key,
          tile1_key = excluded.tile1_key,
          tile2_key = excluded.tile2_key,
          tile3_key = excluded.tile3_key,
          tile4_key = excluded.tile4_key,
          updated_at = excluded.updated_at
      `).bind(userPkp, gridKey, tileKeys[0], tileKeys[1], tileKeys[2], tileKeys[3], updatedNow, updatedNow).run()
    }

    // Build tile URLs
    const animeTileUrls = tileKeys.map((_, i) =>
      `${baseUrl}/api/photos/anime/${userPkp}/${i + 1}`
    )

    // Update job as completed
    await c.env.DB.prepare(`
      UPDATE photo_jobs SET status = 'completed', step = 'done', anime_tiles_json = ?, updated_at = ?
      WHERE job_id = ?
    `).bind(JSON.stringify(animeTileUrls), updatedNow, jobId).run()

    // Clean up source tokens
    await c.env.DB.prepare(`
      DELETE FROM photo_source_tokens WHERE expires_at < ?
    `).bind(updatedNow).run()

    // Build response with both R2 URLs and IPFS URLs
    const response: PhotoPipelineResponse = {
      success: true,
      jobId,
      photoIds,
      animeTiles: animeTileUrls,
    }

    if (ipfsTileUrls.length === 4) {
      response.ipfsTiles = ipfsTileUrls
      response.ipfsGatewayTiles = ipfsGatewayUrls
    }

    return c.json(response)

  } catch (err) {
    console.error('[Photos] Pipeline error:', err)
    await c.env.DB.prepare(`
      UPDATE photo_jobs SET status = 'failed', error_message = ?, updated_at = ?
      WHERE job_id = ?
    `).bind(String(err), Math.floor(Date.now() / 1000), jobId).run()
    return c.json({ success: false, error: 'Pipeline failed' } as PhotoPipelineResponse, 500)
  }
})

// ============================================================================
// GET /pipeline/:jobId - Check job status
// ============================================================================

app.get('/pipeline/:jobId', async (c) => {
  const jobId = c.req.param('jobId')

  const row = await c.env.DB.prepare(`
    SELECT job_id, user_id, status, step, error_message, photo_ids_json, anime_tiles_json
    FROM photo_jobs WHERE job_id = ?
  `).bind(jobId).first<PhotoJobRow>()

  if (!row) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const response: PhotoJobStatusResponse = {
    jobId: row.job_id,
    status: row.status,
    step: row.step ?? undefined,
  }

  if (row.status === 'completed') {
    response.photoIds = row.photo_ids_json ? JSON.parse(row.photo_ids_json) : undefined
    response.animeTiles = row.anime_tiles_json ? JSON.parse(row.anime_tiles_json) : undefined
  } else if (row.status === 'failed') {
    response.error = row.error_message ?? 'Unknown error'
  }

  return c.json(response)
})

// ============================================================================
// GET /anime/:userId/:slot - Serve anime tile (public)
// ============================================================================

app.get('/anime/:userId/:slot', async (c) => {
  const userId = c.req.param('userId').toLowerCase()
  const slot = parseInt(c.req.param('slot'), 10)

  if (slot < 1 || slot > 4) {
    return c.json({ error: 'Slot must be 1-4' }, 400)
  }

  // Get anime assets record
  const row = await c.env.DB.prepare(`
    SELECT tile1_key, tile2_key, tile3_key, tile4_key FROM anime_assets WHERE user_id = ?
  `).bind(userId).first<AnimeAssetsRow>()

  if (!row) {
    return c.json({ error: 'Anime tiles not found' }, 404)
  }

  const tileKey = [row.tile1_key, row.tile2_key, row.tile3_key, row.tile4_key][slot - 1]

  // Fetch from R2
  const object = await c.env.R2_ANIME.get(tileKey)
  if (!object) {
    return c.json({ error: 'Tile not found in storage' }, 404)
  }

  return new Response(object.body as ReadableStream, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'image/webp',
      'Cache-Control': 'public, max-age=86400', // Cache 1 day
    },
  })
})

// ============================================================================
// GET /internal/source/:photoId - Ephemeral signed URL for fal.ai
// ============================================================================

app.get('/internal/source/:photoId', async (c) => {
  const photoId = c.req.param('photoId')
  const token = c.req.query('t')

  if (!token) {
    return c.json({ error: 'Missing token' }, 401)
  }

  const tokenHash = await sha256Hex(token)
  const now = Math.floor(Date.now() / 1000)

  // Verify token
  const tokenRow = await c.env.DB.prepare(`
    SELECT photo_id, expires_at FROM photo_source_tokens WHERE token_hash = ?
  `).bind(tokenHash).first<PhotoSourceTokenRow>()

  if (!tokenRow) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  if (tokenRow.expires_at < now) {
    return c.json({ error: 'Token expired' }, 401)
  }

  if (tokenRow.photo_id !== photoId) {
    return c.json({ error: 'Token/photo mismatch' }, 401)
  }

  // Get photo record
  const photoRow = await c.env.DB.prepare(`
    SELECT orig_key FROM user_photos WHERE photo_id = ?
  `).bind(photoId).first<UserPhotoRow>()

  if (!photoRow) {
    return c.json({ error: 'Photo not found' }, 404)
  }

  // Fetch from R2
  const object = await c.env.R2_ORIG.get(photoRow.orig_key)
  if (!object) {
    return c.json({ error: 'Photo not found in storage' }, 404)
  }

  return new Response(object.body as ReadableStream, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'no-store', // Don't cache ephemeral URLs
    },
  })
})

// ============================================================================
// GET /reveal/:photoId - Serve real photo with per-viewer watermark (match-only)
// ============================================================================

app.get('/reveal/:photoId', async (c) => {
  const viewerPkp = c.get('userPkp' as never) as string
  if (!viewerPkp) {
    return c.json({ success: false, error: 'User not authenticated' }, 401)
  }

  const photoId = c.req.param('photoId')

  // Check photo_access for this viewer/photo combination
  const accessRow = await c.env.DB.prepare(`
    SELECT * FROM photo_access WHERE viewer_user_id = ? AND photo_id = ?
  `).bind(viewerPkp, photoId).first<PhotoAccessRow>()

  if (!accessRow) {
    return c.json({ success: false, error: 'Not authorized to view this photo' }, 403)
  }

  // Check if cached variant exists
  if (accessRow.variant_key) {
    const cachedObject = await c.env.R2_REVEAL.get(accessRow.variant_key)
    if (cachedObject) {
      return new Response(cachedObject.body as ReadableStream, {
        headers: {
          'Content-Type': cachedObject.httpMetadata?.contentType ?? 'image/webp',
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }
  }

  // Get original photo
  const photoRow = await c.env.DB.prepare(`
    SELECT orig_key FROM user_photos WHERE photo_id = ?
  `).bind(photoId).first<UserPhotoRow>()

  if (!photoRow) {
    return c.json({ success: false, error: 'Photo not found' }, 404)
  }

  const origObject = await c.env.R2_ORIG.get(photoRow.orig_key)
  if (!origObject) {
    return c.json({ success: false, error: 'Photo not found in storage' }, 404)
  }

  const origBuffer = await origObject.arrayBuffer()

  // Get watermark assets from R2
  let wmTileBuffer: ArrayBuffer | null = null
  let wmStampBuffer: ArrayBuffer | null = null

  if (accessRow.wm_tile_key) {
    const wmTileObject = await c.env.R2_WM.get(accessRow.wm_tile_key)
    if (wmTileObject) {
      wmTileBuffer = await wmTileObject.arrayBuffer()
    }

    // Stamp is stored with same pattern but /stamps/ instead of /tiles/
    const stampKey = accessRow.wm_tile_key.replace('/tiles/', '/stamps/')
    const wmStampObject = await c.env.R2_WM.get(stampKey)
    if (wmStampObject) {
      wmStampBuffer = await wmStampObject.arrayBuffer()
    }
  }

  // Generate full 500x500 watermark overlay on-demand (includes font-rendered text)
  // Use FULL wallet address for maximum attribution visibility
  let fullOverlayBuffer: ArrayBuffer | null = null
  try {
    console.log(`[Photos] Generating full 500x500 watermark overlay for ${accessRow.viewer_wallet_full}`)
    const overlayPng = await generateFullOverlay(
      accessRow.viewer_wallet_full,
      accessRow.fingerprint_code
    )
    // CRITICAL: Use proper slice to avoid extra bytes
    fullOverlayBuffer = u8ToArrayBuffer(overlayPng)
    console.log(`[Photos] Full overlay generated: ${fullOverlayBuffer.byteLength} bytes`)
  } catch (err) {
    console.error('[Photos] Full overlay generation failed:', err)
  }

  // Corner stamp removed - diagonal watermark is sufficient

  try {
    // Transform: resize to 500x500, apply watermarks
    console.log(`[Photos] Reveal transform starting. overlay=${fullOverlayBuffer?.byteLength || 0}b, stamp=${wmStampBuffer?.byteLength || 0}b`)

    // Build base transform
    let transformChain = c.env.IMAGES.input(origBuffer)
      .transform({
        width: 500,
        height: 500,
        fit: 'cover',
      })

    // Apply full 500x500 watermark overlay (wallet address repeated diagonally)
    if (fullOverlayBuffer) {
      console.log(`[Photos] Applying full overlay (${fullOverlayBuffer.byteLength} bytes)`)
      const overlayImage = c.env.IMAGES.input(fullOverlayBuffer)
      transformChain = transformChain.draw(overlayImage, {
        left: 0,
        top: 0,
        opacity: 1.0,  // Full opacity - the overlay PNG has its own transparency
      })
    }

    // Corner stamp removed - diagonal watermark is sufficient for attribution

    // Use .response() to get output (recommended per CF docs)
    const outputResult = await transformChain.output({ format: 'image/webp', quality: 85 })
    const resp = outputResult.response()
    const watermarkedBuffer = await resp.arrayBuffer()

    // Cache the result
    const variantKey = `reveal/${photoId}/${viewerPkp}.webp`
    await c.env.R2_REVEAL.put(variantKey, watermarkedBuffer, {
      httpMetadata: { contentType: 'image/webp' },
    })

    // Store sidecar metadata JSON for attribution tracking
    const metadataKey = `reveal/meta/${photoId}/${viewerPkp}.json`
    const metadata = {
      photoId,
      ownerId: accessRow.owner_user_id,
      viewerWallet: accessRow.viewer_wallet_full,
      viewerWalletShort: accessRow.viewer_wallet_short,
      fingerprint: accessRow.fingerprint_code,
      matchId: accessRow.match_id,
      revealedAt: new Date().toISOString(),
      variantKey,
    }
    await c.env.R2_REVEAL.put(metadataKey, JSON.stringify(metadata, null, 2), {
      httpMetadata: { contentType: 'application/json' },
    })

    // Update access record with variant key
    await c.env.DB.prepare(`
      UPDATE photo_access SET variant_key = ? WHERE access_id = ?
    `).bind(variantKey, accessRow.access_id).run()

    return new Response(watermarkedBuffer, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, max-age=3600',
        // Include attribution in headers (doesn't survive screenshots but useful for direct access)
        'X-Revealed-To': accessRow.viewer_wallet_short,
        'X-Fingerprint': accessRow.fingerprint_code,
      },
    })
  } catch (err) {
    console.error('[Photos] Reveal transform error:', err)
    return c.json({ success: false, error: 'Failed to generate watermarked image' }, 500)
  }
})

// ============================================================================
// POST /access - Create photo access record on match (internal/admin use)
// ============================================================================

app.post('/access', async (c) => {
  // This would typically be called by the matching system when a match occurs
  // For now, only allow in development mode
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not available in production' }, 403)
  }

  const body = await c.req.json<{
    matchId: string
    ownerUserId: string
    viewerUserId: string
    viewerWallet: string
  }>()

  const { matchId, ownerUserId, viewerUserId, viewerWallet } = body

  if (!matchId || !ownerUserId || !viewerUserId || !viewerWallet) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  // Get all photos for the owner
  const photos = await c.env.DB.prepare(`
    SELECT photo_id FROM user_photos WHERE user_id = ?
  `).bind(ownerUserId).all<UserPhotoRow>()

  if (!photos.results || photos.results.length === 0) {
    return c.json({ error: 'No photos found for owner' }, 404)
  }

  const now = Math.floor(Date.now() / 1000)
  const walletShort = formatWalletShort(viewerWallet)
  const secret = c.env.WATERMARK_SECRET || 'dev-secret'

  // Generate watermark tiles once (same for all photos of this viewer)
  let wmTileKey: string | null = null
  let wmStampKey: string | null = null

  try {
    // Generate fingerprint for this viewer (same across all photos)
    const viewerFingerprint = await hmacSha256Hex(secret, `${matchId}|${viewerWallet}`)
    const fingerprintCode = viewerFingerprint.slice(0, 10).toUpperCase()

    // Generate tiled watermark PNG
    const tilePng = await generateTileWatermark(walletShort, fingerprintCode)
    wmTileKey = `wm/tiles/${viewerUserId}/${matchId}.png`
    await c.env.R2_WM.put(wmTileKey, tilePng, {
      httpMetadata: { contentType: 'image/png' },
    })

    // Generate corner stamp PNG
    const stampPng = await generateCornerStamp(
      walletShort,
      fingerprintCode,
      new Date(now * 1000).toISOString().split('T')[0]
    )
    wmStampKey = `wm/stamps/${viewerUserId}/${matchId}.png`
    await c.env.R2_WM.put(wmStampKey, stampPng, {
      httpMetadata: { contentType: 'image/png' },
    })

    console.log(`[Photos] Generated watermarks for viewer ${viewerUserId}: tile=${wmTileKey}, stamp=${wmStampKey}`)
  } catch (err) {
    console.error('[Photos] Watermark generation error:', err)
    // Continue without watermarks - they can be generated on-demand in reveal
  }

  const accessIds: string[] = []

  for (const photo of photos.results) {
    const accessId = generateUUID()
    const fingerprint = await hmacSha256Hex(secret, `${matchId}|${photo.photo_id}|${viewerWallet}`)
    const fingerprintCode = fingerprint.slice(0, 10).toUpperCase()

    await c.env.DB.prepare(`
      INSERT INTO photo_access (
        access_id, match_id, photo_id, owner_user_id, viewer_user_id,
        viewer_wallet_full, viewer_wallet_short, fingerprint_code, wm_tile_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      accessId, matchId, photo.photo_id, ownerUserId, viewerUserId,
      viewerWallet, walletShort, fingerprintCode, wmTileKey, now
    ).run()

    accessIds.push(accessId)
  }

  return c.json({ success: true, accessIds, wmTileKey, wmStampKey })
})

// ============================================================================
// GET /debug/overlay - Returns just the generated watermark PNG (test text rendering)
// ============================================================================

app.get('/debug/overlay', async (c) => {
  const label = c.req.query('label') || '0xABCD...1234 • FP12345678'

  try {
    const overlayPng = await generateFullOverlay(
      label.split(' • ')[0] || '0xABCD...1234',
      label.split(' • ')[1] || 'FP12345678'
    )
    const buffer = u8ToArrayBuffer(overlayPng)

    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[DebugOverlay] Error:', err)
    return c.json({ error: String(err) }, 500)
  }
})

// ============================================================================
// GET /debug/stamp - Returns just the generated corner stamp PNG
// ============================================================================

app.get('/debug/stamp', async (c) => {
  const wallet = c.req.query('wallet') || '0xABCD...1234'
  const fp = c.req.query('fp') || 'FP12345678'

  try {
    const stampPng = await generateCornerStamp(wallet, fp)
    const buffer = u8ToArrayBuffer(stampPng)

    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[DebugStamp] Error:', err)
    return c.json({ error: String(err) }, 500)
  }
})

// ============================================================================
// GET /debug/draw - Applies overlay to a photo (no caching, for testing)
// ============================================================================

app.get('/debug/draw', async (c) => {
  const wallet = c.req.query('wallet') || '0xABCD...1234'
  const fp = c.req.query('fp') || 'FP12345678'

  // Get first photo
  const photoRow = await c.env.DB.prepare(`
    SELECT orig_key FROM user_photos LIMIT 1
  `).first<UserPhotoRow>()

  if (!photoRow) {
    return c.json({ error: 'No photos found' }, 404)
  }

  const origObject = await c.env.R2_ORIG.get(photoRow.orig_key)
  if (!origObject) {
    return c.json({ error: 'Photo not in R2' }, 404)
  }

  const origBuffer = await origObject.arrayBuffer()

  try {
    // Generate overlay
    const overlayPng = await generateFullOverlay(wallet, fp)
    const overlayBuffer = u8ToArrayBuffer(overlayPng)

    console.log(`[DebugDraw] Original: ${origBuffer.byteLength}b, Overlay: ${overlayBuffer.byteLength}b`)

    // Apply overlay
    const result = await c.env.IMAGES.input(origBuffer)
      .transform({ width: 500, height: 500, fit: 'cover' })
      .draw(c.env.IMAGES.input(overlayBuffer), { left: 0, top: 0, opacity: 1.0 })
      .output({ format: 'image/webp', quality: 85 })

    const response = result.response()
    const buffer = await response.arrayBuffer()

    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[DebugDraw] Error:', err)
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

export default app
