export type VoiceState = 'idle' | 'connecting' | 'connected' | 'error'

export interface VoiceProvider {
  state: () => VoiceState
  isMuted: () => boolean
  startCall: () => Promise<void>
  endCall: () => Promise<void>
  toggleMute: () => void
  sessionId: () => string | null
  duration: () => number
}
