import { type Component, createSignal, For } from 'solid-js'
import {
  AppShell,
  Header,
  RightPanel,
  Avatar,
  IconButton,
  MusicPlayer,
  MessageBubble,
  MessageList,
  MessageInput,
} from '@heaven/ui'
import { AppSidebar } from '../components/shell'
import { useAuth } from '../providers'
import { useNavigate, useParams } from '@solidjs/router'

const BellIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const MoreIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
)

interface Message {
  id: number
  text: string
  alignment: 'left' | 'right'
  timestamp: string
}

// Chat data for different users
const chatData: Record<string, { displayName: string; messages: Message[] }> = {
  vitalik: {
    displayName: 'vitalik.eth',
    messages: [
      {
        id: 1,
        text: 'Hey! Have you had a chance to review the governance proposal?',
        alignment: 'left',
        timestamp: '2:30 PM',
      },
      {
        id: 2,
        text: 'Yes! I think it looks solid. The tokenomics make sense.',
        alignment: 'right',
        timestamp: '2:31 PM',
      },
      {
        id: 3,
        text: "Great, I'll submit my vote then. Should go live by tomorrow.",
        alignment: 'left',
        timestamp: '2:33 PM',
      },
    ],
  },
  nick: {
    displayName: 'nick.heaven',
    messages: [
      {
        id: 1,
        text: 'The transaction went through!',
        alignment: 'left',
        timestamp: '10:15 AM',
      },
      {
        id: 2,
        text: 'Nice! How much gas did it cost?',
        alignment: 'right',
        timestamp: '10:16 AM',
      },
      {
        id: 3,
        text: 'Only 0.002 ETH, not bad for a swap.',
        alignment: 'left',
        timestamp: '10:17 AM',
      },
      {
        id: 4,
        text: "That's pretty reasonable. What did you swap?",
        alignment: 'right',
        timestamp: '10:18 AM',
      },
    ],
  },
}

export const ChatPage: Component = () => {
  const auth = useAuth()
  const navigate = useNavigate()
  const params = useParams<{ username: string }>()

  const chatUser = () => chatData[params.username] || { displayName: params.username, messages: [] }
  const [messages, setMessages] = createSignal<Message[]>(chatUser().messages)

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
        alignment: 'right',
        timestamp,
      },
    ])
  }

  return (
    <AppShell
      header={
        <Header
          rightSlot={
            <div class="flex items-center gap-3">
              <IconButton variant="ghost" size="md" aria-label="Notifications">
                <BellIcon />
              </IconButton>
              <button
                onClick={() => navigate('/profile')}
                class="flex items-center gap-2 hover:opacity-80 transition-opacity"
                title={`Signed in as ${auth.pkpAddress()?.slice(0, 6)}...${auth.pkpAddress()?.slice(-4)}`}
              >
                <Avatar size="sm" class="cursor-pointer" />
              </button>
            </div>
          }
        />
      }
      sidebar={<AppSidebar />}
      rightPanel={
        <RightPanel>
          <div class="p-4">
            <h3 class="text-base font-semibold text-[var(--text-primary)] mb-4">Now Playing</h3>
            <div class="aspect-square bg-[var(--bg-highlight)] rounded-lg mb-4" />
            <p class="text-lg font-semibold text-[var(--text-primary)]">Neon Dreams</p>
            <p class="text-base text-[var(--text-secondary)]">Synthwave Collective</p>
          </div>
        </RightPanel>
      }
      footer={
        <MusicPlayer
          title="Neon Dreams"
          artist="Synthwave Collective"
          currentTime="2:47"
          duration="4:39"
          progress={58}
          isPlaying
        />
      }
    >
      <div class="h-full flex flex-col bg-[var(--bg-page)]">
        {/* Chat Header */}
        <div class="h-16 bg-[var(--bg-surface)] flex items-center justify-between px-6 border-b border-[var(--border-default)] flex-shrink-0">
          <div class="flex items-center gap-3">
            <Avatar size="md" />
            <span class="text-base font-medium text-[var(--text-primary)]">{chatUser().displayName}</span>
          </div>
          <IconButton variant="ghost" size="md" aria-label="Open menu">
            <MoreIcon />
          </IconButton>
        </div>

        {/* Messages */}
        <div class="flex-1 overflow-y-auto">
          <MessageList>
            <For each={messages()}>
              {(msg) => (
                <MessageBubble
                  alignment={msg.alignment}
                  message={msg.text}
                  timestamp={msg.timestamp}
                />
              )}
            </For>
          </MessageList>
        </div>

        {/* Input */}
        <MessageInput
          onSubmit={handleSubmit}
          placeholder={`Message ${chatUser().displayName}...`}
        />
      </div>
    </AppShell>
  )
}
