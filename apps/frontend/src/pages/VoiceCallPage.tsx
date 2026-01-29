/**
 * VoiceCallPage - Dedicated voice call page
 *
 * Full-screen voice call interface with Agora RTC.
 * Accessible at /chat/:chatId/call
 */

const IS_DEV = import.meta.env.DEV

import { Component, createSignal, createMemo, onMount, onCleanup } from 'solid-js'
import { useParams, useNavigate } from '@solidjs/router'
import { VoicePage } from '../components/chat/VoicePage'
import { useAuth } from '../providers'
import { useAgoraVoice, type VoiceState } from '../lib/voice'

// AI Personalities
const AI_PERSONALITIES = [
  {
    id: 'scarlett',
    name: 'Scarlett',
    avatarUrl: 'https://picsum.photos/seed/scarlett/200/200',
  },
]

export const VoiceCallPage: Component = () => {
  const params = useParams<{ chatId: string }>()
  const navigate = useNavigate()
  const auth = useAuth()

  // Voice state
  const [isBotSpeaking, setIsBotSpeaking] = createSignal(false)
  const [hasStartedCall, setHasStartedCall] = createSignal(false)

  // Get personality from URL
  const personality = createMemo(() => {
    const id = params.chatId
    return AI_PERSONALITIES.find((p: any) => p.id === id) || null
  })

  // Create signMessage function from wallet client
  const signMessage = async (message: string): Promise<string> => {
    return auth.signMessage(message)
  }

  // Initialize voice hook
  const pkpInfo = () => {
    const info = auth.pkpInfo()
    return info ? {
      tokenId: info.tokenId,
      publicKey: info.publicKey,
      ethAddress: info.ethAddress,
    } : null
  }

  const voice = createMemo(() => {
    const info = pkpInfo()
    if (!info) return null

    return useAgoraVoice({
      pkpInfo: info,
      signMessage,
      onBotSpeaking: () => setIsBotSpeaking(true),
      onBotSilent: () => setIsBotSpeaking(false),
      onError: (error) => {
        console.error('[VoiceCallPage] Voice error:', error)
      },
    })
  })

  // Voice state accessors
  const voiceState = (): VoiceState => voice()?.state() ?? 'idle'
  const voiceMuted = () => voice()?.isMuted() ?? false
  const voiceDuration = () => voice()?.duration() ?? 0

  // Auto-start call when page loads
  onMount(() => {
    if (IS_DEV) console.log('[VoiceCallPage] Mounted, auth ready:', auth.isAuthenticated())

    // If not authenticated, redirect to chat
    if (!auth.isAuthenticated()) {
      auth.loginWithPasskey()
      navigate(`/chat/${params.chatId}`, { replace: true })
      return
    }

    // Start call after a short delay to let hook initialize
    const timer = setTimeout(() => {
      if (voice() && !hasStartedCall()) {
        if (IS_DEV) console.log('[VoiceCallPage] Starting call...')
        setHasStartedCall(true)
        voice()?.startCall()
      }
    }, 100)

    onCleanup(() => clearTimeout(timer))
  })

  // Handle back / end call - navigate to chat
  const handleBack = () => {
    voice()?.endCall()
    navigate(`/chat/${params.chatId}`)
  }

  const handleEndCall = () => {
    voice()?.endCall()
    navigate(`/chat/${params.chatId}`)
  }

  const handleStartCall = () => {
    voice()?.startCall()
  }

  const handleToggleMute = () => {
    voice()?.toggleMute()
  }

  // If no personality found, redirect
  if (!personality()) {
    navigate('/chat', { replace: true })
    return null
  }

  return (
    <div class="h-[calc(var(--vh,1vh)*100)] md:h-screen flex flex-col">
      <div class="flex-1 flex flex-col max-w-2xl mx-auto w-full">
        <VoicePage
          state={voiceState()}
          isMuted={voiceMuted()}
          duration={voiceDuration()}
          isBotSpeaking={isBotSpeaking()}
          name={personality()!.name}
          avatarUrl={personality()!.avatarUrl}
          onBack={handleBack}
          onStartCall={handleStartCall}
          onEndCall={handleEndCall}
          onToggleMute={handleToggleMute}
        />
      </div>
    </div>
  )
}

export default VoiceCallPage
