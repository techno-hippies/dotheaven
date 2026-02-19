// ─── Time formatting ─────────────────────────────────────────────────────────

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function parseDuration(value?: string | null): number {
  if (!value) return 0
  const parts = value.split(':').map((part) => Number.parseInt(part, 10))
  if (parts.some((p) => Number.isNaN(p))) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

// ─── Audio format sniffing ───────────────────────────────────────────────────

function bytesMatch(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) return false
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false
  }
  return true
}

export function sniffAudioMime(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null
  if (bytesMatch(bytes, 0, 'RIFF') && bytesMatch(bytes, 8, 'WAVE')) return 'audio/wav'
  if (bytesMatch(bytes, 0, 'fLaC')) return 'audio/flac'
  if (bytesMatch(bytes, 0, 'OggS')) return 'audio/ogg'
  if (bytesMatch(bytes, 0, 'ID3')) return 'audio/mpeg'
  if (bytes.length >= 12 && bytesMatch(bytes, 4, 'ftyp')) return 'audio/mp4'
  if (bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0 && (bytes[1] & 0x06) === 0x00) {
    return 'audio/aac'
  }
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg'
  return null
}

export async function decodeDuration(bytes: Uint8Array): Promise<number | null> {
  const AudioCtx = (window as typeof window & {
    webkitAudioContext?: typeof AudioContext
  }).AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return null
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const ctx = new AudioCtx()
  try {
    const decoded = await ctx.decodeAudioData(buffer)
    return Number.isFinite(decoded.duration) && decoded.duration > 0 ? decoded.duration : null
  } catch {
    return null
  } finally {
    try { await ctx.close() } catch { /* ignore */ }
  }
}

// ─── LocalStorage persistence ────────────────────────────────────────────────

export const LS_TRACK_ID = 'heaven:lastTrackId'
export const LS_POSITION = 'heaven:lastPosition'
export const LS_DURATION = 'heaven:lastDuration'
export const LS_VOLUME = 'heaven:lastVolume'

export function savePlayerState(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* quota */ }
}

export function readPlayerState(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
