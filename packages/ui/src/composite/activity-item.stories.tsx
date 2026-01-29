import type { Meta, StoryObj } from '@storybook/react'
import { ActivityItem } from './activity-item'
import { AlbumCover } from './album-cover'
import { Avatar } from '../primitives/avatar'

const meta: Meta<typeof ActivityItem> = {
  title: 'Composite/ActivityItem',
  component: ActivityItem,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '600px', background: 'var(--bg-page)', padding: '1rem' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ActivityItem>

// Sleep tracking with moon icon
export const Sleep: Story = {
  args: {
    icon: (
      <div class="w-[72px] h-[72px] rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center">
        <svg class="w-10 h-10 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
          <path d="M235.54,150.21a104.84,104.84,0,0,1-37,52.91A104,104,0,0,1,32,120,103.09,103.09,0,0,1,52.88,57.48a104.84,104.84,0,0,1,52.91-37,8,8,0,0,1,10,10,88.08,88.08,0,0,0,109.8,109.8,8,8,0,0,1,10,10Z" />
        </svg>
      </div>
    ),
    title: '7h 30m',
    subtitle: 'sleep',
    timestamp: '8h ago',
    onClick: () => console.log('Sleep clicked'),
  },
}

// Activity tracking (run) with shoe icon
export const Activity: Story = {
  args: {
    icon: (
      <div class="w-[72px] h-[72px] rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center">
        <svg class="w-10 h-10 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
          <path d="M240,96.08v48a16,16,0,0,1-16,16H180.67a16,16,0,0,1-9.6-3.2L128,128l-43.07,28.88a16,16,0,0,1-9.6,3.2H32a16,16,0,0,1-16-16v-48a16,16,0,0,1,16-16H75.33a16,16,0,0,1,9.6,3.2L128,112l43.07-28.88a16,16,0,0,1,9.6-3.2H224A16,16,0,0,1,240,96.08ZM32,184H75.33L128,224l52.67-40H224a16,16,0,0,0,16-16H32A16,16,0,0,0,32,184Z" />
        </svg>
      </div>
    ),
    title: 'Run',
    subtitle: '45min · 6.2 km',
    timestamp: '5h ago',
    onClick: () => console.log('Activity clicked'),
  },
}

// Playlist with album cover
export const Playlist: Story = {
  args: {
    icon: (
      <AlbumCover
        src="https://picsum.photos/seed/chill/200/200"
        alt="Late Night Chill"
        size="lg"
      />
    ),
    title: 'Late Night Chill',
    subtitle: '24 songs',
    timestamp: '1d ago',
    onClick: () => console.log('Playlist clicked'),
  },
}

// Scrobble with small album grid
export const Scrobble: Story = {
  args: {
    icon: (
      <div class="w-[72px] h-[72px] grid grid-cols-2 grid-rows-2 gap-1 rounded-lg overflow-hidden">
        <img src="https://picsum.photos/seed/1/100/100" alt="Album 1" class="w-full h-full object-cover" />
        <img src="https://picsum.photos/seed/2/100/100" alt="Album 2" class="w-full h-full object-cover" />
        <img src="https://picsum.photos/seed/3/100/100" alt="Album 3" class="w-full h-full object-cover" />
        <img src="https://picsum.photos/seed/4/100/100" alt="Album 4" class="w-full h-full object-cover" />
      </div>
    ),
    title: 'Scrobbled 12 songs',
    subtitle: 'Tool, Tame Impala +5 others',
    timestamp: '2h ago',
    onClick: () => console.log('Scrobble clicked'),
  },
}

// Artist discovered
export const Artist: Story = {
  args: {
    icon: (
      <AlbumCover
        src="https://picsum.photos/seed/artist/200/200"
        alt="The Weeknd"
        size="lg"
      />
    ),
    title: 'The Weeknd, Dua Lipa',
    subtitle: '8 songs',
    timestamp: '3d ago',
    onClick: () => console.log('Artist clicked'),
  },
}

// Recommendation (no click handler)
export const Recommendation: Story = {
  args: {
    icon: (
      <div class="w-[72px] h-[72px] rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center">
        <svg class="w-10 h-10 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
          <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm40-68a28,28,0,0,1-28,28h-4v8a8,8,0,0,1-16,0v-8H104a8,8,0,0,1,0-16h36a12,12,0,0,0,0-24H116a28,28,0,0,1,0-56h4V72a8,8,0,0,1,16,0v8h16a8,8,0,0,1,0,16H116a12,12,0,0,0,0,24h24A28,28,0,0,1,168,148Z" />
        </svg>
      </div>
    ),
    title: 'Recommended playlist',
    subtitle: 'Based on your listening',
    timestamp: '1w ago',
  },
}

// All examples together
export const AllExamples: Story = {
  render: () => (
    <div class="flex flex-col">
      <ActivityItem
        icon={
          <div class="w-[72px] h-[72px] rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center">
            <svg class="w-10 h-10 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
              <path d="M235.54,150.21a104.84,104.84,0,0,1-37,52.91A104,104,0,0,1,32,120,103.09,103.09,0,0,1,52.88,57.48a104.84,104.84,0,0,1,52.91-37,8,8,0,0,1,10,10,88.08,88.08,0,0,0,109.8,109.8,8,8,0,0,1,10,10Z" />
            </svg>
          </div>
        }
        title="7h 30m"
        subtitle="sleep"
        timestamp="8h ago"
        onClick={() => console.log('Sleep clicked')}
      />

      <ActivityItem
        icon={
          <div class="w-[72px] h-[72px] rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center">
            <svg class="w-10 h-10 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 256 256">
              <path d="M240,96.08v48a16,16,0,0,1-16,16H180.67a16,16,0,0,1-9.6-3.2L128,128l-43.07,28.88a16,16,0,0,1-9.6,3.2H32a16,16,0,0,1-16-16v-48a16,16,0,0,1,16-16H75.33a16,16,0,0,1,9.6,3.2L128,112l43.07-28.88a16,16,0,0,1,9.6-3.2H224A16,16,0,0,1,240,96.08ZM32,184H75.33L128,224l52.67-40H224a16,16,0,0,0,16-16H32A16,16,0,0,0,32,184Z" />
            </svg>
          </div>
        }
        title="Run"
        subtitle="45min · 6.2 km"
        timestamp="5h ago"
        onClick={() => console.log('Activity clicked')}
      />

      <ActivityItem
        icon={
          <AlbumCover
            src="https://picsum.photos/seed/chill/200/200"
            alt="Late Night Chill"
            size="lg"
          />
        }
        title="Late Night Chill"
        subtitle="24 songs"
        timestamp="1d ago"
        onClick={() => console.log('Playlist clicked')}
      />

      <ActivityItem
        icon={
          <div class="w-[72px] h-[72px] grid grid-cols-2 grid-rows-2 gap-1 rounded-lg overflow-hidden bg-[var(--bg-elevated)]">
            <img src="https://picsum.photos/seed/1/100/100" alt="Album 1" class="w-full h-full object-cover" />
            <img src="https://picsum.photos/seed/2/100/100" alt="Album 2" class="w-full h-full object-cover" />
            <img src="https://picsum.photos/seed/3/100/100" alt="Album 3" class="w-full h-full object-cover" />
            <img src="https://picsum.photos/seed/4/100/100" alt="Album 4" class="w-full h-full object-cover" />
          </div>
        }
        title="Scrobbled 12 songs"
        subtitle="Tool, Tame Impala +5 others"
        timestamp="2h ago"
        onClick={() => console.log('Scrobble clicked')}
      />

      <ActivityItem
        icon={
          <AlbumCover
            src="https://picsum.photos/seed/artist/200/200"
            alt="The Weeknd"
            size="lg"
          />
        }
        title="The Weeknd, Dua Lipa"
        subtitle="8 songs"
        timestamp="3d ago"
        onClick={() => console.log('Artist clicked')}
      />
    </div>
  ),
}
