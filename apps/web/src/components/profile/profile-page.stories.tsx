import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { ProfilePage } from './profile-page'
import type { ProfileTab } from './profile-tabs'
import type { ProfileScrobble } from './profile-page'
const meta = {
  title: 'Profile/ProfilePage',
  component: ProfilePage,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ProfilePage>

export default meta
type Story = StoryObj<typeof meta>

// Sample profile data
const sampleProfileData = {
  displayName: 'Samantha',
  bio: 'Music lover, coffee enthusiast, and aspiring digital nomad. Always looking for the next adventure.',
  url: 'samantha.com',
  twitter: 'samantha_dev',
  github: 'samantha',
  telegram: 'samantha_tg',
  age: 28,
  gender: 'woman',
  nationality: 'JP',
  locationCityId: 'Tokyo, Kanto, Japan',
  heightCm: 165,
  relocate: 'willing-relocate',
  degree: 'bachelors',
  fieldBucket: 'computer-science',
  school: 'University of Tokyo',
  profession: 'software-engineer',
  industry: 'technology',
  relationshipStatus: 'single',
  sexuality: 'straight',
  ethnicity: 'asian',
  datingStyle: 'monogamous',
  children: 'none',
  wantsChildren: 'maybe',
  lookingFor: 'long-term',
  drinking: 'socially',
  smoking: 'never',
  drugs: 'never',
  religion: 'agnostic',
  pets: 'love-dogs',
  diet: 'omnivore',
  hobbiesCommit: '1,5,12,13',
  skillsCommit: '1001,1005,1010',
  languages: [
    { code: 'ja', proficiency: 7 },
    { code: 'en', proficiency: 5 },
  ],
}

// Sample scrobbles data — enough repeats for meaningful top artists/tracks
const sampleScrobbles: ProfileScrobble[] = [
  { id: '1', title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', trackId: '0x123', timestamp: '2h', durationSec: 200, coverUrl: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36' },
  { id: '2', title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', trackId: '0x124', timestamp: '3h', durationSec: 203, coverUrl: 'https://i.scdn.co/image/ab67616d0000b273c85a19d3d1ebba4f86b1c3bd' },
  { id: '3', title: 'Save Your Tears', artist: 'The Weeknd', album: 'After Hours', trackId: '0x127', timestamp: '5h', durationSec: 215, coverUrl: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36' },
  { id: '4', title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', trackId: '0x123', timestamp: '8h', durationSec: 200, coverUrl: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36' },
  { id: '5', title: 'Stay', artist: 'The Kid LAROI & Justin Bieber', album: 'F*ck Love 3: Over You', trackId: '0x125', timestamp: '1d', durationSec: 141 },
  { id: '6', title: 'Good 4 U', artist: 'Olivia Rodrigo', album: 'SOUR', trackId: '0x126', timestamp: '1d', durationSec: 178, coverUrl: 'https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd89802e5a' },
  { id: '7', title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', trackId: '0x124', timestamp: '1d', durationSec: 203, coverUrl: 'https://i.scdn.co/image/ab67616d0000b273c85a19d3d1ebba4f86b1c3bd' },
  { id: '8', title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', trackId: '0x123', timestamp: '2d', durationSec: 200, coverUrl: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36' },
  { id: '9', title: 'Peaches', artist: 'Justin Bieber', album: 'Justice', trackId: '0x128', timestamp: '2d', durationSec: 198, coverUrl: 'https://i.scdn.co/image/ab67616d0000b273e6f407c7f3a0ec98845e4431' },
  { id: '10', title: 'Montero', artist: 'Lil Nas X', album: 'Montero', trackId: '0x129', timestamp: '3d', durationSec: 137, coverUrl: 'https://i.scdn.co/image/ab67616d0000b273be82673b5f79d9658ec0a9fd' },
  { id: '11', title: 'Good 4 U', artist: 'Olivia Rodrigo', album: 'SOUR', trackId: '0x126', timestamp: '3d', durationSec: 178, coverUrl: 'https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd89802e5a' },
  { id: '12', title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', trackId: '0x124', timestamp: '4d', durationSec: 203, coverUrl: 'https://i.scdn.co/image/ab67616d0000b273c85a19d3d1ebba4f86b1c3bd' },
  { id: '13', title: 'Kiss Me More', artist: 'Doja Cat', album: 'Planet Her', trackId: '0x130', timestamp: '4d', durationSec: 209, coverUrl: 'https://i.scdn.co/image/ab67616d0000b2734df3245f26298a1579ecc321' },
  { id: '14', title: 'Save Your Tears', artist: 'The Weeknd', album: 'After Hours', trackId: '0x127', timestamp: '5d', durationSec: 215, coverUrl: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36' },
  { id: '15', title: 'drivers license', artist: 'Olivia Rodrigo', album: 'SOUR', trackId: '0x131', timestamp: '5d', durationSec: 242, coverUrl: 'https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd89802e5a' },
  { id: '16', title: 'Peaches', artist: 'Justin Bieber', album: 'Justice', trackId: '0x128', timestamp: '6d', durationSec: 198, coverUrl: 'https://i.scdn.co/image/ab67616d0000b273e6f407c7f3a0ec98845e4431' },
  { id: '17', title: 'Butter', artist: 'BTS', album: 'Butter', trackId: '0x132', timestamp: '1w', durationSec: 165, coverUrl: 'https://i.scdn.co/image/ab67616d0000b273750f2b4209696f01f6d4fa18' },
  { id: '18', title: 'Montero', artist: 'Lil Nas X', album: 'Montero', trackId: '0x129', timestamp: '1w', durationSec: 137, coverUrl: 'https://i.scdn.co/image/ab67616d0000b273be82673b5f79d9658ec0a9fd' },
]

// Sample schedule data
const sampleAvailability = [
  { day: 0, startHour: 9, endHour: 17 },   // Mon 9am-5pm
  { day: 2, startHour: 10, endHour: 16 },  // Wed 10am-4pm
  { day: 4, startHour: 14, endHour: 20 },  // Fri 2pm-8pm
]

const sampleSlots = [
  {
    id: 1,
    startTime: Math.floor(Date.now() / 1000) + 86400 * 2,
    durationMins: 60,
    priceEth: '0.05',
    status: 'open' as const,
  },
  {
    id: 2,
    startTime: Math.floor(Date.now() / 1000) + 86400 * 3,
    durationMins: 90,
    priceEth: '0.08',
    status: 'open' as const,
  },
  {
    id: 3,
    startTime: Math.floor(Date.now() / 1000) + 86400 * 5,
    durationMins: 60,
    priceEth: '0.05',
    status: 'booked' as const,
    guestName: 'alice.heaven',
  },
]

const sampleRequests = [
  {
    id: 1,
    guestAddress: '0x1234567890abcdef1234567890abcdef12345678',
    guestName: 'bob.heaven',
    windowStart: Math.floor(Date.now() / 1000) + 86400,
    windowEnd: Math.floor(Date.now() / 1000) + 86400 * 4,
    durationMins: 60,
    amountEth: '0.06',
    expiry: Math.floor(Date.now() / 1000) + 86400 * 7,
    status: 'open' as const,
  },
]

// Public Profile (default) - all 4 tabs navigable
export const PublicProfile: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('posts')
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
        followerCount={42}
        followingCount={128}
        onFollowerCountClick={() => console.log('[Story] Followers clicked')}
        onFollowingCountClick={() => console.log('[Story] Following clicked')}
        onFollowClick={() => setIsFollowing(!isFollowing())}
        onMessageClick={() => console.log('[Story] Message clicked')}
        onAvatarClick={() => console.log('[Story] Avatar clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => {
          console.log('[Story] Tab changed to:', tab)
          setActiveTab(tab)
        }}
        profileData={sampleProfileData}
        scrobbles={sampleScrobbles}
        onArtistClick={(artist) => console.log('[Story] Artist clicked:', artist)}
        onTrackClick={(trackId) => console.log('[Story] Track clicked:', trackId)}
        scheduleBasePrice="0.05"
        scheduleSlots={sampleSlots}
        onBookSlot={(slotId) => console.log('[Story] Book slot:', slotId)}
        onRequestCustomTime={(params) => console.log('[Story] Request custom time:', params)}
      />
    )
  },
}

// Public Profile - Music Tab Active
export const PublicProfileMusic: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('music')
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
        followerCount={42}
        followingCount={128}
        onFollowerCountClick={() => console.log('[Story] Followers clicked')}
        onFollowingCountClick={() => console.log('[Story] Following clicked')}
        onFollowClick={() => setIsFollowing(!isFollowing())}
        onMessageClick={() => console.log('[Story] Message clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
        profileData={sampleProfileData}
        scrobbles={sampleScrobbles}
        onArtistClick={(artist) => console.log('[Story] Artist clicked:', artist)}
        onTrackClick={(trackId) => console.log('[Story] Track clicked:', trackId)}
      />
    )
  },
}

// Public Profile - Schedule Tab Active
export const PublicProfileSchedule: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('schedule')
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
        followerCount={42}
        followingCount={128}
        onFollowerCountClick={() => console.log('[Story] Followers clicked')}
        onFollowingCountClick={() => console.log('[Story] Following clicked')}
        onFollowClick={() => setIsFollowing(!isFollowing())}
        onMessageClick={() => console.log('[Story] Message clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
        profileData={sampleProfileData}
        scheduleBasePrice="0.05"
        scheduleSlots={sampleSlots}
        onBookSlot={(slotId) => console.log('[Story] Book slot:', slotId)}
        onRequestCustomTime={(params) => console.log('[Story] Request custom time:', params)}
      />
    )
  },
}

// Own Profile - View Mode (not editing)
export const OwnProfile: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('posts')

    return (
      <ProfilePage
        username="samantha.heaven"
        displayName="Samantha"
        avatarUrl="https://i.pravatar.cc/300?img=1"
        nationalityCode="JP"
        verificationState="verified"
        isOwnProfile={true}
        followerCount={42}
        followingCount={128}
        onFollowerCountClick={() => console.log('[Story] Followers clicked')}
        onFollowingCountClick={() => console.log('[Story] Following clicked')}
        onAvatarClick={() => console.log('[Story] Avatar clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
        profileData={sampleProfileData}
        scrobbles={sampleScrobbles}
        heavenName="samantha"
        ensProfile={{ name: 'samantha.eth', avatar: 'https://i.pravatar.cc/300?img=1' }}
        scheduleBasePrice="0.05"
        scheduleAccepting={true}
        scheduleAvailability={sampleAvailability}
        scheduleSlots={sampleSlots}
        scheduleRequests={sampleRequests}
        onSetBasePrice={(price) => console.log('[Story] Set base price:', price)}
        onToggleAccepting={(accepting) => console.log('[Story] Toggle accepting:', accepting)}
        onAvailabilityChange={(slots) => console.log('[Story] Availability changed:', slots)}
        onCancelSlot={(slotId) => console.log('[Story] Cancel slot:', slotId)}
      />
    )
  },
}

// Own Profile - Editing Mode
export const OwnProfileEditing: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('posts')

    return (
      <ProfilePage
        username="samantha.heaven"
        displayName="Samantha"
        avatarUrl="https://i.pravatar.cc/300?img=1"
        nationalityCode="JP"
        verificationState="verified"
        isOwnProfile={true}
        onAvatarClick={() => console.log('[Story] Avatar clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
        profileData={sampleProfileData}
        onProfileSave={async (data) => {
          console.log('[Story] Save profile:', data)
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }}
        heavenName="samantha"
        ensProfile={{ name: 'samantha.eth', avatar: 'https://i.pravatar.cc/300?img=1' }}
        eoaAddress="0x1234567890abcdef1234567890abcdef12345678"
      />
    )
  },
}

// Own Profile - Unverified (shows Verify button)
export const OwnProfileUnverified: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('posts')

    return (
      <ProfilePage
        username="samantha.heaven"
        displayName="Samantha"
        avatarUrl="https://i.pravatar.cc/300?img=1"
        nationalityCode="JP"
        verificationState="none"
        isOwnProfile={true}
        onAvatarClick={() => console.log('[Story] Avatar clicked')}
        onVerifyClick={() => console.log('[Story] Verify clicked - would show QR dialog')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
        profileData={sampleProfileData}
        scrobbles={sampleScrobbles}
        heavenName="samantha"
        scheduleBasePrice="0.05"
        scheduleAccepting={false}
        scheduleAvailability={sampleAvailability}
        scheduleSlots={sampleSlots}
        onSetBasePrice={(price) => console.log('[Story] Set base price:', price)}
        onToggleAccepting={(accepting) => console.log('[Story] Toggle accepting:', accepting)}
        onAvailabilityChange={(slots) => console.log('[Story] Availability changed:', slots)}
        onCancelSlot={(slotId) => console.log('[Story] Cancel slot:', slotId)}
      />
    )
  },
}

