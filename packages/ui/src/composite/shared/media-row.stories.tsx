import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { MediaRow } from './media-row'
import { AlbumCover } from '../media/album-cover'

const meta: Meta<typeof MediaRow> = {
  title: 'Shared/MediaRow',
  component: MediaRow,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div class="w-[400px] bg-[var(--bg-page)]">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof MediaRow>

export const Default: Story = {
  args: {
    title: 'Midnight Dreams',
    subtitle: 'Luna Sky',
    cover: <AlbumCover size="sm" src="https://picsum.photos/seed/cover1/96/96" />,
    onClick: () => console.log('clicked'),
  },
}

export const WithDuration: Story = {
  args: {
    title: 'Electric Hearts',
    subtitle: 'Neon Pulse',
    cover: <AlbumCover size="sm" src="https://picsum.photos/seed/cover2/96/96" />,
    trailing: <span class="text-base text-[var(--text-muted)]">4:18</span>,
    onClick: () => console.log('clicked'),
  },
}

export const WithTimestamp: Story = {
  args: {
    title: 'Summer Waves',
    subtitle: 'Ocean Blue',
    cover: <AlbumCover size="sm" src="https://picsum.photos/seed/cover3/96/96" />,
    trailing: <span class="text-base text-[var(--text-muted)]">2m ago</span>,
    onClick: () => console.log('clicked'),
  },
}

export const PlaylistCard: Story = {
  args: {
    title: 'Chill Vibes',
    cover: <div class="w-12 h-12 rounded-md flex-shrink-0" style={{ background: 'var(--accent-purple)' }} />,
    onClick: () => console.log('playlist clicked'),
    class: 'bg-[var(--bg-highlight)] h-12 px-0 py-0',
  },
}

export const Active: Story = {
  args: {
    title: 'Golden Hour',
    subtitle: 'Sunset Crew',
    cover: <AlbumCover size="sm" src="https://picsum.photos/seed/cover4/96/96" />,
    active: true,
    onClick: () => console.log('clicked'),
  },
}

export const NonClickable: Story = {
  args: {
    title: 'Crystal Clear',
    subtitle: 'Aqua Dreams',
    cover: <AlbumCover size="sm" src="https://picsum.photos/seed/cover6/96/96" />,
    trailing: <span class="text-base text-[var(--text-muted)]">5:10</span>,
  },
}
