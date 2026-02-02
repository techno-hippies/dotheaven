import type { Meta, StoryObj } from 'storybook-solidjs'
import { NotificationItem } from './notification-item'
import { Tabs } from './tabs'

const meta: Meta<typeof NotificationItem> = {
  title: 'Composite/NotificationItem',
  component: NotificationItem,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '600px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof NotificationItem>

const noop = () => {}

export const Like: Story = {
  args: {
    avatarUrl: 'https://placewaifu.com/image/100',
    actorName: 'Yuki',
    action: 'liked your post',
    preview: 'Just discovered this amazing album...',
    timestamp: '2m ago',
    type: 'like',
    unread: true,
    onClick: noop,
  },
}

export const Comment: Story = {
  args: {
    avatarUrl: 'https://placewaifu.com/image/101',
    actorName: 'Miku',
    action: 'commented on your post',
    preview: 'This is incredible, where did you find it?',
    timestamp: '15m ago',
    type: 'comment',
    unread: true,
    onClick: noop,
  },
}

export const Follow: Story = {
  args: {
    avatarUrl: 'https://placewaifu.com/image/102',
    actorName: 'Rei',
    action: 'started following you',
    timestamp: '1h ago',
    type: 'follow',
    onClick: noop,
  },
}

export const Mention: Story = {
  args: {
    avatarUrl: 'https://placewaifu.com/image/103',
    actorName: 'Asuka',
    action: 'mentioned you in a comment',
    preview: '@you should check this out',
    timestamp: '3h ago',
    type: 'mention',
    onClick: noop,
  },
}

export const Scrobble: Story = {
  args: {
    avatarUrl: 'https://placewaifu.com/image/104',
    actorName: 'Sakura',
    action: 'is listening to Schism by Tool',
    timestamp: '5h ago',
    type: 'scrobble',
    onClick: noop,
  },
}

export const PlaylistRead: Story = {
  name: 'Playlist',
  args: {
    avatarUrl: 'https://placewaifu.com/image/105',
    actorName: 'Misato',
    action: 'added a track to Late Night Vibes',
    timestamp: '1d ago',
    type: 'playlist',
    onClick: noop,
  },
}

export const NotificationFeed: StoryObj = {
  render: () => (
    <div style={{ width: '600px', height: '700px', overflow: 'auto', background: 'var(--bg-page)' }}>
      {/* Header */}
      <div class="sticky top-0 z-10 bg-[var(--bg-page)] border-b border-[var(--bg-highlight)]">
        <div class="px-4 pt-4 pb-2">
          <h1 class="text-xl font-bold text-[var(--text-primary)]">Notifications</h1>
        </div>
        <div class="px-4 pb-1">
          <Tabs
            tabs={[
              { id: 'all', label: 'All' },
              { id: 'mentions', label: 'Mentions' },
              { id: 'follows', label: 'Follows' },
            ]}
            activeTab="all"
            onTabChange={noop}
          />
        </div>
      </div>

      {/* Today */}
      <div class="px-4 py-2">
        <span class="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Today</span>
      </div>
      <div class="divide-y divide-[var(--bg-highlight)]">
        <NotificationItem
          avatarUrl="https://placewaifu.com/image/100"
          actorName="Yuki"
          action="liked your post"
          preview="Just discovered this amazing album..."
          timestamp="2m ago"
          type="like"
          unread
          onClick={noop}
        />
        <NotificationItem
          avatarUrl="https://placewaifu.com/image/101"
          actorName="Miku"
          action="commented on your post"
          preview="This is incredible, where did you find it?"
          timestamp="15m ago"
          type="comment"
          unread
          onClick={noop}
        />
        <NotificationItem
          avatarUrl="https://placewaifu.com/image/102"
          actorName="Rei"
          action="started following you"
          timestamp="1h ago"
          type="follow"
          unread
          onClick={noop}
        />
        <NotificationItem
          avatarUrl="https://placewaifu.com/image/103"
          actorName="Asuka"
          action="mentioned you in a comment"
          preview="@you should check this out"
          timestamp="3h ago"
          type="mention"
          onClick={noop}
        />
      </div>

      {/* Earlier */}
      <div class="px-4 py-2 mt-2">
        <span class="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Earlier</span>
      </div>
      <div class="divide-y divide-[var(--bg-highlight)]">
        <NotificationItem
          avatarUrl="https://placewaifu.com/image/104"
          actorName="Sakura"
          action="is listening to Schism by Tool"
          timestamp="5h ago"
          type="scrobble"
          onClick={noop}
        />
        <NotificationItem
          avatarUrl="https://placewaifu.com/image/105"
          actorName="Misato"
          action="added a track to Late Night Vibes"
          timestamp="1d ago"
          type="playlist"
          onClick={noop}
        />
        <NotificationItem
          avatarUrl="https://placewaifu.com/image/106"
          actorName="Shinji"
          action="liked your comment"
          preview="Haunting vocals on this track"
          timestamp="1d ago"
          type="like"
          onClick={noop}
        />
        <NotificationItem
          avatarUrl="https://placewaifu.com/image/107"
          actorName="Kaworu"
          action="started following you"
          timestamp="2d ago"
          type="follow"
          onClick={noop}
        />
      </div>
    </div>
  ),
}
