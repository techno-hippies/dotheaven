import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { AppShell } from './AppShell'
import { Sidebar, SidebarSection } from './Sidebar'
import { RightPanel } from './RightPanel'
import { Header } from './Header'
import { MobileFooter } from './MobileFooter'
import { ListItem } from '../composite/list-item'
import { MusicPlayer } from '../composite/music-player'
import { MiniPlayer } from '../composite/mini-player'
import { AlbumCover } from '../composite/album-cover'
import { Avatar } from '../primitives/avatar'
import { IconButton } from '../primitives/icon-button'

// Phosphor icons (regular weight)
const ChatCircleIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-4-1.08,7.85,7.85,0,0,0-2.53.42L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
  </svg>
)

const MusicNotesIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V62.25l112-28V134.08A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z" />
  </svg>
)

const HomeIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z" />
  </svg>
)

const SearchIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
  </svg>
)

const UserIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
  </svg>
)

const BellIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M168,224a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,224Zm53.85-32A15.8,15.8,0,0,1,208,200H48a16,16,0,0,1-13.8-24.06C39.75,166.38,48,139.34,48,104a80,80,0,1,1,160,0c0,35.33,8.26,62.38,13.81,71.94A15.89,15.89,0,0,1,221.85,192ZM208,184c-7.73-13.27-16-43.95-16-80a64,64,0,1,0-128,0c0,36.06-8.28,66.74-16,80Z" />
  </svg>
)

const WalletIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,64H56A8,8,0,0,1,56,48H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-36-60a12,12,0,1,1,12-12A12,12,0,0,1,180,132Z" />
  </svg>
)

const GearIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Zm-16.1-6.5a73.93,73.93,0,0,1,0,8.68,8,8,0,0,0,1.74,5.48l14.19,17.73a91.57,91.57,0,0,1-6.23,15L187,173.11a8,8,0,0,0-5.1,2.64,74.11,74.11,0,0,1-6.14,6.14,8,8,0,0,0-2.64,5.1l-2.51,22.58a91.32,91.32,0,0,1-15,6.23l-17.74-14.19a8,8,0,0,0-5-1.75h-.48a73.93,73.93,0,0,1-8.68,0,8,8,0,0,0-5.48,1.74L100.45,215.8a91.57,91.57,0,0,1-15-6.23L82.89,187a8,8,0,0,0-2.64-5.1,74.11,74.11,0,0,1-6.14-6.14,8,8,0,0,0-5.1-2.64L46.43,170.6a91.32,91.32,0,0,1-6.23-15l14.19-17.74a8,8,0,0,0,1.74-5.48,73.93,73.93,0,0,1,0-8.68,8,8,0,0,0-1.74-5.48L40.2,100.45a91.57,91.57,0,0,1,6.23-15L69,82.89a8,8,0,0,0,5.1-2.64,74.11,74.11,0,0,1,6.14-6.14A8,8,0,0,0,82.89,69L85.4,46.43a91.32,91.32,0,0,1,15-6.23l17.74,14.19a8,8,0,0,0,5.48,1.74,73.93,73.93,0,0,1,8.68,0,8,8,0,0,0,5.48-1.74L155.55,40.2a91.57,91.57,0,0,1,15,6.23L173.11,69a8,8,0,0,0,2.64,5.1,74.11,74.11,0,0,1,6.14,6.14,8,8,0,0,0,5.1,2.64l22.58,2.51a91.32,91.32,0,0,1,6.23,15l-14.19,17.74A8,8,0,0,0,199.87,123.66Z" />
  </svg>
)

// Filled icons for active states
const HomeFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M224,115.55V208a16,16,0,0,1-16,16H168a16,16,0,0,1-16-16V168a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8v40a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V115.55a16,16,0,0,1,5.17-11.78l80-75.48a16,16,0,0,1,21.66,0l80,75.48A16,16,0,0,1,224,115.55Z" />
  </svg>
)

const SearchFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M168,112a56,56,0,1,1-56-56A56,56,0,0,1,168,112Zm61.66,117.66a8,8,0,0,1-11.32,0l-50.06-50.07a88,88,0,1,1,11.32-11.31l50.06,50.06A8,8,0,0,1,229.66,229.66ZM112,184a72,72,0,1,0-72-72A72.08,72.08,0,0,0,112,184Z" />
  </svg>
)

const MusicNotesFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V98.75l112-28v69.33A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69Z" />
  </svg>
)

const ChatCircleFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M232,128A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Z" />
  </svg>
)

const UserFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
  </svg>
)

const PlusIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

