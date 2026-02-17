/**
 * Local cover image reader.
 */

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  bmp: 'image/bmp',
  gif: 'image/gif',
  avif: 'image/avif',
}

function inferImageType(path: string, hintedType: string): string {
  const hint = String(hintedType || '').split(';')[0].trim().toLowerCase()
  if (hint.startsWith('image/')) return hint

  const clean = path.split('#')[0].split('?')[0]
  const ext = clean.includes('.') ? clean.split('.').pop()?.toLowerCase() || '' : ''
  return MIME_BY_EXT[ext] || 'image/jpeg'
}

export async function readCoverBase64(coverPath: string): Promise<{ base64: string; contentType: string } | null> {
  try {
    const response = await fetch(coverPath)
    if (!response.ok) return null

    const blob = await response.blob()
    if (!blob.size) return null

    const contentType = inferImageType(coverPath, blob.type || response.headers.get('content-type') || '')
    if (!contentType.startsWith('image/')) return null

    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }

    return { base64: btoa(binary), contentType }
  } catch {
    return null
  }
}
