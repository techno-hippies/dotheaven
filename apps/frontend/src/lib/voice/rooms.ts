/**
 * Free Room Voice API Client
 *
 * API client for free voice rooms (alongside existing p2p.ts for booked sessions).
 * Uses the same nonce-based auth flow via worker-auth.ts.
 */

import { getWorkerToken } from '../worker-auth'

const IS_DEV = import.meta.env.DEV

const SESSION_VOICE_URL = import.meta.env.VITE_SESSION_VOICE_URL || (
  import.meta.env.DEV ? 'http://localhost:3338' : 'https://session-voice.heaven.dev'
)

// =============================================================================
// Types
// =============================================================================

export interface CreateRoomResponse {
  room_id: string
  channel: string
}

export interface JoinRoomResponse {
  room_id: string
  channel: string
  connection_id: string
  agora_uid: number
  host_wallet: string
  is_host: boolean
  agora_token: string
  token_expires_in_seconds: number
  renew_after_seconds: number | null
  heartbeat_interval_seconds: number | null
  remaining_seconds: number
}

export interface HeartbeatResponse {
  ok: boolean
  remaining_seconds: number
  events: RoomEvent[]
}

export interface RenewResponse {
  agora_token?: string
  token_expires_in_seconds?: number
  remaining_seconds: number
  events?: RoomEvent[]
  denied?: boolean
  reason?: string
}

export interface LeaveResponse {
  ok: boolean
  debited_seconds: number
  remaining_seconds: number
  closed: boolean
}

export interface CreditsResponse {
  remaining_seconds: number
  base_granted_seconds: number
  bonus_granted_seconds: number
  consumed_seconds: number
}

export interface RoomEvent {
  type: 'credits_low' | 'credits_exhausted'
  wallet: string
  remaining_seconds: number
  at_epoch: number
}

export interface PKPInfo {
  tokenId: string
  publicKey: string
  ethAddress: string
}

export type RoomVisibility = 'open' | 'private'

export interface CreateRoomOptions {
  visibility?: RoomVisibility
  ai_enabled?: boolean
}

interface AuthContext {
  pkpInfo: PKPInfo
  signMessage: (message: string) => Promise<string>
}

// =============================================================================
// Internal helpers
// =============================================================================

async function authedFetch(
  path: string,
  auth: AuthContext,
  body?: Record<string, unknown>,
): Promise<Response> {
  const token = await getWorkerToken({
    workerUrl: SESSION_VOICE_URL,
    wallet: auth.pkpInfo.ethAddress,
    signMessage: auth.signMessage,
    logPrefix: 'FreeRoom',
  })

  return fetch(`${SESSION_VOICE_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body && { body: JSON.stringify(body) }),
  })
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json()
  if (!res.ok) {
    const errorData = data as { error?: string }
    throw new Error(errorData.error || `HTTP ${res.status}`)
  }
  return data as T
}

// =============================================================================
// API functions
// =============================================================================

/** Get current credit balance */
export async function getCredits(auth: AuthContext): Promise<CreditsResponse> {
  const res = await authedFetch('/credits', auth)
  return handleResponse<CreditsResponse>(res)
}

/** Verify Celo and grant bonus credits */
export async function verifyCelo(auth: AuthContext): Promise<{ granted: boolean; remaining_seconds: number }> {
  const res = await authedFetch('/credits/verify-celo', auth, {})
  return handleResponse<{ granted: boolean; remaining_seconds: number }>(res)
}

/** Create a free room */
export async function createRoom(auth: AuthContext, options?: CreateRoomOptions): Promise<CreateRoomResponse> {
  if (IS_DEV) console.log('[FreeRoom] Creating room...', options)
  const res = await authedFetch('/rooms/create', auth, {
    visibility: options?.visibility,
    ai_enabled: options?.ai_enabled,
  })
  return handleResponse<CreateRoomResponse>(res)
}

/** List open active rooms (no auth required) */
export async function getActiveRooms(): Promise<ActiveRoomsResponse> {
  const res = await fetch(`${SESSION_VOICE_URL}/rooms/active`)
  return handleResponse<ActiveRoomsResponse>(res)
}

export interface ActiveRoomsResponse {
  rooms: ActiveRoom[]
}

export interface ActiveRoom {
  room_id: string
  host_wallet: string
  participant_count: number
  created_at: string
}

/** Join an existing free room */
export async function joinRoom(roomId: string, auth: AuthContext): Promise<JoinRoomResponse> {
  if (IS_DEV) console.log('[FreeRoom] Joining room:', roomId)
  const res = await authedFetch('/rooms/join', auth, { room_id: roomId })
  return handleResponse<JoinRoomResponse>(res)
}

/** Send heartbeat (call every heartbeat_interval_seconds) */
export async function sendHeartbeat(
  roomId: string,
  connectionId: string,
  auth: AuthContext,
): Promise<HeartbeatResponse> {
  const res = await authedFetch('/rooms/heartbeat', auth, {
    room_id: roomId,
    connection_id: connectionId,
  })
  return handleResponse<HeartbeatResponse>(res)
}

/** Renew Agora token (call every renew_after_seconds) */
export async function renewToken(
  roomId: string,
  connectionId: string,
  auth: AuthContext,
): Promise<RenewResponse> {
  if (IS_DEV) console.log('[FreeRoom] Renewing token...')
  const res = await authedFetch('/rooms/token/renew', auth, {
    room_id: roomId,
    connection_id: connectionId,
  })
  return handleResponse<RenewResponse>(res)
}

/** Leave a room */
export async function leaveRoom(
  roomId: string,
  connectionId: string,
  auth: AuthContext,
): Promise<LeaveResponse> {
  if (IS_DEV) console.log('[FreeRoom] Leaving room:', roomId)
  const res = await authedFetch('/rooms/leave', auth, {
    room_id: roomId,
    connection_id: connectionId,
  })
  return handleResponse<LeaveResponse>(res)
}
