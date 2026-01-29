import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { MessageInput } from './message-input'
import { MessageBubble, MessageList } from './message-bubble'
import { IconButton } from '../primitives/icon-button'
import { createSignal } from 'solid-js'

const meta: Meta<typeof MessageInput> = {
  title: 'Composite/MessageInput',
  component: MessageInput,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof MessageInput>

export const Default: Story = {
  args: {
    placeholder: 'Type a message...',
  },
}

export const WithValue: Story = {
  args: {
    value: 'This is a pre-filled message',
    placeholder: 'Type a message...',
  },
}

export const Disabled: Story = {
  args: {
    placeholder: 'Type a message...',
    disabled: true,
  },
}

export const CustomPlaceholder: Story = {
  args: {
    placeholder: 'Send a message to vitalik.eth...',
  },
}

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = createSignal('')
    const [lastSent, setLastSent] = createSignal<string | null>(null)

    const handleSubmit = (message: string) => {
      console.log('Sent:', message)
      setLastSent(message)
    }

    return (
      <div class="space-y-4">
        <MessageInput
          value={value()}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Type a message..."
        />
        {lastSent() && (
          <div class="p-4 bg-[var(--bg-surface)] rounded-lg">
            <p class="text-sm text-[var(--text-secondary)] mb-1">Last sent message:</p>
            <p class="text-base text-[var(--text-primary)]">{lastSent()}</p>
          </div>
        )}
      </div>
    )
  },
}

export const LongText: Story = {
  args: {
    value:
      'This is a much longer message to demonstrate how the textarea auto-resizes when you type more content. It should grow vertically but stay within the max height limit.',
    placeholder: 'Type a message...',
  },
}

export const FullChatExample: Story = {
  render: () => {
    interface Message {
      id: number
      text: string
      username: string
      timestamp: string
      isOwn: boolean
    }

    const [messages, setMessages] = createSignal<Message[]>([
      {
        id: 1,
        text: 'Hey! Have you had a chance to review the governance proposal?',
        username: 'vitalik.eth',
        timestamp: '2:30 PM',
        isOwn: false,
      },
      {
        id: 2,
        text: 'Yes! I think it looks solid. The tokenomics make sense.',
        username: 'you',
        timestamp: '2:31 PM',
        isOwn: true,
      },
      {
        id: 3,
        text: "Great, I'll submit my vote then. Should go live by tomorrow.",
        username: 'vitalik.eth',
        timestamp: '2:33 PM',
        isOwn: false,
      },
      {
        id: 4,
        text: 'Perfect! Let me know if you need any help with the implementation. I can take a look at the smart contracts this weekend.',
        username: 'you',
        timestamp: '2:34 PM',
        isOwn: true,
      },
    ])

    const handleSubmit = (message: string) => {
      const now = new Date()
      const timestamp = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })

      setMessages((prev) => [
        ...prev,
        {
          id: prev.length + 1,
          text: message,
          username: 'you',
          timestamp,
          isOwn: true,
        },
      ])
    }

    return (
      <div class="max-w-2xl mx-auto bg-[var(--bg-page)] h-[600px] flex flex-col">
        {/* Header */}
        <div class="h-16 bg-[var(--bg-surface)] flex items-center justify-between px-6 border-b border-[var(--border-default)] flex-shrink-0">
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
        <div class="flex-1 overflow-y-auto">
          <MessageList>
            {messages().map((msg) => (
              <MessageBubble
                username={msg.username}
                message={msg.text}
                timestamp={msg.timestamp}
                isOwn={msg.isOwn}
              />
            ))}
          </MessageList>
        </div>

        {/* Input */}
        <MessageInput
          onSubmit={handleSubmit}
          placeholder="Type a message..."
          class="border-t-0"
        />
      </div>
    )
  },
}

export const MultipleInputs: Story = {
  render: () => (
    <div class="space-y-6">
      <div>
        <p class="text-sm text-[var(--text-secondary)] mb-2">Chat 1</p>
        <MessageInput placeholder="Message alice.eth..." />
      </div>
      <div>
        <p class="text-sm text-[var(--text-secondary)] mb-2">Chat 2</p>
        <MessageInput placeholder="Message bob.eth..." />
      </div>
      <div>
        <p class="text-sm text-[var(--text-secondary)] mb-2">Disabled</p>
        <MessageInput placeholder="This chat is disabled" disabled />
      </div>
    </div>
  ),
}
