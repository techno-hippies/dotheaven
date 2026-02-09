import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { EngagementBar } from './engagement-bar'

const meta: Meta<typeof EngagementBar> = {
  title: 'Feed/EngagementBar',
  component: EngagementBar,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '520px', background: 'var(--bg-surface)', padding: '16px', 'border-radius': '6px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof EngagementBar>

const noop = () => {}

// ── Default ─────────────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    comments: 7,
    reposts: 3,
    likes: 42,
    onComment: noop,
    onRepost: noop,
    onQuote: noop,
    onLike: noop,
    onCopyLink: noop,
    onSendViaChat: noop,
  },
}

// ── Liked ───────────────────────────────────────────────────────────────

export const Liked: Story = {
  args: {
    comments: 12,
    reposts: 5,
    likes: 244,
    isLiked: true,
    onComment: noop,
    onRepost: noop,
    onQuote: noop,
    onLike: noop,
    onCopyLink: noop,
    onSendViaChat: noop,
  },
}

// ── Reposted ────────────────────────────────────────────────────────────

export const Reposted: Story = {
  args: {
    comments: 3,
    reposts: 13,
    likes: 89,
    isReposted: true,
    onComment: noop,
    onRepost: noop,
    onQuote: noop,
    onLike: noop,
    onCopyLink: noop,
    onSendViaChat: noop,
  },
}

// ── Large counts ────────────────────────────────────────────────────────

export const LargeCounts: Story = {
  args: {
    comments: 1200,
    reposts: 5400,
    likes: 24300,
    onComment: noop,
    onRepost: noop,
    onQuote: noop,
    onLike: noop,
    onCopyLink: noop,
    onSendViaChat: noop,
  },
}

// ── Zero counts ─────────────────────────────────────────────────────────

export const ZeroCounts: Story = {
  args: {
    comments: 0,
    reposts: 0,
    likes: 0,
    onComment: noop,
    onRepost: noop,
    onQuote: noop,
    onLike: noop,
    onCopyLink: noop,
    onSendViaChat: noop,
  },
}

// ── Compact ─────────────────────────────────────────────────────────────

export const Compact: Story = {
  args: {
    comments: 7,
    reposts: 3,
    likes: 42,
    compact: true,
    onComment: noop,
    onRepost: noop,
    onQuote: noop,
    onLike: noop,
    onCopyLink: noop,
    onSendViaChat: noop,
  },
}

// ── Translation: Needs Translation ─────────────────────────────────────

export const TranslateAvailable: Story = {
  name: 'Translate Button Shown',
  args: {
    comments: 7,
    reposts: 3,
    likes: 42,
    needsTranslation: true,
    onTranslate: () => console.log('translate'),
    onComment: noop,
    onRepost: noop,
    onQuote: noop,
    onLike: noop,
    onCopyLink: noop,
    onSendViaChat: noop,
  },
}

// ── Translation: In Progress ───────────────────────────────────────────

export const TranslateInProgress: Story = {
  name: 'Translate In Progress',
  args: {
    comments: 7,
    reposts: 3,
    likes: 42,
    needsTranslation: true,
    isTranslating: true,
    onTranslate: noop,
    onComment: noop,
    onRepost: noop,
    onQuote: noop,
    onLike: noop,
    onCopyLink: noop,
    onSendViaChat: noop,
  },
}

// ── Translation: Already Translated (button hidden) ────────────────────

export const TranslateDone: Story = {
  name: 'Already Translated (no button)',
  args: {
    comments: 7,
    reposts: 3,
    likes: 42,
    hasTranslation: true,
    needsTranslation: true,
    onTranslate: noop,
    onComment: noop,
    onRepost: noop,
    onQuote: noop,
    onLike: noop,
    onCopyLink: noop,
    onSendViaChat: noop,
  },
}

// ── Interactive ─────────────────────────────────────────────────────────

export const Interactive: StoryObj = {
  render: () => {
    const [liked, setLiked] = createSignal(false)
    const [likes, setLikes] = createSignal(42)
    const [reposted, setReposted] = createSignal(false)
    const [reposts, setReposts] = createSignal(3)

    return (
      <EngagementBar
        comments={7}
        reposts={reposts()}
        likes={likes()}
        isLiked={liked()}
        isReposted={reposted()}
        onComment={() => console.log('comment')}
        onRepost={() => {
          setReposted(!reposted())
          setReposts(r => reposted() ? r + 1 : r - 1)
        }}
        onQuote={() => console.log('quote')}
        onLike={() => {
          setLiked(!liked())
          setLikes(l => liked() ? l + 1 : l - 1)
        }}
        onCopyLink={() => console.log('copy link')}
        onSendViaChat={() => console.log('send via chat')}
      />
    )
  },
}
