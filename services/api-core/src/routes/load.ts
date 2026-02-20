import { Hono } from 'hono'
import type { Env } from '../types'
import { createLoadBlobStore, loadAgentBaseFromEnv } from '../lib/blob-store'

const app = new Hono<{ Bindings: Env }>()

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

app.post('/upload', async (c) => {
  if (!c.env.LOAD_S3_AGENT_API_KEY) {
    return c.json({ error: 'Load upload not configured (LOAD_S3_AGENT_API_KEY)' }, 500)
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

  const contentType = (form.get('contentType') as string | null) || file.type || 'application/octet-stream'
  const tags = (form.get('tags') as string | null) || '[]'

  const blobStore = createLoadBlobStore(c.env)
  try {
    const result = await blobStore.put({
      file: new File([await file.arrayBuffer()], file.name || 'upload.bin', { type: contentType }),
      contentType,
      tags,
    })
    return c.json({
      id: result.id,
      gatewayUrl: result.gatewayUrl,
      payload: result.payload,
    })
  } catch (error) {
    return c.json(
      {
        error: 'Load agent upload failed',
        details: error instanceof Error ? error.message : String(error),
      },
      502,
    )
  }
})

app.get('/health', async (c) => {
  const agentUrl = loadAgentBaseFromEnv(c.env)
  // load-s3-agent deprecates /health and /info in recent versions; probe "/" first.
  const root = await fetch(`${agentUrl}/`)
  if (root.ok) {
    return c.json({ ok: true })
  }

  const legacy = await fetch(`${agentUrl}/health`)
  if (!legacy.ok) {
    return c.json({ ok: false, status: root.status, legacyStatus: legacy.status }, 502)
  }
  return c.json({ ok: true })
})

export default app
