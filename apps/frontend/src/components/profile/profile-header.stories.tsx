import type { Meta, StoryObj } from 'storybook-solidjs'
import { ProfileHeader } from './profile-header'

const meta = {
  title: 'Components/ProfileHeader',
  component: ProfileHeader,
  tags: ['autodocs'],
  argTypes: {
    onFollowClick: { action: 'follow clicked' },
    onMessageClick: { action: 'message clicked' },
    onAvatarClick: { action: 'avatar clicked' },
  },
} satisfies Meta<typeof ProfileHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    username: 'samantha.heaven',
    displayName: 'Samantha',
    avatarUrl: 'https://i.pravatar.cc/300?img=1',
    stats: {
      followers: 12400,
      following: 843,
      likes: 94200,
    },
    isFollowing: false,
    isOwnProfile: false,
  },
}

export const Following: Story = {
  args: {
    username: 'samantha.heaven',
    displayName: 'Samantha',
    avatarUrl: 'https://i.pravatar.cc/300?img=1',
    stats: {
      followers: 12400,
      following: 843,
      likes: 94200,
    },
    isFollowing: true,
    isOwnProfile: false,
  },
}

export const OwnProfile: Story = {
  args: {
    username: 'samantha.heaven',
    displayName: 'Samantha',
    avatarUrl: 'https://i.pravatar.cc/300?img=1',
    stats: {
      followers: 12400,
      following: 843,
      likes: 94200,
    },
    isOwnProfile: true,
  },
}

export const HighFollowerCount: Story = {
  args: {
    username: 'celebrity.heaven',
    displayName: 'Celebrity',
    avatarUrl: 'https://i.pravatar.cc/300?img=5',
    stats: {
      followers: 2400000,
      following: 234,
      likes: 15600000,
    },
    isFollowing: false,
    isOwnProfile: false,
  },
}

export const CustomBanner: Story = {
  args: {
    username: 'artist.heaven',
    displayName: 'Artist',
    avatarUrl: 'https://i.pravatar.cc/300?img=3',
    bannerGradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    stats: {
      followers: 8500,
      following: 421,
      likes: 42300,
    },
    isFollowing: false,
    isOwnProfile: false,
  },
}

export const InContext: Story = {
  args: {
    username: 'samantha.heaven',
    displayName: 'Samantha',
    avatarUrl: 'https://i.pravatar.cc/300?img=1',
    stats: {
      followers: 12400,
      following: 843,
      likes: 94200,
    },
    isFollowing: false,
    isOwnProfile: false,
  },
  render: (args: any) => (
    <div class="bg-[var(--bg-page)] min-h-screen">
      <ProfileHeader {...args} />
      <div class="px-8 py-4 text-[var(--text-secondary)]">
        Profile content would go here...
      </div>
    </div>
  ),
}
