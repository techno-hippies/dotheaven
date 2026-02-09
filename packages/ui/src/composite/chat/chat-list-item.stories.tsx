import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { ChatListItem } from './chat-list-item'

const meta: Meta<typeof ChatListItem> = {
  title: 'Chat/ChatListItem',
  component: ChatListItem,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '600px', background: 'var(--bg-surface)', 'border-radius': '6px', padding: '8px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ChatListItem>

export const Default: Story = {
  args: {
    name: 'Miku',
    handle: 'miku.heaven',
    avatarUrl: 'https://placewaifu.com/image/101',
    nationalityCode: 'KR',
    lastMessage: 'Have you heard the new album?',
    timestamp: '2m ago',
  },
}

export const Unread: Story = {
  args: {
    name: 'Rei',
    handle: 'rei.heaven',
    avatarUrl: 'https://placewaifu.com/image/102',
    lastMessage: 'Check out this playlist I made',
    timestamp: '15m ago',
    unreadCount: 3,
  },
}

export const Active: Story = {
  args: {
    name: 'Asuka',
    handle: 'asuka.eth',
    avatarUrl: 'https://placewaifu.com/image/103',
    lastMessage: 'That concert was insane',
    timestamp: '1h ago',
    active: true,
  },
}

export const Online: Story = {
  args: {
    name: 'Sakura',
    handle: 'sakura.heaven',
    avatarUrl: 'https://placewaifu.com/image/104',
    lastMessage: 'Want to go to the show tonight?',
    timestamp: '3h ago',
    online: true,
  },
}

export const ManyUnread: Story = {
  args: {
    name: 'Kaworu',
    handle: 'kaworu.heaven',
    avatarUrl: 'https://placewaifu.com/image/107',
    lastMessage: 'You need to listen to this',
    timestamp: 'Yesterday',
    unreadCount: 42,
    online: true,
  },
}

export const NoAvatar: Story = {
  args: {
    name: 'Anonymous',
    handle: '0x1234...5678',
    lastMessage: 'Hey, are you there?',
    timestamp: '5m ago',
    unreadCount: 1,
  },
}

// ── Full Chat List ────────────────────────────────────────────────────

export const ChatList: StoryObj = {
  decorators: [
    (Story) => (
      <div style={{ width: '600px', height: '700px', overflow: 'auto', background: 'var(--bg-page)', 'border-radius': '6px' }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div class="flex flex-col">
      <div class="p-3 pb-1">
        <h2 class="text-lg font-bold text-[var(--text-primary)]">Messages</h2>
      </div>
      <div class="p-1 flex flex-col">
        <ChatListItem
          name="Miku"
          handle="miku.heaven"
          avatarUrl="https://placewaifu.com/image/101"
          nationalityCode="KR"
          lastMessage="Have you heard the new album? It's incredible"
          timestamp="2m ago"
          unreadCount={2}
          online
        />
        <ChatListItem
          name="Rei"
          handle="rei.heaven"
          avatarUrl="https://placewaifu.com/image/102"
          nationalityCode="DE"
          lastMessage="Check out this playlist I made for you"
          timestamp="15m ago"
          unreadCount={1}
        />
        <ChatListItem
          name="Asuka"
          handle="asuka.eth"
          avatarUrl="https://placewaifu.com/image/103"
          nationalityCode="US"
          lastMessage="That concert was insane last night"
          timestamp="1h ago"
          active
        />
        <ChatListItem
          name="Sakura"
          handle="sakura.heaven"
          avatarUrl="https://placewaifu.com/image/104"
          nationalityCode="JP"
          lastMessage="Want to go to the show tonight?"
          timestamp="3h ago"
          online
        />
        <ChatListItem
          name="Misato"
          handle="misato.heaven"
          avatarUrl="https://placewaifu.com/image/105"
          nationalityCode="FR"
          lastMessage="I'll send you the link later"
          timestamp="Yesterday"
        />
        <ChatListItem
          name="Shinji"
          handle="shinji.eth"
          avatarUrl="https://placewaifu.com/image/106"
          nationalityCode="BR"
          lastMessage="Thanks for the recommendation"
          timestamp="Yesterday"
        />
        <ChatListItem
          name="Kaworu"
          handle="kaworu.heaven"
          avatarUrl="https://placewaifu.com/image/107"
          nationalityCode="GB"
          lastMessage="You need to listen to this right now"
          timestamp="2d ago"
          unreadCount={5}
          online
        />
        <ChatListItem
          name="Anonymous"
          handle="0x7890...abcd"
          lastMessage="Hey, are you on heaven?"
          timestamp="3d ago"
        />
      </div>
    </div>
  ),
}
