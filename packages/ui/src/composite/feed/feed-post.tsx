import type { Component, JSX } from 'solid-js'
import { Show, Switch, Match, For, createSignal } from 'solid-js'
import { cn } from '../../lib/classnames'
import { useIsMobile } from '../../lib/use-media-query'
import { EngagementBar } from './engagement-bar'
import { Avatar } from '../../primitives/avatar'
import { PlayFill, Info, DotsThree, Globe, Flag, Prohibit } from '../../icons'
import { IconButton } from '../../primitives/icon-button'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../primitives/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '../../primitives/dialog'
import { Drawer, DrawerContent } from '../../primitives/drawer'

// ── Types ──────────────────────────────────────────────────────────────

/** On-chain metadata for a post */
export interface PostProvenance {
  postId?: string
  ipfsHash?: string
  txHash?: string
  chainId?: number
  /** Story Protocol IP Asset ID (photo posts only, when registered) */
  ipId?: string | null
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
  onCopyLink?: () => void
  onSendViaChat?: () => void
  hideAuthor?: boolean
  // Menu
  menuSlot?: JSX.Element
  onMenuClick?: () => void
  onReportPost?: () => void
  onBlockUser?: () => void
  // Provenance metadata (shown in info dialog)
  provenance?: PostProvenance
  onPostClick?: () => void
  // Translation
  /** Available translations keyed by ISO 639-1 lang code, e.g. { ja: "...", es: "..." } */
  translations?: Record<string, string>
  /** User's locale ISO 639-1 code for auto-showing translations */
  userLang?: string
  /** ISO 639-1 language code of the original post (detected at creation) */
  postLang?: string
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
  const chainName = () => {
    if (props.provenance.chainId === 6343) return 'MegaETH Testnet'
    if (props.provenance.chainId === 1513) return 'Story Protocol'
    return props.provenance.chainId ? `Chain ${props.provenance.chainId}` : undefined
  }

  const truncHash = (hash: string) =>
    `${hash.slice(0, 10)}...${hash.slice(-8)}`

  return (
    <div class="flex flex-col gap-4 p-4 rounded-md bg-[var(--bg-elevated)]">
      <ProvenanceRow label="Post ID" value={props.provenance.postId} mono />
        <ProvenanceRow
          label="IPFS"
          value={props.provenance.ipfsHash}
          href={props.provenance.ipfsHash ? `https://heaven.myfilebase.com/ipfs/${props.provenance.ipfsHash}` : undefined}
          mono
        />
        <Show when={props.provenance.txHash}>
          <ProvenanceRow
            label="Transaction"
            value={truncHash(props.provenance.txHash!)}
            href={`https://megaeth-testnet-v2.blockscout.com/tx/${props.provenance.txHash}`}
            mono
          />
        </Show>
        <Show when={props.provenance.ipId}>
          <ProvenanceRow
            label="Story Protocol IP"
            value={props.provenance.ipId!}
            href={`https://explorer.story.foundation/ipa/${props.provenance.ipId}`}
            mono
          />
        </Show>
        <Show when={chainName()}>
          <ProvenanceRow
            label="Chain"
            value={`${chainName()} (${props.provenance.chainId})`}
          />
        </Show>
    </div>
  )
}

// ── Provenance Modal (responsive: Dialog on desktop, Drawer on mobile) ──

interface ProvenanceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provenance: PostProvenance
}

const ProvenanceModal: Component<ProvenanceModalProps> = (props) => {
  const isMobile = useIsMobile()

  return (
    <Show
      when={isMobile()}
      fallback={
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
          <DialogContent class="max-w-md">
            <DialogHeader>
              <DialogTitle>Provenance</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <ProvenanceDialogContent provenance={props.provenance} />
            </DialogBody>
          </DialogContent>
        </Dialog>
      }
    >
      <Drawer open={props.open} onOpenChange={props.onOpenChange}>
        <DrawerContent showHandle class="pb-8 max-h-[85vh]">
          <div class="pt-4 pb-2">
            <h2 class="text-lg font-semibold text-[var(--text-primary)] text-center">Provenance</h2>
          </div>
          <div class="px-4 overflow-y-auto">
            <ProvenanceDialogContent provenance={props.provenance} />
          </div>
        </DrawerContent>
      </Drawer>
    </Show>
  )
}

// ── Post Content (with translation support) ───────────────────────────

