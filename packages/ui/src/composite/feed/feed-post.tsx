import type { Component, JSX } from 'solid-js'
import { Show, Switch, Match, For, createSignal } from 'solid-js'
import { cn } from '../../lib/utils'
import { useIsMobile } from '../../lib/use-media-query'
import { UserIdentity } from '../chat/user-identity'
import { EngagementBar } from './engagement-bar'
import { PlayFill, Info, DotsThree, Globe } from '../../icons'
import { Dialog, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogCloseButton } from '../../primitives/dialog'

// ── Types ──────────────────────────────────────────────────────────────

/** Full provenance/metadata for displayed posts */
export interface PostProvenance {
  // Ownership
  ownership: 'mine' | 'not-mine' | null
  // Source attribution
  source?: {
    url: string
    platform?: string
    handle?: string
  }
  audioSource?: {
    url: string
    platform?: string
  }
  // On-chain IDs
  postId?: string
  contentId?: string
  ipId?: string | null
  ipfsHash?: string
  contentHash?: string
  txHash?: string
  megaTxHash?: string
  // Timestamps
  registeredAt?: string
  chainId?: number
}

export type MediaItem = {
  url: string
  alt?: string
  aspect?: 'landscape' | 'portrait' | 'square'
}

export type FeedPostMedia =
  | { type: 'photo'; items: MediaItem[] }
  | { type: 'video'; src: string; thumbnailUrl?: string; aspect?: 'landscape' | 'portrait' | 'square' }

export interface FeedPostProps {
  class?: string
  // Author
  authorName: string
  authorHandle?: string
  authorAvatarUrl?: string
  authorNationalityCode?: string
  timestamp: string
  onAuthorClick?: () => void
  // Content
  text?: string
  media?: FeedPostMedia
  contentSlot?: JSX.Element
  // Engagement
  likes?: number
  comments?: number
  reposts?: number
  isLiked?: boolean
  isReposted?: boolean
  onLike?: () => void
  onComment?: () => void
  onRepost?: () => void
  onQuote?: () => void
  onShare?: () => void
  hideAuthor?: boolean
  // Menu
  menuSlot?: JSX.Element
  onMenuClick?: () => void
  // Provenance metadata (shown in info dialog)
  provenance?: PostProvenance
  onPostClick?: () => void
  // Translation
  /** Available translations keyed by ISO 639-1 lang code, e.g. { ja: "...", es: "..." } */
  translations?: Record<string, string>
  /** User's locale ISO 639-1 code for auto-showing translations */
  userLang?: string
  /** Called when user clicks "Translate" — should trigger Lit Action */
  onTranslate?: (targetLang: string) => void
  /** Whether a translation is currently in progress */
  isTranslating?: boolean
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

      {/* 4+ images: 2x2 grid with overflow indicator */}
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
            <PlayFill class="w-16 h-16 text-[var(--text-muted)]" />
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
          <PlayFill class="w-8 h-8 text-white ml-1" />
        </div>
      </div>
    </div>
  )
}

// ── Provenance Row ──────────────────────────────────────────────────────

const ProvenanceRow: Component<{ label: string; value?: string; href?: string; mono?: boolean }> = (props) => (
  <Show when={props.value}>
    <div class="flex flex-col gap-1">
      <span class="text-base text-[var(--text-muted)]">{props.label}</span>
      <Show when={props.href} fallback={
        <span class={cn('text-base text-[var(--text-primary)] break-all', props.mono && 'font-mono')}>
          {props.value}
        </span>
      }>
        <a
          href={props.href}
          target="_blank"
          rel="noopener noreferrer"
          class={cn('text-base text-[var(--accent-blue)] hover:underline break-all', props.mono && 'font-mono')}
        >
          {props.value}
        </a>
      </Show>
    </div>
  </Show>
)

// ── Provenance Dialog Content ───────────────────────────────────────────

