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

// ── Phosphor Icons (regular weight, 256x256) ────────────────────

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

const ChatCircleIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-4-1.08,7.85,7.85,0,0,0-2.53.42L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
  </svg>
)

const UserIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
  </svg>
)

const WalletIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M216,64H56A8,8,0,0,1,56,48H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-36-60a12,12,0,1,1,12-12A12,12,0,0,1,180,132Z" />
  </svg>
)

const CalendarIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z" />
  </svg>
)

const GearIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Zm-16.1-6.5a73.93,73.93,0,0,1,0,8.68,8,8,0,0,0,1.74,5.48l14.19,17.73a91.57,91.57,0,0,1-6.23,15L187,173.11a8,8,0,0,0-5.1,2.64,74.11,74.11,0,0,1-6.14,6.14,8,8,0,0,0-2.64,5.1l-2.51,22.58a91.32,91.32,0,0,1-15,6.23l-17.74-14.19a8,8,0,0,0-5-1.75h-.48a73.93,73.93,0,0,1-8.68,0,8,8,0,0,0-5.48,1.74L100.45,215.8a91.57,91.57,0,0,1-15-6.23L82.89,187a8,8,0,0,0-2.64-5.1,74.11,74.11,0,0,1-6.14-6.14,8,8,0,0,0-5.1-2.64L46.43,170.6a91.32,91.32,0,0,1-6.23-15l14.19-17.74a8,8,0,0,0,1.74-5.48,73.93,73.93,0,0,1,0-8.68,8,8,0,0,0-1.74-5.48L40.2,100.45a91.57,91.57,0,0,1,6.23-15L69,82.89a8,8,0,0,0,5.1-2.64,74.11,74.11,0,0,1,6.14-6.14A8,8,0,0,0,82.89,69L85.4,46.43a91.32,91.32,0,0,1,15-6.23l17.74,14.19a8,8,0,0,0,5.48,1.74,73.93,73.93,0,0,1,8.68,0,8,8,0,0,0,5.48-1.74L155.55,40.2a91.57,91.57,0,0,1,15,6.23L173.11,69a8,8,0,0,0,2.64,5.1,74.11,74.11,0,0,1,6.14,6.14,8,8,0,0,0,5.1,2.64l22.58,2.51a91.32,91.32,0,0,1,6.23,15l-14.19,17.74A8,8,0,0,0,199.87,123.66Z" />
  </svg>
)

const DownloadIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z" />
  </svg>
)

const PlusIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" />
  </svg>
)

const CloudIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M160,40A88.09,88.09,0,0,0,81.29,88.67,64,64,0,1,0,72,216h88a88,88,0,0,0,0-176Zm0,160H72a48,48,0,0,1,0-96c1.1,0,2.2,0,3.29.11A88,88,0,0,0,72,128a8,8,0,0,0,16,0,72,72,0,1,1,72,72Z" />
  </svg>
)

const ShareIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M176,160a39.89,39.89,0,0,0-28.62,12.09l-46.1-29.63a39.8,39.8,0,0,0,0-28.92l46.1-29.63a40,40,0,1,0-8.66-13.45l-46.1,29.63a40,40,0,1,0,0,55.82l46.1,29.63A40,40,0,1,0,176,160Zm0-128a24,24,0,1,1-24,24A24,24,0,0,1,176,32ZM64,152a24,24,0,1,1,24-24A24,24,0,0,1,64,152Zm112,72a24,24,0,1,1,24-24A24,24,0,0,1,176,224Z" />
  </svg>
)

const MusicIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V62.25l112-28V134.08A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z" />
  </svg>
)

// Filled icons for active states (mobile footer)
const HomeFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M224,115.55V208a16,16,0,0,1-16,16H168a16,16,0,0,1-16-16V168a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8v40a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V115.55a16,16,0,0,1,5.17-11.78l80-75.48a16,16,0,0,1,21.66,0l80,75.48A16,16,0,0,1,224,115.55Z" />
  </svg>
)

const SearchFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M168,112a56,56,0,1,1-56-56A56.06,56.06,0,0,1,168,112Zm61.66,117.66a8,8,0,0,1-11.32,0l-50.07-50.07a88.11,88.11,0,1,1,11.31-11.31l50.08,50.06A8,8,0,0,1,229.66,229.66ZM112,184a72,72,0,1,0-72-72A72.08,72.08,0,0,0,112,184Z" />
  </svg>
)

const ChatFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M232,128A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Z" />
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

const MusicFillIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V98.75l112-28v69.33A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69Z" />
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
          <NavItem icon={SearchIcon} label="Community" active={active === 'community'} onClick={() => {}} />
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
  { id: 'community', icon: <SearchIcon />, activeIcon: <SearchFillIcon />, label: 'Community' },
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
      home: 'Home Feed',
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