const PostContent: Component<{
  text?: string
  media?: FeedPostMedia
  translations?: Record<string, string>
  userLang?: string
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
    <>
      <Show when={props.text}>
        <div class="text-base font-medium text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{displayText()}</div>

        {/* Show original / Show translation toggle (only when translation exists) */}
        <Show when={hasTranslation()}>
          <div class="flex items-center gap-2 mt-1.5">
            <button
              type="button"
              class="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--accent-blue)] cursor-pointer transition-colors"
              data-no-post-click
              onClick={() => setShowOriginal(!showOriginal())}
            >
              <Globe class="w-3.5 h-3.5" />
              <span>{showOriginal() ? 'Show translation' : 'Show original'}</span>
            </button>
          </div>
        </Show>
      </Show>
      <Show when={props.media}>
        {(media) => (
          <div class="mt-2">
            <Switch>
              <Match when={media().type === 'photo' && media() as Extract<FeedPostMedia, { type: 'photo' }>}>
                {(m) => <PhotoGrid items={m().items} />}
              </Match>
              <Match when={media().type === 'video' && media() as Extract<FeedPostMedia, { type: 'video' }>}>
                {(m) => <VideoEmbed src={m().src} thumbnailUrl={m().thumbnailUrl} aspect={m().aspect} />}
              </Match>
            </Switch>
          </div>
        )}
      </Show>
    </>
  )
}

// ── Main Component ─────────────────────────────────────────────────────

export const FeedPost: Component<FeedPostProps> = (props) => {
  const isMobile = useIsMobile()
  const [showProvenance, setShowProvenance] = createSignal(false)

  // 3-dot menu dropdown in the top-right
  const headerRightSlot = () => (
    <div class="flex items-center -mr-2" data-no-post-click>
      {props.menuSlot ?? (
        <DropdownMenu>
          <DropdownMenuTrigger
            as={(triggerProps: Record<string, unknown>) => (
              <IconButton {...triggerProps} variant="soft" size="md" aria-label="Post options">
                <DotsThree class="w-5 h-5" />
              </IconButton>
            )}
          />
          <DropdownMenuContent class="min-w-[180px]">
            <Show when={props.provenance}>
              <DropdownMenuItem onSelect={() => setShowProvenance(true)}>
                <Info class="w-4 h-4" />
                View metadata
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </Show>
            <DropdownMenuItem onSelect={() => props.onReportPost?.()}>
              <Flag class="w-4 h-4" />
              Report post
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onBlockUser?.()}>
              <Prohibit class="w-4 h-4" />
              Block user
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Provenance modal (dialog on desktop, drawer on mobile) */}
      <Show when={props.provenance}>
        <ProvenanceModal
          open={showProvenance()}
          onOpenChange={setShowProvenance}
          provenance={props.provenance!}
        />
      </Show>
    </div>
  )

  return (
    <div
      class={cn('flex gap-3', isMobile() ? 'px-4 py-3' : 'px-5 py-3.5', props.onPostClick && 'cursor-pointer', props.class)}
      onClick={(e) => {
        // Don't navigate if clicking interactive elements (buttons, links, dialogs)
        const target = e.target as HTMLElement
        if (target.closest('button, a, [role="dialog"], [data-no-post-click]')) return
        // Don't navigate if provenance modal was just opened (dropdown portal click)
        if (showProvenance()) return
        props.onPostClick?.()
      }}
    >
      {/* Left column: avatar */}
      <Show when={!props.hideAuthor}>
        <div class="flex-shrink-0">
          <Show
            when={props.onAuthorClick}
            fallback={
              <Avatar
                src={props.authorAvatarUrl}
                size="md"
                shape="circle"
                nationalityCode={props.authorNationalityCode}
              />
            }
          >
            <button type="button" class="cursor-pointer" onClick={(e) => { e.stopPropagation(); props.onAuthorClick?.() }}>
              <Avatar
                src={props.authorAvatarUrl}
                size="md"
                shape="circle"
                nationalityCode={props.authorNationalityCode}
              />
            </button>
          </Show>
        </div>
      </Show>

      {/* Right column: name + content + engagement */}
      <div class="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* Header: name + timestamp + menu */}
        <Show when={!props.hideAuthor}>
          <div class="flex items-center gap-1.5">
            <span
              class={cn('text-base font-semibold truncate text-[var(--text-primary)]', props.onAuthorClick && 'cursor-pointer')}
              onClick={(e) => { e.stopPropagation(); props.onAuthorClick?.() }}
            >
              {props.authorHandle || props.authorName}
            </span>
            <span class="text-base text-[var(--text-muted)]">·</span>
            <span class="text-base flex-shrink-0 text-[var(--text-muted)]">{props.timestamp}</span>
            <div class="flex-1" />
            {headerRightSlot()}
          </div>
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
          onCopyLink={props.onCopyLink}
          onSendViaChat={props.onSendViaChat}
          hasTranslation={!!(props.translations && props.userLang && props.translations[props.userLang])}
          onTranslate={props.onTranslate && props.userLang ? () => props.onTranslate!(props.userLang!) : undefined}
          isTranslating={props.isTranslating}
          needsTranslation={props.postLang && props.userLang ? props.postLang !== props.userLang : true}
          compact={isMobile()}
          class="-mt-1 -mb-1"
        />
      </div>
    </div>
  )
}
