/**
 * Local cover image reader for Tauri (base64 + content type).
 * Safe to import in web builds; returns null outside Tauri.
 */

let _isTauri: boolean | null = null

function isTauri(): boolean {
  if (_isTauri === null) {
    try {
      _isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    } catch {
      _isTauri = false
    }
  }
  return _isTauri
}

function coverContentType(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  return 'image/jpeg'
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function readCoverBase64(coverPath: string): Promise<{ base64: string; contentType: string } | null> {
  if (!isTauri()) return null
  try {
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const bytes = await readFile(coverPath)
    if (!bytes || bytes.length === 0) return null
    return {
      base64: bytesToBase64(bytes),
      contentType: coverContentType(coverPath),
    }
  } catch {
    return null
  }
}
