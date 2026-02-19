import type { UseAgoraVoiceOptions } from './useAgoraVoice'
import { useAgoraVoice } from './useAgoraVoice'

export const useVoice = (options: UseAgoraVoiceOptions) => {
  return useAgoraVoice(options)
}
