import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { IconButton } from './icon-button'

const meta: Meta<typeof IconButton> = {
  title: 'Primitives/IconButton',
  component: IconButton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['ghost', 'soft', 'default', 'play', 'send'],
    },
    size: {
      control: 'select',
      options: ['md', 'lg', 'xl'],
    },
  },
}

export default meta
type Story = StoryObj<typeof IconButton>

// Common icons for examples
const BellIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const PlayIcon = () => (
  <svg class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const HeartIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
    <path d="M178,32c-20.65,0-38.73,8.88-50,23.89C116.73,40.88,98.65,32,78,32A62.07,62.07,0,0,0,16,94c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,220.66,240,164,240,94A62.07,62.07,0,0,0,178,32ZM128,206.8C109.74,196.16,32,147.69,32,94A46.06,46.06,0,0,1,78,48c19.45,0,35.78,10.36,42.6,27a8,8,0,0,0,14.8,0c6.82-16.67,23.15-27,42.6-27a46.06,46.06,0,0,1,46,46C224,147.61,146.24,196.15,128,206.8Z" />
  </svg>
)

const PlusIcon = () => (
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const SendIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
)

const MenuIcon = () => (
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
)

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    size: 'md',
    'aria-label': 'Notifications',
    children: <BellIcon />,
  },
}

export const Soft: Story = {
  args: {
    variant: 'soft',
    size: 'md',
    'aria-label': 'Add item',
    children: <PlusIcon />,
  },
}

export const Default: Story = {
  args: {
    variant: 'default',
    size: 'md',
    'aria-label': 'Add item',
    children: <PlusIcon />,
  },
}

export const Play: Story = {
  args: {
    variant: 'play',
    size: 'lg',
    'aria-label': 'Play',
    children: <PlayIcon />,
  },
}

export const Send: Story = {
  args: {
    variant: 'send',
    size: 'xl',
    'aria-label': 'Send message',
    children: <SendIcon />,
  },
}

export const SendDisabled: Story = {
  args: {
    variant: 'send',
    size: 'xl',
    'aria-label': 'Send message',
    disabled: true,
    children: <SendIcon />,
  },
}

export const Menu: Story = {
  args: {
    variant: 'ghost',
    size: 'md',
    'aria-label': 'Open menu',
    children: <MenuIcon />,
  },
}

export const AllSizes: Story = {
  render: () => (
    <div class="flex items-center gap-4">
      <div class="flex flex-col items-center gap-2">
        <IconButton variant="ghost" size="md" aria-label="Medium">
          <BellIcon />
        </IconButton>
        <span class="text-xs text-[var(--text-muted)]">Medium (20px icon)</span>
      </div>
      <div class="flex flex-col items-center gap-2">
        <IconButton variant="ghost" size="lg" aria-label="Large">
          <HeartIcon />
        </IconButton>
        <span class="text-xs text-[var(--text-muted)]">Large (24px icon)</span>
      </div>
    </div>
  ),
}

export const AllVariants: Story = {
  render: () => (
    <div class="flex items-center gap-4">
      <div class="flex flex-col items-center gap-2">
        <IconButton variant="ghost" size="md" aria-label="Ghost">
          <PlusIcon />
        </IconButton>
        <span class="text-xs text-[var(--text-muted)]">Ghost</span>
      </div>
      <div class="flex flex-col items-center gap-2">
        <IconButton variant="soft" size="md" aria-label="Soft">
          <PlusIcon />
        </IconButton>
        <span class="text-xs text-[var(--text-muted)]">Soft</span>
      </div>
      <div class="flex flex-col items-center gap-2">
        <IconButton variant="default" size="md" aria-label="Default">
          <PlusIcon />
        </IconButton>
        <span class="text-xs text-[var(--text-muted)]">Default</span>
      </div>
      <div class="flex flex-col items-center gap-2">
        <IconButton variant="play" size="lg" aria-label="Play">
          <PlayIcon />
        </IconButton>
        <span class="text-xs text-[var(--text-muted)]">Play</span>
      </div>
      <div class="flex flex-col items-center gap-2">
        <IconButton variant="send" size="xl" aria-label="Send">
          <SendIcon />
        </IconButton>
        <span class="text-xs text-[var(--text-muted)]">Send</span>
      </div>
    </div>
  ),
}
