import { Hono } from 'hono'
import type { Env } from '../types'
import { createLoadBlobStore } from '../lib/blob-store'

const app = new Hono<{ Bindings: Env }>()

// Uses Load's S3 agent as the "staging" uploader, then anchors the dataitem to Arweave.
// On-chain we should store only the stable dataitem id (e.g. `ar://<id>`).

// Turbo free tier is commonly quoted as <= 100 KiB. Enforce at the API boundary.
const MAX_COVER_BYTES = 100 * 1024

app.post('/cover', async (c) => {
  if (!c.env.LOAD_S3_AGENT_API_KEY) {
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
  const blobStore = createLoadBlobStore(c.env)
  let staged: Awaited<ReturnType<typeof blobStore.put>>
  try {
    staged = await blobStore.put({
      file: new File([await file.arrayBuffer()], file.name || 'cover', { type: contentType }),
      contentType,
      tags,
    })
  } catch (error) {
    return c.json({ error: 'LS3 agent upload failed', details: error instanceof Error ? error.message : String(error) }, 502)
  }

  let anchored: Awaited<ReturnType<typeof blobStore.anchor>>
  try {
    anchored = await blobStore.anchor(staged.id)
  } catch (error) {
    return c.json(
      {
        error: 'LS3 agent post-to-arweave failed',
        details: error instanceof Error ? error.message : String(error),
        id: staged.id,
      },
      502,
    )
  }

  return c.json({
    id: staged.id,
    ref: anchored.ref,
    ls3GatewayUrl: staged.gatewayUrl,
    arweaveUrl: anchored.arweaveUrl,
    arweaveAvailable: anchored.arweaveAvailable,
    uploadPayload: staged.payload,
    postPayload: anchored.payload,
  })
})

export default app
