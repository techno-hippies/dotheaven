import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal } from 'solid-js'
import { AppShell } from './AppShell'
import { Sidebar } from './Sidebar'
import { RightPanel } from './RightPanel'
import { MobileFooter } from './MobileFooter'
import { MiniPlayer } from '../composite/media/mini-player'
import { SidePlayer } from '../composite/media/side-player'
import { AlbumCover } from '../composite/media/album-cover'
import { IconButton } from '../primitives/icon-button'
import { CreateDialog } from '../composite/create-dialog'
import { DownloadDialog } from '../composite/download-dialog'
import {
  Home, HomeFill, UsersThree, UsersThreeFill,
  ChatCircle, ChatCircleFill, User, Wallet, CalendarBlank,
  Gear, Download, Plus, ShareNetwork, MusicNotes, MusicNotesFill,
} from '../icons'

// ── Icon aliases (matching original names used in this file) ─────

const HomeIcon = () => <Home />
const CommunityIcon = () => <UsersThree />
const ChatCircleIcon = () => <ChatCircle />
const UserIcon = () => <User />
const WalletIcon = () => <Wallet />
const CalendarIcon = () => <CalendarBlank />
const GearIcon = () => <Gear class="w-5 h-5" />
const DownloadIcon = () => <Download class="w-5 h-5" />
const PlusIcon = () => <Plus class="w-5 h-5" />
const ShareIcon = () => <ShareNetwork class="w-5 h-5" />
const MusicIcon = () => <MusicNotes />

// Filled icons for active states (mobile footer)
const HomeFillIcon = () => <HomeFill />
const CommunityFillIcon = () => <UsersThreeFill />
const ChatFillIcon = () => <ChatCircleFill />
const MusicFillIcon = () => <MusicNotesFill />

// No icon package equivalents for these filled variants
const CloudIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M160,40A88.09,88.09,0,0,0,81.29,88.67,64,64,0,1,0,72,216h88a88,88,0,0,0,0-176Zm0,160H72a48,48,0,0,1,0-96c1.1,0,2.2,0,3.29.11A88,88,0,0,0,72,128a8,8,0,0,0,16,0,72,72,0,1,1,72,72Z" />
  </svg>
)

const CalendarFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,48H48V48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24Z" />
  </svg>
)

const WalletFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,64H56a8,8,0,0,1,0-16H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm-36,80a12,12,0,1,1,12-12A12,12,0,0,1,180,144Z" />
  </svg>
)

// ── Logo placeholder (matches AppLogo visual) ────────────────────

const LogoPlaceholder = () => (
  <div class="w-9 h-9 rounded-full bg-gradient-to-br from-[oklch(0.65_0.12_240)] to-[oklch(0.60_0.15_290)] flex items-center justify-center text-white text-base font-bold">
    H
  </div>
)

// ── NavItem (matches AppSidebar.tsx NavItem exactly) ─────────────

interface NavItemProps {
  icon: () => any
  label: string
  active: boolean
  onClick: () => void
  badge?: number
}

const NavItem = (props: NavItemProps) => (
  <button
    type="button"
    class={`flex items-center gap-3 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)] w-full px-3 py-3 ${props.active ? 'bg-[var(--bg-highlight)]' : ''}`}
    onClick={props.onClick}
  >
    <span class="relative w-6 h-6 flex-shrink-0 flex items-center justify-center text-[var(--text-secondary)]">
      <props.icon />
      {props.badge && props.badge > 0 && (
        <span class="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold px-1">
          {props.badge > 99 ? '99+' : props.badge}
        </span>
      )}
    </span>
    <span class="text-base font-semibold text-[var(--text-secondary)] whitespace-nowrap">{props.label}</span>
  </button>
)

// ── Sidebar (matches real AppSidebar layout exactly) ─────────────

