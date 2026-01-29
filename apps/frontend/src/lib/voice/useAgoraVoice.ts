/**
 * Agora Voice Hook
 *
 * Real-time voice conversation via Agora CAI (Conversational AI).
 * Uses Agora Web SDK to connect to RTC channel.
 */

import { createSignal, onCleanup } from 'solid-js'
import AgoraRTC, {
  type IAgoraRTCClient,
  type IMicrophoneAudioTrack,
  type IRemoteAudioTrack,
} from 'agora-rtc-sdk-ng'
import type { PKPInfo } from './api'
import { startAgent, stopAgent, AGORA_APP_ID } from './api'

const IS_DEV = import.meta.env.DEV

// Agora SDK log level (0=none, 1=error, 2=warn, 3=info, 4=debug)
AgoraRTC.setLogLevel(IS_DEV ? 3 : 1)

// =============================================================================
// Types
// =============================================================================

export type VoiceState = 'idle' | 'connecting' | 'connected' | 'error'

export interface UseAgoraVoiceOptions {
  /** PKP wallet info */
  pkpInfo: PKPInfo
  /** Sign message function from auth context */
  signMessage: (message: string) => Promise<string>
  /** Called when bot starts speaking */
  onBotSpeaking?: () => void
  /** Called when bot stops speaking */
  onBotSilent?: () => void
  /** Called on error */
  onError?: (error: Error) => void
}

