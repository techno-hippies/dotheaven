import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { CommentItem, CommentSection } from './comment-item'

const meta: Meta<typeof CommentItem> = {
  title: 'Composite/CommentItem',
  component: CommentItem,
  parameters: {
    layout: 'centered',
  },
}

export default meta
type Story = StoryObj<typeof CommentItem>

/**
 * Single comment with default styling
 */
export const Default: Story = {
  render: () => (
    <div class="w-[320px] bg-[var(--bg-surface)] p-4 rounded-xl">
      <CommentItem authorName="urbanexplorer">
        The vibe is immaculate 🔥
      </CommentItem>
    </div>
  ),
}

/**
 * Comment with custom avatar
 */
export const WithAvatar: Story = {
  render: () => (
    <div class="w-[320px] bg-[var(--bg-surface)] p-4 rounded-xl">
      <CommentItem
        authorName="neonlights"
        avatarSrc="https://picsum.photos/seed/neon/100/100"
      >
        Where is this? Need to visit
      </CommentItem>
    </div>
  ),
}

/**
 * Long comment text wrapping
 */
export const LongComment: Story = {
  render: () => (
    <div class="w-[320px] bg-[var(--bg-surface)] p-4 rounded-xl">
      <CommentItem authorName="musiclover">
        This is absolutely incredible! The production quality is top-notch and the mixing is so clean.
        I've been listening to this on repeat for hours. Where can I find more tracks like this?
      </CommentItem>
    </div>
  ),
}

/**
 * Multiple comments in a section
 */
export const CommentThread: Story = {
  render: () => (
    <div class="w-[320px] bg-[var(--bg-surface)] p-4 rounded-xl">
      <CommentSection title="Comments">
        <CommentItem
          authorName="producer101"
          avatarSrc="https://picsum.photos/seed/prod/100/100"
        >
          The mixing is so clean
        </CommentItem>
        <CommentItem
          authorName="beatmaker"
          avatarSrc="https://picsum.photos/seed/beat/100/100"
        >
          What DAW do they use?
        </CommentItem>
        <CommentItem
          authorName="audiophile"
          avatarSrc="https://picsum.photos/seed/audio/100/100"
        >
          Need this on vinyl
        </CommentItem>
      </CommentSection>
    </div>
  ),
}

/**
 * Comment section without title
 */
export const NoTitle: Story = {
  render: () => (
    <div class="w-[320px] bg-[var(--bg-surface)] p-4 rounded-xl">
      <CommentSection>
        <CommentItem authorName="user1">First comment</CommentItem>
        <CommentItem authorName="user2">Second comment with more text</CommentItem>
      </CommentSection>
    </div>
  ),
}
