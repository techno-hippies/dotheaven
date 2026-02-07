import type { Component } from 'solid-js'
import { createSignal, createMemo, For, Show } from 'solid-js'
import { FeedPost, type FeedPostProps, Avatar, Tabs, ComposeBox, ComposeFab, ComposeDrawer, useIsMobile, type ProfileInput } from '@heaven/ui'
import { useQueryClient } from '@tanstack/solid-query'
import { useNavigate } from '@solidjs/router'
import { post } from '@heaven/core'
import { useAuth } from '../providers'
import { openUserMenu } from '../lib/user-menu'

const noop = () => {}

export const feedPosts: FeedPostProps[] = [
  {
    authorName: 'Yuki',
    authorHandle: 'yuki.heaven',
    authorAvatarUrl: 'https://placewaifu.com/image/100',
    authorNationalityCode: 'JP',
    timestamp: '2h ago',
    text: 'Just discovered this amazing album. The production quality is insane, every track flows into the next perfectly. Highly recommend giving it a full listen with headphones.',
    likes: 42,
    comments: 7,
    reposts: 3,
    onLike: noop, onComment: noop, onRepost: noop, onQuote: noop, onShare: noop,
  },
  {
    authorName: 'Miku',
    authorHandle: 'miku.heaven',
    authorAvatarUrl: 'https://placewaifu.com/image/101',
    authorNationalityCode: 'JP',
    timestamp: '4h ago',
    text: 'Sunset vibes from the rooftop',
    media: { type: 'photo', items: [{ url: 'https://placewaifu.com/image/800/450', aspect: 'landscape' }] },
    likes: 234,
    comments: 18,
    reposts: 13,
    onLike: noop, onComment: noop, onRepost: noop, onQuote: noop, onShare: noop,
  },
  {
    authorName: 'Rei',
    authorHandle: 'rei.heaven',
    authorAvatarUrl: 'https://placewaifu.com/image/102',
    authorNationalityCode: 'JP',
    timestamp: '6h ago',
    text: 'New album art is incredible',
    media: { type: 'photo', items: [{ url: 'https://placewaifu.com/image/500', aspect: 'square' }] },
    likes: 28,
    comments: 3,
    reposts: 1,
    isLiked: true,
    onLike: noop, onComment: noop, onRepost: noop, onQuote: noop, onShare: noop,
  },
  {
    authorName: 'Asuka',
    authorHandle: 'asuka.eth',
    authorAvatarUrl: 'https://placewaifu.com/image/103',
    authorNationalityCode: 'DE',
    timestamp: '8h ago',
    text: 'Concert was incredible last night',
    media: { type: 'photo', items: [
      { url: 'https://placewaifu.com/image/400/400' },
      { url: 'https://placewaifu.com/image/401/401' },
    ]},
    likes: 312,
    comments: 45,
    reposts: 21,
    onLike: noop, onComment: noop, onRepost: noop, onQuote: noop, onShare: noop,
  },
  {
    authorName: 'Sakura',
    authorHandle: 'sakura.heaven',
    authorAvatarUrl: 'https://placewaifu.com/image/104',
    authorNationalityCode: 'JP',
    timestamp: '12h ago',
    text: 'POV: discovering a new genre',
    media: { type: 'video', src: '', thumbnailUrl: 'https://placewaifu.com/image/270/480', aspect: 'portrait' },
    likes: 5400,
    comments: 312,
    reposts: 89,
    onLike: noop, onComment: noop, onRepost: noop, onQuote: noop, onShare: noop,
  },
  {
    authorName: 'Misato',
    authorHandle: 'misato.heaven',
    authorAvatarUrl: 'https://placewaifu.com/image/105',
    authorNationalityCode: 'JP',
    timestamp: '1d ago',
    text: 'Festival photo dump',
    media: { type: 'photo', items: [
      { url: 'https://placewaifu.com/image/400/400' },
      { url: 'https://placewaifu.com/image/401/401' },
      { url: 'https://placewaifu.com/image/402/402' },
      { url: 'https://placewaifu.com/image/403/403' },
      { url: 'https://placewaifu.com/image/404/404' },
    ]},
    likes: 891,
    comments: 67,
    reposts: 34,
    onLike: noop, onComment: noop, onRepost: noop, onQuote: noop, onShare: noop,
  },
  {
    authorName: 'Shinji',
    authorHandle: 'shinji.eth',
    authorAvatarUrl: 'https://placewaifu.com/image/106',
    authorNationalityCode: 'JP',
    timestamp: '1d ago',
    text: 'Found this hidden gem on a random playlist. No idea who this artist is but the vocals are haunting. Anyone know them?',
    likes: 14,
    comments: 2,
    reposts: 0,
    onLike: noop, onComment: noop, onRepost: noop, onQuote: noop, onShare: noop,
  },
  {
    authorName: 'Kaworu',
    authorHandle: 'kaworu.heaven',
    authorAvatarUrl: 'https://placewaifu.com/image/107',
    authorNationalityCode: 'JP',
    timestamp: '2d ago',
    text: 'New music video just dropped',
    media: { type: 'video', src: '', thumbnailUrl: 'https://placewaifu.com/image/800/450', aspect: 'landscape' },
    likes: 1200,
    comments: 89,
    reposts: 56,
    onLike: noop, onComment: noop, onRepost: noop, onQuote: noop, onShare: noop,
  },
]

