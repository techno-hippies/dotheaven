import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Spinner } from './spinner'

const meta: Meta<typeof Spinner> = {
  title: 'Primitives/Spinner',
  component: Spinner,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Spinner>

export const Default: Story = {
  args: {},
}

export const Small: Story = {
  args: {
    size: 'sm',
  },
}

export const Medium: Story = {
  args: {
    size: 'md',
  },
}

export const Large: Story = {
  args: {
    size: 'lg',
  },
}

export const ExtraLarge: Story = {
  args: {
    size: 'xl',
  },
}

export const CustomColor: Story = {
  args: {
    size: 'lg',
    class: 'text-[var(--accent-blue)]',
  },
}

export const InButton: Story = {
  render: () => (
    <button class="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-blue)] text-white rounded-lg">
      <Spinner size="sm" />
      Loading...
    </button>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <div class="flex items-center gap-8">
      <div class="flex flex-col items-center gap-2">
        <Spinner size="sm" />
        <span class="text-xs text-[var(--text-muted)]">Small</span>
      </div>
      <div class="flex flex-col items-center gap-2">
        <Spinner size="md" />
        <span class="text-xs text-[var(--text-muted)]">Medium</span>
      </div>
      <div class="flex flex-col items-center gap-2">
        <Spinner size="lg" />
        <span class="text-xs text-[var(--text-muted)]">Large</span>
      </div>
      <div class="flex flex-col items-center gap-2">
        <Spinner size="xl" />
        <span class="text-xs text-[var(--text-muted)]">XL</span>
      </div>
    </div>
  ),
}
