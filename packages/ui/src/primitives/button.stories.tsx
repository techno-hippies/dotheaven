import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Button } from './button'
import { Sliders, CalendarBlank, Plus, Download, Sparkle, LockSimple } from '../icons'

const meta: Meta<typeof Button> = {
  title: 'Primitives/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Button>

export const Default: Story = {
  args: {
    children: 'Button',
  },
}

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary',
  },
}

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Destructive',
  },
}

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline',
  },
}

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Ghost',
  },
}

export const Link: Story = {
  args: {
    variant: 'link',
    children: 'Link',
  },
}

export const Small: Story = {
  args: {
    size: 'sm',
    children: 'Small',
  },
}

export const Large: Story = {
  args: {
    size: 'lg',
    children: 'Large',
  },
}

export const Loading: Story = {
  args: {
    loading: true,
    children: 'Loading',
  },
}

export const LoadingSecondary: Story = {
  args: {
    loading: true,
    variant: 'secondary',
    children: 'Authenticating',
  },
}

// ── Icon + Text variants ──────────────────────────────────────────

export const WithIconDefault: Story = {
  name: 'Icon + Text (Default)',
  args: {
    icon: <Plus />,
    children: 'Create',
  },
}

export const WithIconSecondary: Story = {
  name: 'Icon + Text (Secondary)',
  args: {
    variant: 'secondary',
    icon: <Download />,
    children: 'Download',
  },
}

export const WithIconOutline: Story = {
  name: 'Icon + Text (Outline)',
  args: {
    variant: 'outline',
    icon: <LockSimple />,
    children: 'Request Access',
  },
}

export const WithIconGhost: Story = {
  name: 'Icon + Text (Ghost)',
  args: {
    variant: 'ghost',
    icon: <Sliders />,
    children: 'Filter',
  },
}

export const WithIconGhostSmall: Story = {
  name: 'Icon + Text (Ghost Small)',
  args: {
    variant: 'ghost',
    size: 'sm',
    icon: <CalendarBlank />,
    children: 'Availability',
  },
}

export const WithIconDestructive: Story = {
  name: 'Icon + Text (Destructive)',
  args: {
    variant: 'destructive',
    icon: <Sparkle />,
    children: 'Mint NFT',
  },
}
