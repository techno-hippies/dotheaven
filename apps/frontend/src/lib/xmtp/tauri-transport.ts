/**
 * Rust Transport
 *
 * XMTP transport using native libxmtp via Tauri commands.
 * Used for Tauri desktop builds where the Rust backend handles all XMTP operations.
 */

type UnlistenFn = () => void

const tauriCore = () => import('@tauri-apps/api/core')
const tauriEvent = () => import('@tauri-apps/api/event')

import type {
  XmtpTransport,
  ConversationInfo,
  XmtpMessage,
  LoadMessagesOptions,
  SignMessageFn,
} from './transport'

export class RustTransport implements XmtpTransport {
  private connected = false
  private inboxId: string | null = null
  private signMessageFn: SignMessageFn | null = null
  private signListenerCleanup: UnlistenFn | null = null

  async init(address: string, signMessage: SignMessageFn): Promise<void> {
    if (this.connected) return

    this.signMessageFn = signMessage
    const { invoke } = await tauriCore()
    const { listen } = await tauriEvent()

    // Listen for signature requests from the Rust backend
    this.signListenerCleanup = await listen<string>('xmtp://sign-request', async (event) => {
      if (!this.signMessageFn) return
      try {
        const signature = await this.signMessageFn(event.payload)
        const { invoke: inv } = await tauriCore()
        await inv('xmtp_resolve_signature', { signatureHex: signature })
      } catch (err) {
        console.error('[XMTP/Rust] Failed to sign:', err)
      }
    })

    this.inboxId = await invoke<string>('xmtp_init', { address })
    this.connected = true
  }

  disconnect(): void {
    this.signListenerCleanup?.()
    this.signListenerCleanup = null
    this.signMessageFn = null
    this.connected = false
    this.inboxId = null
    tauriCore().then(({ invoke }) => invoke('xmtp_disconnect')).catch(() => {})
  }

  isConnected(): boolean {
    return this.connected
  }

  getInboxId(): string | null {
    return this.inboxId
  }

  async listConversations(): Promise<ConversationInfo[]> {
    const { invoke } = await tauriCore()
    return invoke<ConversationInfo[]>('xmtp_list_conversations')
  }

  async getOrCreateConversation(peerAddress: string): Promise<string> {
    const { invoke } = await tauriCore()
    return invoke<string>('xmtp_get_or_create_conversation', { peerAddress })
  }

  async sendMessage(conversationId: string, content: string): Promise<void> {
    const { invoke } = await tauriCore()
    await invoke('xmtp_send_message', { conversationId, content })
  }

  async loadMessages(conversationId: string, options?: LoadMessagesOptions): Promise<XmtpMessage[]> {
    const { invoke } = await tauriCore()
    return invoke<XmtpMessage[]>('xmtp_load_messages', {
      conversationId,
      limit: options?.limit ?? null,
      sentAfterNs: options?.sentAfterNs ?? null,
    })
  }

  streamMessages(
    conversationId: string,
    onMessage: (msg: XmtpMessage) => void,
    onError?: (err: Error) => void,
  ): () => void {
    let unlisten: UnlistenFn | null = null
    let isActive = true

    // Start the Rust-side stream
    tauriCore().then(({ invoke }) => invoke('xmtp_stream_messages', { conversationId })).catch((err) => {
      if (isActive) onError?.(new Error(String(err)))
    })

    // Listen for messages emitted by the Rust stream
    tauriEvent().then(({ listen }) => listen<XmtpMessage>('xmtp://message', (event) => {
      if (!isActive) return
      if (event.payload.conversationId === conversationId) {
        onMessage(event.payload)
      }
    })).then((fn) => {
      unlisten = fn
    })

    return () => {
      isActive = false
      unlisten?.()
    }
  }

  streamAllMessages(
    onMessage: (msg: XmtpMessage) => void,
    onError?: (err: Error) => void,
  ): () => void {
    let unlisten: UnlistenFn | null = null
    let isActive = true

    // Start the Rust-side global stream
    tauriCore().then(({ invoke }) => invoke('xmtp_stream_all_messages')).catch((err) => {
      if (isActive) onError?.(new Error(String(err)))
    })

    // Listen for messages emitted by the global stream
    tauriEvent().then(({ listen }) => listen<XmtpMessage>('xmtp://message-all', (event) => {
      if (!isActive) return
      onMessage(event.payload)
    })).then((fn) => {
      unlisten = fn
    })

    return () => {
      isActive = false
      unlisten?.()
    }
  }

  async updateConsent(conversationId: string, state: 'allowed' | 'denied' | 'unknown'): Promise<void> {
    const { invoke } = await tauriCore()
    await invoke('xmtp_update_consent', { conversationId, consent: state })
  }
}
