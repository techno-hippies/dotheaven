import type { Meta, StoryObj } from 'storybook-solidjs'
import { createSignal } from 'solid-js'
import { ProfileTabs, type ProfileTab } from './profile-tabs'

const meta = {
  title: 'Components/ProfileTabs',
  component: ProfileTabs,
  tags: ['autodocs'],
  argTypes: {
    onTabChange: { action: 'tab changed' },
  },
} satisfies Meta<typeof ProfileTabs>

export default meta
type Story = StoryObj<typeof meta>

export const Activity: Story = {
  args: {
    activeTab: 'activity',
  },
}

export const Videos: Story = {
  args: {
    activeTab: 'videos',
  },
}

export const Music: Story = {
  args: {
    activeTab: 'music',
  },
}

export const Health: Story = {
  args: {
    activeTab: 'health',
  },
}

export const Interactive: Story = {
  render: () => {
    const [activeTab, setActiveTab] = createSignal<ProfileTab>('videos')

    return (
      <div class="bg-[var(--bg-page)] p-6 rounded-lg">
        <ProfileTabs
          activeTab={activeTab()}
          onTabChange={(tab) => setActiveTab(tab)}
        />
        <div class="mt-6 p-6 bg-[var(--bg-surface)] rounded-lg">
          <p class="text-[var(--text-secondary)]">
            Active tab: <span class="text-[var(--text-primary)] font-semibold">{activeTab()}</span>
          </p>
        </div>
      </div>
    )
  },
}
