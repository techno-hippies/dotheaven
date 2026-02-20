/**
 * Upload Routes — Proxy uploads to Filebase S3 (avoids browser CORS issues)
 *
 * Flow:
 * 1. Client POSTs multipart form to /api/upload with slot files
 * 2. Worker uploads each file to Filebase S3 server-side
 * 3. Worker returns CIDs for each slot
 *
 * Canvas videos go to a separate bucket (FILEBASE_CANVAS_KEY).
 */

import { Hono } from 'hono'
import type { Env } from '../types'
import { pinToFilebase } from '../lib/filebase'

const app = new Hono<{ Bindings: Env }>()

// ── Config ──────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_CONTENT_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/flac', 'audio/ogg', 'audio/aac', 'audio/m4a',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm',
])

const CANVAS_SLOT = 'canvas'

// ── Upload endpoint (multipart) ─────────────────────────────────────

app.post('/', async (c) => {
  const songsKey = c.env.FILEBASE_SONGS_KEY
  if (!songsKey) {
    return c.json({ error: 'Upload not configured (FILEBASE_SONGS_KEY)' }, 500)
  }
  const canvasKey = c.env.FILEBASE_CANVAS_KEY || songsKey // fallback to songs bucket

  const formData = await c.req.formData()
  const prefix = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const results: Record<string, { cid: string; gatewayUrl: string }> = {}

  // Worker FormData is iterable even when entries() is missing from TS libs.
  for (const [slot, value] of formData as unknown as Iterable<[string, FormDataEntryValue]>) {
    if (!(value instanceof File)) continue

    if (!ALLOWED_CONTENT_TYPES.has(value.type)) {
      return c.json({ error: `Unsupported content type for ${slot}: ${value.type}` }, 400)
    }
    if (value.size > MAX_FILE_SIZE) {
      return c.json({ error: `File too large for ${slot}: ${value.size} > ${MAX_FILE_SIZE}` }, 400)
    }

    const ext = value.type.split('/')[1] || 'bin'
    const filename = `${prefix}-${slot}.${ext}`
    const filebaseKey = slot === CANVAS_SLOT ? canvasKey : songsKey
    const data = await value.arrayBuffer()

    const result = await pinToFilebase(data, filename, value.type, filebaseKey)
    results[slot] = { cid: result.cid, gatewayUrl: result.gatewayUrl }
  }

  if (Object.keys(results).length === 0) {
    return c.json({ error: 'No files provided' }, 400)
  }

  return c.json({ slots: results })
})

export default app
