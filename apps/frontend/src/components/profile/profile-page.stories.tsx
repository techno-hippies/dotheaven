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

export const Default: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('about')
    const [isFollowing, setIsFollowing] = createSignal(false)

    return (
      <ProfilePage
        username="samantha.heaven"
        displayName="Samantha"
        avatarUrl="https://i.pravatar.cc/300?img=1"
        nationalityCode="JP"
        verificationState="verified"
        isFollowing={isFollowing()}
        isOwnProfile={false}
        onFollowClick={() => setIsFollowing(!isFollowing())}
        onMessageClick={() => console.log('Message clicked')}
        onAvatarClick={() => console.log('Avatar clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
      />
    )
  },
}

export const OwnProfile: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('about')

    return (
      <ProfilePage
        username="samantha.heaven"
        displayName="Samantha"
        avatarUrl="https://i.pravatar.cc/300?img=1"
        nationalityCode="GB"
        verificationState="verified"
        isOwnProfile={true}
        onAvatarClick={() => console.log('Avatar clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
      />
    )
  },
}

export const CelebrityProfile: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('about')
    const [isFollowing, setIsFollowing] = createSignal(false)

    return (
      <ProfilePage
        username="celebrity.heaven"
        displayName="Celebrity"
        avatarUrl="https://i.pravatar.cc/300?img=5"
        bannerGradient="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
        isFollowing={isFollowing()}
        isOwnProfile={false}
        onFollowClick={() => setIsFollowing(!isFollowing())}
        onMessageClick={() => console.log('Message clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
      />
    )
  },
}
