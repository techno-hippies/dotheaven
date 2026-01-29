/**
 * XmtpTransport Interface
 *
 * Platform-agnostic abstraction over XMTP messaging.
 * - Web: BrowserTransport (browser-sdk with OPFS)
 * - Tauri: SidecarTransport (Node sidecar with persistent SQLite)
 */

export interface ConversationInfo {
  id: string
  peerAddress: string
  lastMessage?: string
  lastMessageAt?: number
  lastMessageSender?: string
}

export interface XmtpMessage {
  id: string
  conversationId: string
  senderAddress: string
  content: string
  sentAtNs: string
  kind: string
}

export interface LoadMessagesOptions {
  limit?: number
  sentAfterNs?: string
}

export type SignMessageFn = (message: string) => Promise<string>

export interface XmtpTransport {
  init(address: string, signMessage: SignMessageFn): Promise<void>
  disconnect(): void
  isConnected(): boolean
  getInboxId(): string | null

  listConversations(): Promise<ConversationInfo[]>
  getOrCreateConversation(peerAddress: string): Promise<string>

  sendMessage(conversationId: string, content: string): Promise<void>
  loadMessages(conversationId: string, options?: LoadMessagesOptions): Promise<XmtpMessage[]>

  streamMessages(
    conversationId: string,
    onMessage: (msg: XmtpMessage) => void,
    onError?: (err: Error) => void
  ): () => void

  updateConsent(conversationId: string, state: 'allowed' | 'denied' | 'unknown'): Promise<void>
}
