/**
 * XMTP Sidecar Entry Point
 *
 * Long-lived process that communicates via NDJSON over stdio.
 * Stdin: receives requests from Tauri frontend
 * Stdout: sends responses and push events to frontend
 * Stderr: logging (not part of IPC protocol)
 */

import { createInterface } from 'node:readline'
import {
  Methods,
  Events,
  sendResponse,
  sendError,
  sendEvent,
  type IPCRequest,
} from './protocol.js'
import { resolveSignRequest } from './signer.js'
import * as service from './service.js'

// Set data dir from first CLI arg if provided (Tauri passes app data dir)
const dataDirArg = process.argv[2]
if (dataDirArg) {
  service.setDataDir(dataDirArg)
}

const rl = createInterface({ input: process.stdin })

async function handleRequest(req: IPCRequest): Promise<void> {
  const { id, method, params } = req

  try {
    switch (method) {
      case Methods.INIT: {
        const inboxId = await service.init(params.address, params.env)
        sendResponse(id, { inboxId })
        break
      }
      case Methods.DISCONNECT: {
        service.disconnect()
        sendResponse(id, { ok: true })
        break
      }
      case Methods.LIST_CONVERSATIONS: {
        const conversations = await service.listConversations()
        sendResponse(id, conversations)
        break
      }
      case Methods.CREATE_CONVERSATION: {
        const conversationId = await service.createConversation(params.peerAddress)
        sendResponse(id, { conversationId })
        break
      }
      case Methods.SEND_MESSAGE: {
        await service.sendMessage(params.conversationId, params.content)
        sendResponse(id, { ok: true })
        break
      }
      case Methods.LOAD_MESSAGES: {
        const messages = await service.loadMessages(params.conversationId, {
          limit: params.limit,
          sentAfterNs: params.sentAfterNs,
        })
        sendResponse(id, messages)
        break
      }
      case Methods.STREAM_MESSAGES: {
        await service.streamMessages(params.conversationId)
        sendResponse(id, { ok: true })
        break
      }
      case Methods.STOP_STREAM: {
        service.stopStream(params.conversationId)
        sendResponse(id, { ok: true })
        break
      }
      case Methods.UPDATE_CONSENT: {
        await service.updateConsent(params.conversationId, params.state)
        sendResponse(id, { ok: true })
        break
      }
      case Methods.SIGNING_RESOLVE: {
        resolveSignRequest(params.requestId, params.signature)
        sendResponse(id, { ok: true })
        break
      }
      default:
        sendError(id, 'METHOD_NOT_FOUND', `Unknown method: ${method}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[sidecar] Error handling ${method}:`, message)
    sendError(id, 'INTERNAL_ERROR', message)
  }
}

rl.on('line', (line: string) => {
  if (!line.trim()) return
  try {
    const req = JSON.parse(line) as IPCRequest
    if (!req.id || !req.method) {
      console.error('[sidecar] Invalid request (missing id or method):', line)
      return
    }
    handleRequest(req)
  } catch {
    console.error('[sidecar] Failed to parse request:', line)
  }
})

rl.on('close', () => {
  service.disconnect()
  process.exit(0)
})

// Signal ready
sendEvent(Events.READY, { pid: process.pid })
