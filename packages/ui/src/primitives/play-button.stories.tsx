import type { Meta, StoryObj } from 'storybook-solidjs'
import { PlayButton } from './play-button'

const meta = {
  title: 'Primitives/PlayButton',
  component: PlayButton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'white'],
      description: 'Visual style of the button',
    },
    size: {
      control: 'select',
      options: ['md', 'lg'],
      description: 'Size of the button',
    },
    isPlaying: {
      control: 'boolean',
      description: 'Toggle between play and pause icon',
    },
  },
} satisfies Meta<typeof PlayButton>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    variant: 'primary',
    size: 'lg',
    isPlaying: false,
  },
}

export const PrimaryPlaying: Story = {
  args: {
    variant: 'primary',
    size: 'lg',
    isPlaying: true,
  },
}

export const White: Story = {
  args: {
    variant: 'white',
    size: 'md',
    isPlaying: false,
  },
}

export const WhitePlaying: Story = {
  args: {
    variant: 'white',
    size: 'md',
    isPlaying: true,
  },
}

export const Sizes: Story = {
  render: () => (
    <div class="flex items-center gap-4">
      <PlayButton size="md" variant="primary" />
      <PlayButton size="lg" variant="primary" />
    </div>
  ),
}

export const Variants: Story = {
  render: () => (
    <div class="flex items-center gap-4 bg-[var(--bg-surface)] p-8 rounded-lg">
      <PlayButton variant="primary" size="lg" />
      <PlayButton variant="white" size="lg" />
    </div>
  ),
}
