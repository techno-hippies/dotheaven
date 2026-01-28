import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { WelcomeScreen } from './WelcomeScreen'

const meta: Meta<typeof WelcomeScreen> = {
  title: 'Layout/WelcomeScreen',
  component: WelcomeScreen,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof WelcomeScreen>

export const Default: Story = {
  args: {
    onAction: () => {
      console.log('Add Folders clicked')
      alert('Add Folders button clicked!')
    },
    actionLabel: 'Add Folders',
    subtitle: 'Add your music folders to start listening',
  },
}

export const WebVersion: Story = {
  args: {
    onAction: () => {
      console.log('Upload Files clicked')
      alert('Upload Files button clicked!')
    },
    actionLabel: 'Upload Files',
    subtitle: 'Upload your music files to start listening',
  },
}
