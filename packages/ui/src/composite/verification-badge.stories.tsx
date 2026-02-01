import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { VerificationBadge } from './verification-badge'

const meta = {
  title: 'Composite/VerificationBadge',
  component: VerificationBadge,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof VerificationBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Verified: Story = {
  args: { state: 'verified', size: 'md' },
}

export const Unverified: Story = {
  args: { state: 'unverified', size: 'md' },
}

export const None: Story = {
  args: { state: 'none', size: 'md' },
}

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '24px' }}>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '16px' }}>
        <span style={{ color: '#b8b8d0', width: '80px', 'font-size': '14px' }}>Small</span>
        <VerificationBadge state="verified" size="sm" />
        <VerificationBadge state="unverified" size="sm" />
      </div>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '16px' }}>
        <span style={{ color: '#b8b8d0', width: '80px', 'font-size': '14px' }}>Medium</span>
        <VerificationBadge state="verified" size="md" />
        <VerificationBadge state="unverified" size="md" />
      </div>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '16px' }}>
        <span style={{ color: '#b8b8d0', width: '80px', 'font-size': '14px' }}>Large</span>
        <VerificationBadge state="verified" size="lg" />
        <VerificationBadge state="unverified" size="lg" />
      </div>
    </div>
  ),
}

export const InlineWithText: Story = {
  render: () => (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
      <span style={{ color: '#f0f0f5', 'font-size': '18px', display: 'inline-flex', 'align-items': 'center', gap: '6px' }}>
        alice.heaven <VerificationBadge state="verified" size="sm" />
      </span>
      <span style={{ color: '#f0f0f5', 'font-size': '18px', display: 'inline-flex', 'align-items': 'center', gap: '6px' }}>
        bob.heaven <VerificationBadge state="unverified" size="sm" />
      </span>
    </div>
  ),
}
