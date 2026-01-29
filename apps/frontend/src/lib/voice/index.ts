/**
 * Voice Module
 * Real-time voice calls via Agora CAI
 */

export { useAgoraVoice, type VoiceState, type UseAgoraVoiceOptions, type UseAgoraVoiceReturn } from './useAgoraVoice'
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
