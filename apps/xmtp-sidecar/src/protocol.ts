/**
 * NDJSON IPC Protocol
 *
 * Frontend → Sidecar: requests (id + method + params)
 * Sidecar → Frontend: responses (id + result/error)
 * Sidecar → Frontend: push events (event + data)
 */

// --- Envelopes ---

export interface IPCRequest {
  id: string
  method: string
  params: Record<string, any>
}

export interface IPCResponse {
  id: string
  result?: any
  error?: { code: string; message: string }
}

export interface IPCEvent {
  event: string
  data: any
}

export type IPCOutgoing = IPCResponse | IPCEvent

// --- Methods ---

export const Methods = {
  INIT: 'xmtp.init',
  DISCONNECT: 'xmtp.disconnect',
  LIST_CONVERSATIONS: 'xmtp.listConversations',
  CREATE_CONVERSATION: 'xmtp.createConversation',
  SEND_MESSAGE: 'xmtp.sendMessage',
  LOAD_MESSAGES: 'xmtp.loadMessages',
  STREAM_MESSAGES: 'xmtp.streamMessages',
  STOP_STREAM: 'xmtp.stopStream',
  UPDATE_CONSENT: 'xmtp.updateConsent',
  SIGNING_RESOLVE: 'signing.resolve',
} as const

// --- Events ---

export const Events = {
  SIGN_REQUEST: 'sign-request',
  MESSAGE: 'message',
  CONVERSATION: 'conversation',
  READY: 'ready',
  ERROR: 'error',
} as const

// --- Data types ---

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

// --- Helpers ---

export function send(msg: IPCOutgoing): void {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

export function sendResponse(id: string, result: any): void {
  send({ id, result })
}

export function sendError(id: string, code: string, message: string): void {
  send({ id, error: { code, message } })
}

export function sendEvent(event: string, data: any): void {
  send({ event, data })
}
