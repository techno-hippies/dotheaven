import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { MiniPlayer } from './mini-player'
import { MobileFooter } from '../../layout/MobileFooter'

const meta: Meta<typeof MiniPlayer> = {
  title: 'Composite/MiniPlayer',
  component: MiniPlayer,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div class="h-screen bg-[var(--bg-page)] flex flex-col">
        <div class="flex-1" />
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof MiniPlayer>

export const Default: Story = {
  args: {
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    coverSrc: 'https://picsum.photos/seed/album1/96/96',
    progress: 35,
    isPlaying: true,
    onPlayPause: () => console.log('play/pause'),
    onExpand: () => console.log('expand'),
    onNext: () => console.log('next'),
  },
}

export const Paused: Story = {
  args: {
    title: 'As It Was',
    artist: 'Harry Styles',
    coverSrc: 'https://picsum.photos/seed/album2/96/96',
    progress: 68,
    isPlaying: false,
    onPlayPause: () => console.log('play/pause'),
    onExpand: () => console.log('expand'),
    onNext: () => console.log('next'),
  },
}

export const LongTitle: Story = {
  args: {
    title: 'The Less I Know The Better (Extended Mix)',
    artist: 'Tame Impala feat. Various Artists',
    coverSrc: 'https://picsum.photos/seed/album4/96/96',
    progress: 50,
    isPlaying: true,
    onPlayPause: () => console.log('play/pause'),
    onExpand: () => console.log('expand'),
    onNext: () => console.log('next'),
  },
}

export const NoCover: Story = {
  args: {
    title: 'Unknown Track',
    artist: 'Unknown Artist',
    progress: 25,
    isPlaying: false,
    onPlayPause: () => console.log('play/pause'),
    onExpand: () => console.log('expand'),
    onNext: () => console.log('next'),
  },
}

export const NoTrack: Story = {
  args: {
    onExpand: () => console.log('expand'),
  },
}

export const ProgressZero: Story = {
  args: {
    title: 'Just Started',
    artist: 'New Artist',
    coverSrc: 'https://picsum.photos/seed/album5/96/96',
    progress: 0,
    isPlaying: true,
    onPlayPause: () => console.log('play/pause'),
    onExpand: () => console.log('expand'),
    onNext: () => console.log('next'),
  },
}

export const ProgressAlmostDone: Story = {
  args: {
    title: 'Almost Done',
    artist: 'Final Artist',
    coverSrc: 'https://picsum.photos/seed/album6/96/96',
    progress: 95,
    isPlaying: true,
    onPlayPause: () => console.log('play/pause'),
    onExpand: () => console.log('expand'),
    onNext: () => console.log('next'),
  },
}

// Interactive example with state
export const Interactive: Story = {
  render: () => {
    const [isPlaying, setIsPlaying] = createSignal(true)
    const [progress, setProgress] = createSignal(35)

    // Simulate progress
    setInterval(() => {
      if (isPlaying()) {
        setProgress((p) => (p >= 100 ? 0 : p + 0.5))
      }
    }, 100)

    return (
      <MiniPlayer
        title="Blinding Lights"
        artist="The Weeknd"
        coverSrc="https://picsum.photos/seed/album1/96/96"
        progress={progress()}
        isPlaying={isPlaying()}
        onPlayPause={() => setIsPlaying(!isPlaying())}
        onExpand={() => alert('Expand to full player!')}
        onNext={() => console.log('next')}
      />
    )
  },
}

// Phosphor icons for footer
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

const MusicNotesIcon = () => (
  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 256 256">
    <path d="M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V62.25l112-28V134.08A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216Zm128-32a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z" />
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

const footerTabs = [
  { id: 'home', icon: <HomeIcon />, label: 'Home' },
  { id: 'search', icon: <SearchIcon />, label: 'Search' },
  { id: 'library', icon: <MusicNotesIcon />, label: 'Library' },
  { id: 'messages', icon: <ChatCircleIcon />, label: 'Messages', badge: 3 },
  { id: 'profile', icon: <UserIcon />, label: 'Profile' },
]

// Combined with MobileFooter - shows real mobile layout
export const WithMobileFooter: Story = {
  decorators: [
    (Story) => (
      <div class="h-screen bg-[var(--bg-page)] flex flex-col">
        {/* Main content area */}
        <div class="flex-1 flex items-center justify-center">
          <p class="text-[var(--text-muted)]">Page content here</p>
        </div>
        {/* Mini player + Footer stack */}
        <Story />
        <MobileFooter
          tabs={footerTabs}
          activeTab="home"
          onTabPress={(id) => console.log('Tab:', id)}
        />
      </div>
    ),
  ],
  args: {
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    coverSrc: 'https://picsum.photos/seed/album1/96/96',
    progress: 35,
    isPlaying: true,
    onPlayPause: () => console.log('play/pause'),
    onExpand: () => console.log('expand'),
    onNext: () => console.log('next'),
  },
}

// Mobile viewport simulation
export const MobileViewport: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  decorators: [
    (Story) => (
      <div class="h-screen bg-[var(--bg-page)] flex flex-col">
        <div class="flex-1 flex items-center justify-center">
          <p class="text-[var(--text-muted)]">Page content</p>
        </div>
        <Story />
        <MobileFooter
          tabs={footerTabs}
          activeTab="library"
          onTabPress={(id) => console.log('Tab:', id)}
        />
      </div>
    ),
  ],
  args: {
    title: 'Levitating',
    artist: 'Dua Lipa',
    coverSrc: 'https://picsum.photos/seed/album7/96/96',
    progress: 62,
    isPlaying: true,
    onPlayPause: () => console.log('play/pause'),
    onExpand: () => console.log('expand'),
    onNext: () => console.log('next'),
  },
}
