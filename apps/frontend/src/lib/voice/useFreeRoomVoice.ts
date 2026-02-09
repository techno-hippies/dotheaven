/**
 * Free Room Voice Hook
 *
 * SolidJS hook for free voice rooms with credit metering.
 * Similar to useP2PVoice but with:
 * - Heartbeat interval (30s) for credit metering
 * - Token renewal interval (45s) for short-lived Agora tokens
 * - Credits low / exhausted event handling
 * - Auto-disconnect on denied renewal
 */

import { createSignal, onCleanup } from 'solid-js'
import AgoraRTC, {
  type IAgoraRTCClient,
  type IMicrophoneAudioTrack,
  type IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng'
import type { VoiceState } from './types'
import type { PKPInfo, RoomEvent, CreateRoomOptions } from './rooms'
import {
  createRoom,
  joinRoom,
  sendHeartbeat,
  renewToken,
  leaveRoom,
} from './rooms'
import { AGORA_APP_ID } from './p2p'

const IS_DEV = import.meta.env.DEV

// Speaking detection constants
const SPEAK_THRESHOLD = 8       // Agora volume level (0-100) to consider speaking
const SPEAK_HOLD_MS = 2500      // Hold speaking state to bridge Agora volume event cadence
const PRUNE_INTERVAL_MS = 300   // How often to prune expired speaking entries

// =============================================================================
// Types
// =============================================================================

export interface UseFreeRoomVoiceOptions {
  pkpInfo: PKPInfo
  signMessage: (message: string) => Promise<string>
  onPeerJoined?: (uid: number) => void
  onPeerLeft?: (uid: number) => void
  onCreditsLow?: (remaining: number) => void
  onCreditsExhausted?: () => void
  onError?: (error: Error) => void
}

export interface UseFreeRoomVoiceReturn {
  state: () => VoiceState
  isMuted: () => boolean
  isHost: () => boolean
  createAndJoin: (options?: CreateRoomOptions) => Promise<void>
  join: (roomId: string) => Promise<void>
  leave: () => Promise<void>
  toggleMute: () => void
  roomId: () => string | null
  duration: () => number
  remainingSeconds: () => number
  participantCount: () => number
  speakingUids: () => number[]
  isSelfSpeaking: () => boolean
}

// =============================================================================
// Hook
// =============================================================================

export function useFreeRoomVoice(options: UseFreeRoomVoiceOptions): UseFreeRoomVoiceReturn {
  const [state, setState] = createSignal<VoiceState>('idle')
  const [isMuted, setIsMuted] = createSignal(false)
  const [isHost, setIsHost] = createSignal(false)
  const [currentRoomId, setCurrentRoomId] = createSignal<string | null>(null)
  const [duration, setDuration] = createSignal(0)
  const [remainingSeconds, setRemainingSeconds] = createSignal(0)
  const [participantCount, setParticipantCount] = createSignal(0)
  const [speakingUids, setSpeakingUids] = createSignal<number[]>([])
  const [isSelfSpeaking, setIsSelfSpeaking] = createSignal(false)

  let client: IAgoraRTCClient | null = null
  let localAudioTrack: IMicrophoneAudioTrack | null = null
  let connectionId: string | null = null
  let durationInterval: number | null = null
  let heartbeatInterval: number | null = null
  let renewInterval: number | null = null
  let pruneInterval: number | null = null
  let onVolumeIndicator: ((volumes: Array<{ uid: number; level: number }>) => void) | null = null

  // Speaking expiry tracking: uid → timestamp when speaking state should expire
  let selfSpeakingUntil = 0
  const peerSpeakingUntil = new Map<number, number>()

  const auth = {
    pkpInfo: options.pkpInfo,
    signMessage: options.signMessage,
  }

  /** Handle events from heartbeat/renew responses */
  function handleEvents(events?: RoomEvent[]) {
    if (!events) return
    for (const event of events) {
      if (event.type === 'credits_low') {
        if (IS_DEV) console.log('[FreeRoom] Credits low:', event.remaining_seconds, 's')
        options.onCreditsLow?.(event.remaining_seconds)
      } else if (event.type === 'credits_exhausted') {
        if (IS_DEV) console.log('[FreeRoom] Credits exhausted')
        options.onCreditsExhausted?.()
      }
    }
  }

  /** Start heartbeat + renewal intervals */
  function startIntervals(heartbeatSec: number, renewSec: number) {
    // Heartbeat
    heartbeatInterval = window.setInterval(async () => {
      const roomId = currentRoomId()
      if (!roomId || !connectionId) return
      try {
        const result = await sendHeartbeat(roomId, connectionId, auth)
        setRemainingSeconds(result.remaining_seconds)
        handleEvents(result.events)
      } catch (e) {
        console.error('[FreeRoom] Heartbeat failed:', e)
      }
    }, heartbeatSec * 1000)

    // Token renewal
    renewInterval = window.setInterval(async () => {
      const roomId = currentRoomId()
      if (!roomId || !connectionId || !client) return
      try {
        const result = await renewToken(roomId, connectionId, auth)
        setRemainingSeconds(result.remaining_seconds)
        handleEvents(result.events)

        if (result.denied) {
          if (IS_DEV) console.log('[FreeRoom] Token renewal denied:', result.reason)
          // Auto-disconnect — token will expire and Agora will disconnect
          options.onCreditsExhausted?.()
          await cleanup()
          setState('idle')
          return
        }

        // Renew token on Agora client
        if (result.agora_token && client) {
          await client.renewToken(result.agora_token)
          if (IS_DEV) console.log('[FreeRoom] Token renewed')
        }
      } catch (e) {
        console.error('[FreeRoom] Token renewal failed:', e)
      }
    }, renewSec * 1000)

    // Duration timer
    durationInterval = window.setInterval(() => {
      setDuration((d) => d + 1)
    }, 1000)
  }

  /** Internal join after room creation/lookup */
  async function joinInternal(roomId: string) {
    setState('connecting')
    setDuration(0)
    setParticipantCount(0)
    setIsHost(false)
    setIsMuted(false)

    try {
      client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })

      // Get room token/role first. Viewers should not publish mic by default.
      const joinResult = await joinRoom(roomId, auth)
      setIsHost(joinResult.is_host)
      connectionId = joinResult.connection_id
      setCurrentRoomId(roomId)
      setRemainingSeconds(joinResult.remaining_seconds)

      if (IS_DEV) {
        console.log('[FreeRoom] Joined:', {
          channel: joinResult.channel,
          uid: joinResult.agora_uid,
          remaining: joinResult.remaining_seconds,
        })
      }

      // Agora event handlers
      client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType) => {
        if (mediaType === 'audio') {
          await client!.subscribe(user, mediaType)
          user.audioTrack?.play()
        }
      })

      client.on('user-joined', (user) => {
        if (IS_DEV) console.log(`[FreeRoom] Peer joined (uid: ${user.uid})`)
        setParticipantCount((c) => c + 1)
        options.onPeerJoined?.(user.uid as number)
      })

      client.on('user-left', (user, reason) => {
        if (IS_DEV) console.log('[FreeRoom] Peer left:', reason)
        setParticipantCount((c) => Math.max(0, c - 1))
        options.onPeerLeft?.(user.uid as number)
      })

      // Join Agora channel
      await client.join(AGORA_APP_ID, joinResult.channel, joinResult.agora_token, joinResult.agora_uid)

      // Speaking detection via volume indicator
      client.enableAudioVolumeIndicator()
      onVolumeIndicator = (volumes) => {
        const now = Date.now()
        for (const v of volumes) {
          if (v.level < SPEAK_THRESHOLD) continue
          const expiry = now + SPEAK_HOLD_MS
          if (v.uid === 0 || v.uid === joinResult.agora_uid) {
            // Local user — uid 0 in some Agora versions, or own uid
            selfSpeakingUntil = expiry
          } else {
            peerSpeakingUntil.set(v.uid as number, expiry)
          }
        }
      }
      client.on('volume-indicator', onVolumeIndicator)

      // Prune expired speaking entries every 300ms
      pruneInterval = window.setInterval(() => {
        const now = Date.now()

        // Self
        if (selfSpeakingUntil > 0 && now >= selfSpeakingUntil) {
          selfSpeakingUntil = 0
          setIsSelfSpeaking(false)
        } else if (selfSpeakingUntil > now && !isSelfSpeaking()) {
          setIsSelfSpeaking(true)
        }

        // Peers
        let changed = false
        for (const [uid, expiry] of peerSpeakingUntil) {
          if (now >= expiry) {
            peerSpeakingUntil.delete(uid)
            changed = true
          }
        }
        // Also mark newly speaking peers
        const currentSpeaking = speakingUids()
        const newSpeaking = [...peerSpeakingUntil.keys()]
        if (changed || newSpeaking.length !== currentSpeaking.length ||
            newSpeaking.some((uid, i) => uid !== currentSpeaking[i])) {
          setSpeakingUids(newSpeaking)
        }
      }, PRUNE_INTERVAL_MS)

      // Only host publishes mic in v1.
      if (joinResult.is_host) {
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: 'speech_standard',
          AEC: true,
          ANS: true,
          AGC: true,
        }).catch((e) => {
          console.warn('[FreeRoom] Mic init failed:', e)
          return null
        })

        if (localAudioTrack) {
          await client.publish(localAudioTrack)
        }
      } else {
        localAudioTrack = null
        setIsMuted(true)
      }

      // Start intervals
      if (joinResult.heartbeat_interval_seconds && joinResult.renew_after_seconds) {
        startIntervals(joinResult.heartbeat_interval_seconds, joinResult.renew_after_seconds)
      }

      setState('connected')
    } catch (error) {
      console.error('[FreeRoom] Failed to join:', error)
      setState('error')
      options.onError?.(error instanceof Error ? error : new Error(String(error)))
      await cleanup()
      setState('idle')
    }
  }

  /** Create a new room and join it */
  const createAndJoin = async (createOptions?: CreateRoomOptions) => {
    if (state() !== 'idle') return

    try {
      setState('connecting')
      const result = await createRoom(auth, createOptions)
      if (IS_DEV) console.log('[FreeRoom] Created room:', result.room_id)
      await joinInternal(result.room_id)
    } catch (error) {
      console.error('[FreeRoom] Failed to create room:', error)
      setState('error')
      options.onError?.(error instanceof Error ? error : new Error(String(error)))
      setState('idle')
    }
  }

  /** Join an existing room */
  const join = async (roomId: string) => {
    if (state() !== 'idle') return
    await joinInternal(roomId)
  }

  /** Leave the current room */
  const leave = async () => {
    if (IS_DEV) console.log('[FreeRoom] Leaving room')
    await cleanup()
    setState('idle')
  }

  const cleanup = async () => {
    // Clear intervals
    if (durationInterval) { clearInterval(durationInterval); durationInterval = null }
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null }
    if (renewInterval) { clearInterval(renewInterval); renewInterval = null }
    if (pruneInterval) { clearInterval(pruneInterval); pruneInterval = null }

    // Reset speaking state
    selfSpeakingUntil = 0
    peerSpeakingUntil.clear()
    setSpeakingUids([])
    setIsSelfSpeaking(false)

    // Stop local audio
    if (localAudioTrack) {
      localAudioTrack.stop()
      localAudioTrack.close()
      localAudioTrack = null
    }

    // Leave Agora
    if (client) {
      if (onVolumeIndicator) {
        client.off('volume-indicator', onVolumeIndicator)
        onVolumeIndicator = null
      }
      await client.leave().catch((e) => {
        if (IS_DEV) console.warn('[FreeRoom] Agora leave error:', e)
      })
      client = null
    }

    // Notify backend
    const roomId = currentRoomId()
    if (roomId && connectionId) {
      try {
        await leaveRoom(roomId, connectionId, auth)
      } catch (e) {
        console.error('[FreeRoom] Failed to notify leave:', e)
      }
    }

    connectionId = null
    setCurrentRoomId(null)
    setParticipantCount(0)
    setIsHost(false)
    setIsMuted(false)
  }

  const toggleMute = () => {
    if (localAudioTrack) {
      const newMuted = !isMuted()
      localAudioTrack.setEnabled(!newMuted)
      setIsMuted(newMuted)
    }
  }

  onCleanup(() => { cleanup() })

  return {
    state,
    isMuted,
    isHost,
    createAndJoin,
    join,
    leave,
    toggleMute,
    roomId: currentRoomId,
    duration,
    remainingSeconds,
    participantCount,
    speakingUids,
    isSelfSpeaking,
  }
}