const ProvenanceDialogContent: Component<{ provenance: PostProvenance }> = (props) => {
  const ownershipLabel = () => {
    if (props.provenance.ownership === 'mine') return 'Original'
    if (props.provenance.ownership === 'not-mine') return 'Shared'
    return 'Not specified'
  }

  const chainName = () => {
    if (props.provenance.chainId === 6343) return 'MegaETH'
    if (props.provenance.chainId === 1513) return 'Story Protocol'
    return props.provenance.chainId ? `Chain ${props.provenance.chainId}` : undefined
  }

  return (
    <div class="flex flex-col gap-6">
      {/* Badges row */}
      <div class="flex items-center gap-3">
        <span class={cn(
          'px-3 py-1.5 rounded-md text-base font-medium',
          props.provenance.ownership === 'mine' && 'bg-green-500/20 text-green-400',
          props.provenance.ownership === 'not-mine' && 'bg-blue-500/20 text-blue-400',
          !props.provenance.ownership && 'bg-[var(--bg-highlight)] text-[var(--text-muted)]',
        )}>
          {ownershipLabel()}
        </span>
        <Show when={chainName()}>
          <span class="px-3 py-1.5 rounded-md text-base font-medium bg-[var(--bg-highlight)] text-[var(--text-secondary)]">
            {chainName()}
          </span>
        </Show>
      </div>

      {/* Attribution section */}
      <Show when={props.provenance.source || props.provenance.audioSource}>
        <div class="flex flex-col gap-4 p-4 rounded-md bg-[var(--bg-elevated)]">
          <span class="text-base font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Attribution</span>
          <ProvenanceRow
            label="Original source"
            value={props.provenance.source?.platform
              ? `${props.provenance.source.platform}${props.provenance.source.handle ? ` · @${props.provenance.source.handle}` : ''}`
              : props.provenance.source?.url}
            href={props.provenance.source?.url}
          />
          <ProvenanceRow
            label="Audio source"
            value={props.provenance.audioSource?.platform || props.provenance.audioSource?.url}
            href={props.provenance.audioSource?.url}
          />
        </div>
      </Show>

      {/* On-chain section */}
      <Show when={props.provenance.postId || props.provenance.ipId || props.provenance.ipfsHash || props.provenance.contentHash}>
        <div class="flex flex-col gap-4 p-4 rounded-md bg-[var(--bg-elevated)]">
          <span class="text-base font-semibold text-[var(--text-secondary)] uppercase tracking-wide">On-chain</span>
          <ProvenanceRow label="Post ID" value={props.provenance.postId} mono />
          <ProvenanceRow label="Content ID" value={props.provenance.contentId} mono />
          {/* Story Protocol IP — only shown if registered */}
          <Show when={props.provenance.ipId}>
            <ProvenanceRow
              label="Story Protocol IP"
              value={props.provenance.ipId!}
              href={`https://explorer.story.foundation/ipa/${props.provenance.ipId}`}
              mono
            />
          </Show>
          <ProvenanceRow
            label="IPFS CID"
            value={props.provenance.ipfsHash}
            href={props.provenance.ipfsHash ? `https://heaven.myfilebase.com/ipfs/${props.provenance.ipfsHash}` : undefined}
            mono
          />
          <ProvenanceRow label="Content hash" value={props.provenance.contentHash} mono />
          {/* Story Protocol transaction */}
          <Show when={props.provenance.txHash}>
            <ProvenanceRow
              label="Story TX"
              value={`${props.provenance.txHash!.slice(0, 10)}...${props.provenance.txHash!.slice(-8)}`}
              href={`https://explorer.story.foundation/tx/${props.provenance.txHash}`}
              mono
            />
          </Show>
          {/* MegaETH mirror transaction */}
          <Show when={props.provenance.megaTxHash}>
            <ProvenanceRow
              label="MegaETH TX"
              value={`${props.provenance.megaTxHash!.slice(0, 10)}...${props.provenance.megaTxHash!.slice(-8)}`}
              href={`https://megaeth-testnet-v2.blockscout.com/tx/${props.provenance.megaTxHash}`}
              mono
            />
          </Show>
        </div>
      </Show>

      {/* Timestamp */}
      <Show when={props.provenance.registeredAt}>
        <div class="text-base text-[var(--text-muted)]">
          Registered {new Date(props.provenance.registeredAt!).toLocaleString()}
        </div>
      </Show>
    </div>
  )
}

// ── Post Content (with translation support) ───────────────────────────

