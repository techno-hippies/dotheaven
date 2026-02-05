import { type Component, createSignal, onMount, Show } from 'solid-js'
import { Button } from '../../primitives/button'

export type DetectedPlatform = 'windows' | 'macos' | 'linux' | 'ios' | 'android'

export interface DownloadAppCtaProps {
  /** Override auto-detected platform */
  platform?: DetectedPlatform
  /** Callback when the primary download button is clicked */
  onDownload?: (platform: DetectedPlatform) => void
  /** Callback when a secondary platform link is clicked */
  onSecondaryClick?: (platform: string) => void
}

function detectPlatform(): DetectedPlatform {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Mac/.test(ua)) return 'macos'
  if (/Win/.test(ua)) return 'windows'
  return 'linux'
}

const platformLabels: Record<DetectedPlatform, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  ios: 'iOS',
  android: 'Android',
}

export const DownloadAppCta: Component<DownloadAppCtaProps> = (props) => {
  const [detected, setDetected] = createSignal<DetectedPlatform>(props.platform ?? 'windows')
  onMount(() => {
    if (!props.platform) setDetected(detectPlatform())
  })

  const current = () => props.platform ?? detected()
  const isDesktop = () => ['windows', 'macos', 'linux'].includes(current())

  return (
    <div class="flex flex-col items-center justify-center gap-6 max-w-md mx-auto text-center">
      {/* Icon */}
      <div class="w-16 h-16 rounded-full bg-[var(--bg-highlight)] flex items-center justify-center">
        <svg class="w-8 h-8 text-[var(--accent-blue)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      </div>

      {/* Primary download button */}
      <Button
        size="lg"
        class="gap-2 text-base px-8"
        onClick={() => props.onDownload?.(current())}
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Download for {platformLabels[current()]}
      </Button>

      {/* Secondary platform links */}
      <div class="flex items-center gap-3 text-sm text-[var(--text-muted)]">
        <Show when={isDesktop()}>
          <span>Also on</span>
          <button class="text-[var(--accent-blue)] hover:underline cursor-pointer" onClick={() => props.onSecondaryClick?.('ios')}>iOS</button>
          <span>&middot;</span>
          <button class="text-[var(--accent-blue)] hover:underline cursor-pointer" onClick={() => props.onSecondaryClick?.('android')}>Android</button>
        </Show>
        <Show when={!isDesktop()}>
          <span>Also on</span>
          <button class="text-[var(--accent-blue)] hover:underline cursor-pointer" onClick={() => props.onSecondaryClick?.('desktop')}>Desktop</button>
        </Show>
      </div>

      {/* Feature list */}
      <ul class="flex flex-col gap-3 text-sm text-[var(--text-secondary)] mt-2">
        <li class="flex items-start gap-2.5">
          <svg class="w-4 h-4 mt-0.5 text-[var(--accent-blue)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Listen, share, and encrypt your local MP3s and music
        </li>
        <li class="flex items-start gap-2.5">
          <svg class="w-4 h-4 mt-0.5 text-[var(--accent-blue)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Scrobble your music onto the Ethereum blockchain for free
        </li>
        <li class="flex items-start gap-2.5">
          <svg class="w-4 h-4 mt-0.5 text-[var(--accent-blue)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Higher quality and lower latency karaoke room audio
        </li>
      </ul>
    </div>
  )
}