export interface UseAgoraVoiceReturn {
  /** Current connection state */
  state: () => VoiceState
  /** Whether microphone is muted */
  isMuted: () => boolean
  /** Start a voice call */
  startCall: () => Promise<void>
  /** End the current call */
  endCall: () => Promise<void>
  /** Toggle microphone mute */
  toggleMute: () => void
  /** Current session ID */
  sessionId: () => string | null
  /** Call duration in seconds */
  duration: () => number
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useAgoraVoice(options: UseAgoraVoiceOptions): UseAgoraVoiceReturn {
  const [state, setState] = createSignal<VoiceState>('idle')
  const [isMuted, setIsMuted] = createSignal(false)
  const [sessionId, setSessionId] = createSignal<string | null>(null)
  const [duration, setDuration] = createSignal(0)

  // Agora client and tracks
  let client: IAgoraRTCClient | null = null
  let localAudioTrack: IMicrophoneAudioTrack | null = null
  let remoteAudioTrack: IRemoteAudioTrack | null = null

  // State tracking
  const [botHasAudio, setBotHasAudio] = createSignal(false)
  let isSpeaking = false
  let speakingTimeout: number | null = null
  let unpublishDebounce: number | null = null
  let durationInterval: number | null = null

  const setIsSpeaking = (speaking: boolean) => {
    if (speaking === isSpeaking) return
    isSpeaking = speaking
    if (speaking) {
      options.onBotSpeaking?.()
    } else {
      options.onBotSilent?.()
    }
  }

  const startCall = async () => {
    if (state() !== 'idle') {
      if (IS_DEV) console.warn('[AgoraVoice] Already in a call')
      return
    }

    setState('connecting')
    setDuration(0)

    try {
      if (IS_DEV) console.log('[AgoraVoice] Starting agent + mic in parallel...')

      // Create Agora client early
      client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })

      // Start agent AND mic track creation in parallel
      const [result, micTrack] = await Promise.all([
        startAgent(options.pkpInfo, options.signMessage),
        AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: 'speech_standard',
          AEC: true,
          ANS: true,
          AGC: true,
        }).catch((e) => {
          console.warn('[AgoraVoice] Mic init failed:', e)
          return null
        }),
      ])

      if (!result.ok) {
        micTrack?.close()
        throw new Error(result.error)
      }

      localAudioTrack = micTrack

      setSessionId(result.sessionId)

      if (IS_DEV) {
        console.log('[AgoraVoice] Agent started:', {
          sessionId: result.sessionId,
          channel: result.channel,
        })
      }

      // Set up event handlers
      client.on('user-published', async (user, mediaType) => {
        if (IS_DEV) console.log(`[AgoraVoice] Bot published: ${mediaType}`)

        if (mediaType === 'audio') {
          if (unpublishDebounce) {
            clearTimeout(unpublishDebounce)
            unpublishDebounce = null
          }

          await client!.subscribe(user, mediaType)
          remoteAudioTrack = user.audioTrack || null

          if (remoteAudioTrack) {
            remoteAudioTrack.play()
            setBotHasAudio(true)
            if (IS_DEV) console.log('[AgoraVoice] Playing bot audio')
          }
        }
      })

      client.on('user-unpublished', (_user, mediaType) => {
        if (IS_DEV) console.log(`[AgoraVoice] Bot unpublished: ${mediaType}`)

        if (mediaType === 'audio') {
          remoteAudioTrack = null
          setBotHasAudio(false)

          if (unpublishDebounce) clearTimeout(unpublishDebounce)
          unpublishDebounce = window.setTimeout(() => {
            if (!botHasAudio()) {
              setIsSpeaking(false)
            }
          }, 300)
        }
      })

      client.on('user-joined', (user) => {
        if (IS_DEV) console.log(`[AgoraVoice] Bot joined channel (uid: ${user.uid})`)
      })

      client.on('user-left', (_user, reason) => {
        if (IS_DEV) console.log('[AgoraVoice] Bot left channel:', reason)
      })

      client.on('connection-state-change', (curState, prevState, reason) => {
        if (IS_DEV) console.log('[AgoraVoice] Connection:', prevState, '->', curState, reason || '')
      })

      // Enable volume indicator for speaking detection
      client.enableAudioVolumeIndicator()
      client.on('volume-indicator', (volumes) => {
        if (!botHasAudio()) return

        for (const v of volumes) {
          if (v.uid !== 0 && v.level > 25) {
            setIsSpeaking(true)

            if (speakingTimeout) clearTimeout(speakingTimeout)
            speakingTimeout = window.setTimeout(() => {
              setIsSpeaking(false)
            }, 600)
          }
        }
      })

      // Join channel
      if (IS_DEV) console.log('[AgoraVoice] Joining channel...')
      await client.join(AGORA_APP_ID, result.channel, result.agoraToken, result.userUid)
      if (IS_DEV) console.log(`[AgoraVoice] Joined as uid: ${result.userUid}`)

      // Publish microphone track
      if (localAudioTrack) {
        await client.publish(localAudioTrack)
        if (IS_DEV) console.log('[AgoraVoice] Published microphone')
      } else {
        console.warn('[AgoraVoice] No mic track available')
      }

      // Start duration timer
      durationInterval = window.setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)

      setState('connected')
    } catch (error) {
      console.error('[AgoraVoice] Failed to start call:', error)
      setState('error')
      options.onError?.(error instanceof Error ? error : new Error(String(error)))
      await cleanup()
      setState('idle')
    }
  }

  const endCall = async () => {
    if (IS_DEV) console.log('[AgoraVoice] Ending call')
    await cleanup()
    setState('idle')
  }

  const cleanup = async () => {
    // Clear timers
    if (speakingTimeout) {
      clearTimeout(speakingTimeout)
      speakingTimeout = null
    }
    if (unpublishDebounce) {
      clearTimeout(unpublishDebounce)
      unpublishDebounce = null
    }
    if (durationInterval) {
      clearInterval(durationInterval)
      durationInterval = null
    }
    isSpeaking = false

    // Stop local audio
    if (localAudioTrack) {
      localAudioTrack.stop()
      localAudioTrack.close()
      localAudioTrack = null
    }

    // Leave channel
    if (client) {
      await client.leave().catch((e) => {
        if (IS_DEV) console.warn('[AgoraVoice] Leave error:', e)
      })
      client = null
    }

    // Stop agent
    const currentSessionId = sessionId()
    if (currentSessionId) {
      try {
        await stopAgent(options.pkpInfo, options.signMessage, currentSessionId)
        if (IS_DEV) console.log('[AgoraVoice] Agent stopped')
      } catch (error) {
        console.error('[AgoraVoice] Failed to stop agent:', error)
      }
    }

    setSessionId(null)
    remoteAudioTrack = null
    setBotHasAudio(false)
  }

  const toggleMute = () => {
    if (localAudioTrack) {
      const newMuted = !isMuted()
      localAudioTrack.setEnabled(!newMuted)
      setIsMuted(newMuted)
      if (IS_DEV) console.log('[AgoraVoice] Mute:', newMuted)
    }
  }

  // Cleanup on unmount
  onCleanup(() => {
    cleanup()
  })

  return {
    state,
    isMuted,
    startCall,
    endCall,
    toggleMute,
    sessionId,
    duration,
  }
}
