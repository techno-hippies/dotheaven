/**
 * Sidecar Transport
 *
 * XMTP transport via Node.js sidecar process (Tauri only).
 * Communicates over NDJSON stdio IPC.
 */

import { Command } from '@tauri-apps/plugin-shell'
import { appDataDir } from '@tauri-apps/api/path'
import type {
  XmtpTransport,
  ConversationInfo,
  XmtpMessage,
  LoadMessagesOptions,
  SignMessageFn,
} from './transport'

const IS_DEV = import.meta.env.DEV
const XMTP_ENV = (import.meta.env.VITE_XMTP_ENV || (IS_DEV ? 'dev' : 'production')) as
  | 'dev'
  | 'production'

const REQUEST_TIMEOUT_MS = 30_000

interface PendingRequest {
  resolve: (result: any) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface IPCResponse {
  id: string
  result?: any
  error?: { code: string; message: string }
}

interface IPCEvent {
  event: string
  data: any
}

export class SidecarTransport implements XmtpTransport {
  private process: Awaited<ReturnType<ReturnType<typeof Command.sidecar>['spawn']>> | null = null
  private pending = new Map<string, PendingRequest>()
  private messageCallbacks = new Map<string, (msg: XmtpMessage) => void>()
  private errorCallbacks = new Map<string, (err: Error) => void>()
  private signMessageFn: SignMessageFn | null = null
  private requestCounter = 0
  private connected = false
  private myInboxId: string | null = null

  async init(address: string, signMessage: SignMessageFn): Promise<void> {
    if (this.connected) return

    this.signMessageFn = signMessage

    // Get app data dir for sidecar DB storage
    const dataDir = await appDataDir()

    // Spawn sidecar
    const command = Command.sidecar('binaries/xmtp-sidecar', [dataDir])
    const child = await command.spawn()
    this.process = child

    // Wait for ready event
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Sidecar did not become ready')), 10_000)

      const onReady = () => {
        clearTimeout(timeout)
        resolve()
      }

      // Set up stdout line handler
      command.stdout.on('data', (line: string) => {
        this.handleLine(line, onReady)
      })

      command.stderr.on('data', (line: string) => {
        if (IS_DEV) console.log('[Sidecar/stderr]', line)
      })

      command.on('close', (data) => {
        if (IS_DEV) console.log('[Sidecar] Process exited:', data.code)
        this.connected = false
        // Reject all pending requests
        for (const [id, req] of this.pending) {
          clearTimeout(req.timer)
          req.reject(new Error('Sidecar process exited'))
          this.pending.delete(id)
        }
      })
    })

    // Initialize XMTP client in sidecar
    const result = await this.request('xmtp.init', { address, env: XMTP_ENV })
    this.myInboxId = result.inboxId
    this.connected = true

    if (IS_DEV) console.log('[Sidecar] Connected, inbox:', this.myInboxId)
  }

  disconnect(): void {
    if (this.process) {
      this.request('xmtp.disconnect', {}).catch(() => {})
      this.process.kill()
      this.process = null
    }
    this.connected = false
    this.myInboxId = null
    this.signMessageFn = null
    this.messageCallbacks.clear()
    this.errorCallbacks.clear()
    for (const [, req] of this.pending) {
      clearTimeout(req.timer)
      req.reject(new Error('Disconnected'))
    }
    this.pending.clear()
  }

  isConnected(): boolean {
    return this.connected
  }

  getInboxId(): string | null {
    return this.myInboxId
  }

  async listConversations(): Promise<ConversationInfo[]> {
    return this.request('xmtp.listConversations', {})
  }

  async getOrCreateConversation(peerAddress: string): Promise<string> {
    const result = await this.request('xmtp.createConversation', { peerAddress })
    return result.conversationId
  }

  async sendMessage(conversationId: string, content: string): Promise<void> {
    await this.request('xmtp.sendMessage', { conversationId, content })
  }

  async loadMessages(conversationId: string, options?: LoadMessagesOptions): Promise<XmtpMessage[]> {
    return this.request('xmtp.loadMessages', { conversationId, ...options })
  }

  streamMessages(
    conversationId: string,
    onMessage: (msg: XmtpMessage) => void,
    onError?: (err: Error) => void
  ): () => void {
    this.messageCallbacks.set(conversationId, onMessage)
    if (onError) this.errorCallbacks.set(conversationId, onError)

    this.request('xmtp.streamMessages', { conversationId }).catch((err) => {
      onError?.(err)
    })

    return () => {
      this.messageCallbacks.delete(conversationId)
      this.errorCallbacks.delete(conversationId)
      this.request('xmtp.stopStream', { conversationId }).catch(() => {})
    }
  }

  async updateConsent(conversationId: string, state: 'allowed' | 'denied' | 'unknown'): Promise<void> {
    await this.request('xmtp.updateConsent', { conversationId, state })
  }

  // --- Private ---

  private handleLine(line: string, onReady?: () => void): void {
    if (!line.trim()) return

    let parsed: any
    try {
      parsed = JSON.parse(line)
    } catch {
      if (IS_DEV) console.warn('[Sidecar] Failed to parse:', line)
      return
    }

    // Response to a request
    if ('id' in parsed && (parsed as IPCResponse).id) {
      const resp = parsed as IPCResponse
      const req = this.pending.get(resp.id)
      if (req) {
        clearTimeout(req.timer)
        this.pending.delete(resp.id)
        if (resp.error) {
          req.reject(new Error(`[${resp.error.code}] ${resp.error.message}`))
        } else {
          req.resolve(resp.result)
        }
      }
      return
    }

    // Push event
    if ('event' in parsed && (parsed as IPCEvent).event) {
      const evt = parsed as IPCEvent

      if (evt.event === 'ready') {
        onReady?.()
        return
      }

      if (evt.event === 'sign-request') {
        this.handleSignRequest(evt.data)
        return
      }

      if (evt.event === 'message') {
        const msg = evt.data as XmtpMessage
        const cb = this.messageCallbacks.get(msg.conversationId)
        cb?.(msg)
        return
      }

      if (evt.event === 'error') {
        const convId = evt.data?.conversationId
        if (convId) {
          const cb = this.errorCallbacks.get(convId)
          cb?.(new Error(evt.data.message))
        }
        return
      }
    }
  }

  private async handleSignRequest(data: { requestId: string; message: string }): Promise<void> {
    if (!this.signMessageFn) {
      console.error('[Sidecar] Sign request received but no signMessage function')
      return
    }

    try {
      const signature = await this.signMessageFn(data.message)
      await this.request('signing.resolve', {
        requestId: data.requestId,
        signature,
      })
    } catch (err) {
      console.error('[Sidecar] Failed to sign:', err)
    }
  }

  private request(method: string, params: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('Sidecar not running'))
        return
      }

      const id = `req-${++this.requestCounter}`
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request ${method} timed out after ${REQUEST_TIMEOUT_MS}ms`))
      }, REQUEST_TIMEOUT_MS)

      this.pending.set(id, { resolve, reject, timer })

      const line = JSON.stringify({ id, method, params }) + '\n'
      this.process.write(line)
    })
  }
}
