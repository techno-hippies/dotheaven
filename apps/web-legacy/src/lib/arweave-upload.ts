const HEAVEN_API_URL = import.meta.env.VITE_HEAVEN_API_URL || 'http://localhost:8787'
const MAX_ARWEAVE_COVER_BYTES = 100 * 1024

export type CoverImageInput = {
  base64: string
  contentType: string
}

export type ArweaveCoverUploadResult = {
  id: string
  ref: string
  ls3GatewayUrl?: string
  arweaveUrl?: string
  arweaveAvailable?: boolean
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  throw new Error('Canvas API unavailable')
}

async function canvasToJpegBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality })
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
  )
  if (!blob) throw new Error('Failed to encode JPEG cover')
  return blob
}

async function compressCoverForArweave(input: Blob): Promise<Blob> {
  if (input.size <= MAX_ARWEAVE_COVER_BYTES) return input

  if (typeof createImageBitmap !== 'function') {
    throw new Error(`Cover too large (${input.size} bytes) and image transcoding is unavailable`)
  }

  const bitmap = await createImageBitmap(input)
  try {
    const maxDims = [1024, 896, 768, 640, 512, 448, 384, 320, 256]
    const qualities = [0.86, 0.8, 0.74, 0.68, 0.62, 0.56, 0.5, 0.44]

    for (const maxDim of maxDims) {
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))

      const canvas = createCanvas(width, height)
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.drawImage(bitmap, 0, 0, width, height)

      for (const quality of qualities) {
        const blob = await canvasToJpegBlob(canvas, quality)
        if (blob.size <= MAX_ARWEAVE_COVER_BYTES) return blob
      }
    }
  } finally {
    bitmap.close()
  }

  throw new Error(`Unable to compress cover below ${MAX_ARWEAVE_COVER_BYTES} bytes`)
}

function extFromType(contentType: string): string {
  const t = contentType.toLowerCase()
  if (t === 'image/png') return 'png'
  if (t === 'image/webp') return 'webp'
  if (t === 'image/gif') return 'gif'
  return 'jpg'
}

export async function uploadCoverToArweave(input: CoverImageInput): Promise<ArweaveCoverUploadResult> {
  if (!input?.base64) throw new Error('Missing cover base64 payload')
  if (!String(input.contentType || '').startsWith('image/')) {
    throw new Error(`Unsupported cover content type: ${input.contentType}`)
  }

  const rawBytes = base64ToBytes(input.base64)
  const rawBlob = new Blob([rawBytes], { type: input.contentType || 'application/octet-stream' })
  const blob = await compressCoverForArweave(rawBlob)

  const contentType = blob.type || input.contentType || 'image/jpeg'
  const form = new FormData()
  form.append('file', new File([blob], `cover.${extFromType(contentType)}`, { type: contentType }))
  form.append('contentType', contentType)
  form.append(
    'tags',
    JSON.stringify([
      { key: 'App-Name', value: 'Heaven' },
      { key: 'Upload-Source', value: 'web-track-cover-v5' },
    ]),
  )

  const response = await fetch(`${HEAVEN_API_URL}/api/arweave/cover`, {
    method: 'POST',
    body: form,
  })

  const text = await response.text()
  let payload: any = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { raw: text }
  }

  if (!response.ok) {
    const err = payload?.error || `Arweave cover upload failed (${response.status})`
    throw new Error(err)
  }

  const ref = payload?.ref
  const id = payload?.id
  if (!ref || typeof ref !== 'string' || !ref.startsWith('ar://') || !id || typeof id !== 'string') {
    throw new Error('Arweave cover upload succeeded but returned invalid ref/id')
  }

  return {
    id,
    ref,
    ls3GatewayUrl: payload?.ls3GatewayUrl,
    arweaveUrl: payload?.arweaveUrl,
    arweaveAvailable: payload?.arweaveAvailable,
  }
}

