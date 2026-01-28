import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { ListItem } from './list-item'
import { AlbumCover } from './album-cover'

const meta: Meta<typeof ListItem> = {
  title: 'UI/ListItem',
  component: ListItem,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof ListItem>

export const Default: Story = {
  args: {
    title: 'Liked Songs',
    subtitle: '128 songs',
    cover: <AlbumCover size="sm" icon="heart" />,
  },
}

export const Playlist: Story = {
  args: {
    title: 'Free Weekly',
    subtitle: 'Playlist • technohippies',
    cover: <AlbumCover size="sm" icon="playlist" />,
  },
}

export const Active: Story = {
  args: {
    title: 'Now Playing',
    subtitle: 'Currently active',
    cover: <AlbumCover size="sm" icon="music" />,
    active: true,
  },
}
