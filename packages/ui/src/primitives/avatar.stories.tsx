import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Avatar } from './avatar'

const meta: Meta<typeof Avatar> = {
  title: 'UI/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'],
    },
    shape: {
      control: 'select',
      options: ['circle', 'square'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Avatar>

export const Default: Story = {
  args: {
    size: 'lg',
    shape: 'circle',
  },
}

export const WithImage: Story = {
  args: {
    size: 'lg',
    shape: 'circle',
    src: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop',
    alt: 'User avatar',
  },
}
