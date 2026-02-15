import { Hono } from 'hono'
import type { Env } from '../types'

const app = new Hono<{ Bindings: Env }>()

// Uses Load's S3 agent as the "staging" uploader, then anchors the dataitem to Arweave.
// On-chain we should store only the stable dataitem id (e.g. `ar://<id>`).

const DEFAULT_AGENT_URL = 'https://load-s3-agent.load.network'
const DEFAULT_GATEWAY_URL = 'https://gateway.s3-node-1.load.network'
const DEFAULT_ARWEAVE_GATEWAY = 'https://arweave.net'

// Turbo free tier is commonly quoted as <= 100 KiB. Enforce at the API boundary.
const MAX_COVER_BYTES = 100 * 1024

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

app.post('/cover', async (c) => {
  const apiKey = c.env.LOAD_S3_AGENT_API_KEY
  if (!apiKey) {
    return c.json({ error: 'Arweave cover upload not configured (LOAD_S3_AGENT_API_KEY)' }, 500)
  }

  const form = await c.req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return c.json({ error: 'Missing file form field' }, 400)
  }
  if (!file.size) {
    return c.json({ error: 'File is empty' }, 400)
  }
  if (file.size > MAX_COVER_BYTES) {
    return c.json({ error: `Cover too large: ${file.size} > ${MAX_COVER_BYTES}` }, 400)
  }

  const contentType = (form.get('contentType') as string | null) || file.type || 'application/octet-stream'
  if (!contentType.startsWith('image/')) {
    return c.json({ error: `Unsupported content type: ${contentType}` }, 400)
  }

  const tags = (form.get('tags') as string | null) || '[]'

  const agentUrl = (c.env.LOAD_S3_AGENT_URL || DEFAULT_AGENT_URL).replace(/\/+$/, '')
  const ls3Gateway = (c.env.LOAD_GATEWAY_URL || DEFAULT_GATEWAY_URL).replace(/\/+$/, '')

  // 1) Upload to LS3 (creates an ANS-104 dataitem and returns its id).
  const upstreamForm = new FormData()
  upstreamForm.append(
    'file',
    new File([await file.arrayBuffer()], file.name || 'cover', { type: contentType }),
  )
  upstreamForm.append('content_type', contentType)
  upstreamForm.append('tags', tags)

  const uploadResp = await fetch(`${agentUrl}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: upstreamForm,
  })

  const uploadText = await uploadResp.text()
  let uploadPayload: any = null
  try {
    uploadPayload = uploadText ? JSON.parse(uploadText) : null
  } catch {
    uploadPayload = { raw: uploadText }
  }

  if (!uploadResp.ok) {
    return c.json(
      { error: 'LS3 agent upload failed', status: uploadResp.status, payload: uploadPayload },
      502,
    )
  }

  const id = extractUploadId(uploadPayload)
  if (!id) {
    return c.json({ error: 'Upload succeeded but no dataitem id returned', payload: uploadPayload }, 502)
  }

  // 2) Anchor to Arweave via the agent.
  const postResp = await fetch(`${agentUrl}/post/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  const postText = await postResp.text()
  let postPayload: any = null
  try {
    postPayload = postText ? JSON.parse(postText) : null
  } catch {
    postPayload = { raw: postText }
  }

  if (!postResp.ok) {
    return c.json(
      { error: 'LS3 agent post-to-arweave failed', status: postResp.status, payload: postPayload, id },
      502,
    )
  }

  // Best-effort: check Arweave gateway visibility. Even after "post" succeeds,
  // it can take a bit for gateways to serve the dataitem.
  const arweaveUrl = `${DEFAULT_ARWEAVE_GATEWAY}/${id}`
  let arweaveAvailable = false
  try {
    const head = await fetch(arweaveUrl, { method: 'HEAD' })
    arweaveAvailable = head.ok
  } catch {
    arweaveAvailable = false
  }

  return c.json({
    id,
    ref: `ar://${id}`,
    ls3GatewayUrl: `${ls3Gateway}/resolve/${id}`,
    arweaveUrl,
    arweaveAvailable,
    uploadPayload,
    postPayload,
  })
})

export default app

