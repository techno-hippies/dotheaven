import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { CommentItem, CommentSection } from './comment-item'

const meta: Meta<typeof CommentItem> = {
  title: 'Feed/CommentItem',
  component: CommentItem,
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
type Story = StoryObj<typeof CommentItem>

// ── Default ─────────────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    authorName: 'Yuki',
    avatarSrc: 'https://placewaifu.com/image/100',
    children: 'This is such a great find! The production on this album is next level.',
  },
}

// ── No avatar ───────────────────────────────────────────────────────────

export const NoAvatar: Story = {
  args: {
    authorName: 'Anonymous',
    children: 'Love this track, been on repeat all day.',
  },
}

// ── Long comment ────────────────────────────────────────────────────────

export const LongComment: Story = {
  args: {
    authorName: 'Miku',
    avatarSrc: 'https://placewaifu.com/image/101',
    children: 'I completely agree with everything you said here. The way the artist layers the synths with those organic percussion samples creates such a unique texture. And that bridge in the third track? Absolutely brilliant. I need to listen to their earlier work now to see how they evolved to this point.',
  },
}

// ── Comment section ─────────────────────────────────────────────────────

export const Section: StoryObj = {
  render: () => (
    <CommentSection title="3 comments">
      <CommentItem
        authorName="Yuki"
        avatarSrc="https://placewaifu.com/image/100"
      >
        This is incredible! Been waiting for this drop.
      </CommentItem>
      <CommentItem
        authorName="Miku"
        avatarSrc="https://placewaifu.com/image/101"
      >
        The vocals on this are haunting. Who is this artist?
      </CommentItem>
      <CommentItem
        authorName="Rei"
        avatarSrc="https://placewaifu.com/image/102"
      >
        Adding to my playlist immediately.
      </CommentItem>
    </CommentSection>
  ),
}
