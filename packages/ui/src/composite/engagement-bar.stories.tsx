import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { EngagementBar } from './engagement-bar'
import { DotsThree } from '../icons'

const meta: Meta<typeof EngagementBar> = {
  title: 'Composite/EngagementBar',
  component: EngagementBar,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div class="max-w-md p-4 bg-[var(--bg-surface)] rounded-md">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof EngagementBar>

// ── Basic Examples ──────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    likes: 42,
    comments: 12,
    onLike: () => console.log('Like clicked'),
    onComment: () => console.log('Comment clicked'),
  },
}

export const WithShares: Story = {
  args: {
    likes: 1234,
    comments: 89,
    shares: 23,
    onLike: () => console.log('Like clicked'),
    onComment: () => console.log('Comment clicked'),
    onShare: () => console.log('Share clicked'),
  },
}

export const WithInfo: Story = {
  args: {
    likes: 567,
    comments: 34,
    onLike: () => console.log('Like clicked'),
    onComment: () => console.log('Comment clicked'),
    showInfo: true,
    onInfo: () => console.log('Info clicked'),
  },
}

export const Liked: Story = {
  args: {
    likes: 100,
    comments: 5,
    isLiked: true,
    onLike: () => console.log('Unlike clicked'),
    onComment: () => console.log('Comment clicked'),
  },
}

// ── Compact Mode ────────────────────────────────────────────────────────

export const Compact: Story = {
  args: {
    likes: 42,
    comments: 12,
    onLike: () => console.log('Like clicked'),
    onComment: () => console.log('Comment clicked'),
    compact: true,
  },
}

export const CompactWithAll: Story = {
  args: {
    likes: 999,
    comments: 50,
    shares: 10,
    isLiked: true,
    onLike: () => console.log('Like clicked'),
    onComment: () => console.log('Comment clicked'),
    onShare: () => console.log('Share clicked'),
    showInfo: true,
    onInfo: () => console.log('Info clicked'),
    compact: true,
  },
}

// ── Large Numbers ───────────────────────────────────────────────────────

export const LargeNumbers: Story = {
  args: {
    likes: 1500000,
    comments: 45000,
    shares: 8900,
    onLike: () => console.log('Like clicked'),
    onComment: () => console.log('Comment clicked'),
    onShare: () => console.log('Share clicked'),
  },
}

// ── Custom Right Slot ───────────────────────────────────────────────────

export const WithCustomRightSlot: Story = {
  args: {
    likes: 42,
    comments: 12,
    onLike: () => console.log('Like clicked'),
    onComment: () => console.log('Comment clicked'),
    rightSlot: (
      <button
        type="button"
        class="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <DotsThree class="w-5 h-5" />
      </button>
    ),
  },
}

// ── Without Counts ──────────────────────────────────────────────────────

export const WithoutCounts: Story = {
  args: {
    onLike: () => console.log('Like clicked'),
    onComment: () => console.log('Comment clicked'),
    onShare: () => console.log('Share clicked'),
  },
}

// ── Interactive ─────────────────────────────────────────────────────────

export const Interactive: Story = {
  render: () => {
    const [likes, setLikes] = createSignal(42)
    const [isLiked, setIsLiked] = createSignal(false)
    const [comments, setComments] = createSignal(12)

    const handleLike = () => {
      if (isLiked()) {
        setLikes((l) => l - 1)
        setIsLiked(false)
      } else {
        setLikes((l) => l + 1)
        setIsLiked(true)
      }
    }

    return (
      <div class="flex flex-col gap-4">
        <p class="text-base text-[var(--text-muted)]">
          Click the buttons to interact:
        </p>
        <EngagementBar
          likes={likes()}
          isLiked={isLiked()}
          comments={comments()}
          onLike={handleLike}
          onComment={() => setComments((c) => c + 1)}
          showInfo
          onInfo={() => alert('Showing post info...')}
        />
      </div>
    )
  },
}

// ── Comparison ──────────────────────────────────────────────────────────

export const SizeComparison: Story = {
  render: () => (
    <div class="flex flex-col gap-6">
      <div>
        <span class="text-xs text-[var(--text-muted)] mb-2 block">Normal</span>
        <EngagementBar
          likes={42}
          comments={12}
          shares={5}
          onLike={() => {}}
          onComment={() => {}}
          onShare={() => {}}
          showInfo
          onInfo={() => {}}
        />
      </div>
      <div>
        <span class="text-xs text-[var(--text-muted)] mb-2 block">Compact</span>
        <EngagementBar
          likes={42}
          comments={12}
          shares={5}
          onLike={() => {}}
          onComment={() => {}}
          onShare={() => {}}
          showInfo
          onInfo={() => {}}
          compact
        />
      </div>
    </div>
  ),
}
