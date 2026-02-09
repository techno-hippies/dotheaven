import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { CommunityCard } from './community-card'

const meta: Meta<typeof CommunityCard> = {
  title: 'Search/CommunityCard',
  component: CommunityCard,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', 'max-width': '520px', background: 'var(--bg-page)', padding: '16px', 'border-radius': '6px' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof CommunityCard>

// ── Basic ───────────────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    name: 'Matthias',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face',
    online: true,
    age: 28,
    gender: 'M',
    nationalityCode: 'DE',
    location: 'Berlin, Germany',
    verified: 'verified',
  },
}

// ── Verified user ───────────────────────────────────────────────────────

export const Verified: Story = {
  args: {
    name: 'Hannah',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
    online: false,
    age: 24,
    gender: 'F',
    nationalityCode: 'US',
    location: 'New York, USA',
    verified: 'verified',
  },
}

// ── Minimal (no location) ──────────────────────────────────────────

export const Minimal: Story = {
  args: {
    name: 'Yuki',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face',
    age: 22,
    nationalityCode: 'JP',
  },
}

// ── No avatar ───────────────────────────────────────────────────────

export const NoAvatar: Story = {
  args: {
    name: 'Anonymous',
    online: false,
    age: 25,
    gender: 'NB',
    nationalityCode: 'KR',
    location: 'Seoul, South Korea',
  },
}

// ── Multiple cards stacked ──────────────────────────────────────────────

export const CardList: StoryObj = {
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ 'max-width': '520px', height: '100vh', overflow: 'auto', background: 'var(--bg-page)', padding: '12px' }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div class="flex flex-col gap-2">
      <CommunityCard
        name="Matthias"
        avatarUrl="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face"
        online={true}
        age={28}
        gender="M"
        nationalityCode="DE"
        location="Berlin, Germany"
        verified="verified"
      />
      <CommunityCard
        name="Martina"
        avatarUrl="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face"
        online={true}
        age={26}
        gender="F"
        nationalityCode="AT"
        location="Vienna, Austria"
        verified="verified"
      />
      <CommunityCard
        name="Hannah"
        avatarUrl="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face"
        age={24}
        gender="F"
        nationalityCode="US"
        location="New York, USA"
      />
      <CommunityCard
        name="Alex"
        avatarUrl="https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&h=200&fit=crop&crop=face"
        online={true}
        age={27}
        gender="NB"
        nationalityCode="GB"
        location="London, UK"
      />
      <CommunityCard
        name="Mia"
        avatarUrl="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face"
        age={22}
        nationalityCode="CA"
        location="Toronto, Canada"
      />
    </div>
  ),
}
