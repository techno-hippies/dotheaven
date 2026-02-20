import { Hono } from 'hono'
import type { Env } from '../types'

const app = new Hono<{ Bindings: Env }>()

const DEFAULT_AGENT_URL = 'https://load-s3-agent.load.network'
const DEFAULT_GATEWAY_URL = 'https://gateway.s3-node-1.load.network'
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

function extractUploadId(payload: any): string | null {
  const candidate =
    payload?.id ||
    payload?.dataitem_id ||
    payload?.dataitemId ||
    payload?.result?.id ||
    payload?.result?.dataitem_id ||
    payload?.result?.dataitemId
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

app.post('/upload', async (c) => {
  const apiKey = c.env.LOAD_S3_AGENT_API_KEY
  if (!apiKey) {
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

  const agentUrl = (c.env.LOAD_S3_AGENT_URL || DEFAULT_AGENT_URL).replace(/\/+$/, '')
  const gatewayUrl = (c.env.LOAD_GATEWAY_URL || DEFAULT_GATEWAY_URL).replace(/\/+$/, '')
  const contentType = (form.get('contentType') as string | null) || file.type || 'application/octet-stream'
  const tags = (form.get('tags') as string | null) || '[]'

  const upstreamForm = new FormData()
  upstreamForm.append(
    'file',
    new File([await file.arrayBuffer()], file.name || 'upload.bin', { type: contentType }),
  )
  upstreamForm.append('content_type', contentType)
  upstreamForm.append('tags', tags)

  const upstream = await fetch(`${agentUrl}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: upstreamForm,
  })

  const text = await upstream.text()
  let payload: any = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { raw: text }
  }

  if (!upstream.ok) {
    return c.json(
      {
        error: 'Load agent upload failed',
        status: upstream.status,
        payload,
      },
      502,
    )
  }

  const id = extractUploadId(payload)
  if (!id) {
    return c.json({ error: 'Upload succeeded but no dataitem id returned', payload }, 502)
  }

  return c.json({
    id,
    gatewayUrl: `${gatewayUrl}/resolve/${id}`,
    payload,
  })
})

app.get('/health', async (c) => {
  const agentUrl = (c.env.LOAD_S3_AGENT_URL || DEFAULT_AGENT_URL).replace(/\/+$/, '')
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
