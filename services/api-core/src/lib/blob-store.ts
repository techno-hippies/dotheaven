import type { Env } from '../types'

export const DEFAULT_LOAD_S3_AGENT_URL = 'https://load-s3-agent.load.network'
export const DEFAULT_LOAD_GATEWAY_URL = 'https://gateway.s3-node-1.load.network'
export const DEFAULT_ARWEAVE_GATEWAY_URL = 'https://arweave.net'

type LoadEnv = Pick<Env, 'LOAD_S3_AGENT_API_KEY' | 'LOAD_S3_AGENT_URL' | 'LOAD_GATEWAY_URL'>

export interface BlobPutResult {
  id: string
  gatewayUrl: string
  payload: unknown
}

export interface BlobAnchorResult {
  id: string
  ref: string
  arweaveUrl: string
  arweaveAvailable: boolean
  payload: unknown
}

export interface BlobHeadResult {
  contentType: string | null
  size: number | null
  checksums: Record<string, string>
  tags: Record<string, string>
}

export interface ContentAddressedBlobStore {
  put(params: {
    file: File
    contentType: string
    tags?: unknown
  }): Promise<BlobPutResult>
  anchor(id: string): Promise<BlobAnchorResult>
  get(id: string): Promise<Response>
  head(id: string): Promise<BlobHeadResult>
  link(logicalKey: string, id: string): Promise<{ logicalKey: string; id: string }>
  resolve(logicalKey: string): Promise<{ logicalKey: string; id: string } | null>
}

export function loadAgentBaseFromEnv(env: LoadEnv): string {
  return (env.LOAD_S3_AGENT_URL || DEFAULT_LOAD_S3_AGENT_URL).replace(/\/+$/, '')
}

export function loadGatewayBaseFromEnv(env: Pick<Env, 'LOAD_GATEWAY_URL'>): string {
  return (env.LOAD_GATEWAY_URL || DEFAULT_LOAD_GATEWAY_URL).replace(/\/+$/, '')
}

export function arweaveGatewayBaseFromEnv(): string {
  return DEFAULT_ARWEAVE_GATEWAY_URL.replace(/\/+$/, '')
}

function extractUploadId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const candidate = (payload as Record<string, unknown>).id
    ?? (payload as Record<string, unknown>).dataitem_id
    ?? (payload as Record<string, unknown>).dataitemId
    ?? ((payload as Record<string, unknown>).result as Record<string, unknown> | undefined)?.id
    ?? ((payload as Record<string, unknown>).result as Record<string, unknown> | undefined)?.dataitem_id
    ?? ((payload as Record<string, unknown>).result as Record<string, unknown> | undefined)?.dataitemId
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text }
  }
}

export class LoadContentAddressedBlobStore implements ContentAddressedBlobStore {
  private readonly links = new Map<string, string>()

  constructor(private readonly env: LoadEnv) {}

  private requireApiKey(): string {
    const apiKey = this.env.LOAD_S3_AGENT_API_KEY?.trim()
    if (!apiKey) {
      throw new Error('LOAD_S3_AGENT_API_KEY not configured')
    }
    return apiKey
  }

  async put(params: { file: File; contentType: string; tags?: unknown }): Promise<BlobPutResult> {
    const apiKey = this.requireApiKey()
    const agentUrl = loadAgentBaseFromEnv(this.env)
    const gatewayUrl = loadGatewayBaseFromEnv(this.env)

    const form = new FormData()
    form.append('file', params.file, params.file.name || 'upload.bin')
    form.append('content_type', params.contentType)
    form.append('tags', typeof params.tags === 'string' ? params.tags : JSON.stringify(params.tags ?? []))

    const response = await fetch(`${agentUrl}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
    const payload = await parseJsonResponse(response)
    if (!response.ok) {
      throw new Error(`load_upload_failed:${response.status}:${JSON.stringify(payload)}`)
    }

    const id = extractUploadId(payload)
    if (!id) {
      throw new Error(`load_upload_missing_id:${JSON.stringify(payload)}`)
    }

    return {
      id,
      gatewayUrl: `${gatewayUrl}/resolve/${id}`,
      payload,
    }
  }

  async anchor(id: string): Promise<BlobAnchorResult> {
    const apiKey = this.requireApiKey()
    const agentUrl = loadAgentBaseFromEnv(this.env)
    const arweaveGateway = arweaveGatewayBaseFromEnv()

    const response = await fetch(`${agentUrl}/post/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const payload = await parseJsonResponse(response)
    if (!response.ok) {
      throw new Error(`load_post_failed:${response.status}:${JSON.stringify(payload)}`)
    }

    const arweaveUrl = `${arweaveGateway}/${id}`
    let arweaveAvailable = false
    try {
      const head = await fetch(arweaveUrl, { method: 'HEAD' })
      arweaveAvailable = head.ok
    } catch {
      arweaveAvailable = false
    }

    return {
      id,
      ref: `ar://${id}`,
      arweaveUrl,
      arweaveAvailable,
      payload,
    }
  }

  async get(id: string): Promise<Response> {
    const gatewayUrl = loadGatewayBaseFromEnv(this.env)
    return fetch(`${gatewayUrl}/resolve/${encodeURIComponent(id)}`)
  }

  async head(id: string): Promise<BlobHeadResult> {
    const response = await this.get(id)
    if (!response.ok) {
      throw new Error(`load_head_failed:${response.status}`)
    }
    const contentType = response.headers.get('content-type')
    const sizeRaw = response.headers.get('content-length')
    const size = sizeRaw && Number.isFinite(Number(sizeRaw)) ? Number(sizeRaw) : null
    return {
      contentType,
      size,
      checksums: {},
      tags: {},
    }
  }

  async link(logicalKey: string, id: string): Promise<{ logicalKey: string; id: string }> {
    this.links.set(logicalKey, id)
    return { logicalKey, id }
  }

  async resolve(logicalKey: string): Promise<{ logicalKey: string; id: string } | null> {
    const id = this.links.get(logicalKey)
    return id ? { logicalKey, id } : null
  }
}

export function createLoadBlobStore(env: LoadEnv): ContentAddressedBlobStore {
  return new LoadContentAddressedBlobStore(env)
}
