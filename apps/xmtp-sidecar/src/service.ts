/**
 * XMTP Service
 *
 * Manages XMTP Node client lifecycle, conversations, and message streaming.
 * Uses build-first, create-fallback pattern for persistence.
 */

import {
  Client,
  ConsentState,
  IdentifierKind,
  type Dm,
  type DecodedMessage,
} from '@xmtp/node-sdk'
import { getRandomValues } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRemoteSigner } from './signer.js'
import { sendEvent, Events, type ConversationInfo, type XmtpMessage } from './protocol.js'

let client: Client | null = null
let dataDir: string = process.cwd()
const activeStreams = new Map<string, { stop: () => void }>()
const conversationCache = new Map<string, Dm>()

async function ensureDataDir(): Promise<void> {
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true })
  }
}

async function loadOrCreateEncryptionKey(): Promise<Uint8Array> {
  const keyPath = join(dataDir, 'xmtp-key.bin')
  try {
    const existing = await readFile(keyPath)
    if (existing.length === 32) return new Uint8Array(existing)
  } catch {
    // Key doesn't exist yet
  }
  const key = getRandomValues(new Uint8Array(32))
  await writeFile(keyPath, key)
  return key
}

function getDbPath(address: string): string {
  return join(dataDir, `xmtp-${address.toLowerCase()}.db3`)
}

export function setDataDir(dir: string): void {
  dataDir = dir
}

export async function init(
  address: string,
  env: 'dev' | 'production' = 'dev'
): Promise<string> {
  if (client) {
    return client.inboxId
  }

  await ensureDataDir()
  const dbEncryptionKey = await loadOrCreateEncryptionKey()
  const dbPath = getDbPath(address)

  // Try build-first (fast path, no signing needed)
  try {
    const built = await Client.build(
      {
        identifier: address.toLowerCase(),
        identifierKind: IdentifierKind.Ethereum,
      },
      { dbEncryptionKey, dbPath, env }
    )
    if (built.isRegistered) {
      client = built
      return client.inboxId
    }
    // DB exists but identity not registered — fall through to create
  } catch {
    // DB doesn't exist or is incompatible — fall through to create
  }

  // Create with remote signer (triggers signing via IPC)
  const signer = createRemoteSigner(address)
  client = await Client.create(signer, { dbEncryptionKey, dbPath, env })
  return client.inboxId
}

export function disconnect(): void {
  for (const [id, stream] of activeStreams) {
    stream.stop()
    activeStreams.delete(id)
  }
  conversationCache.clear()
  client = null
}

export function isConnected(): boolean {
  return client !== null
}

export function getInboxId(): string | null {
  return client?.inboxId ?? null
}

function decodeMessage(msg: DecodedMessage, conversationId: string): XmtpMessage | null {
  // Only include text/application messages
  if (msg.contentType?.typeId !== 'text' && msg.kind !== 'application') {
    return null
  }
  return {
    id: msg.id,
    conversationId,
    senderAddress: msg.senderInboxId,
    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    sentAtNs: String(msg.sentAtNs),
    kind: String(msg.kind ?? 'application'),
  }
}

export async function listConversations(): Promise<ConversationInfo[]> {
  if (!client) throw new Error('Not connected')

  await client.conversations.sync()
  const dms = await client.conversations.listDms()

  const results: ConversationInfo[] = []
  for (const dm of dms) {
    conversationCache.set(dm.id, dm)
    const peerInboxId = dm.peerInboxId
    const lastMsg = await dm.lastMessage()
    let preview: string | undefined
    if (lastMsg && typeof lastMsg.content === 'string') {
      preview = lastMsg.content
    }
    results.push({
      id: dm.id,
      peerAddress: peerInboxId,
      lastMessage: preview,
      lastMessageAt: lastMsg ? Number(lastMsg.sentAtNs / 1_000_000n) : undefined,
      lastMessageSender: lastMsg?.senderInboxId,
    })
  }
  return results
}

export async function createConversation(peerAddress: string): Promise<string> {
  if (!client) throw new Error('Not connected')

  let dm: Dm
  if (peerAddress.startsWith('0x') || peerAddress.startsWith('0X')) {
    // Ethereum address
    dm = await client.conversations.createDmWithIdentifier({
      identifier: peerAddress,
      identifierKind: IdentifierKind.Ethereum,
    })
  } else {
    // Inbox ID
    dm = await client.conversations.createDm(peerAddress)
  }
  conversationCache.set(dm.id, dm)
  return dm.id
}

async function getConversation(conversationId: string): Promise<Dm> {
  let dm = conversationCache.get(conversationId)
  if (dm) return dm

  if (!client) throw new Error('Not connected')
  const dms = await client.conversations.listDms()
  for (const d of dms) {
    conversationCache.set(d.id, d)
    if (d.id === conversationId) dm = d
  }
  if (!dm) throw new Error(`Conversation ${conversationId} not found`)
  return dm
}

export async function sendMessage(conversationId: string, content: string): Promise<void> {
  const dm = await getConversation(conversationId)
  await dm.sendText(content)
}

export async function loadMessages(
  conversationId: string,
  options?: { limit?: number; sentAfterNs?: string }
): Promise<XmtpMessage[]> {
  const dm = await getConversation(conversationId)
  await dm.sync()
  const msgs = await dm.messages({
    limit: options?.limit,
    sentAfterNs: options?.sentAfterNs ? BigInt(options.sentAfterNs) : undefined,
  })
  return msgs
    .map((m) => decodeMessage(m, conversationId))
    .filter((m): m is XmtpMessage => m !== null)
}

export async function streamMessages(conversationId: string): Promise<void> {
  if (activeStreams.has(conversationId)) return

  const dm = await getConversation(conversationId)
  const stream = await dm.stream()

  let active = true
  activeStreams.set(conversationId, {
    stop: () => {
      active = false
    },
  })

  // Run stream in background
  ;(async () => {
    try {
      for await (const msg of stream) {
        if (!active || msg === undefined) break
        const decoded = decodeMessage(msg, conversationId)
        if (decoded) {
          sendEvent(Events.MESSAGE, decoded)
        }
      }
    } catch (err) {
      if (active) {
        sendEvent(Events.ERROR, {
          conversationId,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    } finally {
      activeStreams.delete(conversationId)
    }
  })()
}

export function stopStream(conversationId: string): void {
  const stream = activeStreams.get(conversationId)
  if (stream) {
    stream.stop()
    activeStreams.delete(conversationId)
  }
}

export async function updateConsent(
  conversationId: string,
  state: 'allowed' | 'denied' | 'unknown'
): Promise<void> {
  const dm = await getConversation(conversationId)
  const consentState =
    state === 'allowed'
      ? ConsentState.Allowed
      : state === 'denied'
        ? ConsentState.Denied
        : ConsentState.Unknown
  await dm.updateConsentState(consentState)
}
