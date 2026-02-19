import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { ThemedButton } from './ThemedButton'

const meta: Meta<typeof ThemedButton> = {
  title: 'Web New/ThemedButton',
  component: ThemedButton,
  args: {
    label: 'Go Live',
  },
}

export default meta

type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    onClick: () => {},
  },
}
