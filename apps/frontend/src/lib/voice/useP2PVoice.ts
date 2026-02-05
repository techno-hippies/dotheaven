/**
 * P2P Voice Hook
 *
 * Real-time voice calls between two users for scheduled sessions.
 * Uses Agora Web SDK with booking ID as channel name.
 */

import { createSignal, onCleanup } from 'solid-js'
import AgoraRTC, {
  type IAgoraRTCClient,
  type IMicrophoneAudioTrack,
  type IRemoteAudioTrack,
  type IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng'
import type { PKPInfo } from './api'
import { joinSession, leaveSession, AGORA_APP_ID } from './p2p'
import type { VoiceState } from './types'

const IS_DEV = import.meta.env.DEV

// =============================================================================
// Types
// =============================================================================

export interface UseP2PVoiceOptions {
  /** PKP wallet info */
  pkpInfo: PKPInfo
  /** Sign message function from auth context */
  signMessage: (message: string) => Promise<string>
  /** Called when peer joins the call */
  onPeerJoined?: (uid: number) => void
  /** Called when peer leaves the call */
  onPeerLeft?: (uid: number) => void
  /** Called on error */
  onError?: (error: Error) => void
}

export interface UseP2PVoiceReturn {
  /** Current connection state */
  state: () => VoiceState
  /** Whether microphone is muted */
  isMuted: () => boolean
  /** Join a session call */
  joinCall: (bookingId: string) => Promise<void>
  /** Leave the current call */
  leaveCall: () => Promise<void>
  /** Toggle microphone mute */
  toggleMute: () => void
  /** Current booking ID */
  bookingId: () => string | null
  /** Call duration in seconds */
  duration: () => number
  /** Whether peer is in the call */
  peerConnected: () => boolean
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useP2PVoice(options: UseP2PVoiceOptions): UseP2PVoiceReturn {
  const [state, setState] = createSignal<VoiceState>('idle')
  const [isMuted, setIsMuted] = createSignal(false)
  const [bookingId, setBookingId] = createSignal<string | null>(null)
  const [duration, setDuration] = createSignal(0)
  const [peerConnected, setPeerConnected] = createSignal(false)

  // Agora client and tracks
  let client: IAgoraRTCClient | null = null
  let localAudioTrack: IMicrophoneAudioTrack | null = null
  let remoteAudioTrack: IRemoteAudioTrack | null = null
  let durationInterval: number | null = null

  const joinCall = async (newBookingId: string) => {
    if (state() !== 'idle') {
      if (IS_DEV) console.warn('[P2PVoice] Already in a call')
      return
    }

    setState('connecting')
    setDuration(0)
    setPeerConnected(false)

    try {
      if (IS_DEV) console.log('[P2PVoice] Joining session:', newBookingId)

      // Create Agora client
      client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })

      // Get token and create mic track in parallel
      const [result, micTrack] = await Promise.all([
        joinSession(newBookingId, options.pkpInfo, options.signMessage),
        AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: 'speech_standard',
          AEC: true,
          ANS: true,
          AGC: true,
        }).catch((e) => {
          console.warn('[P2PVoice] Mic init failed:', e)
          return null
        }),
      ])

      if (!result.ok) {
        micTrack?.close()
        throw new Error(result.error)
      }

      localAudioTrack = micTrack
      setBookingId(newBookingId)

      if (IS_DEV) {
        console.log('[P2PVoice] Got session token:', {
          channel: result.channel,
          uid: result.userUid,
        })
      }

      // Set up event handlers for peer
      client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType) => {
        if (IS_DEV) console.log(`[P2PVoice] Peer published: ${mediaType}`)

        if (mediaType === 'audio') {
          await client!.subscribe(user, mediaType)
          remoteAudioTrack = user.audioTrack || null

          if (remoteAudioTrack) {
            remoteAudioTrack.play()
            if (IS_DEV) console.log('[P2PVoice] Playing peer audio')
          }
        }
      })

      client.on('user-unpublished', (_user, mediaType) => {
        if (IS_DEV) console.log(`[P2PVoice] Peer unpublished: ${mediaType}`)

        if (mediaType === 'audio') {
          remoteAudioTrack = null
        }
      })

      client.on('user-joined', (user) => {
        if (IS_DEV) console.log(`[P2PVoice] Peer joined (uid: ${user.uid})`)
        setPeerConnected(true)
        options.onPeerJoined?.(user.uid as number)
      })

      client.on('user-left', (user, reason) => {
        if (IS_DEV) console.log('[P2PVoice] Peer left:', reason)
        setPeerConnected(false)
        options.onPeerLeft?.(user.uid as number)
      })

      client.on('connection-state-change', (curState, prevState, reason) => {
        if (IS_DEV) console.log('[P2PVoice] Connection:', prevState, '->', curState, reason || '')
      })

      // Join channel
      if (IS_DEV) console.log('[P2PVoice] Joining channel...')
      await client.join(AGORA_APP_ID, result.channel, result.agoraToken, result.userUid)
      if (IS_DEV) console.log(`[P2PVoice] Joined as uid: ${result.userUid}`)

      // Publish microphone track
      if (localAudioTrack) {
        await client.publish(localAudioTrack)
        if (IS_DEV) console.log('[P2PVoice] Published microphone')
      } else {
        console.warn('[P2PVoice] No mic track available')
      }

      // Start duration timer
      durationInterval = window.setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)

      setState('connected')
    } catch (error) {
      console.error('[P2PVoice] Failed to join call:', error)
      setState('error')
      options.onError?.(error instanceof Error ? error : new Error(String(error)))
      await cleanup()
      setState('idle')
    }
  }

  const leaveCall = async () => {
    if (IS_DEV) console.log('[P2PVoice] Leaving call')
    await cleanup()
    setState('idle')
  }

  const cleanup = async () => {
    // Clear timer
    if (durationInterval) {
      clearInterval(durationInterval)
      durationInterval = null
    }

    // Stop local audio
    if (localAudioTrack) {
      localAudioTrack.stop()
      localAudioTrack.close()
      localAudioTrack = null
    }

    // Leave channel
    if (client) {
      await client.leave().catch((e) => {
        if (IS_DEV) console.warn('[P2PVoice] Leave error:', e)
      })
      client = null
    }

    // Notify backend
    const currentBookingId = bookingId()
    if (currentBookingId) {
      try {
        await leaveSession(currentBookingId, options.pkpInfo, options.signMessage)
        if (IS_DEV) console.log('[P2PVoice] Notified backend of leave')
      } catch (error) {
        console.error('[P2PVoice] Failed to notify leave:', error)
      }
    }

    setBookingId(null)
    remoteAudioTrack = null
    setPeerConnected(false)
  }

  const toggleMute = () => {
    if (localAudioTrack) {
      const newMuted = !isMuted()
      localAudioTrack.setEnabled(!newMuted)
      setIsMuted(newMuted)
      if (IS_DEV) console.log('[P2PVoice] Mute:', newMuted)
    }
  }

  // Cleanup on unmount
  onCleanup(() => {
    cleanup()
  })

  return {
    state,
    isMuted,
    joinCall,
    leaveCall,
    toggleMute,
    bookingId,
    duration,
    peerConnected,
  }
}
