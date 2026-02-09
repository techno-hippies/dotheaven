import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { RightPanel } from './RightPanel'
import { Avatar } from '../primitives/avatar'
import { IconButton } from '../primitives/icon-button'

const HeartIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)

const ShareIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
)

const QueueIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
)

const meta: Meta<typeof RightPanel> = {
  title: 'Layout/RightPanel',
  component: RightPanel,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div class="h-[600px] bg-[var(--bg-page)]">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof RightPanel>

export const NowPlayingPanel: Story = {
  render: () => (
    <RightPanel>
      <div class="p-4 flex flex-col h-full">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-semibold text-[var(--text-primary)]">Now Playing</h3>
          <div class="flex items-center gap-1">
            <IconButton variant="ghost" size="md" aria-label="Add to queue">
              <QueueIcon />
            </IconButton>
          </div>
        </div>
        <div class="aspect-square bg-[var(--bg-highlight)] rounded-md mb-4 overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop"
            alt="Album art"
            class="w-full h-full object-cover"
          />
        </div>
        <div class="mb-4">
          <p class="text-lg font-semibold text-[var(--text-primary)]">Neon Dreams</p>
          <p class="text-base text-[var(--text-secondary)]">Synthwave Collective</p>
        </div>
        <div class="flex items-center gap-2">
          <IconButton variant="ghost" size="md" aria-label="Like">
            <HeartIcon />
          </IconButton>
          <IconButton variant="ghost" size="md" aria-label="Share">
            <ShareIcon />
          </IconButton>
        </div>
      </div>
    </RightPanel>
  ),
}

export const WithComments: Story = {
  render: () => (
    <RightPanel>
      <div class="p-4 flex flex-col h-full">
        <h3 class="text-base font-semibold text-[var(--text-primary)] mb-4">Comments</h3>
        <div class="flex-1 overflow-y-auto space-y-4">
          <div class="flex gap-3">
            <Avatar size="sm" src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" />
            <div>
              <p class="text-base font-medium text-[var(--text-primary)]">vitalik.eth</p>
              <p class="text-base text-[var(--text-secondary)]">This track is fire! 🔥</p>
              <p class="text-xs text-[var(--text-muted)]">2m ago</p>
            </div>
          </div>
          <div class="flex gap-3">
            <Avatar size="sm" />
            <div>
              <p class="text-base font-medium text-[var(--text-primary)]">alice.heaven</p>
              <p class="text-base text-[var(--text-secondary)]">Been on repeat all day</p>
              <p class="text-xs text-[var(--text-muted)]">15m ago</p>
            </div>
          </div>
        </div>
      </div>
    </RightPanel>
  ),
}

export const QueuePanel: Story = {
  render: () => (
    <RightPanel>
      <div class="p-4 flex flex-col h-full">
        <h3 class="text-base font-semibold text-[var(--text-primary)] mb-4">Queue</h3>
        <div class="mb-4">
          <p class="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">Now Playing</p>
          <div class="flex items-center gap-3 p-2 bg-[var(--bg-highlight)] rounded-md">
            <div class="w-10 h-10 bg-[var(--bg-elevated)] rounded" />
            <div class="flex-1 min-w-0">
              <p class="text-base font-medium text-[var(--text-primary)] truncate">Neon Dreams</p>
              <p class="text-xs text-[var(--text-secondary)] truncate">Synthwave Collective</p>
            </div>
          </div>
        </div>
        <div>
          <p class="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">Next Up</p>
          <div class="space-y-2">
            <div class="flex items-center gap-3 p-2 rounded-md hover:bg-[var(--bg-highlight)] transition-colors">
              <div class="w-10 h-10 bg-[var(--bg-elevated)] rounded" />
              <div class="flex-1 min-w-0">
                <p class="text-base font-medium text-[var(--text-primary)] truncate">Midnight City</p>
                <p class="text-xs text-[var(--text-secondary)] truncate">M83</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </RightPanel>
  ),
}

export const Empty: Story = {
  render: () => (
    <RightPanel>
      <div class="p-4 flex flex-col items-center justify-center h-full text-center">
        <div class="w-16 h-16 bg-[var(--bg-highlight)] rounded-full flex items-center justify-center mb-4">
          <QueueIcon />
        </div>
        <p class="text-[var(--text-secondary)] text-base">Nothing playing</p>
        <p class="text-[var(--text-muted)] text-xs mt-1">Select a track to start listening</p>
      </div>
    </RightPanel>
  ),
}
