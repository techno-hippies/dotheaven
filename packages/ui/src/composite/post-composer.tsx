import type { Component } from 'solid-js'
import { Show, createSignal, createEffect } from 'solid-js'
import { cn } from '../lib/utils'
import { Avatar } from '../primitives/avatar'
import { Button } from '../primitives/button'
import { Spinner } from '../primitives/spinner'
import { Switch } from '../primitives/switch'

// ── Types ──────────────────────────────────────────────────────────────

export type PostProcessingStep = 'safety' | 'converting' | 'uploading' | 'registering'

const STEP_LABELS: Record<PostProcessingStep, string> = {
  safety: 'Checking...',
  converting: 'Converting...',
  uploading: 'Uploading...',
  registering: 'Registering...',
}

// ── Link Parser ─────────────────────────────────────────────────────────

export interface SourceRef {
  url: string
  platform?: string
  handle?: string
  contentId?: string
}

export interface AudioRef {
  url?: string
  platform?: string
  contentId?: string
}

/** Parse a URL and extract platform/handle/contentId */
export function parseSourceLink(url: string): SourceRef {
  const result: SourceRef = { url }
  try {
    const u = new URL(url)
    const host = u.hostname.replace('www.', '')

    // Twitter/X
    if (host === 'twitter.com' || host === 'x.com') {
      result.platform = 'twitter'
      const match = u.pathname.match(/^\/([^/]+)\/status\/(\d+)/)
      if (match) {
        result.handle = match[1]
        result.contentId = match[2]
      }
    }
    // TikTok
    else if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
      result.platform = 'tiktok'
      const match = u.pathname.match(/^\/@([^/]+)\/video\/(\d+)/)
      if (match) {
        result.handle = match[1]
        result.contentId = match[2]
      }
    }
    // YouTube
    else if (host === 'youtube.com' || host === 'youtu.be') {
      result.platform = 'youtube'
      if (host === 'youtu.be') {
        result.contentId = u.pathname.slice(1)
      } else {
        result.contentId = u.searchParams.get('v') || undefined
        const channelMatch = u.pathname.match(/^\/@([^/]+)/)
        if (channelMatch) result.handle = channelMatch[1]
      }
    }
    // Spotify
    else if (host === 'open.spotify.com') {
      result.platform = 'spotify'
      const match = u.pathname.match(/^\/(track|album|artist)\/([a-zA-Z0-9]+)/)
      if (match) result.contentId = match[2]
    }
    // Reddit
    else if (host === 'reddit.com' || host.endsWith('.reddit.com')) {
      result.platform = 'reddit'
      const match = u.pathname.match(/^\/r\/([^/]+)\/comments\/([^/]+)/)
      if (match) {
        result.handle = match[1] // subreddit
        result.contentId = match[2]
      }
    }
    // Pixiv
    else if (host === 'pixiv.net' || host.endsWith('.pixiv.net')) {
      result.platform = 'pixiv'
      const match = u.pathname.match(/\/artworks\/(\d+)/)
      if (match) result.contentId = match[1]
    }
    // DeviantArt
    else if (host === 'deviantart.com' || host.endsWith('.deviantart.com')) {
      result.platform = 'deviantart'
      const match = u.pathname.match(/^\/([^/]+)\/art\//)
      if (match) result.handle = match[1]
    }
    // Apple Music
    else if (host === 'music.apple.com') {
      result.platform = 'apple_music'
      const match = u.pathname.match(/\/album\/[^/]+\/(\d+)/)
      if (match) result.contentId = match[1]
    }
  } catch {
    // Invalid URL, just keep raw
  }
  return result
}

/** Ownership declaration for content */
export type OwnershipClaim = 'mine' | 'not-mine'

/** Attribution data for posts */
export interface Attribution {
  /** User's ownership claim (null if not specified) */
  ownership: OwnershipClaim | null
  /** Source reference (when ownership is 'not-mine') */
  source?: SourceRef
  /** Whether video contains third-party audio (video only) */
  hasThirdPartyAudio?: boolean
  /** Audio source reference (video only, when hasThirdPartyAudio) */
  audioSource?: AudioRef
}

