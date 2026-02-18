const CONTENT_KEY_STORAGE = 'heaven:content-key:v1'

type StoredContentKeyV1 = {
  version: 1
  privateJwk: JsonWebKey
  publicJwk: JsonWebKey
}

export const CONTENT_PUBKEY_RECORD_KEY = 'contentPubKey'

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function base64UrlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const decoded = atob(padded)
  const out = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) out[i] = decoded.charCodeAt(i)
  return out
}

function normalizeHex(input: string): string | null {
  const clean = input.trim().replace(/^0x/i, '').toLowerCase()
  if (clean.length !== 130) return null
  if (!/^[0-9a-f]+$/.test(clean)) return null
  if (!clean.startsWith('04')) return null
  return clean
}

function publicJwkToContentPubKey(publicJwk: JsonWebKey): `0x${string}` {
  if (publicJwk.kty !== 'EC' || publicJwk.crv !== 'P-256' || !publicJwk.x || !publicJwk.y) {
    throw new Error('Invalid stored content public key')
  }
  const x = base64UrlToBytes(publicJwk.x)
  const y = base64UrlToBytes(publicJwk.y)
  if (x.length !== 32 || y.length !== 32) {
    throw new Error('Invalid stored content public key length')
  }
  const raw = new Uint8Array(65)
  raw[0] = 0x04
  raw.set(x, 1)
  raw.set(y, 33)
  return `0x${bytesToHex(raw)}` as `0x${string}`
}

function readStoredKey(): StoredContentKeyV1 | null {
  try {
    const raw = localStorage.getItem(CONTENT_KEY_STORAGE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredContentKeyV1
    if (parsed?.version !== 1 || !parsed.publicJwk || !parsed.privateJwk) return null
    return parsed
  } catch {
    return null
  }
}

function writeStoredKey(data: StoredContentKeyV1): void {
  localStorage.setItem(CONTENT_KEY_STORAGE, JSON.stringify(data))
}

export function normalizeContentPubKeyHex(value: string | null | undefined): `0x${string}` | null {
  if (!value) return null
  const normalized = normalizeHex(value)
  if (!normalized) return null
  return `0x${normalized}` as `0x${string}`
}

export async function getOrCreateContentPubKeyHex(): Promise<`0x${string}`> {
  const existing = readStoredKey()
  if (existing) {
    return publicJwkToContentPubKey(existing.publicJwk)
  }

  const generated = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveBits'],
  )

  if (!('privateKey' in generated) || !('publicKey' in generated)) {
    throw new Error('Failed to generate content encryption keypair')
  }

  const [privateJwk, publicJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', generated.privateKey),
    crypto.subtle.exportKey('jwk', generated.publicKey),
  ])

  writeStoredKey({
    version: 1,
    privateJwk,
    publicJwk,
  })

  return publicJwkToContentPubKey(publicJwk)
}
