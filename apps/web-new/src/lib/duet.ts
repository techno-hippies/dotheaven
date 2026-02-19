const DEFAULT_DUET_BASE_URL = 'https://session-voice.deletion-backup782.workers.dev'

export interface DiscoverDuetRoomItem {
  room_id: string
  host_wallet: string
  status?: string | null
  title?: string | null
  live_amount?: string | null
  audience_mode?: 'free' | 'ticketed' | null
  listener_count?: number | null
  live_started_at?: number | null
  created_at?: number | null
}

interface DiscoverDuetRoomsResponse {
  rooms?: DiscoverDuetRoomItem[]
}

export interface LiveRoom {
  roomId: string
  title: string
  hostWallet: string
  listenerCount: number
  audienceMode: 'free' | 'ticketed'
  watchUrl: string
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value))
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed))
  }
  return 0
}

function toAudienceMode(room: DiscoverDuetRoomItem): 'free' | 'ticketed' {
  if (room.audience_mode === 'free' || room.audience_mode === 'ticketed') return room.audience_mode
  if (room.live_amount === '0') return 'free'
  return 'ticketed'
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function normalizeBaseUrl(raw: string | undefined): string {
  const trimmed = (raw || DEFAULT_DUET_BASE_URL).trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

function normalizeLiveRoom(room: DiscoverDuetRoomItem, duetBaseUrl: string): LiveRoom {
  return {
    roomId: room.room_id,
    title: room.title?.trim() || `Live Room ${room.room_id.slice(0, 8)}`,
    hostWallet: room.host_wallet,
    listenerCount: toNonNegativeInt(room.listener_count),
    audienceMode: toAudienceMode(room),
    watchUrl: `${duetBaseUrl}/duet/${room.room_id}/watch`,
  }
}

export async function fetchLiveRooms(): Promise<LiveRoom[]> {
  const duetBaseUrl = normalizeBaseUrl(import.meta.env.VITE_DUET_WORKER_URL || import.meta.env.VITE_SESSION_VOICE_URL)
  const response = await fetch(`${duetBaseUrl}/duet/discover`)
  if (!response.ok) {
    throw new Error(`duet_discover_http_${response.status}`)
  }
  const payload = await response.json() as DiscoverDuetRoomsResponse
  const rooms = payload.rooms || []

  return rooms
    .filter((room) => room.status === 'live' && !!room.room_id && !!room.host_wallet)
    .map((room) => normalizeLiveRoom(room, duetBaseUrl))
    .sort((a, b) => b.listenerCount - a.listenerCount)
    .map((room) => ({
      ...room,
      title: room.title || shortAddress(room.hostWallet),
    }))
}