export type MediaType = 'image' | 'video'

export interface PostComposerProps {
  class?: string
  avatarUrl?: string
  placeholder?: string
  /** Action buttons */
  onPhotoClick?: () => void
  onVideoClick?: () => void
  onMusicClick?: () => void
  /** Called when user submits post. Attribution is included when media is attached. */
  onSubmit?: (text: string, attribution?: Attribution) => void

  // ── Media attachment ──
  /** When set, shows media preview inline */
  mediaPreviewUrl?: string
  /** Type of attached media (determines which attribution fields to show) */
  mediaType?: MediaType
  onMediaRemove?: () => void

  // ── Legacy compat (alias for mediaPreviewUrl) ──
  /** @deprecated Use mediaPreviewUrl instead */
  imagePreviewUrl?: string
  /** @deprecated Use onMediaRemove instead */
  onImageRemove?: () => void

  // ── Processing state ──
  /** When set, composer enters processing state */
  processing?: boolean
  processingStep?: PostProcessingStep
  processingError?: string
  onRetry?: () => void

  // ── Success flash ──
  /** Brief success state after post completes */
  success?: boolean
}

// ── Icons ──────────────────────────────────────────────────────────────

const PhotoIcon: Component = () => (
  <svg class="w-5 h-5" viewBox="0 0 256 256" fill="currentColor">
    <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,56H216V200H40ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Zm-2.34,77.66-24-24a8,8,0,0,0-11.32,0L40,220l0-20L98.34,142.34a8,8,0,0,1,11.32,0l24,24a8,8,0,0,0,11.32,0L197.66,116a8,8,0,0,1,11.32,0L216,122.34V200H52.69Z" />
  </svg>
)

const VideoIcon: Component = () => (
  <svg class="w-5 h-5" viewBox="0 0 256 256" fill="currentColor">
    <path d="M164.44,105.34l-48-32A8,8,0,0,0,104,80v64a8,8,0,0,0,12.44,6.66l48-32a8,8,0,0,0,0-13.32ZM120,129.05V95l25.58,17ZM216,40H40A16,16,0,0,0,24,56V168a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,128H40V56H216V168ZM232,200a8,8,0,0,1-8,8H32a8,8,0,0,1,0-16H224A8,8,0,0,1,232,200Z" />
  </svg>
)

const MusicIcon: Component = () => (
  <svg class="w-5 h-5" viewBox="0 0 256 256" fill="currentColor">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V62.25l112-28v99.83A36,36,0,1,0,216,168V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z" />
  </svg>
)

const CloseIcon: Component = () => (
  <svg class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
    <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
  </svg>
)

const CheckIcon: Component = () => (
  <svg class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
    <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
  </svg>
)

// ── Main Component ─────────────────────────────────────────────────────