const PostContent: Component<{
  text?: string
  media?: FeedPostMedia
  translations?: Record<string, string>
  userLang?: string
  onTranslate?: (targetLang: string) => void
  isTranslating?: boolean
}> = (props) => {
  const [showOriginal, setShowOriginal] = createSignal(false)

  const translatedText = () => {
    if (!props.userLang || !props.translations) return undefined
    return props.translations[props.userLang]
  }

  const hasTranslation = () => !!translatedText()
  const displayText = () => {
    if (showOriginal() || !hasTranslation()) return props.text
    return translatedText()
  }

  return (
    <div class="text-left w-full">
      <Show when={props.text}>
        <p class="text-base font-medium text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{displayText()}</p>

        {/* Translation controls */}
        <div class="flex items-center gap-2 mt-1.5">
          <Show when={hasTranslation()}>
            <button
              type="button"
              class="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--accent-blue)] cursor-pointer transition-colors"
              data-no-post-click
              onClick={() => setShowOriginal(!showOriginal())}
            >
              <Globe class="w-3.5 h-3.5" />
              <span>{showOriginal() ? 'Show translation' : 'Show original'}</span>
            </button>
          </Show>

          <Show when={!hasTranslation() && props.onTranslate && props.userLang}>
            <button
              type="button"
              class={cn(
                'flex items-center gap-1 text-sm cursor-pointer transition-colors',
                props.isTranslating
                  ? 'text-[var(--accent-blue)] opacity-70'
                  : 'text-[var(--text-muted)] hover:text-[var(--accent-blue)]'
              )}
              data-no-post-click
              disabled={props.isTranslating}
              onClick={() => props.onTranslate?.(props.userLang!)}
            >
              <Globe class={cn('w-3.5 h-3.5', props.isTranslating && 'animate-spin')} />
              <span>{props.isTranslating ? 'Translating...' : 'Translate'}</span>
            </button>
          </Show>
        </div>
      </Show>
      <Show when={props.text && props.media}>
        <div class="h-3" />
      </Show>
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
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────

export const FeedPost: Component<FeedPostProps> = (props) => {
  const isMobile = useIsMobile()

  // 3-dot menu + provenance info in the top-right
  const headerRightSlot = () => (
    <div class="flex items-center gap-1">
      <Show when={props.provenance}>
        <Dialog>
          <DialogTrigger
            as="button"
            type="button"
            class="flex items-center p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-highlight)] cursor-pointer transition-colors"
          >
            <Info class="w-4 h-4" />
          </DialogTrigger>
          <DialogPortal>
            <DialogOverlay />
            <DialogContent class="max-w-md">
              <DialogHeader>
                <DialogTitle>Provenance</DialogTitle>
                <DialogCloseButton />
              </DialogHeader>
              <DialogBody>
                <ProvenanceDialogContent provenance={props.provenance!} />
              </DialogBody>
            </DialogContent>
          </DialogPortal>
        </Dialog>
      </Show>
      {props.menuSlot ?? (
        <button
          type="button"
          class="flex items-center p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-highlight)] cursor-pointer transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            props.onMenuClick?.()
          }}
        >
          <DotsThree class="w-5 h-5" />
        </button>
      )}
    </div>
  )

  return (
    <div
      class={cn('flex flex-col gap-3', isMobile() ? 'p-4' : 'p-5', props.onPostClick && 'cursor-pointer', props.class)}
      onClick={(e) => {
        // Don't navigate if clicking interactive elements (buttons, links, dialogs)
        const target = e.target as HTMLElement
        if (target.closest('button, a, [role="dialog"], [data-no-post-click]')) return
        props.onPostClick?.()
      }}
    >
      {/* Header: avatar + name + timestamp + menu */}
      <Show when={!props.hideAuthor}>
        <UserIdentity
          name={props.authorHandle || props.authorName}
          avatarUrl={props.authorAvatarUrl}
          nationalityCode={props.authorNationalityCode}
          timestamp={props.timestamp}
          showDot
          size={isMobile() ? 'md' : 'lg'}
          onAvatarClick={props.onAuthorClick}
          onClick={props.onAuthorClick}
          rightSlot={headerRightSlot()}
        />
      </Show>

      {/* Content: custom slot or default text+media */}
      {props.contentSlot ? (
        props.contentSlot
      ) : (
        <PostContent
          text={props.text}
          media={props.media}
          translations={props.translations}
          userLang={props.userLang}
          onTranslate={props.onTranslate}
          isTranslating={props.isTranslating}
        />
      )}

      {/* Engagement bar */}
      <EngagementBar
        comments={props.comments}
        onComment={props.onComment}
        reposts={props.reposts}
        isReposted={props.isReposted}
        onRepost={props.onRepost}
        onQuote={props.onQuote}
        likes={props.likes}
        isLiked={props.isLiked}
        onLike={props.onLike}
        onShare={props.onShare}
        compact={isMobile()}
        class="pt-2"
      />
    </div>
  )
}
