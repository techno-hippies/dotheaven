import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { MessageBubble, MessageList } from './message-bubble'
import { IconButton } from '../../primitives/icon-button'

const meta: Meta<typeof MessageBubble> = {
  title: 'Composite/MessageBubble',
  component: MessageBubble,
  tags: ['autodocs'],
  argTypes: {
    isOwn: {
      control: 'boolean',
    },
  },
}

export default meta
type Story = StoryObj<typeof MessageBubble>

export const Default: Story = {
  args: {
    username: 'vitalik.eth',
    message: 'Hey! Have you had a chance to review the governance proposal?',
    timestamp: '2:30 PM',
    isOwn: false,
    nationalityCode: 'CA',
  },
}

export const OwnMessage: Story = {
  args: {
    username: 'you',
    message: 'Yes! I think it looks solid. The tokenomics make sense.',
    timestamp: '2:31 PM',
    isOwn: true,
  },
}

export const ShortMessage: Story = {
  args: {
    username: 'alice.eth',
    message: 'Cool!',
    timestamp: '2:32 PM',
    isOwn: false,
  },
}

export const LongMessage: Story = {
  args: {
    username: 'you',
    message:
      'This is a much longer message to demonstrate how the bubble wraps text when it gets really long. The bubble should maintain proper width and wrap the content nicely with proper line height.',
    timestamp: '2:33 PM',
    isOwn: true,
  },
}

export const MultilineMessage: Story = {
  args: {
    username: 'bob.eth',
    message: 'First line\nSecond line\nThird line',
    timestamp: '2:34 PM',
    isOwn: false,
  },
}

export const WithoutTimestamp: Story = {
  args: {
    username: 'vitalik.eth',
    message: 'This message has no timestamp',
  },
}

export const EmojiMessage: Story = {
  args: {
    username: 'you',
    message: 'Perfect! Let me know if you need anything else',
    timestamp: '2:33 PM',
    isOwn: true,
  },
}

export const Conversation: Story = {
  render: () => (
    <div class="max-w-2xl mx-auto bg-[var(--bg-page)] min-h-[600px] flex flex-col">
      <MessageList class="flex-1">
        <MessageBubble
          username="vitalik.eth"
          message="Hey! Have you had a chance to review the governance proposal?"
          timestamp="2:30 PM"
          nationalityCode="CA"
        />
        <MessageBubble
          username="you"
          message="Yes! I think it looks solid. The tokenomics make sense."
          timestamp="2:31 PM"
          nationalityCode="US"
          isOwn
        />
        <MessageBubble
          username="vitalik.eth"
          message="Great, I'll submit my vote then. Should go live by tomorrow."
          timestamp="2:33 PM"
          nationalityCode="CA"
        />
        <MessageBubble
          username="you"
          message="Perfect! Let me know if you need anything else"
          timestamp="2:34 PM"
          nationalityCode="US"
          isOwn
        />
      </MessageList>
    </div>
  ),
}

export const ConversationWithHeader: Story = {
  render: () => (
    <div class="max-w-2xl mx-auto bg-[var(--bg-page)] min-h-[600px] flex flex-col">
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
          username="vitalik.eth"
          message="Hey! Have you had a chance to review the governance proposal?"
          timestamp="2:30 PM"
          nationalityCode="CA"
        />
        <MessageBubble
          username="you"
          message="Yes! I think it looks solid. The tokenomics make sense."
          timestamp="2:31 PM"
          nationalityCode="US"
          isOwn
        />
        <MessageBubble
          username="vitalik.eth"
          message="Great, I'll submit my vote then. Should go live by tomorrow."
          timestamp="2:33 PM"
          nationalityCode="CA"
        />
        <MessageBubble
          username="you"
          message="Perfect! Let me know if you need anything else"
          timestamp="2:34 PM"
          nationalityCode="US"
          isOwn
        />
      </MessageList>
    </div>
  ),
}

export const GroupConversation: Story = {
  render: () => (
    <div class="max-w-2xl mx-auto bg-[var(--bg-page)] min-h-[600px] flex flex-col">
      <MessageList class="flex-1">
        <MessageBubble
          username="alice.eth"
          message="Anyone want to grab coffee?"
          timestamp="3:00 PM"
          nationalityCode="FR"
        />
        <MessageBubble
          username="bob.eth"
          message="Sure, I'm in!"
          timestamp="3:01 PM"
          nationalityCode="NG"
        />
        <MessageBubble
          username="you"
          message="Count me in too"
          timestamp="3:02 PM"
          nationalityCode="JP"
          isOwn
        />
        <MessageBubble
          username="alice.eth"
          message="Great! Meet at the usual place in 15?"
          timestamp="3:03 PM"
          nationalityCode="FR"
        />
        <MessageBubble
          username="bob.eth"
          message="Works for me"
          timestamp="3:04 PM"
          nationalityCode="NG"
        />
        <MessageBubble
          username="you"
          message="On my way!"
          timestamp="3:05 PM"
          nationalityCode="JP"
          isOwn
        />
      </MessageList>
    </div>
  ),
}
