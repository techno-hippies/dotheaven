/**
 * Voice Module
 * Real-time voice calls via Agora CAI
 */

export { useAgoraVoice, type UseAgoraVoiceOptions, type UseAgoraVoiceReturn } from './useAgoraVoice'
export { useJackTripVoice } from './useJackTripVoice'
export { useVoice } from './useVoice'
export type { VoiceState, VoiceProvider } from './types'
export {
  startAgent,
  stopAgent,
  clearVoiceAuthCache,
  AGORA_APP_ID,
  type StartAgentResult,
  type StartAgentError,
  type StartAgentResponse,
  type StopAgentResult,
} from './api'
