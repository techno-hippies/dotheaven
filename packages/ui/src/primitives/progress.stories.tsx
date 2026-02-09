import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { ProgressBar } from './progress'

const meta: Meta<typeof ProgressBar> = {
  title: 'Primitives/ProgressBar',
  component: ProgressBar,
  decorators: [
    (Story) => (
      <div class="p-6 bg-[var(--bg-page)] min-h-[200px] w-80 flex flex-col gap-6">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof ProgressBar>

export const Default: Story = {
  args: { value: 60 },
}

export const WithLabel: Story = {
  args: { value: 80, label: 'Uploading...', showValue: true },
}

export const Success: Story = {
  args: { value: 100, variant: 'success' },
}

export const Error: Story = {
  args: { value: 100, variant: 'error' },
}

export const Indeterminate: Story = {
  args: { indeterminate: true, label: 'Processing...' },
}

export const CustomScale: Story = {
  args: {
    value: 3,
    minValue: 0,
    maxValue: 10,
    label: 'Tasks',
    showValue: true,
    getValueLabel: ({ value, max }: { value: number; max: number }) =>
      `${value} of ${max}`,
  },
}
