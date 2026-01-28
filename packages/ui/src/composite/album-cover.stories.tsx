import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { AlbumCover } from './album-cover'

const meta: Meta<typeof AlbumCover> = {
  title: 'UI/AlbumCover',
  component: AlbumCover,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    icon: {
      control: 'select',
      options: ['music', 'compass', 'heart', 'playlist'],
    },
  },
}

export default meta
type Story = StoryObj<typeof AlbumCover>

export const Default: Story = {
  args: {
    size: 'md',
    icon: 'music',
  },
}

export const WithImage: Story = {
  args: {
    size: 'lg',
    src: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop',
    alt: 'Album cover',
  },
}
