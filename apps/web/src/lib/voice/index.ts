/**
 * Voice Module
 * Real-time voice calls via Agora
 *
 * Two modes:
 * 1. AI agent calls (useAgoraVoice) - for AI chat
 * 2. P2P session calls (useP2PVoice) - for scheduled user sessions
 */

// AI agent calls
export { useAgoraVoice, type UseAgoraVoiceOptions, type UseAgoraVoiceReturn } from './useAgoraVoice'
export { useVoice } from './useVoice'
export type { VoiceState, VoiceProvider } from './types'
export {
  startAgent,
  stopAgent,
  clearVoiceAuthCache,
  getAgoraAppId,
  type StartAgentResult,
  type StartAgentError,
  type StartAgentResponse,
  type StopAgentResult,
} from './api'

// P2P session calls
export { useP2PVoice, type UseP2PVoiceOptions, type UseP2PVoiceReturn } from './useP2PVoice'
export {
  joinSession,
  joinSessionLocal,
  leaveSession,
  clearP2PAuthCache,
  type JoinSessionResult,
  type JoinSessionError,
  type JoinSessionResponse,
  type LeaveSessionResult,
} from './p2p'