// Own Profile - Schedule Tab with Slots & Requests
export const OwnProfileSchedule: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('schedule')

    return (
      <ProfilePage
        username="samantha.heaven"
        displayName="Samantha"
        avatarUrl="https://i.pravatar.cc/300?img=1"
        nationalityCode="JP"
        verificationState="verified"
        isOwnProfile={true}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
        profileData={sampleProfileData}
        heavenName="samantha"
        scheduleBasePrice="0.05"
        scheduleAccepting={true}
        scheduleAvailability={sampleAvailability}
        scheduleSlots={sampleSlots}
        scheduleRequests={sampleRequests}
        onSetBasePrice={(price) => console.log('[Story] Set base price:', price)}
        onToggleAccepting={(accepting) => console.log('[Story] Toggle accepting:', accepting)}
        onAvailabilityChange={(slots) => console.log('[Story] Availability changed:', slots)}
        onCancelSlot={(slotId) => console.log('[Story] Cancel slot:', slotId)}
      />
    )
  },
}

// Celebrity Profile with Custom Banner
export const CelebrityProfile: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('posts')
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
        onMessageClick={() => console.log('[Story] Message clicked')}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
        profileData={{
          ...sampleProfileData,
          displayName: 'Celebrity',
          bio: 'Artist, creator, and visionary. Making waves in the digital space.',
        }}
        scrobbles={sampleScrobbles}
      />
    )
  },
}

// Loading States
export const LoadingProfile: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('posts')

    return (
      <ProfilePage
        username="samantha.heaven"
        displayName="Samantha"
        avatarUrl="https://i.pravatar.cc/300?img=1"
        nationalityCode="JP"
        verificationState="verified"
        isOwnProfile={false}
        activeTab={activeTab()}
        onTabChange={(tab) => setActiveTab(tab)}
        profileLoading={true}
      />
    )
  },
}

