import type { UseAgoraVoiceOptions } from './useAgoraVoice'
import { useAgoraVoice } from './useAgoraVoice'
import { useJackTripVoice } from './useJackTripVoice'

const isTauri = () => '__TAURI__' in window || '__TAURI_INTERNALS__' in window

export const useVoice = (options: UseAgoraVoiceOptions) => {
  return isTauri() ? useJackTripVoice(options) : useAgoraVoice(options)
}
