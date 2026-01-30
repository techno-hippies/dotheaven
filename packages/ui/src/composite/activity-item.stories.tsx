import type { Meta, StoryObj } from '@storybook/react'
import { ActivityItem } from './activity-item'
import { AlbumCover } from './album-cover'

const meta: Meta<typeof ActivityItem> = {
  title: 'Composite/ActivityItem',
  component: ActivityItem,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div style={{ width: '600px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ActivityItem>

export const Scrobble: Story = {
  args: {
    icon: (
      <AlbumCover
        src="https://picsum.photos/seed/lateralus/200/200"
        alt="Lateralus"
        size="lg"
      />
    ),
    title: 'Schism',
    subtitle: 'Tool · Lateralus',
    timestamp: '2h ago',
    onClick: () => console.log('Scrobble clicked'),
  },
}