const feedTabs = [
  { id: 'foryou', label: 'For you' },
  { id: 'following', label: 'Following' },
]

export const FeedPage: Component = () => {
  const isMobile = useIsMobile()
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [composeOpen, setComposeOpen] = createSignal(false)
  const [feedTab, setFeedTab] = createSignal('foryou')

  // Derive avatar URL from cached profile query (same pattern as AppLayout)
  const cachedAvatarUrl = createMemo(() => {
    const addr = auth.pkpAddress()
    if (!addr) return undefined
    const queries = queryClient.getQueriesData<ProfileInput>({ queryKey: ['profile', addr] })
    for (const [, data] of queries) {
      if (data?.avatar) return data.avatar
    }
    return undefined
  })

  const handlePost = (text: string) => {
    console.log('Post:', text)
    // TODO: wire to Lit Action post pipeline
  }

  return (
    <div class="h-full overflow-y-auto">
      <header>
        {/* Mobile: avatar (left) + logo (center) row */}
        <Show when={isMobile()}>
          <div class="relative flex items-center justify-center h-14">
            <Show when={auth.isAuthenticated()}>
              <button
                type="button"
                class="absolute left-4 cursor-pointer"
                onClick={openUserMenu}
              >
                <Avatar src={cachedAvatarUrl()} fallback="U" size="sm" />
              </button>
            </Show>
            <img
              src={`${import.meta.env.BASE_URL}images/heaven-white-sm.png`}
              alt="Heaven"
              class="h-7"
            />
          </div>
        </Show>
        <Tabs tabs={feedTabs} activeTab={feedTab()} onTabChange={setFeedTab} />
      </header>

      {/* Desktop: inline compose box at top */}
      <Show when={!isMobile()}>
        <ComposeBox onPost={handlePost} />
      </Show>

      <div class="divide-y divide-[var(--bg-highlight)]">
        <For each={feedPosts}>
          {(p, i) => <FeedPost {...p} onPostClick={() => navigate(post(String(i())))} />}
        </For>
      </div>

      {/* Mobile: FAB + compose drawer */}
      <Show when={isMobile()}>
        <ComposeFab onClick={() => setComposeOpen(true)} />
        <ComposeDrawer
          open={composeOpen()}
          onOpenChange={setComposeOpen}
          onPost={handlePost}
        />
      </Show>
    </div>
  )
}
