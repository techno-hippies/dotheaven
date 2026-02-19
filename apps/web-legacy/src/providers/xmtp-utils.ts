import type { XmtpMessage as XmtpWireMessage } from '../lib/xmtp'
import type { XMTPMessage } from './XMTPProvider'

// ---------------------------------------------------------------------------
// localStorage-backed read state
// ---------------------------------------------------------------------------

const READ_STATE_KEY = 'heaven:xmtp:lastRead'

/** Load persisted lastRead timestamps: { [peerAddressLower]: epochMs } */
export function loadReadState(): Record<string, number> {
  try {
    const raw = localStorage.getItem(READ_STATE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveReadState(state: Record<string, number>) {
  try {
    localStorage.setItem(READ_STATE_KEY, JSON.stringify(state))
  } catch {
    // storage full or unavailable — silently ignore
  }
}

export function markRead(peerAddress: string): number {
  const key = peerAddress.toLowerCase()
  const state = loadReadState()
  const now = Date.now()
  state[key] = now
  saveReadState(state)
  return now
}

export function getLastReadAt(peerAddress: string): number {
  return loadReadState()[peerAddress.toLowerCase()] ?? 0
}

// ---------------------------------------------------------------------------
// Wire format conversion
// ---------------------------------------------------------------------------

export function toLocalMessage(msg: XmtpWireMessage, myInboxId: string): XMTPMessage {
  return {
    id: msg.id,
    content: msg.content,
    sender: msg.senderAddress === myInboxId ? 'user' : 'other',
    timestamp: new Date(Number(msg.sentAtNs) / 1_000_000),
  }
}

export function formatAddress(address: string): string {
  // Skip non-address strings (e.g. XMTP conversation IDs like "dm:abc123...")
  if (!address.startsWith('0x')) {
    return address.length > 20 ? `${address.slice(0, 8)}...${address.slice(-4)}` : address
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// ---------------------------------------------------------------------------
// Byte / hex helpers
// ---------------------------------------------------------------------------

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (!ms || ms <= 0) return promise
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`[XMTPProvider] ${label} timed out after ${ms}ms`))
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function isInstallationLimitError(error: unknown): boolean {
  const message = getErrorMessage(error)
  return /10\/10\s+installations/i.test(message)
}

export function extractInboxId(message: string): string | null {
  const match =
    message.match(/InboxID\s+([a-f0-9]{64})/i) ??
    message.match(/inbox(?:\s*id)?[:\s]+([a-f0-9]{64})/i)
  return match?.[1]?.toLowerCase() ?? null
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function parseHexBytes(value: string): Uint8Array | null {
  const clean = value.startsWith('0x') ? value.slice(2) : value
  if (clean.length === 0 || clean.length % 2 !== 0) return null
  if (!/^[0-9a-f]+$/i.test(clean)) return null
  return hexToBytes(clean)
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value

  if (Array.isArray(value) && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return new Uint8Array(value)
  }

  if (typeof value === 'string') {
    return parseHexBytes(value)
  }

  return null
}

export function getInstallationBytes(installations: unknown[]): Uint8Array[] {
  const bytes: Uint8Array[] = []
  for (const installation of installations) {
    const direct = toUint8Array(installation)
    if (direct) {
      bytes.push(direct)
      continue
    }

    const record = asRecord(installation)
    if (!record) continue

    const candidate = toUint8Array(record.bytes) ?? toUint8Array(record.id) ?? toUint8Array(record.installationId)
    if (candidate) {
      bytes.push(candidate)
    }
  }
  return bytes
}
