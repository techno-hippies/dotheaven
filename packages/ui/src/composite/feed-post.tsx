import type { Component, JSX } from 'solid-js'
import { Show, Switch, Match, For } from 'solid-js'
import { cn } from '../lib/utils'
import { Avatar } from '../primitives/avatar'

// ── Types ──────────────────────────────────────────────────────────────

export type MediaItem = {
  url: string
  alt?: string
  /** Aspect ratio hint for layout. Auto-detected from naturalWidth/Height if omitted. */
  aspect?: 'landscape' | 'portrait' | 'square'
}

export type FeedPostMedia =
  | { type: 'photo'; items: MediaItem[] }
  | { type: 'video'; src: string; thumbnailUrl?: string; aspect?: 'landscape' | 'portrait' | 'square' }

export interface FeedPostProps {
  class?: string
  // Author
  authorName: string
  /** Domain handle like "yuki.heaven" or "vitalik.eth" */
  authorHandle?: string
  authorAvatarUrl?: string
  timestamp: string
  onAuthorClick?: () => void
  // Content
  text?: string
  media?: FeedPostMedia
  // Engagement
  likes?: number
  comments?: number
  isLiked?: boolean
  onLike?: () => void
  onComment?: () => void
  // Menu
  menuSlot?: JSX.Element
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return n.toString()
}

// ── Sub-components ─────────────────────────────────────────────────────