// Mobile footer tabs
const mobileFooterTabs = [
  { id: 'home', icon: <HomeIcon />, activeIcon: <HomeFillIcon />, label: 'Home' },
  { id: 'search', icon: <SearchIcon />, activeIcon: <SearchFillIcon />, label: 'Search' },
  { id: 'library', icon: <MusicNotesIcon />, activeIcon: <MusicNotesFillIcon />, label: 'Library' },
  { id: 'messages', icon: <ChatCircleIcon />, activeIcon: <ChatCircleFillIcon />, label: 'Messages', badge: 3 },
  { id: 'profile', icon: <UserIcon />, activeIcon: <UserFillIcon />, label: 'Profile' },
]

const meta: Meta<typeof AppShell> = {
  title: 'Layout/AppShell',
  component: AppShell,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof AppShell>

// Header with notifications (for Home page)
const HomeHeader = () => (
  <Header
    rightSlot={
      <div class="flex items-center gap-3">
        <IconButton variant="ghost" size="md" aria-label="Notifications">
          <BellIcon />
        </IconButton>
        <Avatar size="sm" src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" class="cursor-pointer" />
      </div>
    }
    mobileRightSlot={
      <IconButton variant="ghost" size="md" aria-label="Notifications">
        <BellIcon />
      </IconButton>
    }
  />
)

// Header without notifications (for other pages)
const SimpleHeader = () => (
  <Header
    rightSlot={
      <div class="flex items-center gap-3">
        <Avatar size="sm" src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" class="cursor-pointer" />
      </div>
    }
  />
)

const SharedSidebar = () => (
  <Sidebar>
    <button
      type="button"
      class="flex items-center gap-2 px-3 py-3 rounded-md cursor-pointer transition-colors bg-[var(--bg-highlight)]"
    >
      <span class="w-6 h-6 flex items-center justify-center text-[var(--text-secondary)]">
        <HomeIcon />
      </span>
      <span class="text-sm font-semibold text-[var(--text-secondary)]">Home</span>
    </button>
    <SidebarSection
      title="Chat"
      icon={<ChatCircleIcon />}
      action={
        <div class="flex items-center gap-1">
          <IconButton variant="soft" size="md" aria-label="Add chat">
            <PlusIcon />
          </IconButton>
          <IconButton variant="soft" size="md" aria-label="Chat options">
            <ChevronDownIcon />
          </IconButton>
        </div>
      }
    >
      <ListItem
        title="vitalik.eth"
        subtitle="Hey, did you see the new proposal?"
        cover={<Avatar size="sm" />}
      />
      <ListItem
        title="nick.heaven"
        subtitle="The transaction went through"
        cover={<Avatar size="sm" />}
      />
    </SidebarSection>
    <SidebarSection
      title="Music"
      icon={<MusicNotesIcon />}
      action={
        <div class="flex items-center gap-1">
          <IconButton variant="soft" size="md" aria-label="Add playlist">
            <PlusIcon />
          </IconButton>
          <IconButton variant="soft" size="md" aria-label="Music options">
            <ChevronDownIcon />
          </IconButton>
        </div>
      }
    >
      <ListItem
        title="Liked Songs"
        subtitle="0 songs"
        cover={<AlbumCover size="sm" icon="heart" />}
      />
      <ListItem
        title="Free Weekly"
        subtitle="Playlist • technohippies"
        cover={<AlbumCover size="sm" icon="playlist" />}
      />
    </SidebarSection>
  </Sidebar>
)

const SharedRightPanel = () => (
  <RightPanel>
    <div class="p-4">
      <h3 class="text-base font-semibold text-[var(--text-primary)] mb-4">Now Playing</h3>
      <AlbumCover size="lg" src="https://picsum.photos/seed/album1/300/300" class="w-full aspect-square mb-4" />
      <p class="text-lg font-semibold text-[var(--text-primary)]">Blinding Lights</p>
      <p class="text-base text-[var(--text-secondary)]">The Weeknd</p>
    </div>
  </RightPanel>
)

const SharedDesktopFooter = () => (
  <MusicPlayer
    title="Blinding Lights"
    artist="The Weeknd"
    coverSrc="https://picsum.photos/seed/album1/96/96"
    currentTime="2:47"
    duration="4:39"
    progress={58}
    isPlaying
  />
)

const SharedMobilePlayer = () => (
  <MiniPlayer
    title="Blinding Lights"
    artist="The Weeknd"
    coverSrc="https://picsum.photos/seed/album1/96/96"
    progress={58}
    isPlaying
    onPlayPause={() => console.log('play/pause')}
    onExpand={() => console.log('expand')}
    onNext={() => console.log('next')}
  />
)

const SharedMobileFooter = () => (
  <MobileFooter
    tabs={mobileFooterTabs}
    activeTab="home"
    onTabPress={(id) => console.log('Tab:', id)}
  />
)

const MainContent = () => (
  <div class="h-full flex items-center justify-center">
    <p class="text-[var(--text-muted)]">Main Content Area</p>
  </div>
)

export const Default: Story = {
  render: () => (
    <AppShell
      header={<HomeHeader />}
      sidebar={<SharedSidebar />}
      rightPanel={<SharedRightPanel />}
      footer={<SharedDesktopFooter />}
      mobilePlayer={<SharedMobilePlayer />}
      mobileFooter={<SharedMobileFooter />}
    >
      <MainContent />
    </AppShell>
  ),
}

export const Desktop: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'desktop',
    },
  },
  render: () => (
    <AppShell
      header={<HomeHeader />}
      sidebar={<SharedSidebar />}
      rightPanel={<SharedRightPanel />}
      footer={<SharedDesktopFooter />}
      mobilePlayer={<SharedMobilePlayer />}
      mobileFooter={<SharedMobileFooter />}
    >
      <MainContent />
    </AppShell>
  ),
}

