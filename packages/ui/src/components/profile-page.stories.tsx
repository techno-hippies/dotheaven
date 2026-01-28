import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { ProfilePage } from './profile-page'
import type { ProfileTab } from './profile-tabs'

const meta = {
  title: 'Pages/ProfilePage',
  component: ProfilePage,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ProfilePage>

export default meta
type Story = StoryObj<typeof meta>

const mockVideos = [
  { id: '1', thumbnailUrl: 'https://picsum.photos/seed/video1/450/800', viewCount: '38.9K' },
  { id: '2', thumbnailUrl: 'https://picsum.photos/seed/video2/450/800', viewCount: '447K' },
  { id: '3', thumbnailUrl: 'https://picsum.photos/seed/video3/450/800', viewCount: '13.1K' },
  { id: '4', thumbnailUrl: 'https://picsum.photos/seed/video4/450/800', viewCount: '17.5K' },
  { id: '5', thumbnailUrl: 'https://picsum.photos/seed/video5/450/800', viewCount: '10.3K' },
  { id: '6', thumbnailUrl: 'https://picsum.photos/seed/video6/450/800', viewCount: '20.9K' },
  { id: '7', thumbnailUrl: 'https://picsum.photos/seed/video7/450/800', viewCount: '16.4K' },
  { id: '8', thumbnailUrl: 'https://picsum.photos/seed/video8/450/800', viewCount: '12.3K' },
  { id: '9', thumbnailUrl: 'https://picsum.photos/seed/video9/450/800', viewCount: '19.8K' },
  { id: '10', thumbnailUrl: 'https://picsum.photos/seed/video10/450/800', viewCount: '6.9M' },
  { id: '11', thumbnailUrl: 'https://picsum.photos/seed/video11/450/800', viewCount: '25.2K' },
  { id: '12', thumbnailUrl: 'https://picsum.photos/seed/video12/450/800', viewCount: '8.7K' },
]

export const Default: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('videos')
    const [isFollowing, setIsFollowing] = createSignal(false)

    return (
      <ProfilePage
        username="samantha.heaven"
        displayName="Samantha"
        avatarUrl="https://i.pravatar.cc/300?img=1"
        stats={{
          followers: 12400,
          following: 843,
          likes: 94200,
        }}
        isFollowing={isFollowing()}
        isOwnProfile={false}
        onFollowClick={() => setIsFollowing(!isFollowing())}
        onMessageClick={() => console.log('Message clicked')}
        onAvatarClick={() => console.log('Avatar clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
        videos={mockVideos}
        onVideoClick={(videoId) => console.log('Video clicked:', videoId)}
      />
    )
  },
}

export const OwnProfile: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('videos')

    return (
      <ProfilePage
        username="samantha.heaven"
        displayName="Samantha"
        avatarUrl="https://i.pravatar.cc/300?img=1"
        stats={{
          followers: 12400,
          following: 843,
          likes: 94200,
        }}
        isOwnProfile={true}
        onAvatarClick={() => console.log('Avatar clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
        videos={mockVideos}
        onVideoClick={(videoId) => console.log('Video clicked:', videoId)}
      />
    )
  },
}

export const FewVideos: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('videos')

    return (
      <ProfilePage
        username="newuser.heaven"
        displayName="New User"
        avatarUrl="https://i.pravatar.cc/300?img=8"
        stats={{
          followers: 42,
          following: 120,
          likes: 318,
        }}
        isFollowing={false}
        isOwnProfile={false}
        onFollowClick={() => console.log('Follow clicked')}
        onMessageClick={() => console.log('Message clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
        videos={mockVideos.slice(0, 3)}
        onVideoClick={(videoId) => console.log('Video clicked:', videoId)}
      />
    )
  },
}

export const NoVideos: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('videos')

    return (
      <ProfilePage
        username="empty.heaven"
        displayName="Empty Profile"
        avatarUrl="https://i.pravatar.cc/300?img=12"
        stats={{
          followers: 0,
          following: 5,
          likes: 0,
        }}
        isFollowing={false}
        isOwnProfile={false}
        onFollowClick={() => console.log('Follow clicked')}
        onMessageClick={() => console.log('Message clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
        videos={[]}
        onVideoClick={(videoId) => console.log('Video clicked:', videoId)}
      />
    )
  },
}

export const CelebrityProfile: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('videos')
    const [isFollowing, setIsFollowing] = createSignal(false)

    return (
      <ProfilePage
        username="celebrity.heaven"
        displayName="Celebrity"
        avatarUrl="https://i.pravatar.cc/300?img=5"
        bannerGradient="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
        stats={{
          followers: 2400000,
          following: 234,
          likes: 15600000,
        }}
        isFollowing={isFollowing()}
        isOwnProfile={false}
        onFollowClick={() => setIsFollowing(!isFollowing())}
        onMessageClick={() => console.log('Message clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
        videos={mockVideos}
        onVideoClick={(videoId) => console.log('Video clicked:', videoId)}
      />
    )
  },
}
