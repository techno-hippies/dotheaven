import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { SidePlayer } from './side-player'
import { RightPanel } from '../../layout/RightPanel'

const meta: Meta<typeof SidePlayer> = {
  title: 'Composite/SidePlayer',
  component: SidePlayer,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div class="h-screen bg-[var(--bg-page)] flex justify-end">
        <RightPanel>
          <Story />
        </RightPanel>
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SidePlayer>

export const Default: Story = {
  args: {
    title: 'Neon Dreams',
    artist: 'Synthwave Collective',
    coverSrc: 'https://picsum.photos/seed/album1/400/400',
    currentTime: '2:47',
    duration: '4:39',
    progress: 58,
    isPlaying: true,
    onPlayPause: () => console.log('play/pause'),
    onPrev: () => console.log('prev'),
    onNext: () => console.log('next'),
    onShuffle: () => console.log('shuffle'),
    onRepeat: () => console.log('repeat'),
    track: { id: '1', title: 'Neon Dreams', artist: 'Synthwave Collective', album: 'Neon Album' },
    menuActions: {
      onAddToPlaylist: (t) => console.log('Add to playlist:', t),
      onAddToQueue: (t) => console.log('Add to queue:', t),
    },
  },
}

export const Paused: Story = {
  args: {
    title: 'Midnight City',
    artist: 'M83',
    coverSrc: 'https://picsum.photos/seed/album2/400/400',
    currentTime: '1:23',
    duration: '4:03',
    progress: 34,
    isPlaying: false,
    onPlayPause: () => console.log('play/pause'),
    onPrev: () => console.log('prev'),
    onNext: () => console.log('next'),
  },
}

export const LongTitle: Story = {
  args: {
    title: 'The Less I Know The Better (Extended Remix Version)',
    artist: 'Tame Impala feat. Various Artists & Friends',
    coverSrc: 'https://picsum.photos/seed/album3/400/400',
    currentTime: '3:15',
    duration: '6:42',
    progress: 48,
    isPlaying: true,
    onPlayPause: () => console.log('play/pause'),
    onPrev: () => console.log('prev'),
    onNext: () => console.log('next'),
  },
}

export const NoCover: Story = {
  args: {
    title: 'Unknown Track',
    artist: 'Unknown Artist',
    currentTime: '0:45',
    duration: '3:20',
    progress: 22,
    isPlaying: false,
    onPlayPause: () => console.log('play/pause'),
    onPrev: () => console.log('prev'),
    onNext: () => console.log('next'),
  },
}

export const NoTrack: Story = {
  args: {
    onPlayPause: () => console.log('play/pause'),
    onPrev: () => console.log('prev'),
    onNext: () => console.log('next'),
  },
}

export const StartOfTrack: Story = {
  args: {
    title: 'Just Started',
    artist: 'New Artist',
    coverSrc: 'https://picsum.photos/seed/album4/400/400',
    currentTime: '0:00',
    duration: '5:30',
    progress: 0,
    isPlaying: true,
    onPlayPause: () => console.log('play/pause'),
    onPrev: () => console.log('prev'),
    onNext: () => console.log('next'),
  },
}

export const EndOfTrack: Story = {
  args: {
    title: 'Almost Done',
    artist: 'Final Artist',
    coverSrc: 'https://picsum.photos/seed/album5/400/400',
    currentTime: '4:28',
    duration: '4:30',
    progress: 98,
    isPlaying: true,
    onPlayPause: () => console.log('play/pause'),
    onPrev: () => console.log('prev'),
    onNext: () => console.log('next'),
  },
}

// Interactive example with state
export const Interactive: Story = {
  decorators: [
    () => {
      const [isPlaying, setIsPlaying] = createSignal(true)
      const [progress, setProgress] = createSignal(35)

      // Simulate progress
      setInterval(() => {
        if (isPlaying()) {
          setProgress((p) => (p >= 100 ? 0 : p + 0.2))
        }
      }, 100)

      const formatTime = (percent: number) => {
        const totalSeconds = Math.floor((percent / 100) * 279) // 4:39 = 279 seconds
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${minutes}:${seconds.toString().padStart(2, '0')}`
      }

      return (
        <div class="h-screen bg-[var(--bg-page)] flex justify-end">
          <RightPanel>
            <SidePlayer
              title="Neon Dreams"
              artist="Synthwave Collective"
              coverSrc="https://picsum.photos/seed/album1/400/400"
              currentTime={formatTime(progress())}
              duration="4:39"
              progress={progress()}
              isPlaying={isPlaying()}
              onPlayPause={() => setIsPlaying(!isPlaying())}
              onProgressChange={setProgress}
              onPrev={() => {
                setProgress(0)
                console.log('prev')
              }}
              onNext={() => {
                setProgress(0)
                console.log('next')
              }}
              onShuffle={() => console.log('shuffle')}
              onRepeat={() => console.log('repeat')}
              track={{ id: '1', title: 'Neon Dreams', artist: 'Synthwave Collective', album: 'Neon Album' }}
              menuActions={{
                onAddToPlaylist: (t) => console.log('Add to playlist:', t),
                onAddToQueue: (t) => console.log('Add to queue:', t),
              }}
            />
          </RightPanel>
        </div>
      )
    },
  ],
}

// Show in context with sidebar simulation
export const InContext: Story = {
  decorators: [
    (Story) => (
      <div class="h-screen bg-[var(--bg-page)] flex">
        {/* Simulated sidebar */}
        <div class="w-60 border-r border-[var(--bg-highlight)] p-4">
          <div class="text-[var(--text-muted)] text-sm">Sidebar</div>
        </div>
        {/* Simulated main content */}
        <div class="flex-1 p-8">
          <h1 class="text-2xl font-bold text-[var(--text-primary)] mb-4">Main Content</h1>
          <p class="text-[var(--text-secondary)]">
            This shows the SidePlayer in context with the full layout.
            Notice how the player sits in the right panel.
          </p>
        </div>
        {/* Right panel with player */}
        <RightPanel>
          <Story />
        </RightPanel>
      </div>
    ),
  ],
  args: {
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    coverSrc: 'https://picsum.photos/seed/weeknd/400/400',
    currentTime: '1:45',
    duration: '3:20',
    progress: 52,
    isPlaying: true,
    onPlayPause: () => console.log('play/pause'),
    onPrev: () => console.log('prev'),
    onNext: () => console.log('next'),
  },
}