export const PostComposer: Component<PostComposerProps> = (props) => {
  let textareaRef: HTMLTextAreaElement | undefined

  // Computed media preview (support both new and legacy props)
  const mediaPreview = () => props.mediaPreviewUrl || props.imagePreviewUrl
  const mediaType = () => props.mediaType || 'image'
  const onRemove = () => props.onMediaRemove || props.onImageRemove

  // Attribution state
  const [ownership, setOwnership] = createSignal<OwnershipClaim | null>(null)
  const [sourceUrl, setSourceUrl] = createSignal('')
  const [parsedSource, setParsedSource] = createSignal<SourceRef | null>(null)
  const [hasThirdPartyAudio, setHasThirdPartyAudio] = createSignal(false)
  const [audioUrl, setAudioUrl] = createSignal('')

  // Parse source URL when it changes
  createEffect(() => {
    const url = sourceUrl().trim()
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      setParsedSource(parseSourceLink(url))
    } else {
      setParsedSource(null)
    }
  })

  // Reset attribution state when media is removed
  createEffect(() => {
    if (!mediaPreview()) {
      setOwnership(null)
      setSourceUrl('')
      setParsedSource(null)
      setHasThirdPartyAudio(false)
      setAudioUrl('')
    }
  })

  const handleInput = () => {
    if (!textareaRef) return
    textareaRef.style.height = 'auto'
    textareaRef.style.height = textareaRef.scrollHeight + 'px'
  }

  const handleSubmit = () => {
    const text = textareaRef?.value ?? ''
    const hasMedia = !!mediaPreview()

    let attribution: Attribution | undefined
    if (hasMedia) {
      attribution = { ownership: ownership() }

      // Add source if 'not-mine' and provided
      if (ownership() === 'not-mine' && sourceUrl().trim()) {
        attribution.source = parsedSource() || { url: sourceUrl().trim() }
      }

      // Add audio info for videos
      if (mediaType() === 'video') {
        attribution.hasThirdPartyAudio = hasThirdPartyAudio()
        if (hasThirdPartyAudio() && audioUrl().trim()) {
          const parsed = parseSourceLink(audioUrl().trim())
          attribution.audioSource = {
            url: parsed.url,
            platform: parsed.platform,
            contentId: parsed.contentId,
          }
        }
      }
    }

    props.onSubmit?.(text, attribution)
  }

  const disabled = () => props.processing || props.success
  // Post button disabled if media attached but no ownership selected
  const canPost = () => !mediaPreview() || ownership() !== null

  return (
    <div class={cn(
      'flex flex-col gap-3 p-5 transition-opacity',
      disabled() && 'pointer-events-none',
      props.class,
    )}>
      {/* Input row */}
      <div class="flex items-start gap-3">
        <Avatar src={props.avatarUrl} size="lg" shape="circle" />
        <textarea
          ref={textareaRef}
          rows={1}
          disabled={disabled()}
          placeholder={props.placeholder ?? "What's on your mind?"}
          onInput={handleInput}
          class={cn(
            'flex-1 bg-transparent text-base text-[var(--text-primary)]',
            'placeholder:text-[var(--text-muted)] outline-none resize-none',
            'py-2',
          )}
        />
      </div>

      {/* Media preview */}
      <Show when={mediaPreview()}>
        <div class="relative rounded-md overflow-hidden bg-[var(--bg-elevated)] ml-[52px]">
          <Show when={mediaType() === 'video'} fallback={
            <img
              src={mediaPreview()}
              alt="Attached photo"
              class="w-full max-h-[280px] object-contain"
            />
          }>
            <video
              src={mediaPreview()}
              class="w-full max-h-[280px] object-contain"
              controls
            />
          </Show>
          <Show when={!disabled()}>
            <button
              type="button"
              class="absolute top-2 right-2 p-1.5 rounded-md bg-black/70 text-white hover:bg-black/90 transition-colors cursor-pointer"
              onClick={() => onRemove()?.()}
            >
              <CloseIcon />
            </button>
          </Show>
        </div>

        {/* Ownership section */}
        <Show when={!disabled()}>
          <div class="ml-[52px] flex flex-col gap-3 py-3">
            {/* Segmented control */}
            <div class="flex rounded-md bg-[var(--bg-elevated)] p-1 gap-1">
              <button
                type="button"
                onClick={() => setOwnership('mine')}
                class={cn(
                  'flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer',
                  ownership() === 'mine'
                    ? 'bg-[var(--accent-blue)] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-highlight)]',
                )}
              >
                I made this
              </button>
              <button
                type="button"
                onClick={() => setOwnership('not-mine')}
                class={cn(
                  'flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer',
                  ownership() === 'not-mine'
                    ? 'bg-[var(--accent-blue)] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-highlight)]',
                )}
              >
                I didn't make this
              </button>
            </div>

            {/* Source input - shows when 'not-mine' */}
            <Show when={ownership() === 'not-mine'}>
              <div class="flex flex-col gap-2">
                <label class="text-base text-[var(--text-muted)]">Original source</label>
                <input
                  type="text"
                  placeholder="https://x.com/..."
                  value={sourceUrl()}
                  onInput={(e) => setSourceUrl(e.currentTarget.value)}
                  class={cn(
                    'w-full px-3 py-2 rounded-md text-sm',
                    'bg-[var(--bg-elevated)] border border-[var(--bg-highlight)]',
                    'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                    'outline-none focus:border-[var(--accent-blue)]',
                  )}
                />
                {/* Parsed preview */}
                <Show when={parsedSource()?.platform}>
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-1 rounded-md text-base font-medium bg-[var(--bg-highlight)] text-[var(--text-secondary)] capitalize">
                      {parsedSource()!.platform}
                    </span>
                    <Show when={parsedSource()?.handle}>
                      <span class="text-base text-[var(--text-secondary)]">@{parsedSource()!.handle}</span>
                    </Show>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Audio attribution - for videos, regardless of ownership */}
            <Show when={mediaType() === 'video'}>
              <div class="flex flex-col gap-3 p-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--bg-highlight)]">
                <Switch
                  checked={hasThirdPartyAudio()}
                  onChange={setHasThirdPartyAudio}
                  label="Contains third-party audio"
                />

                {/* Audio source - when toggle is on */}
                <Show when={hasThirdPartyAudio()}>
                  <div class="flex flex-col gap-2 pt-2 border-t border-[var(--bg-highlight)]">
                    <input
                      type="text"
                      placeholder="https://open.spotify.com/..."
                      value={audioUrl()}
                      onInput={(e) => setAudioUrl(e.currentTarget.value)}
                      class={cn(
                        'w-full px-3 py-2 rounded-md text-sm',
                        'bg-[var(--bg-surface)] border border-[var(--bg-highlight)]',
                        'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                        'outline-none focus:border-[var(--accent-blue)]',
                      )}
                    />
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
      </Show>

      {/* Divider */}
      <div class="h-px bg-[var(--bg-highlight)]" />

      {/* Action row / processing state */}
      <Show
        when={!props.processing && !props.success && !props.processingError}
        fallback={
          <div class="flex items-center gap-3 h-9">
            <Show when={props.processingError}>
              <span class="text-sm text-[var(--accent-coral)] flex-1">{props.processingError}</span>
              <Button size="sm" variant="secondary" onClick={() => props.onRetry?.()}>
                Retry
              </Button>
            </Show>
            <Show when={props.success}>
              <div class="flex items-center gap-2 text-green-500">
                <CheckIcon />
                <span class="text-sm font-medium">Posted!</span>
              </div>
            </Show>
            <Show when={props.processing && !props.processingError}>
              <Spinner size="sm" />
              <span class="text-sm text-[var(--text-secondary)]">
                {STEP_LABELS[props.processingStep ?? 'safety']}
              </span>
            </Show>
          </div>
        }
      >
        <div class="flex items-center gap-1">
          {/* Hide media buttons when media is already attached */}
          <Show when={!mediaPreview()}>
            <Show when={props.onPhotoClick}>
              <button
                type="button"
                class="flex items-center gap-2 px-3 py-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-highlight)] cursor-pointer transition-colors"
                onClick={() => props.onPhotoClick?.()}
              >
                <PhotoIcon />
                <span class="text-sm">Photo</span>
              </button>
            </Show>
            <Show when={props.onVideoClick}>
              <button
                type="button"
                class="flex items-center gap-2 px-3 py-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-highlight)] cursor-pointer transition-colors"
                onClick={() => props.onVideoClick?.()}
              >
                <VideoIcon />
                <span class="text-sm">Video</span>
              </button>
            </Show>
            <Show when={props.onMusicClick}>
              <button
                type="button"
                class="flex items-center gap-2 px-3 py-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-highlight)] cursor-pointer transition-colors"
                onClick={() => props.onMusicClick?.()}
              >
                <MusicIcon />
                <span class="text-sm">Music</span>
              </button>
            </Show>
          </Show>

          <div class="flex-1" />

          <Button size="sm" onClick={handleSubmit} disabled={!canPost()}>
            Post
          </Button>
        </div>
      </Show>
    </div>
  )
}
