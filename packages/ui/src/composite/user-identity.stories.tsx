import type { Meta, StoryObj } from 'storybook-solidjs'
import { UserIdentity } from './user-identity'
import { DotsThree, SealCheckFill } from '../icons'

const meta: Meta<typeof UserIdentity> = {
  title: 'Composite/UserIdentity',
  component: UserIdentity,
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
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
}

export default meta
type Story = StoryObj<typeof UserIdentity>

// ── Basic Examples ──────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    name: 'yuki.heaven',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=yuki',
    timestamp: '2m ago',
  },
}

export const WithOnlineStatus: Story = {
  args: {
    name: 'vitalik.eth',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vitalik',
    timestamp: 'Now',
    online: true,
  },
}

export const WithDotSeparator: Story = {
  args: {
    name: 'alice.heaven',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
    timestamp: '5h ago',
    showDot: true,
  },
}

export const WalletAddress: Story = {
  args: {
    name: '0x1234...5678',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=wallet',
  },
}

// ── Size Variants ───────────────────────────────────────────────────────

export const SizeSmall: Story = {
  args: {
    name: 'compact.heaven',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=small',
    timestamp: 'Just now',
    size: 'sm',
  },
}

export const SizeMedium: Story = {
  args: {
    name: 'medium.heaven',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=medium',
    timestamp: '10m ago',
    size: 'md',
  },
}

export const SizeLarge: Story = {
  args: {
    name: 'large.heaven',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=large',
    timestamp: '1h ago',
    size: 'lg',
  },
}

// ── With Secondary Line ─────────────────────────────────────────────────

export const WithSecondaryLine: Story = {
  args: {
    name: 'alex.heaven',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex',
    timestamp: '3m ago',
    secondaryLine: (
      <span class="text-base text-[var(--text-muted)] truncate">
        Hey! Are you coming to the party tonight?
      </span>
    ),
  },
}

export const ChatListStyle: Story = {
  args: {
    name: 'sarah.heaven',
    handle: '0x8a9b...4c2d',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
    timestamp: 'Yesterday',
    online: true,
    size: 'lg',
    secondaryLine: (
      <span class="text-base text-[var(--text-muted)] truncate">
        Thanks for the playlist! I love it 🎵
      </span>
    ),
    rightSlot: (
      <span class="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--accent-blue)] text-white text-xs font-bold flex items-center justify-center">
        3
      </span>
    ),
  },
}

// ── With Right Slot ─────────────────────────────────────────────────────

export const WithMenuButton: Story = {
  args: {
    name: 'author.heaven',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=author',
    timestamp: '2h ago',
    showDot: true,
    rightSlot: (
      <button
        type="button"
        class="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <DotsThree class="w-5 h-5" />
      </button>
    ),
  },
}

export const WithBadge: Story = {
  args: {
    name: 'verified.heaven',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=verified',
    timestamp: '1d ago',
    rightSlot: (
      <SealCheckFill class="w-5 h-5 text-[var(--accent-blue)]" />
    ),
  },
}

// ── Custom Styling ──────────────────────────────────────────────────────

export const OwnMessage: Story = {
  args: {
    name: 'You',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=me',
    timestamp: 'Just now',
    nameClass: 'text-[var(--accent-blue)]',
  },
}

export const MutedName: Story = {
  args: {
    name: 'Anonymous',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=anon',
    timestamp: '5m ago',
    nameBold: false,
    nameClass: 'text-[var(--text-secondary)]',
  },
}

// ── Interactive ─────────────────────────────────────────────────────────

export const Clickable: Story = {
  args: {
    name: 'clickme.heaven',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=click',
    timestamp: 'Now',
    onClick: () => alert('Identity clicked!'),
  },
}

export const ClickableAvatar: Story = {
  args: {
    name: 'avatar.heaven',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=avatar',
    timestamp: 'Now',
    onAvatarClick: () => alert('Avatar clicked!'),
  },
}

// ── All Sizes Comparison ────────────────────────────────────────────────

export const AllSizes: Story = {
  render: () => (
    <div class="flex flex-col gap-6">
      <div>
        <span class="text-xs text-[var(--text-muted)] mb-2 block">Small</span>
        <UserIdentity
          name="small.heaven"
          avatarUrl="https://api.dicebear.com/7.x/avataaars/svg?seed=small"
          timestamp="Just now"
          size="sm"
        />
      </div>
      <div>
        <span class="text-xs text-[var(--text-muted)] mb-2 block">Medium (default)</span>
        <UserIdentity
          name="medium.heaven"
          avatarUrl="https://api.dicebear.com/7.x/avataaars/svg?seed=medium"
          timestamp="2m ago"
          size="md"
        />
      </div>
      <div>
        <span class="text-xs text-[var(--text-muted)] mb-2 block">Large</span>
        <UserIdentity
          name="large.heaven"
          avatarUrl="https://api.dicebear.com/7.x/avataaars/svg?seed=large"
          timestamp="1h ago"
          size="lg"
        />
      </div>
    </div>
  ),
}