export const Tablet: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'tablet',
    },
  },
  render: () => (
    <AppShell
      header={<HomeHeader />}
      sidebar={<SharedSidebar />}
      rightPanel={<SharedRightPanel />}
      footer={<SharedDesktopFooter />}
      mobilePlayer={<SharedMobilePlayer />}
      mobileFooter={<SharedMobileFooter />}
    >
      <MainContent />
    </AppShell>
  ),
}

export const Mobile: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  render: () => (
    <AppShell
      header={<HomeHeader />}
      sidebar={<SharedSidebar />}
      rightPanel={<SharedRightPanel />}
      footer={<SharedDesktopFooter />}
      mobilePlayer={<SharedMobilePlayer />}
      mobileFooter={<SharedMobileFooter />}
    >
      <MainContent />
    </AppShell>
  ),
}

export const MobileMessagesActive: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  render: () => (
    <AppShell
      header={<SimpleHeader />}
      sidebar={<SharedSidebar />}
      rightPanel={<SharedRightPanel />}
      footer={<SharedDesktopFooter />}
      mobilePlayer={<SharedMobilePlayer />}
      mobileFooter={
        <MobileFooter
          tabs={mobileFooterTabs}
          activeTab="messages"
          onTabPress={(id) => console.log('Tab:', id)}
        />
      }
    >
      <div class="h-full flex items-center justify-center">
        <p class="text-[var(--text-muted)]">Messages Page</p>
      </div>
    </AppShell>
  ),
}

export const MobileNoTrackPlaying: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  render: () => (
    <AppShell
      header={<HomeHeader />}
      sidebar={<SharedSidebar />}
      rightPanel={<SharedRightPanel />}
      footer={<SharedDesktopFooter />}
      mobilePlayer={
        <MiniPlayer
          onExpand={() => console.log('expand')}
        />
      }
      mobileFooter={<SharedMobileFooter />}
    >
      <MainContent />
    </AppShell>
  ),
}

// Without right panel (e.g., chat page)
export const DesktopNoRightPanel: Story = {
  render: () => (
    <AppShell
      header={<SimpleHeader />}
      sidebar={<SharedSidebar />}
      footer={<SharedDesktopFooter />}
      mobilePlayer={<SharedMobilePlayer />}
      mobileFooter={<SharedMobileFooter />}
    >
      <MainContent />
    </AppShell>
  ),
}

// Interactive mobile demo with working tab navigation
export const MobileInteractive: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  render: () => {
    const [activeTab, setActiveTab] = createSignal('home')

    const pageContent: Record<string, string> = {
      home: 'Home Feed',
      search: 'Search',
      library: 'Your Library',
      messages: 'Messages',
      profile: 'Profile',
    }

    // Different mobile slots based on current page
    const getMobileLeftSlot = () => {
      if (activeTab() === 'profile') {
        return (
          <IconButton variant="ghost" size="md" aria-label="Wallet">
            <WalletIcon />
          </IconButton>
        )
      }
      return null
    }

    const getMobileRightSlot = () => {
      switch (activeTab()) {
        case 'home':
          return (
            <IconButton variant="ghost" size="md" aria-label="Notifications">
              <BellIcon />
            </IconButton>
          )
        case 'profile':
          return (
            <IconButton variant="ghost" size="md" aria-label="Settings">
              <GearIcon />
            </IconButton>
          )
        default:
          return null
      }
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
                <Avatar size="sm" src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" class="cursor-pointer" />
              </div>
            }
            mobileLeftSlot={getMobileLeftSlot()}
            mobileRightSlot={getMobileRightSlot()}
          />
        }
        sidebar={<SharedSidebar />}
        rightPanel={<SharedRightPanel />}
        footer={<SharedDesktopFooter />}
        mobilePlayer={<SharedMobilePlayer />}
        mobileFooter={
          <MobileFooter
            tabs={mobileFooterTabs}
            activeTab={activeTab()}
            onTabPress={setActiveTab}
          />
        }
      >
        <div class="h-full flex items-center justify-center">
          <p class="text-[var(--text-primary)] text-xl font-semibold">{pageContent[activeTab()]}</p>
        </div>
      </AppShell>
    )
  },
}
