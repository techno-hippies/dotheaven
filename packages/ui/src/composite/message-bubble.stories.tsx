import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { MessageBubble, MessageList } from './message-bubble'
import { IconButton } from '../primitives/icon-button'

const meta: Meta<typeof MessageBubble> = {
  title: 'UI/MessageBubble',
  component: MessageBubble,
  tags: ['autodocs'],
  argTypes: {
    alignment: {
      control: 'select',
      options: ['left', 'right'],
    },
  },
}

export default meta
type Story = StoryObj<typeof MessageBubble>

export const Left: Story = {
  args: {
    alignment: 'left',
    message: 'Hey! Have you had a chance to review the governance proposal?',
    timestamp: '2:30 PM',
  },
}

export const Right: Story = {
  args: {
    alignment: 'right',
    message: 'Yes! I think it looks solid. The tokenomics make sense.',
    timestamp: '2:31 PM',
  },
}

export const ShortMessage: Story = {
  args: {
    alignment: 'left',
    message: 'Cool!',
    timestamp: '2:32 PM',
  },
}

export const LongMessage: Story = {
  args: {
    alignment: 'right',
    message:
      'This is a much longer message to demonstrate how the bubble wraps text when it gets really long. The bubble should maintain its max width of 75% and wrap the content nicely with proper line height.',
    timestamp: '2:33 PM',
  },
}

export const MultilineMessage: Story = {
  args: {
    alignment: 'left',
    message: 'First line\nSecond line\nThird line',
    timestamp: '2:34 PM',
  },
}

export const WithoutTimestamp: Story = {
  args: {
    alignment: 'left',
    message: 'This message has no timestamp',
  },
}

export const EmojiMessage: Story = {
  args: {
    alignment: 'right',
    message: 'Perfect! Let me know if you need anything else 👍',
    timestamp: '2:33 PM',
  },
}

export const Conversation: Story = {
  render: () => (
    <div class="max-w-2xl mx-auto bg-black min-h-[600px] flex flex-col">
      <MessageList class="flex-1">
        <MessageBubble
          alignment="left"
          message="Hey! Have you had a chance to review the governance proposal?"
          timestamp="2:30 PM"
        />
        <MessageBubble
          alignment="right"
          message="Yes! I think it looks solid. The tokenomics make sense."
        />
        <MessageBubble
          alignment="left"
          message="Great, I'll submit my vote then. Should go live by tomorrow."
          timestamp="2:33 PM"
        />
        <MessageBubble
          alignment="right"
          message="Perfect! Let me know if you need anything else 👍"
          timestamp="2:34 PM"
        />
      </MessageList>
    </div>
  ),
}

export const ConversationWithHeader: Story = {
  render: () => (
    <div class="max-w-2xl mx-auto bg-black min-h-[600px] flex flex-col">
      {/* Header */}
      <div class="h-16 bg-[var(--bg-surface)] flex items-center justify-between px-6 border-b border-[var(--border-default)]">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
            <svg class="w-6 h-6 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
          <span class="text-base font-medium text-[var(--text-primary)]">vitalik.eth</span>
        </div>
        <IconButton variant="ghost" size="md" aria-label="Open menu">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </IconButton>
      </div>

      {/* Messages */}
      <MessageList class="flex-1 overflow-y-auto">
        <MessageBubble
          alignment="left"
          message="Hey! Have you had a chance to review the governance proposal?"
          timestamp="2:30 PM"
        />
        <MessageBubble
          alignment="right"
          message="Yes! I think it looks solid. The tokenomics make sense."
        />
        <MessageBubble
          alignment="left"
          message="Great, I'll submit my vote then. Should go live by tomorrow."
          timestamp="2:33 PM"
        />
        <MessageBubble
          alignment="right"
          message="Perfect! Let me know if you need anything else 👍"
          timestamp="2:34 PM"
        />
      </MessageList>
    </div>
  ),
}

export const AllAlignments: Story = {
  render: () => (
    <div class="space-y-4 max-w-2xl">
      <div>
        <p class="text-xs text-[var(--text-muted)] mb-2 uppercase font-medium">Left Aligned</p>
        <MessageBubble
          alignment="left"
          message="This is a left-aligned message (received)"
          timestamp="2:30 PM"
        />
      </div>
      <div>
        <p class="text-xs text-[var(--text-muted)] mb-2 uppercase font-medium">Right Aligned</p>
        <MessageBubble
          alignment="right"
          message="This is a right-aligned message (sent)"
          timestamp="2:31 PM"
        />
      </div>
    </div>
  ),
}
