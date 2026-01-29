/**
 * JackTrip Voice Hook (Tauri desktop)
 *
 * Uses Tauri invoke commands to manage JACK + JackTrip processes.
 */

import { createSignal, onCleanup } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import type { VoiceState } from './types'
import type { UseAgoraVoiceOptions } from './useAgoraVoice'

const IS_DEV = import.meta.env.DEV

const JACKTRIP_SERVER = import.meta.env.VITE_JACKTRIP_SERVER || '127.0.0.1'
const JACKTRIP_PORT = Number(import.meta.env.VITE_JACKTRIP_PORT) || 4464

const CAPTURE_LEFT_OVERRIDE = import.meta.env.VITE_HEAVEN_JACK_CAPTURE_LEFT
const CAPTURE_RIGHT_OVERRIDE = import.meta.env.VITE_HEAVEN_JACK_CAPTURE_RIGHT
const SEND_LEFT_OVERRIDE = import.meta.env.VITE_HEAVEN_JACK_SEND_LEFT
const SEND_RIGHT_OVERRIDE = import.meta.env.VITE_HEAVEN_JACK_SEND_RIGHT

interface JackTripPorts {
  captureLeft: string
  captureRight: string
  sendLeft: string
  sendRight: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const errorFrom = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)))

const matchAny = (value: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(value))

const findCapturePort = (ports: string[], side: 'left' | 'right'): string | undefined => {
  const systemCapture = ports.filter((port) => port.startsWith('system:') && /capture/i.test(port))
  const capturePorts = systemCapture.length > 0 ? systemCapture : ports.filter((port) => /capture/i.test(port))
  if (capturePorts.length === 0) return undefined

  if (side === 'left') {
    return capturePorts.find((port) => /capture_1$|_l$|_fl$/i.test(port)) ?? capturePorts[0]
  }
  return capturePorts.find((port) => /capture_2$|_r$|_fr$/i.test(port)) ?? capturePorts[1]
}

const findSendPort = (ports: string[], suffix: 'send_1' | 'send_2'): string | undefined => {
  return ports.find((port) => port.endsWith(suffix) || new RegExp(`${suffix}$`, 'i').test(port))
}

const resolvePorts = (ports: string[]): JackTripPorts => {
  const captureLeft =
    CAPTURE_LEFT_OVERRIDE ||
    findCapturePort(ports, 'left') ||
    ports.find((port) => matchAny(port, [/capture/i, /input/i])) ||
    ''
  const captureRight =
    CAPTURE_RIGHT_OVERRIDE ||
    findCapturePort(ports, 'right') ||
    ports.find((port) => matchAny(port, [/capture/i, /input/i])) ||
    ''
  const sendLeft = SEND_LEFT_OVERRIDE || findSendPort(ports, 'send_1') || ''
  const sendRight = SEND_RIGHT_OVERRIDE || findSendPort(ports, 'send_2') || ''

  if (!sendLeft || !sendRight) {
    throw new Error('JackTrip ports not detected yet (send_1/send_2 missing)')
  }
  if (!captureLeft || !captureRight) {
    throw new Error('No capture ports found (check JACK inputs)')
  }

  return { captureLeft, captureRight, sendLeft, sendRight }
}

const connectPair = async (source: string, dest: string) => {
  try {
    await invoke<string>('connect_jack_port', { source, dest })
  } catch (error) {
    const message = String(error).toLowerCase()
    if (!message.includes('already connected')) {
      throw error
    }
  }
}

const disconnectPair = async (source: string, dest: string) => {
  try {
    await invoke<string>('disconnect_jack_port', { source, dest })
  } catch (error) {
    const message = String(error).toLowerCase()
    if (!message.includes('not connected') && !message.includes('no connection')) {
      throw error
    }
  }
}

