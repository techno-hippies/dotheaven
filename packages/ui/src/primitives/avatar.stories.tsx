import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Avatar } from './avatar'
import type { AvatarProps } from './avatar'

const meta: Meta<typeof Avatar> = {
  title: 'Primitives/Avatar',
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

export const WithNationalityFlag: Story = {
  args: {
    size: 'lg',
    shape: 'circle',
    src: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop',
    alt: 'User avatar',
    nationalityCode: 'JP',
  },
}

export const FlagAllSizes: StoryObj = {
  name: 'Nationality Flag — All Sizes',
  render: () => (
    <div class="flex items-end gap-4">
      {(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'] as const).map((size) => (
        <div class="flex flex-col items-center gap-1">
          <Avatar
            size={size}
            src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop"
            nationalityCode="BR"
          />
          <span class="text-xs text-[var(--text-muted)]">{size}</span>
        </div>
      ))}
    </div>
  ),
}

export const FlagVariousCountries: StoryObj = {
  name: 'Nationality Flag — Various Countries',
  render: () => (
    <div class="flex items-center gap-4 flex-wrap">
      {['US', 'GB', 'JP', 'BR', 'DE', 'FR', 'KR', 'IN', 'NG', 'AU'].map((code) => (
        <div class="flex flex-col items-center gap-1">
          <Avatar
            size="lg"
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${code}`}
            nationalityCode={code}
          />
          <span class="text-xs text-[var(--text-muted)]">{code}</span>
        </div>
      ))}
    </div>
  ),
}

export const FlagNoAvatar: Story = {
  name: 'Nationality Flag — Fallback Avatar',
  args: {
    size: 'lg',
    shape: 'circle',
    nationalityCode: 'SE',
  },
}