const PhotoGrid: Component<{ items: MediaItem[] }> = (props) => {
  const count = () => props.items.length

  return (
    <Switch>
      {/* Single image */}
      <Match when={count() === 1}>
        <SinglePhoto item={props.items[0]} />
      </Match>

      {/* Two images: side by side */}
      <Match when={count() === 2}>
        <div class="grid grid-cols-2 gap-0.5 rounded-md overflow-hidden">
          <For each={props.items}>
            {(item) => (
              <img
                src={item.url}
                alt={item.alt ?? ''}
                class="w-full aspect-square object-cover"
              />
            )}
          </For>
        </div>
      </Match>

      {/* Three images: 1 large left + 2 stacked right */}
      <Match when={count() === 3}>
        <div class="grid grid-cols-2 gap-0.5 rounded-md overflow-hidden" style={{ 'aspect-ratio': '16/9' }}>
          <img
            src={props.items[0].url}
            alt={props.items[0].alt ?? ''}
            class="w-full h-full object-cover row-span-2"
            style={{ 'grid-row': 'span 2' }}
          />
          <img
            src={props.items[1].url}
            alt={props.items[1].alt ?? ''}
            class="w-full h-full object-cover"
          />
          <img
            src={props.items[2].url}
            alt={props.items[2].alt ?? ''}
            class="w-full h-full object-cover"
          />
        </div>
      </Match>

      {/* 4+ images: 2×2 grid with overflow indicator */}
      <Match when={count() >= 4}>
        <div class="grid grid-cols-2 gap-0.5 rounded-md overflow-hidden">
          <For each={props.items.slice(0, 4)}>
            {(item, i) => (
              <div class="relative aspect-square">
                <img
                  src={item.url}
                  alt={item.alt ?? ''}
                  class="w-full h-full object-cover"
                />
                <Show when={i() === 3 && count() > 4}>
                  <div class="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span class="text-white text-2xl font-bold">+{count() - 4}</span>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Match>
    </Switch>
  )
}

const SinglePhoto: Component<{ item: MediaItem }> = (props) => {
  const aspect = () => props.item.aspect ?? 'landscape'

  return (
    <div
      class={cn(
        'rounded-md overflow-hidden w-full',
        aspect() === 'portrait' && 'max-h-[500px] flex justify-center bg-[var(--bg-elevated)]',
      )}
    >
      <img
        src={props.item.url}
        alt={props.item.alt ?? ''}
        class={cn(
          aspect() === 'landscape' && 'w-full aspect-video object-cover',
          aspect() === 'square' && 'w-full aspect-square object-cover',
          aspect() === 'portrait' && 'h-full max-h-[500px] object-cover',
        )}
      />
    </div>
  )
}

const VideoEmbed: Component<{
  src: string
  thumbnailUrl?: string
  aspect?: 'landscape' | 'portrait' | 'square'
}> = (props) => {
  const aspect = () => props.aspect ?? 'landscape'

  return (
    <div
      class={cn(
        'rounded-md overflow-hidden w-full relative bg-black',
        aspect() === 'portrait' && 'max-h-[500px] flex justify-center',
      )}
    >
      {/* Thumbnail / placeholder — real playback wired later */}
      <Show
        when={props.thumbnailUrl}
        fallback={
          <div
            class={cn(
              'bg-[var(--bg-elevated)] flex items-center justify-center',
              aspect() === 'landscape' && 'w-full aspect-video',
              aspect() === 'square' && 'w-full aspect-square',
              aspect() === 'portrait' && 'h-[500px] aspect-[9/16]',
            )}
          >
            <svg class="w-16 h-16 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        }
      >
        <img
          src={props.thumbnailUrl}
          alt="Video thumbnail"
          class={cn(
            'object-cover',
            aspect() === 'landscape' && 'w-full aspect-video',
            aspect() === 'square' && 'w-full aspect-square',
            aspect() === 'portrait' && 'h-[500px] aspect-[9/16]',
          )}
        />
      </Show>

      {/* Play button overlay */}
      <div class="absolute inset-0 flex items-center justify-center cursor-pointer group">
        <div class="w-16 h-16 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:bg-black/50 transition-colors">
          <svg class="w-8 h-8 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────

/** Rounded/bubbly heart (Phosphor-style) */
const HeartIcon: Component<{ filled?: boolean }> = (props) => (
  <svg class="w-5 h-5" viewBox="0 0 256 256" fill="currentColor">
    {props.filled ? (
      <path d="M240,94c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,220.66,16,164,16,94A62.07,62.07,0,0,1,78,32c20.65,0,38.73,8.88,50,23.89C139.27,40.88,157.35,32,178,32A62.07,62.07,0,0,1,240,94Z" />
    ) : (
      <path d="M178,32c-20.65,0-38.73,8.88-50,23.89C116.73,40.88,98.65,32,78,32A62.07,62.07,0,0,0,16,94c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,220.66,240,164,240,94A62.07,62.07,0,0,0,178,32ZM128,206.8C109.74,196.16,32,147.69,32,94A46.06,46.06,0,0,1,78,48c19.45,0,35.78,10.36,42.6,27a8,8,0,0,0,14.8,0c6.82-16.67,23.15-27,42.6-27a46.06,46.06,0,0,1,46,46C224,147.61,146.24,196.15,128,206.8Z" />
    )}
  </svg>
)

const ChatIcon: Component = () => (
  <svg class="w-5 h-5" viewBox="0 0 256 256" fill="currentColor">
    <path d="M216,48H40A16,16,0,0,0,24,64V224a15.85,15.85,0,0,0,9.24,14.5A16.13,16.13,0,0,0,40,240a15.89,15.89,0,0,0,10.25-3.78l.09-.07L83,208H216a16,16,0,0,0,16-16V64A16,16,0,0,0,216,48ZM216,192H83a8,8,0,0,0-5.23,1.95L40,224V64H216Z" />
  </svg>
)

// ── Main Component ─────────────────────────────────────────────────────

export const FeedPost: Component<FeedPostProps> = (props) => {
  return (
    <div class={cn('flex flex-col gap-3 p-4', props.class)}>
      {/* Header: avatar + name + timestamp */}
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="cursor-pointer flex-shrink-0"
          onClick={() => props.onAuthorClick?.()}
        >
          <Avatar
            src={props.authorAvatarUrl}
            size="md"
            shape="circle"
          />
        </button>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="font-semibold text-base text-[var(--text-primary)] truncate cursor-pointer hover:underline"
              onClick={() => props.onAuthorClick?.()}
            >
              {props.authorName}
            </button>
            <span class="text-base text-[var(--text-muted)]">·</span>
            <span class="text-base text-[var(--text-muted)] flex-shrink-0">{props.timestamp}</span>
          </div>
          <Show when={props.authorHandle}>
            <div class="text-base text-[var(--text-muted)] truncate">{props.authorHandle}</div>
          </Show>
        </div>
        <Show when={props.menuSlot}>
          {props.menuSlot}
        </Show>
      </div>

      {/* Text content */}
      <Show when={props.text}>
        <p class="text-base text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{props.text}</p>
      </Show>

      {/* Media slot */}
      <Show when={props.media}>
        {(media) => (
          <Switch>
            <Match when={media().type === 'photo' && media() as Extract<FeedPostMedia, { type: 'photo' }>}>
              {(m) => <PhotoGrid items={m().items} />}
            </Match>
            <Match when={media().type === 'video' && media() as Extract<FeedPostMedia, { type: 'video' }>}>
              {(m) => <VideoEmbed src={m().src} thumbnailUrl={m().thumbnailUrl} aspect={m().aspect} />}
            </Match>
          </Switch>
        )}
      </Show>

      {/* Engagement bar */}
      <div class="flex items-center gap-5 pt-1">
        <button
          type="button"
          class={cn(
            'flex items-center gap-1.5 text-base cursor-pointer transition-colors',
            props.isLiked ? 'text-red-500' : 'text-[var(--text-secondary)] hover:text-red-400',
          )}
          onClick={() => props.onLike?.()}
        >
          <HeartIcon filled={props.isLiked} />
          <Show when={props.likes !== undefined}>
            <span>{formatCount(props.likes!)}</span>
          </Show>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 text-base text-[var(--text-secondary)] hover:text-[var(--accent-blue)] cursor-pointer transition-colors"
          onClick={() => props.onComment?.()}
        >
          <ChatIcon />
          <Show when={props.comments !== undefined}>
            <span>{formatCount(props.comments!)}</span>
          </Show>
        </button>
      </div>
    </div>
  )
}