export function useJackTripVoice(options: UseAgoraVoiceOptions) {
  const [state, setState] = createSignal<VoiceState>('idle')
  const [isMuted, setIsMuted] = createSignal(false)
  const [duration, setDuration] = createSignal(0)

  let ports: JackTripPorts | null = null
  let durationInterval: number | null = null
  let connectionInterval: number | null = null
  let startToken = 0
  let isStarting = false
  let dependenciesOk = false

  const checkDependencies = async () => {
    try {
      await invoke('check_jacktrip_dependencies')
      dependenciesOk = true
    } catch (error) {
      const err = errorFrom(error)
      dependenciesOk = false
      setState('error')
      options.onError?.(err)
      throw err
    }
  }

  const ensurePorts = async (): Promise<JackTripPorts> => {
    const list = await invoke<string[]>('list_jack_ports')
    ports = resolvePorts(list)
    return ports
  }

  const waitForJackTripPorts = async (timeoutMs: number, intervalMs: number) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const list = await invoke<string[]>('list_jack_ports')
      const sendLeft = SEND_LEFT_OVERRIDE || findSendPort(list, 'send_1')
      const sendRight = SEND_RIGHT_OVERRIDE || findSendPort(list, 'send_2')
      if (sendLeft && sendRight) {
        ports = resolvePorts(list)
        return
      }
      await sleep(intervalMs)
    }
    throw new Error('Timed out waiting for JackTrip ports')
  }

  const connectMic = async () => {
    const resolved = ports || (await ensurePorts())
    await connectPair(resolved.captureLeft, resolved.sendLeft)
    await connectPair(resolved.captureRight, resolved.sendRight)
  }

  const disconnectMic = async () => {
    if (!ports) return
    await disconnectPair(ports.captureLeft, ports.sendLeft)
    await disconnectPair(ports.captureRight, ports.sendRight)
  }

  const startConnectionMonitor = () => {
    if (connectionInterval) return
    connectionInterval = window.setInterval(async () => {
      try {
        const alive = await invoke<boolean>('is_jacktrip_connected')
        if (!alive && state() === 'connected') {
          setState('error')
          options.onError?.(new Error('JackTrip disconnected'))
          await cleanup()
          setState('idle')
        }
      } catch (error) {
        if (IS_DEV) console.warn('[JackTrip] Connection poll error:', error)
      }
    }, 1000)
  }

  const stopConnectionMonitor = () => {
    if (connectionInterval) {
      clearInterval(connectionInterval)
      connectionInterval = null
    }
  }

  const startCall = async () => {
    if (state() !== 'idle' || isStarting) {
      if (IS_DEV) console.warn('[JackTrip] Already in a call')
      return
    }

    setState('connecting')
    setDuration(0)
    isStarting = true
    const token = ++startToken

    try {
      if (!dependenciesOk) {
        await checkDependencies()
      }

      await invoke<string>('connect_jacktrip', {
        server: JACKTRIP_SERVER,
        port: JACKTRIP_PORT,
      })

      await waitForJackTripPorts(8000, 500)

      if (token !== startToken) {
        return
      }

      if (!isMuted()) {
        await connectMic()
      }

      durationInterval = window.setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)

      startConnectionMonitor()
      setState('connected')
    } catch (error) {
      const err = errorFrom(error)
      if (IS_DEV) console.error('[JackTrip] Failed to start call:', err)
      setState('error')
      options.onError?.(err)
      await cleanup()
      setState('idle')
    } finally {
      isStarting = false
    }
  }

  const endCall = async () => {
    startToken += 1
    await cleanup()
    setState('idle')
  }

  const cleanup = async () => {
    stopConnectionMonitor()
    if (durationInterval) {
      clearInterval(durationInterval)
      durationInterval = null
    }

    try {
      await disconnectMic()
    } catch (error) {
      if (IS_DEV) console.warn('[JackTrip] Mic disconnect error:', error)
    }

    try {
      await invoke<string>('disconnect_jacktrip')
    } catch (error) {
      if (IS_DEV) console.warn('[JackTrip] Disconnect error:', error)
    }

    ports = null
  }

  const toggleMute = () => {
    if (state() !== 'connected') return
    const newMuted = !isMuted()
    setIsMuted(newMuted)
    if (newMuted) {
      void disconnectMic()
    } else {
      void connectMic().catch((error) => {
        if (IS_DEV) console.warn('[JackTrip] Mic connect error:', error)
      })
    }
  }

  void checkDependencies().catch(() => {
    // Error already surfaced via onError and state.
  })

  onCleanup(() => {
    void cleanup()
  })

  return {
    state,
    isMuted,
    startCall,
    endCall,
    toggleMute,
    sessionId: () => null,
    duration,
  }
}