const AppSidebarStory = (props: { activeNav?: string }) => {
  const active = props.activeNav ?? 'home'
  const [createOpen, setCreateOpen] = createSignal(false)
  const [downloadOpen, setDownloadOpen] = createSignal(false)

  return (
    <>
      <Sidebar>
        {/* Logo */}
        <div class="py-4 mb-2 px-3">
          <LogoPlaceholder />
        </div>

        {/* Main navigation */}
        <nav class="flex flex-col gap-1">
          <NavItem icon={HomeIcon} label="Home" active={active === 'home'} onClick={() => {}} />
          <NavItem icon={CommunityIcon} label="Community" active={active === 'community'} onClick={() => {}} />
          <NavItem icon={ChatCircleIcon} label="Messages" active={active === 'messages'} onClick={() => {}} badge={2} />
          <NavItem icon={WalletIcon} label="Wallet" active={active === 'wallet'} onClick={() => {}} />
          <NavItem icon={CalendarIcon} label="Schedule" active={active === 'schedule'} onClick={() => {}} />
          <NavItem icon={UserIcon} label="Profile" active={active === 'profile'} onClick={() => {}} />
        </nav>

        {/* Music section - separator + label + plus button */}
        <div class="mt-6 -mx-3 px-3 border-t border-[var(--border-subtle)] pt-4">
          <div class="flex items-center justify-between px-3 mb-2 min-h-10">
            <span class="text-base text-[var(--text-muted)] font-medium whitespace-nowrap">Music</span>
            <IconButton
              variant="soft"
              size="md"
              aria-label="Create"
              onClick={() => setCreateOpen(true)}
            >
              <PlusIcon />
            </IconButton>
          </div>

          <div class="flex flex-col gap-0.5">
            {/* Cloud */}
            <button
              type="button"
              class="flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)]"
            >
              <div class="w-10 h-10 flex-shrink-0 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
                <CloudIcon />
              </div>
              <div class="flex flex-col min-w-0 text-left">
                <span class="text-base text-[var(--text-primary)] whitespace-nowrap">Cloud</span>
                <span class="text-base text-[var(--text-muted)] whitespace-nowrap">3 songs</span>
              </div>
            </button>

            {/* Shared */}
            <button
              type="button"
              class="flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)]"
            >
              <div class="w-10 h-10 flex-shrink-0 rounded-md bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
                <ShareIcon />
              </div>
              <div class="flex flex-col min-w-0 text-left">
                <span class="text-base text-[var(--text-primary)] whitespace-nowrap">Shared</span>
                <span class="text-base text-[var(--text-muted)] whitespace-nowrap">0 songs</span>
              </div>
            </button>

            {/* Example playlists */}
            <button
              type="button"
              class="flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)]"
            >
              <AlbumCover size="sm" icon="playlist" class="flex-shrink-0" />
              <div class="flex flex-col min-w-0 text-left">
                <span class="text-base text-[var(--text-primary)] truncate whitespace-nowrap">Chill Vibes</span>
                <span class="text-base text-[var(--text-muted)] whitespace-nowrap">12 songs</span>
              </div>
            </button>

            <button
              type="button"
              class="flex items-center gap-3 w-full px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-highlight-hover)]"
            >
              <AlbumCover size="sm" icon="playlist" class="flex-shrink-0" />
              <div class="flex flex-col min-w-0 text-left">
                <span class="text-base text-[var(--text-primary)] truncate whitespace-nowrap">Workout Mix</span>
                <span class="text-base text-[var(--text-muted)] whitespace-nowrap">8 songs</span>
              </div>
            </button>
          </div>
        </div>

        {/* Bottom: Download + Settings */}
        <div class="mt-auto pt-3 flex flex-col gap-1">
          <NavItem icon={DownloadIcon} label="Download" active={false} onClick={() => setDownloadOpen(true)} />
          <NavItem icon={GearIcon} label="Settings" active={false} onClick={() => {}} />
        </div>
      </Sidebar>

      {/* Dialogs (matches real AppSidebar) */}
      <CreateDialog
        open={createOpen()}
        onOpenChange={setCreateOpen}
        onNewPlaylist={() => console.log('New Playlist')}
        onPublishSong={() => console.log('Publish Song')}
      />
      <DownloadDialog open={downloadOpen()} onOpenChange={setDownloadOpen} />
    </>
  )
}

// ── Right Panel (SidePlayer, matches real AppLayout) ─────────────

const RightPanelStory = () => (
  <RightPanel>
    <SidePlayer
      title="Blinding Lights"
      artist="The Weeknd"
      coverSrc="https://picsum.photos/seed/album1/300/300"
      currentTime="1:32"
      duration="3:20"
      progress={46}
      isPlaying
      onPlayPause={() => {}}
      onPrev={() => {}}
      onNext={() => {}}
    />
  </RightPanel>
)

