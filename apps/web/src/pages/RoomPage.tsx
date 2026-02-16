/**
 * RoomPage — standalone voice room page
 *
 * Entry modes:
 *   /room/new?visibility=open   → create a new room and join
 *   /room/:uuid                 → join an existing room
 *
 * Host status is derived from the room join response (`is_host`), so
 * refresh/deeplink preserves host controls for the actual host.
 *
 * Participant resolution (v1):
 *   - Self: own PKP address → heaven name lookup
 *   - Peers: generic "User XXXX" display names, default avatars
 *   - isSpeaking: driven by Agora volume-indicator (threshold=8, hold=1.2s)
 *   - All participants are on stage (no stage/audience split yet)
 */

import { type Component, createSignal, createEffect, on, Show, onCleanup } from 'solid-js'
import { useNavigate, useParams, useSearchParams } from '@solidjs/router'
import { RoomPanel, type RoomParticipant } from '@heaven/ui'
import { HOME, AUTH, room as roomRoute } from '@heaven/core'
import { useAuth } from '../providers'
import { useFreeRoomVoice } from '../lib/voice/useFreeRoomVoice'
import type { RoomVisibility } from '../lib/voice/rooms'
import { addToast } from '../lib/toast'

// ── Helpers ──────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Map known API error codes to user-facing messages */
function errorMessage(error: Error): string {
  const msg = error.message
  if (msg === 'heaven_name_required') return 'You need a .heaven name to create a room.'
  if (msg === 'insufficient_credits') return 'Not enough credits to join a room.'
  if (msg === 'already_hosting_free_room') return 'You already have an active room. Close it first.'
  if (msg === 'already_in_free_room') return 'You are already in another room.'
  if (msg === 'room_not_found') return 'Room not found or already closed.'
  if (msg === 'room_full') return 'This room is full.'
  return msg
}

// ── Component ────────────────────────────────────────────────────────

export const RoomPage: Component = () => {
  const params = useParams<{ roomId: string }>()
  const [searchParams] = useSearchParams<{ visibility?: string; ai_enabled?: string }>()
  const navigate = useNavigate()
  const auth = useAuth()

  // Guards against duplicate side effects
  let creatingRef = false
  let joinedRoomRef: string | null = null

  // Peer tracking: Agora UIDs we know about
  const [peerUids, setPeerUids] = createSignal<number[]>([])
  const [isMobile, setIsMobile] = createSignal(
    typeof window !== 'undefined' ? window.innerWidth < 768 : true,
  )

  // Error state for inline display
  const [pageError, setPageError] = createSignal<string | null>(null)

  // ── Auth guard ───────────────────────────────────────────────────

  if (!auth.isAuthenticated() && !auth.isSessionRestoring()) {
    navigate(AUTH, { replace: true })
    return null
  }

  // ── Voice hook ───────────────────────────────────────────────────

  const pkpInfo = auth.pkpInfo()
  if (!pkpInfo) {
    // Session restoring — wait for it
    createEffect(() => {
      if (!auth.isSessionRestoring() && !auth.pkpInfo()) {
        navigate(AUTH, { replace: true })
      }
    })
    return (
      <div class="flex items-center justify-center h-screen bg-[var(--bg-page)]">
        <p class="text-[var(--text-muted)]">Restoring session...</p>
      </div>
    )
  }

  const voice = useFreeRoomVoice({
    pkpInfo,
    signMessage: (msg) => auth.signMessage(msg),
    onPeerJoined: (uid) => {
      setPeerUids((prev) => (prev.includes(uid) ? prev : [...prev, uid]))
    },
    onPeerLeft: (uid) => {
      setPeerUids((prev) => prev.filter((u) => u !== uid))
    },
    onCreditsLow: (remaining) => {
      addToast(`Credits low: ${Math.floor(remaining / 60)}m remaining`, 'info')
    },
    onCreditsExhausted: () => {
      addToast('Credits exhausted. Leaving room.', 'error')
      void voice.leave().finally(() => navigate(HOME, { replace: true }))
    },
    onError: (error) => {
      const msg = errorMessage(error)
      setPageError(msg)
      addToast(msg, 'error')
    },
  })

  if (typeof window !== 'undefined') {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    onCleanup(() => window.removeEventListener('resize', onResize))
  }

  // ── Create or Join on mount ──────────────────────────────────────

  createEffect(on(
    () => params.roomId,
    (roomId) => {
      if (!roomId) return
      setPeerUids([])

      if (roomId === 'new') {
        // Create new room — guard against double-fire
        if (creatingRef) return
        creatingRef = true
        setPageError(null)

        const visibility = (searchParams.visibility === 'private' ? 'private' : 'open') as RoomVisibility
        const aiEnabled = searchParams.ai_enabled === 'true'

        voice.createAndJoin({ visibility, ai_enabled: aiEnabled }).then(() => {
          const newRoomId = voice.roomId()
          if (newRoomId) {
            joinedRoomRef = newRoomId
            navigate(roomRoute(newRoomId), { replace: true })
          }
        }).catch(() => {
          // Error already handled by onError callback
          creatingRef = false
        })
      } else {
        // Join existing room — guard against duplicate join for same room
        if (joinedRoomRef === roomId) return
        joinedRoomRef = roomId
        setPageError(null)

        voice.join(roomId).catch(() => {
          // Error already handled by onError callback
          joinedRoomRef = null
        })
      }
    },
  ))

  // ── Build participant list ───────────────────────────────────────

  const participants = (): RoomParticipant[] => {
    const speaking = voice.speakingUids()

    const self: RoomParticipant = {
      id: 'self',
      name: 'You',
      isOnStage: true,
      isSpeaking: voice.isSelfSpeaking(),
    }

    const peers = peerUids().map((uid): RoomParticipant => ({
      id: String(uid),
      name: `User ${String(uid).slice(-4)}`,
      isOnStage: true,
      isSpeaking: speaking.includes(uid),
    }))

    return [self, ...peers]
  }

  // ── Handlers ─────────────────────────────────────────────────────

  const handleLeave = async () => {
    await voice.leave()
    setPeerUids([])
    navigate(HOME, { replace: true })
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div class="h-screen w-screen bg-[var(--bg-page)]">
      <Show when={pageError() && voice.state() !== 'connected' && voice.state() !== 'connecting'}>
        <div class="flex flex-col items-center justify-center h-full gap-4 px-6">
          <p class="text-[var(--text-primary)] text-lg text-center">{pageError()}</p>
          <button
            class="px-6 py-2 rounded-full bg-[var(--accent-blue)] text-white font-medium"
            onClick={() => navigate(HOME, { replace: true })}
          >
            Go Home
          </button>
        </div>
      </Show>

      <Show when={voice.state() === 'connecting'}>
        <div class="flex items-center justify-center h-full">
          <p class="text-[var(--text-muted)]">Connecting...</p>
        </div>
      </Show>

      <Show when={voice.state() === 'connected'}>
        <RoomPanel
          size={isMobile() ? 'compact' : 'full'}
          role={voice.isHost() ? 'host' : 'viewer'}
          duration={formatDuration(voice.duration())}
          participants={participants()}
          isMuted={voice.isMuted()}
          onMicToggle={() => voice.toggleMute()}
          onClose={handleLeave}
          class="h-full"
        />
      </Show>

      <Show when={voice.state() === 'idle' && !pageError()}>
        <div class="flex items-center justify-center h-full">
          <p class="text-[var(--text-muted)]">Initializing...</p>
        </div>
      </Show>
    </div>
  )
}