const RightPanelEmptyStory = () => (
  <RightPanel>
    <SidePlayer
      onPlayPause={() => {}}
      onPrev={() => {}}
      onNext={() => {}}
    />
  </RightPanel>
)

// ── Mobile footer tabs (matches AppLayout.tsx exactly: 6 tabs) ───

const mobileFooterTabs = [
  { id: 'home', icon: <HomeIcon />, activeIcon: <HomeFillIcon />, label: 'Home' },
  { id: 'community', icon: <CommunityIcon />, activeIcon: <CommunityFillIcon />, label: 'Community' },
  { id: 'music', icon: <MusicIcon />, activeIcon: <MusicFillIcon />, label: 'Music' },
  { id: 'chat', icon: <ChatCircleIcon />, activeIcon: <ChatFillIcon />, label: 'Chat' },
  { id: 'schedule', icon: <CalendarIcon />, activeIcon: <CalendarFillIcon />, label: 'Schedule' },
  { id: 'wallet', icon: <WalletIcon />, activeIcon: <WalletFillIcon />, label: 'Wallet' },
]

// ── Mobile player + footer ───────────────────────────────────────

const SharedMobilePlayer = () => (
  <MiniPlayer
    title="Blinding Lights"
    artist="The Weeknd"
    coverSrc="https://picsum.photos/seed/album1/96/96"
    progress={46}
    isPlaying
    onPlayPause={() => {}}
    onExpand={() => {}}
    onNext={() => {}}
  />
)

const SharedMobileFooter = () => (
  <MobileFooter
    tabs={mobileFooterTabs}
    activeTab="home"
    onTabPress={(id) => console.log('Tab:', id)}
  />
)

// ── Main content placeholder ─────────────────────────────────────

const MainContent = () => (
  <div class="h-full flex items-center justify-center">
    <p class="text-[var(--text-muted)]">Main Content Area</p>
  </div>
)

// ── Stories ───────────────────────────────────────────────────────

const meta: Meta<typeof AppShell> = {
  title: 'Layout/AppShell',
  component: AppShell,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof AppShell>

export const Default: Story = {
  render: () => (
    <AppShell
      sidebar={<AppSidebarStory />}
      rightPanel={<RightPanelStory />}
      mobilePlayer={<SharedMobilePlayer />}
      mobileFooter={<SharedMobileFooter />}
    >
      <MainContent />
    </AppShell>
  ),
}

export const NoTrackPlaying: Story = {
  render: () => (
    <AppShell
      sidebar={<AppSidebarStory />}
      rightPanel={<RightPanelEmptyStory />}
      mobileFooter={<SharedMobileFooter />}
    >
      <MainContent />
    </AppShell>
  ),
}

export const MessagesActive: Story = {
  render: () => (
    <AppShell
      sidebar={<AppSidebarStory activeNav="messages" />}
      rightPanel={<RightPanelStory />}
      mobilePlayer={<SharedMobilePlayer />}
      mobileFooter={<SharedMobileFooter />}
    >
      <div class="h-full flex items-center justify-center">
        <p class="text-[var(--text-muted)]">Messages Page</p>
      </div>
    </AppShell>
  ),
}

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  render: () => (
    <AppShell
      sidebar={<AppSidebarStory />}
      rightPanel={<RightPanelStory />}
      mobilePlayer={<SharedMobilePlayer />}
      mobileFooter={<SharedMobileFooter />}
    >
      <MainContent />
    </AppShell>
  ),
}

export const MobileNoTrack: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  render: () => (
    <AppShell
      sidebar={<AppSidebarStory />}
      rightPanel={<RightPanelEmptyStory />}
      mobileFooter={<SharedMobileFooter />}
    >
      <MainContent />
    </AppShell>
  ),
}

export const MobileInteractive: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  render: () => {
    const [activeTab, setActiveTab] = createSignal('home')

    const pageContent: Record<string, string> = {
      home: 'Home',
      community: 'Community',
      music: 'Music Library',
      chat: 'Messages',
      schedule: 'Schedule',
      wallet: 'Wallet',
    }

    return (
      <AppShell
        sidebar={<AppSidebarStory />}
        rightPanel={<RightPanelStory />}
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
